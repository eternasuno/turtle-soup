import type { ModelResourceError } from '@turtle-soup/core/model-management';
import { sanitizeLocalReason } from './local-diagnostic';

export function resourceFailure(
  error: ModelResourceError,
  modelId: string,
  stage: 'prepare' | 'remove'
): string {
  const reason = sanitizeLocalReason(error.message);
  console.error({ modelId, backend: 'wasm', stage, reason });

  return `${stage === 'prepare' ? '模型准备失败' : '删除模型缓存失败'}：${reason}`;
}
