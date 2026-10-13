import { env } from '@huggingface/transformers';
import { localModelDefinitions } from '@turtle-soup/core/model-management';
import type { LocalModelId } from '@turtle-soup/core/types';

const layaId = 'onnx-community/laya-multilingual-ONNX';

function definition(modelId: LocalModelId) {
  const model = localModelDefinitions.find((model) => model.id === modelId);
  if (!model) throw new Error(`不支持的本地模型：${modelId}`);

  return model;
}

function prefix(modelId: LocalModelId) {
  const path = env.remotePathTemplate
    .replace('{model}', modelId)
    .replace('{revision}', 'main');

  return `${env.remoteHost}${path}`.replace(/\/?$/, '/');
}

export async function isModelCached(
  modelId: LocalModelId,
  backend?: 'wasm' | 'webgpu'
): Promise<boolean> {
  if (modelId === layaId) {
    const { isLayaCached } = await import('./laya');

    return isLayaCached();
  }

  if (typeof caches === 'undefined') return false;

  const model = definition(modelId);
  const cache = await caches.open(env.cacheKey);
  const files = new Set((await cache.keys()).map((key) => key.url));
  const precision = backend && model.precisionByBackend[backend];
  const required = model.files.filter(
    (file) =>
      !precision ||
      !file.startsWith('onnx/') ||
      file.includes(precision === 'q8' ? 'quantized' : 'fp16')
  );

  return required.every((file) => files.has(`${prefix(modelId)}${file}`));
}

export async function deleteModelCache(modelId: LocalModelId): Promise<void> {
  definition(modelId);
  if (typeof caches === 'undefined') return;

  const cache = await caches.open(env.cacheKey);
  const target = prefix(modelId);
  for (const key of await cache.keys()) {
    if (key.url.startsWith(target)) await cache.delete(key);
  }

  if ((await cache.keys()).some((key) => key.url.startsWith(target))) {
    throw new Error('模型缓存未完全删除，请重试。');
  }
}

export async function ensureModelFiles(modelId: LocalModelId): Promise<void> {
  const model = definition(modelId);
  const cache = await caches.open(env.cacheKey);
  for (const file of model.files) {
    const url = new URL(`${prefix(modelId)}${file}`);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      throw new Error('无效的模型下载地址');
    }

    if (await cache.match(url.href)) continue;

    const response = await fetch(url, {
      credentials: 'omit',
      redirect: 'follow',
    });
    if (!response.ok) throw new Error(`模型文件下载失败：${file}`);

    await cache.put(url.href, response);
  }

  if (!(await isModelCached(modelId)))
    throw new Error('模型下载后缓存仍不完整，请重试。');
}
