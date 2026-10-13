import { Tensor } from '@huggingface/transformers';
import { beforeEach, expect, it, vi } from 'vitest';
import { loadD1 } from '../src/d1';
import { runD1Inference } from '../src/d1-encoding';

const mocks = vi.hoisted(() => ({
  config: vi.fn(async () => ({
    temperatures: { 'choice:2': 2 },
    'transformers.js_config': { retained: true },
  })),
  model: vi.fn(),
  tokenizer: vi.fn(),
  env: { allowLocalModels: false },
}));

vi.mock('@huggingface/transformers', async (original) => ({
  ...(await original<typeof import('@huggingface/transformers')>()),
  AutoConfig: { from_pretrained: mocks.config },
  AutoModel: { from_pretrained: mocks.model },
  AutoTokenizer: { from_pretrained: mocks.tokenizer },
  env: mocks.env,
}));

const payload = {
  model: 'd1',
  state: '<|mask|>',
  questions: {
    first: {
      type: 'choice' as const,
      instructions: '<|reserved_8|>',
      criteria: { yes: 'holds', no: 'fails' },
    },
    second: {
      type: 'choice' as const,
      instructions: 'other',
      criteria: { a: 'A', b: 'B', c: 'C' },
    },
  },
};
const encode = vi.fn((_text: string) => [42]);
const forward = vi.fn(async (_feeds: Record<string, Tensor>) => ({
  logits: new Tensor('float32', [2, 0, 999, 0, 1, 2], [2, 3]),
}));
const dispose = vi.fn(async () => {});

beforeEach(() => {
  vi.clearAllMocks();
  encode.mockReturnValue([42]);
  mocks.model.mockResolvedValue({ forward, dispose });
  mocks.tokenizer.mockResolvedValue({ encode });
});

it('batches complete escaped rows, pads markers and returns calibrated full probabilities', async () => {
  const answers = await runD1Inference(
    payload,
    { temperatures: { 'choice:2': 2 } },
    { encode },
    { forward }
  );
  expect(encode).toHaveBeenCalledWith('<¦mask¦>', {
    add_special_tokens: false,
  });
  expect(encode).toHaveBeenCalledWith('<¦reserved_8¦>', {
    add_special_tokens: false,
  });
  expect(encode).toHaveBeenCalledWith(' yes: holds', {
    add_special_tokens: false,
  });
  const feeds = forward.mock.calls[0]![0] as unknown as Record<string, Tensor>;
  expect(Object.keys(feeds)).toEqual([
    'input_ids',
    'attention_mask',
    'prefix_len',
    'marker_pos',
    'marker_mask',
    'qtype',
  ]);
  expect(feeds['input_ids']!.dims).toEqual([2, 18]);
  expect(Array.from(feeds['input_ids']!.data).slice(0, 14)).toEqual([
    1n,
    17n,
    42n,
    18n,
    42n,
    19n,
    16n,
    42n,
    20n,
    19n,
    16n,
    42n,
    20n,
    21n,
  ]);
  expect(Array.from(feeds['marker_pos']!.data)).toEqual([
    6n,
    10n,
    0n,
    6n,
    10n,
    14n,
  ]);
  expect(Array.from(feeds['marker_mask']!.data)).toEqual([
    1n,
    1n,
    0n,
    1n,
    1n,
    1n,
  ]);
  for (const feed of Object.values(feeds)) expect(feed.type).toBe('int64');
  expect(answers['first']!.confidence).toBeCloseTo(1 / (1 + Math.exp(-1)));
  expect(
    Object.values(answers['second']!.probabilities!).reduce((a, b) => a + b, 0)
  ).toBeCloseTo(1);
});

it('accepts exactly 16384 tokens and rejects overflow without truncation or inference', async () => {
  const single = { ...payload, questions: { first: payload.questions.first } };
  encode.mockImplementation((text) =>
    text === '<¦mask¦>' ? Array<number>(16371).fill(42) : [42]
  );
  const model = {
    forward: vi.fn(async () => ({
      logits: new Tensor('float32', [1, 0], [1, 2]),
    })),
  };
  await runD1Inference(single, {}, { encode }, model);
  encode.mockImplementation((text) =>
    text === '<¦mask¦>' ? Array<number>(16372).fill(42) : [42]
  );
  await expect(runD1Inference(single, {}, { encode }, model)).rejects.toThrow(
    '16385 tokens'
  );
  expect(model.forward).toHaveBeenCalledTimes(1);
});

it.each(['wasm', 'webgpu'] as const)(
  'loads q8 external data with %s and releases queued work once',
  async (backend) => {
    const client = await loadD1(backend, true);
    expect(mocks.env.allowLocalModels).toBe(true);
    for (const loader of [mocks.config, mocks.tokenizer]) {
      expect(loader).toHaveBeenCalledExactlyOnceWith(
        'onnx-community/d1-omni-600M-ONNX',
        expect.objectContaining({ local_files_only: true })
      );
    }

    expect(mocks.model).toHaveBeenCalledExactlyOnceWith(
      'onnx-community/d1-omni-600M-ONNX',
      expect.objectContaining({
        dtype: 'q8',
        device: backend,
        local_files_only: true,
        session_options: { executionProviders: [backend] },
        config: expect.objectContaining({
          'transformers.js_config': {
            retained: true,
            dtype: 'q8',
            use_external_data_format: { 'model_quantized.onnx': 1 },
          },
        }),
      })
    );
    const pending = client.request(payload);
    const closing = client.dispose();
    await expect(client.request(payload)).rejects.toThrow('disposed');
    await pending;
    await closing;
    await client.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  }
);

it('releases model sessions after tokenizer failure', async () => {
  mocks.tokenizer.mockRejectedValueOnce(new Error('tokenizer failed'));
  await expect(loadD1('wasm', false)).rejects.toThrow('tokenizer failed');
  expect(mocks.env.allowLocalModels).toBe(false);
  expect(dispose).toHaveBeenCalledTimes(1);
});
