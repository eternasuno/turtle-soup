import { type LayaProgress, loadLaya } from './laya';

export async function loadModel(
  backend: 'wasm' | 'webgpu',
  cacheOnly: boolean,
  onProgress?: (progress: LayaProgress) => void
) {
  return loadLaya(
    onProgress,
    undefined,
    cacheOnly ? backend : 'wasm',
    cacheOnly
  );
}
