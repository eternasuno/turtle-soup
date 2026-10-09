import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  tokenizer: vi.fn(),
  model: vi.fn(),
  modelFiles: vi.fn(),
  env: {
    allowLocalModels: false,
    cacheKey: 'transformers-cache',
    remoteHost: 'https://huggingface.co/',
    remotePathTemplate: '{model}/resolve/{revision}/',
  },
}));

vi.mock('@huggingface/transformers', () => ({
  env: mocks.env,
  AutoConfig: { from_pretrained: mocks.config },
  AutoTokenizer: { from_pretrained: mocks.tokenizer },
  AutoModel: { from_pretrained: mocks.model },
  ModelRegistry: { get_model_files: mocks.modelFiles },
  Tensor: class Tensor {
    constructor(
      public type: string,
      public data: ArrayLike<number | bigint>,
      public dims: number[]
    ) {}
  },
}));

import { deleteLayaCache, isLayaCached, loadLaya } from '../src/laya';

const payload = (state = 'fact') => ({
  model: 'jev-latest' as const,
  state,
  questions: {
    answer: {
      type: 'choice' as const,
      instructions: 'Select an answer',
      criteria: { yes: 'It is true', no: 'It is false' },
    },
  },
});

function setup() {
  const dispose = vi.fn(async () => {});
  const tokenizer = Object.assign(
    (text: string) => ({
      input_ids: {
        data: text.trim()
          ? text
              .trim()
              .split(' ')
              .map((word) => word.length)
          : [],
      },
    }),
    {
      config: {
        cls_token: 'C',
        sep_token: 'S',
        mask_token: 'M',
        pad_token: 'P',
      },
    }
  );
  mocks.config.mockResolvedValue({
    laya: { head_max_len: 128, max_len: 256, temperature: [2] },
  });
  mocks.tokenizer.mockResolvedValue(tokenizer);
  mocks.model.mockResolvedValue(
    Object.assign(
      async (
        inputs: Record<
          string,
          { type: string; data: ArrayLike<number | bigint>; dims: number[] }
        >
      ) => {
        expect(inputs['input_ids']!.type).toBe('int64');
        expect(inputs['marker_pos']!.dims).toEqual([1, 2]);
        expect(inputs['marker_mask']!.type).toBe('bool');
        expect(inputs['attention_mask']!.dims).toEqual(
          inputs['input_ids']!.dims
        );
        return { logits: { to: () => ({ data: [4, 2] }) } };
      },
      { dispose }
    )
  );
  return { dispose };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  mocks.env.allowLocalModels = false;
});

it('deletes only Laya cache entries, including incomplete downloads', async () => {
  const prefix =
    'https://huggingface.co/onnx-community/laya-multilingual-ONNX/resolve/main/';
  const keys = [
    { url: `${prefix}config.json` },
    { url: `${prefix}onnx/model_fp16.onnx` },
    { url: 'https://huggingface.co/other/model/resolve/main/config.json' },
  ];
  const remove = vi.fn(async (key: { url: string }) => {
    keys.splice(keys.indexOf(key), 1);

    return true;
  });
  const originalKeys = [...keys];
  vi.stubGlobal('caches', {
    open: async () => ({ keys: async () => keys, delete: remove }),
  });

  await deleteLayaCache();

  expect(remove).toHaveBeenCalledTimes(2);
  expect(remove).toHaveBeenCalledWith(originalKeys[0]);
  expect(remove).toHaveBeenCalledWith(originalKeys[1]);
  expect(remove).not.toHaveBeenCalledWith(originalKeys[2]);
});

it.each([
  { files: [] },
  { files: ['config.json'] },
  { files: ['config.json', 'onnx/model_fp16.onnx', 'tokenizer.json'] },
  {
    files: [
      'config.json',
      'onnx/model_fp16.onnx',
      'tokenizer.json',
      'tokenizer_config.json',
    ],
  },
])(
  'checks complete fp16 cache without loading model: $files',
  async ({ files }) => {
    setup();
    mocks.config.mockImplementation(async () => {
      if (!mocks.env.allowLocalModels) {
        throw new Error('local models are disabled');
      }

      return { model_type: 'laya' };
    });
    mocks.modelFiles.mockResolvedValue(['config.json', 'onnx/model_fp16.onnx']);
    const prefix =
      'https://huggingface.co/onnx-community/laya-multilingual-ONNX/resolve/main/';
    vi.stubGlobal('caches', {
      open: vi.fn(async () => ({
        keys: async () => files.map((file) => ({ url: `${prefix}${file}` })),
      })),
    });

    expect(await isLayaCached()).toBe(files.length === 4);
    expect(mocks.model).not.toHaveBeenCalled();
    if (files.length > 0) {
      expect(mocks.config).toHaveBeenCalledWith(
        'onnx-community/laya-multilingual-ONNX',
        { local_files_only: true }
      );
    }
  }
);

it('loads WASM fp16 without WebGPU and never selects fp32', async () => {
  setup();
  vi.stubGlobal('navigator', {});
  mocks.env.allowLocalModels = true;
  const model = await loadLaya();

  expect(mocks.env.allowLocalModels).toBe(false);
  expect(mocks.model).toHaveBeenCalledExactlyOnceWith(
    'onnx-community/laya-multilingual-ONNX',
    expect.objectContaining({
      device: 'wasm',
      dtype: 'fp16',
      session_options: { executionProviders: ['wasm'] },
    })
  );
  await model.dispose();
});

it('decodes nested config, builds described tensors, calibrates finite output, and queues disposal', async () => {
  const { dispose } = setup();
  vi.stubGlobal('navigator', {
    gpu: {
      requestAdapter: async () => ({ features: new Set(['shader-f16']) }),
    },
  });
  const laya = await loadLaya();
  const answer = await laya.request(payload());
  expect(answer['answer']!).toMatchObject({ type: 'choice', choice: 'yes' });
  const pending = laya.request(payload());
  const disposing = laya.dispose();
  await pending;
  await disposing;
  expect(dispose).toHaveBeenCalledTimes(1);
  await expect(
    Promise.resolve().then(() => laya.request(payload()))
  ).rejects.toThrow(/disposed/);
});

it('rejects state truncation instead of silently dropping tokens', async () => {
  setup();
  vi.stubGlobal('navigator', {
    gpu: {
      requestAdapter: async () => ({ features: new Set(['shader-f16']) }),
    },
  });
  const laya = await loadLaya();
  await expect(laya.request(payload('x '.repeat(100000)))).rejects.toThrow(
    /does not fit/
  );
  await laya.dispose();
});

it('disposes a model loaded after the caller aborts exactly once', async () => {
  const { dispose } = setup();
  vi.stubGlobal('navigator', {
    gpu: {
      requestAdapter: async () => ({ features: new Set(['shader-f16']) }),
    },
  });
  let resolveModel!: (model: unknown) => void;
  mocks.model.mockReturnValue(
    new Promise((resolve) => {
      resolveModel = resolve;
    })
  );
  const controller = new AbortController();
  const loading = loadLaya(undefined, controller.signal);
  await vi.waitFor(() => expect(mocks.model).toHaveBeenCalled());
  controller.abort();
  resolveModel(
    Object.assign(async () => ({ logits: { to: () => ({ data: [] }) } }), {
      dispose,
    })
  );
  await expect(loading).rejects.toMatchObject({ name: 'AbortError' });
  expect(dispose).toHaveBeenCalledTimes(1);
});

it('rejects cache-only loading after cache deletion without fetching files', async () => {
  setup();
  vi.stubGlobal('caches', {
    open: async () => ({ keys: async () => [] }),
  });

  await expect(loadLaya(undefined, undefined, 'wasm', true)).rejects.toThrow(
    '模型缓存不完整，请先下载模型。'
  );
  expect(mocks.config).not.toHaveBeenCalled();
  expect(mocks.model).not.toHaveBeenCalled();
});

it('selects WebGPU with fp16 and cache-only loading for separate testing', async () => {
  setup();
  mocks.modelFiles.mockResolvedValue(['config.json', 'onnx/model_fp16.onnx']);
  const prefix =
    'https://huggingface.co/onnx-community/laya-multilingual-ONNX/resolve/main/';
  vi.stubGlobal('caches', {
    open: async () => ({
      keys: async () =>
        [
          'config.json',
          'onnx/model_fp16.onnx',
          'tokenizer.json',
          'tokenizer_config.json',
        ].map((file) => ({ url: `${prefix}${file}` })),
    }),
  });
  const model = await loadLaya(undefined, undefined, 'webgpu', true);

  expect(mocks.env.allowLocalModels).toBe(true);

  expect(mocks.model).toHaveBeenCalledExactlyOnceWith(
    'onnx-community/laya-multilingual-ONNX',
    expect.objectContaining({
      device: 'webgpu',
      session_options: { executionProviders: ['webgpu'] },
      dtype: 'fp16',
      local_files_only: true,
    })
  );
  expect(mocks.tokenizer).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ local_files_only: true })
  );
  await model.dispose();
});
