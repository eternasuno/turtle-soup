import { LocalModelResources } from '@turtle-soup/core/model-management';
import { Effect, Fiber } from 'effect';
import { afterEach, expect, it, vi } from 'vitest';
import { LocalModelResourcesLive } from '../src/resources';

const mocks = vi.hoisted(() => ({
  inspect: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../src/laya', () => ({
  isLayaCached: mocks.inspect,
  deleteLayaCache: mocks.remove,
  downloadLaya: mocks.download,
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

it('downloads files with cancellation and progress without a model worker', async () => {
  const onProgress = vi.fn();
  const progress = { file: 'model.onnx', loaded: 10, total: 100 };
  mocks.download.mockImplementation(async (_signal, report) => {
    report(progress);
  });
  await run((resources) => resources.download(modelId, onProgress));
  expect(mocks.download).toHaveBeenCalledWith(
    expect.any(AbortSignal),
    onProgress
  );
  expect(onProgress).toHaveBeenCalledWith(progress);
});

it('delegates deletion to the verified model-specific deletion', async () => {
  mocks.remove.mockResolvedValue(undefined);
  await run((resources) => resources.remove(modelId));
  expect(mocks.remove).toHaveBeenCalledOnce();
  expect(mocks.download).not.toHaveBeenCalled();
});

for (const operation of ['inspect', 'download', 'remove'] as const) {
  it(`rejects unsupported ids before ${operation}`, async () => {
    const result = await run((resources) =>
      resources[operation]('unsupported').pipe(Effect.result)
    );
    expect(result._tag).toBe('Failure');
    expect(mocks.inspect).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it(`keeps ${operation} failures in the typed error channel`, async () => {
    mocks.inspect.mockRejectedValue(new Error('cache unavailable'));
    mocks.download.mockRejectedValue(new Error('cache unavailable'));
    mocks.remove.mockRejectedValue(new Error('cache unavailable'));
    const result = await run((resources) =>
      resources[operation](modelId).pipe(Effect.result)
    );
    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'ModelResourceError', message: 'cache unavailable' },
    });
  });
}

it('aborts an active file download', async () => {
  mocks.download.mockImplementation(
    (signal: AbortSignal) =>
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
  await vi.waitFor(() => expect(mocks.download).toHaveBeenCalledOnce());
  const signal = mocks.download.mock.calls[0]?.[0] as AbortSignal;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(signal.aborted).toBe(true);
});
