import {
  choiceAnswersToProvider,
  providerOptionsToRequest,
} from '@turtle-soup/core/decision-provider';
import type { LocalModelId } from '@turtle-soup/core/types';
import { Effect, Layer } from 'effect';
import { AiError, DecisionModel } from 'effect/ai';
import type { LayaProgress } from './laya';
import { createLayaWorker } from './worker-client';

const modelError = (method: string, cause: unknown) =>
  AiError.make({
    module: 'LayaDecisionModel',
    method,
    reason: new AiError.UnknownError({
      description: cause instanceof Error ? cause.message : String(cause),
      metadata: {
        cause: cause instanceof Error ? cause.message : String(cause),
      },
    }),
  });

export const LocalDecisionModelLayer = (
  modelId: LocalModelId,
  backend: 'wasm' | 'webgpu' = 'wasm',
  onProgress?: (progress: LayaProgress) => void
): Layer.Layer<DecisionModel.DecisionModel, AiError.AiError> =>
  Layer.effect(
    DecisionModel.DecisionModel,
    Effect.gen(function* () {
      const worker = yield* Effect.acquireRelease(
        Effect.try({
          try: createLayaWorker,
          catch: (cause) => modelError('load', cause),
        }),
        (worker) => Effect.sync(() => worker.dispose())
      );
      yield* Effect.tryPromise({
        try: (signal) =>
          worker.load(backend, signal, onProgress, true, modelId),
        catch: (cause) => modelError('load', cause),
      });

      return yield* DecisionModel.make({
        decide: (options) =>
          Effect.gen(function* () {
            const payload = yield* providerOptionsToRequest(options);
            const answers = yield* Effect.tryPromise({
              try: (signal) => worker.request(payload, signal),
              catch: (cause) => modelError('decide', cause),
            });

            return choiceAnswersToProvider(payload.questions, answers);
          }),
      });
    })
  );

export const LayaDecisionModelLayer = (
  backend: 'wasm' | 'webgpu' = 'wasm',
  onProgress?: (progress: LayaProgress) => void
) =>
  LocalDecisionModelLayer(
    'onnx-community/laya-multilingual-ONNX',
    backend,
    onProgress
  );
