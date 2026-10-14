import type { ModelResourceError } from '@turtle-soup/core/model-management';
import { Effect } from 'effect';
import { sanitizeLocalReason } from './local-diagnostic';

export function resourceOperation<A, R>(
  operation: Effect.Effect<A, ModelResourceError, R>,
  modelId: string,
  stage: 'prepare' | 'remove',
  current: () => boolean,
  onError: (message: string) => void,
  onSuccess: () => void
) {
  return operation.pipe(
    Effect.match({
      onFailure: (error) => {
        if (current()) onError(resourceFailure(error, modelId, stage));
      },
      onSuccess: () => {
        if (current()) onSuccess();
      },
    })
  );
}

export function resourceFailure(
  error: ModelResourceError,
  modelId: string,
  stage: 'prepare' | 'remove'
): string {
  const reason = sanitizeLocalReason(error.message);
  console.error({ modelId, backend: 'wasm', stage, reason });

  return `${stage === 'prepare' ? '模型准备失败' : '删除模型缓存失败'}：${reason}`;
}
