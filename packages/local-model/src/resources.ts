import {
  type LocalModelDefinition,
  LocalModelResources,
  localModelDefinitions,
  ModelResourceError,
} from '@turtle-soup/core/model-management';
import { Effect, Layer } from 'effect';

const resourceError = (cause: unknown) =>
  new ModelResourceError({
    message:
      cause instanceof Error ? cause.message : '模型资源操作失败，请重试。',
  });

const supportedModel = (
  modelId: string
): Effect.Effect<LocalModelDefinition['id'], ModelResourceError> => {
  const model = localModelDefinitions.find((model) => model.id === modelId);

  return model
    ? Effect.succeed(model.id)
    : Effect.fail(
        new ModelResourceError({ message: `不支持的本地模型：${modelId}` })
      );
};

export const LocalModelResourcesLive = Layer.succeed(LocalModelResources, {
  inspect: (modelId) =>
    supportedModel(modelId).pipe(
      Effect.andThen(
        Effect.tryPromise({
          try: async () => {
            const { isLayaCached } = await import('./laya');

            return {
              tag: (await isLayaCached()) ? 'complete' : 'missing',
            } as const;
          },
          catch: resourceError,
        })
      )
    ),
  download: (modelId, onProgress) =>
    supportedModel(modelId).pipe(
      Effect.andThen(() =>
        Effect.tryPromise({
          try: async (signal) => {
            const { downloadLaya } = await import('./laya');
            await downloadLaya(signal, onProgress);
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
            const { deleteLayaCache } = await import('./laya');
            await deleteLayaCache();
          },
          catch: resourceError,
        })
      )
    ),
});
