import type { LocalModelId } from '@turtle-soup/core/types';
import { loadD1 } from './d1';
import { type LayaProgress, loadLaya } from './laya';
import { ensureModelFiles, isModelCached } from './model-cache';
import { loadVerdict } from './verdict';

export async function loadModel(
  modelId: LocalModelId,
  backend: 'wasm' | 'webgpu',
  cacheOnly: boolean,
  onProgress?: (progress: LayaProgress) => void
) {
  if (cacheOnly && !(await isModelCached(modelId, backend))) {
    throw new Error('模型缓存不完整，请先下载。');
  }

  const device = cacheOnly ? backend : 'wasm';
  let model: Awaited<ReturnType<typeof loadLaya>>;
  switch (modelId) {
    case 'onnx-community/laya-multilingual-ONNX':
      model = await loadLaya(onProgress, undefined, device, cacheOnly);
      break;
    case 'Manav2op/verdict-small':
      model = await loadVerdict(device, cacheOnly, onProgress);
      break;
    case 'onnx-community/d1-omni-600M-ONNX':
      model = await loadD1(device, cacheOnly, onProgress);
      break;
  }

  try {
    if (!cacheOnly) await ensureModelFiles(modelId);

    return model;
  } catch (cause) {
    await model.dispose();
    throw cause;
  }
}
