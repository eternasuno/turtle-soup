import {
  LocalModelResources,
  localModelDefinitions,
  ModelResourceError,
} from '@turtle-soup/core/model-management';
import { LocalModelId } from '@turtle-soup/core/types';
import { Effect, Layer, Schema } from 'effect';
import { createLayaWorker } from './worker-client';

const resourceError = (cause: unknown) =>
  new ModelResourceError({
    message:
      cause instanceof Error ? cause.message : '模型资源操作失败，请重试。',
  });

const supportedModel = (modelId: string) =>
  localModelDefinitions.some((model) => model.id === modelId)
    ? Effect.void
    : Effect.fail(
        new ModelResourceError({ message: `不支持的本地模型：${modelId}` })
      );

export const LocalModelResourcesLive = Layer.succeed(LocalModelResources, {
  inspect: (modelId) =>
    supportedModel(modelId).pipe(
      Effect.andThen(
        Effect.tryPromise({
          try: async () => {
            const { isModelCached } = await import('./model-cache');

            return {
              tag: (await isModelCached(
                Schema.decodeUnknownSync(LocalModelId)(modelId)
              ))
                ? 'complete'
                : 'missing',
            } as const;
          },
          catch: resourceError,
        })
      )
    ),
  download: (modelId) =>
    supportedModel(modelId).pipe(
      Effect.andThen(
        Effect.tryPromise({
          try: async (signal) => {
            const worker = createLayaWorker();
            try {
              await worker.load(
                'wasm',
                signal,
                undefined,
                false,
                Schema.decodeUnknownSync(LocalModelId)(modelId)
              );
            } finally {
              worker.dispose();
            }
          },
          catch: resourceError,
        })
      )
    ),
  remove: (modelId) =>
    supportedModel(modelId).pipe(
      Effect.andThen(
        Effect.tryPromise({
          try: async () => {
            const { deleteModelCache } = await import('./model-cache');
            await deleteModelCache(
              Schema.decodeUnknownSync(LocalModelId)(modelId)
            );
          },
          catch: resourceError,
        })
      )
    ),
});
