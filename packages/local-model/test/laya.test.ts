import { expect, it, vi } from 'vitest';
import { completeCache, mocks, payload, setup } from './laya-mocks';

const { deleteLayaCache, isLayaCached, loadLaya } = await import('../src/laya');

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

  expect(mocks.env.allowLocalModels).toBe(true);
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
  expect(answer['answer']!.probabilities).toEqual({
    yes: 1 / (1 + Math.exp(-1)),
    no: Math.exp(-1) / (1 + Math.exp(-1)),
  });
  expect(answer['answer']!.confidence).toBe(
    answer['answer']!.probabilities!['yes']
  );
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

  expect(mocks.env.allowLocalModels).toBe(false);

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

it('serializes cache inspection against download and restores global environment', async () => {
  setup();
  completeCache();
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  mocks.tokenizer.mockImplementationOnce(async () => {
    expect(mocks.env.allowLocalModels).toBe(false);
    await gate;
    expect(mocks.env.allowLocalModels).toBe(false);

    return { config: {} };
  });
  const loading = loadLaya();
  await vi.waitFor(() => expect(mocks.tokenizer).toHaveBeenCalled());
  const inspection = isLayaCached();
  await Promise.resolve();
  expect(mocks.config).toHaveBeenCalledTimes(1);
  finish();
  const model = await loading;
  expect(await inspection).toBe(true);
  expect(mocks.env.allowLocalModels).toBe(false);
  await model.dispose();
});

it('preserves prototype-named answer IDs and choice probabilities', async () => {
  setup();
  const laya = await loadLaya();
  const request = {
    ...payload(),
    questions: Object.fromEntries([
      [
        '__proto__',
        {
          ...payload().questions.answer,
          criteria: Object.fromEntries([
            ['__proto__', 'It is true'],
            ['constructor', 'It is false'],
          ]),
        },
      ],
    ]),
  };
  const answers = await laya.request(request);
  const answer = answers['__proto__']!;

  expect(Object.getPrototypeOf(answers)).toBeNull();
  expect(Object.hasOwn(answers, '__proto__')).toBe(true);
  expect(answer.choice).toBe('__proto__');
  expect(Object.hasOwn(answer.probabilities!, '__proto__')).toBe(true);
  expect(answer.probabilities!['__proto__']).toBeCloseTo(0.7310585786);
  expect(answer.probabilities!['constructor']).toBeCloseTo(0.2689414214);
  expect(answer.confidence).toBe(answer.probabilities!['__proto__']);
  await laya.dispose();
});
