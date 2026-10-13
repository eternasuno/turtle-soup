import { afterEach, expect, vi } from 'vitest';

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

export { mocks };

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

export const payload = (state = 'fact') => ({
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

export function setup() {
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

export function completeCache() {
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
}
