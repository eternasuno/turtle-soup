import { expect, it, vi } from 'vitest';
import { mocks, setup } from './laya-mocks';

const { downloadLaya } = await import('../src/laya');

it('streams missing model files into cache without initializing a model', async () => {
  setup();
  mocks.modelFiles.mockResolvedValue([
    'config.json',
    'onnx/model_fp16.onnx',
    'onnx/model_fp16.onnx_data',
  ]);
  const saved = new Map<string, ArrayBuffer>();
  const cache = {
    match: vi.fn(async (url: string) =>
      saved.has(url) ? new Response(saved.get(url)) : undefined
    ),
    put: vi.fn(async (url: string, response: Response) => {
      saved.set(url, await response.arrayBuffer());
    }),
  };
  vi.stubGlobal('caches', { open: async () => cache });
  const fetchFile = vi.fn(
    async () => new Response('data', { headers: { 'content-length': '4' } })
  );
  vi.stubGlobal('fetch', fetchFile);
  const progress = vi.fn();
  const signal = new AbortController().signal;
  await downloadLaya(signal, progress);
  expect(saved.size).toBe(5);
  expect(fetchFile).toHaveBeenCalledTimes(5);
  expect(fetchFile).toHaveBeenCalledWith(
    expect.stringContaining('/onnx/model_fp16.onnx_data'),
    { signal, credentials: 'omit' }
  );
  expect(progress).toHaveBeenCalledWith({
    file: 'onnx/model_fp16.onnx',
    loaded: 4,
    total: 4,
  });
  expect(mocks.model).not.toHaveBeenCalled();
  expect(mocks.tokenizer).not.toHaveBeenCalled();
  expect(mocks.config).toHaveBeenCalledWith(expect.any(String), {
    local_files_only: true,
  });
  await downloadLaya(signal);
  expect(fetchFile).toHaveBeenCalledTimes(5);
});

it('reports cache write failures instead of treating network completion as success', async () => {
  vi.stubGlobal('caches', {
    open: async () => ({
      match: async () => undefined,
      put: async (_url: string, response: Response) => {
        await response.body?.cancel();
        throw new DOMException('quota exceeded', 'QuotaExceededError');
      },
    }),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('data'))
  );
  await expect(downloadLaya(new AbortController().signal)).rejects.toThrow(
    '模型文件缓存写入失败：config.json'
  );
  expect(mocks.model).not.toHaveBeenCalled();
});

it('does not fetch files for an already cancelled download', async () => {
  const fetchFile = vi.fn();
  vi.stubGlobal('fetch', fetchFile);
  const controller = new AbortController();
  controller.abort();
  await expect(downloadLaya(controller.signal)).rejects.toThrow();
  expect(fetchFile).not.toHaveBeenCalled();
});
