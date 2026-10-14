import { Effect, Fiber, Schema } from 'effect';
import { Decision, DecisionModel } from 'effect/ai';
import { beforeEach, expect, it, vi } from 'vitest';
import { LayaDecisionModelLayer, LocalDecisionModelLayer } from '../src/client';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  load: vi.fn(),
  request: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('../src/worker-client', () => ({
  createLayaWorker: () => mocks.create(),
}));

const definition = Decision.make({
  input: Schema.String,
  decisions: {
    answer: Decision.classify({
      instructions: 'Select an answer',
      criteria: { yes: 'It is true', no: 'It is false' },
    }),
  },
});

const decide = Effect.gen(function* () {
  const model = yield* DecisionModel.DecisionModel;

  return yield* model.decide(definition, { input: 'fact' });
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.create.mockReturnValue(mocks);
  mocks.load.mockResolvedValue(undefined);
  mocks.request.mockResolvedValue({
    answer: {
      choice: 'yes',
      confidence: 0.75,
      probabilities: { yes: 0.75, no: 0.25 },
    },
  });
});

it.each(['wasm', 'webgpu'] as const)(
  'provides scoped worker DecisionModel on %s',
  async (backend) => {
    const onProgress = vi.fn();
    const response = await Effect.runPromise(
      decide.pipe(Effect.provide(LayaDecisionModelLayer(backend, onProgress)))
    );
    expect(response.answers.answer.label).toBe('yes');
    expect(response.answers.answer.probabilities).toEqual({
      yes: 0.75,
      no: 0.25,
    });
    expect(mocks.load).toHaveBeenCalledWith(
      backend,
      expect.any(AbortSignal),
      onProgress,
      true,
      'onnx-community/laya-multilingual-ONNX'
    );
    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        state: '"fact"',
        questions: {
          answer: {
            type: 'choice',
            instructions: 'Select an answer',
            criteria: { yes: 'It is true', no: 'It is false' },
          },
        },
      }),
      expect.any(AbortSignal)
    );
    expect(mocks.dispose).toHaveBeenCalledOnce();
  }
);

it('maps worker creation failure into the typed error channel', async () => {
  mocks.create.mockImplementation(() => {
    throw new Error('Worker blocked');
  });
  const result = await Effect.runPromise(
    decide.pipe(Effect.provide(LayaDecisionModelLayer()), Effect.result)
  );
  expect(result).toMatchObject({
    _tag: 'Failure',
    failure: { _tag: 'AiError', module: 'LayaDecisionModel', method: 'load' },
  });
  expect(mocks.load).not.toHaveBeenCalled();
  expect(mocks.dispose).not.toHaveBeenCalled();
});

it('maps initialization failure and terminates the worker', async () => {
  mocks.load.mockRejectedValue(new Error('cache missing'));
  const result = await Effect.runPromise(
    decide.pipe(Effect.provide(LayaDecisionModelLayer()), Effect.result)
  );
  expect(result).toMatchObject({
    _tag: 'Failure',
    failure: { _tag: 'AiError', module: 'LayaDecisionModel', method: 'load' },
  });
  expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.dispose).toHaveBeenCalledOnce();
});

it('maps request failure and terminates the worker', async () => {
  mocks.request.mockRejectedValue(new Error('inference failed'));
  const result = await Effect.runPromise(
    decide.pipe(Effect.provide(LayaDecisionModelLayer()), Effect.result)
  );
  expect(result).toMatchObject({
    _tag: 'Failure',
    failure: { _tag: 'AiError', module: 'LayaDecisionModel', method: 'decide' },
  });
  expect(mocks.dispose).toHaveBeenCalledOnce();
});

it.each(['load', 'request'] as const)(
  'aborts %s and terminates on interruption',
  async (operation) => {
    mocks[operation].mockReturnValue(new Promise(() => {}));
    const fiber = Effect.runFork(
      decide.pipe(Effect.provide(LayaDecisionModelLayer()))
    );
    await vi.waitFor(() => expect(mocks[operation]).toHaveBeenCalledOnce());
    const signal = mocks[operation].mock.calls[0]?.[1] as AbortSignal;
    expect(signal.aborted).toBe(false);
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(signal.aborted).toBe(true);
    expect(mocks.dispose).toHaveBeenCalledOnce();
    if (operation === 'load') {
      expect(mocks.request).not.toHaveBeenCalled();
    }
  }
);

it.each(['onnx-community/laya-multilingual-ONNX'] as const)(
  'passes selected model %s to the scoped worker',
  async (modelId) => {
    await Effect.runPromise(
      decide.pipe(Effect.provide(LocalDecisionModelLayer(modelId, 'webgpu')))
    );
    expect(mocks.load).toHaveBeenCalledWith(
      'webgpu',
      expect.any(AbortSignal),
      undefined,
      true,
      modelId
    );
    expect(mocks.dispose).toHaveBeenCalledOnce();
  }
);
