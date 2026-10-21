import { AutoConfig, env, ModelRegistry } from '@huggingface/transformers';
import type { ModelDownloadProgress } from '@turtle-soup/core/model-management';

function progressBody(
  response: Response,
  file: string,
  signal: AbortSignal,
  onProgress?: (progress: ModelDownloadProgress) => void
) {
  const size = Number(response.headers.get('content-length'));
  const total = Number.isFinite(size) && size > 0 ? size : 0;
  let loaded = 0;
  onProgress?.({ file, loaded, total });

  return response.body!.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        loaded += chunk.byteLength;
        onProgress?.({ file, loaded, total });
        controller.enqueue(chunk);
      },
    }),
    { signal }
  );
}

export async function downloadCachedFile(
  cache: Cache,
  url: string,
  file: string,
  signal: AbortSignal,
  onProgress?: (progress: ModelDownloadProgress) => void
): Promise<void> {
  signal.throwIfAborted();
  if (await cache.match(url)) return;

  const response = await fetch(url, { signal, credentials: 'omit' });
  if (!response.ok || !response.body) {
    throw new Error(`模型文件下载失败：${file}（HTTP ${response.status}）`);
  }

  const body = progressBody(response, file, signal, onProgress);
  try {
    await cache.put(url, new Response(body, { headers: response.headers }));
  } catch (cause) {
    signal.throwIfAborted();
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `模型文件缓存写入失败：${file}。请检查设备可用存储空间后重试。${detail}`
    );
  }

  signal.throwIfAborted();
  if (!(await cache.match(url))) {
    throw new Error(`模型文件未能保存到缓存：${file}，请重试。`);
  }
}

export async function downloadModelFiles(
  signal: AbortSignal,
  onProgress?: (progress: ModelDownloadProgress) => void
): Promise<void> {
  signal.throwIfAborted();
  if (typeof caches === 'undefined') {
    throw new Error('此浏览器不支持模型缓存，请使用 API 模式。');
  }

  const cache = await caches.open(env.cacheKey);
  const prefix = `${env.remoteHost}${env.remotePathTemplate
    .replace('{model}', 'onnx-community/laya-multilingual-ONNX')
    .replace('{revision}', 'main')}`;
  const downloadFile = (file: string) =>
    downloadCachedFile(cache, `${prefix}${file}`, file, signal, onProgress);
  await downloadFile('config.json');
  env.allowLocalModels = true;
  const config = await AutoConfig.from_pretrained(
    'onnx-community/laya-multilingual-ONNX',
    { local_files_only: true }
  );
  const files = await ModelRegistry.get_model_files(
    'onnx-community/laya-multilingual-ONNX',
    { config, dtype: 'fp16', device: 'wasm' }
  );
  for (const file of new Set([
    ...files,
    'tokenizer.json',
    'tokenizer_config.json',
  ])) {
    await downloadFile(file);
  }

  signal.throwIfAborted();
}
