import { LocalModelId } from '@turtle-soup/core/types';
import { Schema } from 'effect';
import { type LayaProgress, loadLaya } from './laya';

export async function loadModel(
  modelId: LocalModelId,
  backend: 'wasm' | 'webgpu',
  cacheOnly: boolean,
  onProgress?: (progress: LayaProgress) => void
) {
  Schema.decodeUnknownSync(LocalModelId)(modelId);

  return loadLaya(
    onProgress,
    undefined,
    cacheOnly ? backend : 'wasm',
    cacheOnly
  );
}
