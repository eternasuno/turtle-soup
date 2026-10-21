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
  const state = { loaded: 0, ended: false };
  let loaded = 0;
  onProgress?.({ file, loaded, total });

  const body = response.body!.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        loaded += chunk.byteLength;
        state.loaded = loaded;
        onProgress?.({ file, loaded, total });
        controller.enqueue(chunk);
      },
      flush() {
        state.ended = true;
      },
    }),
    { signal }
  );

  return { body, state };
}

function describeError(value: unknown): string {
  if (!(value instanceof Error)) return String(value);

  const nested =
    value.cause === undefined ? '' : `；cause=${String(value.cause)}`;

  return `${value.name}: ${value.message}${nested}`;
}

async function storageDetails(): Promise<string> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
      return '不可用';
    }

    const { usage, quota } = await navigator.storage.estimate();

    return `usage=${usage ?? '未知'} B，quota=${quota ?? '未知'} B`;
  } catch (cause) {
    return `读取失败（${describeError(cause)}）`;
  }
}

async function cacheFailureDetails(
  cause: unknown,
  response: Response,
  state: { loaded: number; ended: boolean },
  started: number
): Promise<string> {
  const elapsed = Math.round(performance.now() - started);
  const standalone =
    typeof matchMedia === 'function'
      ? matchMedia('(display-mode: standalone)').matches
      : '未知';
  const origin = response.url ? new URL(response.url).origin : '未知';
  const secure =
    typeof isSecureContext === 'undefined' ? '未知' : isSecureContext;
  const storage = await storageDetails();

  return [
    describeError(cause),
    `已接收=${state.loaded} B / ${response.headers.get('content-length') ?? '未知'} B`,
    `响应流正常结束=${state.ended}`,
    `耗时=${elapsed} ms`,
    `HTTP=${response.status}，type=${response.type}，来源=${origin}，重定向=${response.redirected}`,
    `网站存储：${storage}`,
    `安全上下文=${secure}，主屏幕模式=${standalone}，无痕模式=未知（无法可靠检测）`,
  ].join('；');
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

  const started = performance.now();
  const { body, state } = progressBody(response, file, signal, onProgress);
  try {
    await cache.put(url, new Response(body, { headers: response.headers }));
  } catch (cause) {
    signal.throwIfAborted();
    const detail = await cacheFailureDetails(cause, response, state, started);
    throw new Error(`模型文件缓存写入失败：${file}。诊断：${detail}`, {
      cause,
    });
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
