import { env } from '@huggingface/transformers';
import { localModelDefinitions } from '@turtle-soup/core/model-management';
import { afterEach, expect, it, vi } from 'vitest';
import {
  deleteModelCache,
  ensureModelFiles,
  isModelCached,
} from '../src/model-cache';

const verdict = localModelDefinitions[1]!;
const d1 = localModelDefinitions[2]!;
const prefix = (id: string) =>
  `${env.remoteHost}${env.remotePathTemplate.replace('{model}', id).replace('{revision}', 'main')}`;

function cacheFor(urls: string[]) {
  const entries = new Set(urls);
  const cache = {
    keys: vi.fn(async () => [...entries].map((url) => ({ url }))),
    delete: vi.fn(async (key: { url: string }) => entries.delete(key.url)),
    match: vi.fn(async (url: string) =>
      entries.has(url) ? new Response('cached') : undefined
    ),
    put: vi.fn(async (url: string, _response: Response) => {
      entries.add(url);
    }),
  };
  vi.stubGlobal('caches', { open: vi.fn(async () => cache) });

  return { entries, cache };
}

afterEach(() => vi.unstubAllGlobals());

it('checks both Verdict precisions for management but only the selected backend for gameplay', async () => {
  const { entries } = cacheFor(
    verdict.files
      .filter((file) => !file.includes('fp16'))
      .map((file) => prefix(verdict.id) + file)
  );
  expect(await isModelCached(verdict.id)).toBe(false);
  expect(await isModelCached(verdict.id, 'wasm')).toBe(true);
  expect(await isModelCached(verdict.id, 'webgpu')).toBe(false);
  entries.add(prefix(verdict.id) + 'onnx/model_fp16.onnx');
  expect(await isModelCached(verdict.id)).toBe(true);
});

it('requires d1 external weights', async () => {
  const { entries } = cacheFor(
    d1.files
      .filter((file) => !file.endsWith('_data'))
      .map((file) => prefix(d1.id) + file)
  );
  expect(await isModelCached(d1.id, 'wasm')).toBe(false);
  entries.add(prefix(d1.id) + 'onnx/model_quantized.onnx_data');
  expect(await isModelCached(d1.id, 'webgpu')).toBe(true);
});

it('deletes selected model partial entries without touching another model or a similar prefix', async () => {
  const other = prefix(d1.id) + 'config.json';
  const similar =
    prefix(verdict.id).replace('/resolve/', '-other/resolve/') + 'config.json';
  const { entries } = cacheFor([
    prefix(verdict.id) + 'partial',
    other,
    similar,
  ]);
  await deleteModelCache(verdict.id);
  expect([...entries]).toEqual([other, similar]);
});

it('propagates inspection errors instead of reporting missing', async () => {
  vi.stubGlobal('caches', {
    open: vi.fn().mockRejectedValue(new Error('blocked')),
  });
  await expect(isModelCached(verdict.id)).rejects.toThrow('blocked');
});

it('verifies deletion', async () => {
  const { cache } = cacheFor([prefix(verdict.id) + 'partial']);
  cache.delete.mockResolvedValue(false);
  await expect(deleteModelCache(verdict.id)).rejects.toThrow('未完全删除');
});

it('fills missing Verdict fp16 after first inspecting a q8 cache and stores redirected responses under the resolve URL', async () => {
  const { entries, cache } = cacheFor(
    verdict.files
      .filter((file) => !file.includes('fp16'))
      .map((file) => prefix(verdict.id) + file)
  );
  expect(await isModelCached(verdict.id)).toBe(false);
  expect(await isModelCached(verdict.id, 'wasm')).toBe(true);
  const url = prefix(verdict.id) + 'onnx/model_fp16.onnx';
  const response = new Response('fp16');
  Object.defineProperties(response, {
    redirected: { value: true },
    url: { value: `${env.remoteHost}redirected-model_fp16.onnx` },
  });
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal('fetch', fetchMock);

  await ensureModelFiles(verdict.id);

  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(new URL(url), {
    redirect: 'follow',
    credentials: 'omit',
  });
  expect(cache.put).toHaveBeenCalledExactlyOnceWith(url, response);
  expect(entries.has(response.url)).toBe(false);
  expect(await isModelCached(verdict.id)).toBe(true);
  expect(await isModelCached(verdict.id, 'webgpu')).toBe(true);
  await ensureModelFiles(verdict.id);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each(['http', 'network', 'incomplete'] as const)(
  'rejects %s download failures without marking Verdict complete',
  async (failure) => {
    const { entries, cache } = cacheFor(
      verdict.files
        .filter((file) => !file.includes('fp16'))
        .map((file) => prefix(verdict.id) + file)
    );
    const url = prefix(verdict.id) + 'onnx/model_fp16.onnx';
    const fetchMock = vi.fn(async () => new Response('fp16'));
    if (failure === 'http') {
      fetchMock.mockResolvedValue(new Response('unavailable', { status: 503 }));
    } else if (failure === 'network') {
      fetchMock.mockRejectedValue(new Error('network failed'));
    } else {
      cache.put.mockImplementation(async () => {});
    }

    vi.stubGlobal('fetch', fetchMock);
    await expect(ensureModelFiles(verdict.id)).rejects.toThrow(
      {
        http: '模型文件下载失败：onnx/model_fp16.onnx',
        network: 'network failed',
        incomplete: '模型下载后缓存仍不完整',
      }[failure]
    );
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(new URL(url), {
      redirect: 'follow',
      credentials: 'omit',
    });
    expect(cache.put).toHaveBeenCalledTimes(failure === 'incomplete' ? 1 : 0);
    expect(entries.has(url)).toBe(false);
    expect(await isModelCached(verdict.id)).toBe(false);
    expect(await isModelCached(verdict.id, 'wasm')).toBe(true);
  }
);
