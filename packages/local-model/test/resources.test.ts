import { LocalModelResources } from '@turtle-soup/core/model-management';
import { Effect, Fiber } from 'effect';
import { afterEach, expect, it, vi } from 'vitest';
import { LocalModelResourcesLive } from '../src/resources';

const mocks = vi.hoisted(() => ({
  inspect: vi.fn(),
  load: vi.fn(),
  remove: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('../src/model-cache', () => ({
  isModelCached: mocks.inspect,
  deleteModelCache: mocks.remove,
}));

vi.mock('../src/worker-client', () => ({
  createLayaWorker: () => mocks,
}));

const modelId = 'onnx-community/laya-multilingual-ONNX';
const run = <A, E>(
  operation: (resources: LocalModelResources['Service']) => Effect.Effect<A, E>
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* operation(yield* LocalModelResources);
    }).pipe(Effect.provide(LocalModelResourcesLive))
  );

afterEach(() => vi.resetAllMocks());

it.each([true, false])('maps cache completeness %s', async (complete) => {
  mocks.inspect.mockResolvedValue(complete);
  expect(await run((resources) => resources.inspect(modelId))).toEqual({
    tag: complete ? 'complete' : 'missing',
  });
});

it('downloads fp16 Laya with wasm, remote lookup and a signal, then disposes', async () => {
  mocks.load.mockResolvedValue(undefined);
  await run((resources) => resources.download(modelId));
  expect(mocks.load).toHaveBeenCalledWith(
    'wasm',
    expect.any(AbortSignal),
    undefined,
    false,
    modelId
  );
  expect(mocks.dispose).toHaveBeenCalledOnce();
});

it('delegates deletion to the verified model-specific deletion', async () => {
  mocks.remove.mockResolvedValue(undefined);
  await run((resources) => resources.remove(modelId));
  expect(mocks.remove).toHaveBeenCalledOnce();
  expect(mocks.load).not.toHaveBeenCalled();
});

for (const operation of ['inspect', 'download', 'remove'] as const) {
  it(`rejects unsupported ids before ${operation}`, async () => {
    const result = await run((resources) =>
      resources[operation]('unsupported').pipe(Effect.result)
    );
    expect(result._tag).toBe('Failure');
    expect(mocks.inspect).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it(`keeps ${operation} failures in the typed error channel`, async () => {
    mocks.inspect.mockRejectedValue(new Error('cache unavailable'));
    mocks.load.mockRejectedValue(new Error('cache unavailable'));
    mocks.remove.mockRejectedValue(new Error('cache unavailable'));
    const result = await run((resources) =>
      resources[operation](modelId).pipe(Effect.result)
    );
    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'ModelResourceError', message: 'cache unavailable' },
    });
    if (operation === 'download') {
      expect(mocks.dispose).toHaveBeenCalledOnce();
    }
  });
}

it('aborts a download and terminates its worker', async () => {
  mocks.load.mockImplementation(
    (_backend, signal: AbortSignal) =>
      new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        });
      })
  );
  const fiber = Effect.runFork(
    Effect.gen(function* () {
      const resources = yield* LocalModelResources;
      yield* resources.download(modelId);
    }).pipe(Effect.provide(LocalModelResourcesLive))
  );
  await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
  const signal = mocks.load.mock.calls[0]?.[1] as AbortSignal;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(signal.aborted).toBe(true);
  await vi.waitFor(() => expect(mocks.dispose).toHaveBeenCalledOnce());
});
