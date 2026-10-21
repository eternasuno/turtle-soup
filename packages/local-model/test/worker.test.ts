import { afterEach, expect, it, vi } from 'vitest';
import { createLayaWorker } from '../src/worker-client';

const payload = {
  model: 'jev-latest',
  state: 'fact',
  questions: {
    answer: {
      type: 'choice' as const,
      instructions: 'Choose',
      criteria: { yes: 'True', no: 'False' },
    },
  },
};
const answers = {
  answer: {
    type: 'choice' as const,
    choice: 'yes',
    confidence: 1,
    probabilities: { yes: 1, no: 0 },
  },
};

class FakeWorker extends EventTarget {
  static current: FakeWorker;
  commands: unknown[] = [];
  readonly terminate = vi.fn();

  constructor(
    public url: URL,
    public options: WorkerOptions
  ) {
    super();
    FakeWorker.current = this;
  }

  postMessage(command: unknown) {
    this.commands.push(command);
  }

  respond(data: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}

function setup() {
  vi.stubGlobal('Worker', FakeWorker);
  const client = createLayaWorker();

  return {
    client,
    worker: FakeWorker.current,
    signal: new AbortController().signal,
  };
}

afterEach(() => vi.unstubAllGlobals());

it.each(['wasm', 'webgpu'] as const)(
  'loads %s with progress and cache flags',
  async (backend) => {
    const { client, worker, signal } = setup();
    const progress = vi.fn();
    const loading = client.load(backend, signal, progress, false);
    expect(worker.options).toEqual({ type: 'module' });
    expect(worker.url.pathname).toContain('laya.worker.ts');
    expect(worker.commands).toEqual([
      {
        type: 'init',
        id: 1,
        backend,
        cacheOnly: false,
        modelId: 'onnx-community/laya-multilingual-ONNX',
      },
    ]);
    worker.respond({
      type: 'progress',
      id: 1,
      progress: { file: 'model', loaded: 1, total: 2 },
    });
    worker.respond({ type: 'stage', id: 1, stage: 'load-started' });
    worker.respond({ type: 'stage', id: 1, stage: 'load-completed' });
    worker.respond({ type: 'success', id: 1, value: undefined });
    await loading;
    expect(progress).toHaveBeenCalledWith({
      file: 'model',
      loaded: 1,
      total: 2,
    });
    client.dispose();
    client.dispose();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  }
);

it('routes concurrent IDs and ignores canceled late results', async () => {
  const { client, worker, signal } = setup();
  const abort = new AbortController();
  const first = client.request(payload, abort.signal);
  const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  const second = client.request(payload, signal);
  abort.abort();
  await rejected;
  expect(worker.commands).toEqual([
    { type: 'request', id: 1, payload },
    { type: 'request', id: 2, payload },
    { type: 'cancel', id: 1 },
  ]);
  worker.respond({ type: 'success', id: 1, value: answers });
  worker.respond({ type: 'success', id: 2, value: answers });
  await expect(second).resolves.toEqual(answers);
  expect(worker.terminate).not.toHaveBeenCalled();
  client.dispose();
});

it.each(['error', 'messageerror', 'invalid', 'dispose', 'init-abort'])(
  'terminates and rejects all on %s',
  async (failure) => {
    const { client, worker, signal } = setup();
    const abort = new AbortController();
    const loading = client.load('wasm', abort.signal);
    const request = client.request(payload, signal);
    const settled = Promise.allSettled([loading, request]);
    expect(worker.commands[0]).toMatchObject({ cacheOnly: true });
    if (failure === 'invalid') worker.respond({ type: 'unknown' });
    else if (failure === 'dispose') client.dispose();
    else if (failure === 'init-abort') abort.abort();
    else worker.dispatchEvent(new Event(failure));

    expect((await settled).map((result) => result.status)).toEqual([
      'rejected',
      'rejected',
    ]);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    await expect(client.request(payload, signal)).rejects.toThrow('disposed');
  }
);

it.each([
  { name: 'undefined request result', value: undefined },
  { name: 'missing answer', value: {} },
  { name: 'extra answer', value: { ...answers, extra: answers.answer } },
  { name: 'wrong answer ID', value: { other: answers.answer } },
  {
    name: 'unknown choice',
    value: { answer: { ...answers.answer, choice: 'maybe' } },
  },
  {
    name: 'invalid confidence',
    value: { answer: { ...answers.answer, confidence: 2 } },
  },
])('rejects $name and terminates the worker', async ({ value }) => {
  const { client, worker, signal } = setup();
  const request = client.request(payload, signal);
  const rejected = expect(request).rejects.toThrow(
    'Invalid Laya worker response'
  );
  worker.respond({ type: 'success', id: 1, value });
  await rejected;
  expect(worker.terminate).toHaveBeenCalledTimes(1);
});

it('rejects answers returned for initialization', async () => {
  const { client, worker, signal } = setup();
  const loading = client.load('wasm', signal);
  const rejected = expect(loading).rejects.toThrow(
    'Invalid Laya worker response'
  );
  worker.respond({ type: 'success', id: 1, value: answers });
  await rejected;
  expect(worker.terminate).toHaveBeenCalledTimes(1);
});

it('runs worker requests serially and skips canceled queued requests', async () => {
  vi.resetModules();
  let finish!: (value: typeof answers) => void;
  const request = vi.fn(
    () =>
      new Promise<typeof answers>((resolve) => {
        finish = resolve;
      })
  );
  const load = vi.fn(async () => ({ request, dispose: vi.fn() }));
  vi.doMock('../src/model-loader', () => ({ loadModel: load }));
  const post = vi.fn();
  let receive!: (event: MessageEvent<unknown>) => void;
  vi.stubGlobal('postMessage', post);
  vi.stubGlobal(
    'addEventListener',
    (_type: string, listener: typeof receive) => {
      receive = listener;
    }
  );
  await import('../src/laya.worker');
  const send = (data: unknown) =>
    receive(new MessageEvent('message', { data }));
  send({ type: 'init', id: 1, backend: 'webgpu', cacheOnly: true });
  await vi.waitFor(() =>
    expect(post).toHaveBeenCalledWith({
      type: 'success',
      id: 1,
      value: undefined,
    })
  );
  expect(load).toHaveBeenCalledWith('webgpu', true, expect.any(Function));
  send({ type: 'request', id: 2, payload });
  send({ type: 'request', id: 3, payload });
  send({ type: 'request', id: 4, payload });
  send({ type: 'cancel', id: 3 });
  send({ type: 'cancel', id: 2 });
  expect(request).toHaveBeenCalledTimes(1);
  finish(answers);
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  finish(answers);
  await vi.waitFor(() =>
    expect(post).toHaveBeenCalledWith({
      type: 'success',
      id: 4,
      value: answers,
    })
  );
  expect(post).not.toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
  expect(() => send({ type: 'invalid' })).toThrow();
  vi.doUnmock('../src/model-loader');
});
