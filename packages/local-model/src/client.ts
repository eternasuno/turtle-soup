import { DecisionClient, DecisionError } from '@turtle-soup/core/decision';
import { Effect, Layer } from 'effect';
import type { LayaProgress } from './laya';

export const LocalDecisionClientLive = (
  backend: 'wasm' | 'webgpu' = 'wasm',
  onProgress?: (progress: LayaProgress) => void
): Layer.Layer<DecisionClient, DecisionError> => {
  return Layer.effect(
    DecisionClient,
    Effect.gen(function* () {
      const model = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: async (signal) => {
            const { loadLaya } = await import('./laya');

            return loadLaya(onProgress, signal, backend, true);
          },
          catch: (cause) =>
            new DecisionError({
              message:
                '本地 fp16 模型加载失败，请先下载模型，或检查后端兼容性与内存。',
              cause,
            }),
        }),
        (model) => Effect.promise(() => model.dispose())
      );

      return DecisionClient.of({
        request: (payload) =>
          Effect.tryPromise({
            try: () => model.request(payload),
            catch: (cause) =>
              new DecisionError({
                message:
                  '本地 fp16 判定失败，可能存在后端兼容问题或输入超长。可尝试 WASM 或改用 API。',
                cause,
              }),
          }),
      });
    })
  );
};
