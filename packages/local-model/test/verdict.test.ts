import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadVerdict } from '../src/verdict';

const mocks = vi.hoisted(() => {
  const dispose = vi.fn(async () => {});
  const model = vi.fn<() => Promise<Record<string, string>>>(async () => ({
    last_hidden_state: 'hidden',
  }));
  Object.assign(model, { dispose });
  const encode = vi.fn(() => [1, 2]);
  const tokenizer = Object.assign(
    vi.fn(() => ({ attention_mask: 'mask' })),
    { encode, config: { model_max_length: 96 } }
  );
  const normalize = vi.fn(() => ({
    tolist: () => [
      [1, 0],
      [1, 0],
      [0, 1],
    ],
  }));

  return {
    model,
    dispose,
    tokenizer,
    encode,
    normalize,
    pooling: vi.fn(() => ({ normalize })),
    loadModel: vi.fn(async () => model),
    loadTokenizer: vi.fn(async () => tokenizer),
    env: { allowLocalModels: false },
  };
});

vi.mock('@huggingface/transformers', () => ({
  AutoModel: { from_pretrained: mocks.loadModel },
  AutoTokenizer: { from_pretrained: mocks.loadTokenizer },
  mean_pooling: mocks.pooling,
  env: mocks.env,
}));

const payload = {
  model: 'verdict',
  state: '谜面和谜底',
  questions: {
    fact: {
      type: 'choice' as const,
      instructions: '判断事实',
      criteria: { yes: '成立', no: '不成立' },
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.model.mockResolvedValue({ last_hidden_state: 'hidden' });
  mocks.encode.mockReturnValue([1, 2]);
  mocks.tokenizer.config.model_max_length = 96;
  mocks.loadTokenizer.mockResolvedValue(mocks.tokenizer);
  mocks.normalize.mockReturnValue({
    tolist: () => [
      [1, 0],
      [1, 0],
      [0, 1],
    ],
  });
});

describe('Verdict', () => {
  it.each([
    ['wasm', 'q8', false],
    ['webgpu', 'fp16', true],
  ] as const)(
    'loads %s with %s and cacheOnly=%s',
    async (backend, dtype, cacheOnly) => {
      const client = await loadVerdict(backend, cacheOnly);
      expect(mocks.env.allowLocalModels).toBe(cacheOnly);
      expect(mocks.tokenizer.config.model_max_length).toBe(512);
      expect(mocks.loadModel).toHaveBeenCalledWith(
        'Manav2op/verdict-small',
        expect.objectContaining({
          device: backend,
          dtype,
          local_files_only: cacheOnly,
          session_options: { executionProviders: [backend] },
        })
      );
      await client.dispose();
    }
  );

  it('uses prefixed descriptions, mean normalized embeddings and full softmax', async () => {
    const client = await loadVerdict('wasm', false);
    const answer = (await client.request(payload))['fact']!;
    expect(mocks.tokenizer).toHaveBeenCalledWith(
      [
        'query: 谜面和谜底',
        'passage: 判断事实 成立',
        'passage: 判断事实 不成立',
      ],
      { padding: true, truncation: false, max_length: 512 }
    );
    expect(mocks.pooling).toHaveBeenCalledWith('hidden', 'mask');
    expect(mocks.normalize).toHaveBeenCalledWith(2, -1);
    expect(answer.choice).toBe('yes');
    expect(answer.confidence).toBeCloseTo(1 / (1 + Math.exp(-20)), 12);
    expect(answer.probabilities!['no']).toBeCloseTo(
      Math.exp(-20) / (1 + Math.exp(-20)),
      12
    );
    expect(
      answer.probabilities!['yes']! + answer.probabilities!['no']!
    ).toBeCloseTo(1);
    await client.dispose();
  });

  it.each(['logits', 'token_embeddings'])(
    'accepts token embeddings named %s',
    async (name) => {
      mocks.model.mockResolvedValue({ [name]: 'hidden' });
      const client = await loadVerdict('wasm', true);
      const answer = (await client.request(payload))['fact']!;
      expect(answer.choice).toBe('yes');
      expect(mocks.pooling).toHaveBeenCalledWith('hidden', 'mask');
      await client.dispose();
    }
  );

  it('reports missing embeddings before pooling', async () => {
    mocks.model.mockResolvedValue({ unexpected: 'output' });
    const client = await loadVerdict('wasm', true);
    await expect(client.request(payload)).rejects.toThrow(
      'outputs: unexpected'
    );
    expect(mocks.pooling).not.toHaveBeenCalled();
    await client.dispose();
  });

  it('accepts 512 tokens, rejects 513 without inference, and remains usable', async () => {
    const client = await loadVerdict('wasm', false);
    mocks.encode.mockReturnValue(Array(513).fill(1));
    await expect(client.request(payload)).rejects.toThrow('513 tokens');
    expect(mocks.model).not.toHaveBeenCalled();
    mocks.encode.mockReturnValue(Array(512).fill(1));
    await client.request(payload);
    await client.dispose();
  });

  it('validates payloads and untrusted model results', async () => {
    const client = await loadVerdict('wasm', false);
    await expect(client.request({ ...payload, state: '' })).rejects.toThrow();
    mocks.normalize.mockReturnValue({
      tolist: () => [
        [NaN, 0],
        [1, 0],
        [0, 1],
      ],
    });
    await expect(client.request(payload)).rejects.toThrow();
    mocks.normalize.mockReturnValue({ tolist: () => [[1, 0]] });
    await expect(client.request(payload)).rejects.toThrow('dimensions');
    await client.dispose();
  });

  it('disposes after queued requests and rejects new work, only once', async () => {
    const client = await loadVerdict('wasm', false);
    const pending = client.request(payload);
    const closing = client.dispose();
    await expect(client.request(payload)).rejects.toThrow('disposed');
    await pending;
    await closing;
    await client.dispose();
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });

  it('snapshots request aliases before queued inference', async () => {
    const client = await loadVerdict('wasm', false);
    const mutable = structuredClone(payload);
    const pending = client.request(mutable);
    mutable.state = 'changed';
    mutable.questions.fact.criteria.yes = 'changed';
    mutable.questions.fact.criteria.no = 'changed';
    const answer = await pending;
    expect(mocks.tokenizer).toHaveBeenCalledWith(
      [
        'query: 谜面和谜底',
        'passage: 判断事实 成立',
        'passage: 判断事实 不成立',
      ],
      { padding: true, truncation: false, max_length: 512 }
    );
    expect(answer['fact']?.choice).toBe('yes');
    expect(mocks.encode).toHaveBeenCalledTimes(3);
    await client.dispose();
  });

  it('serializes inference and disposal while a model call is in flight', async () => {
    const client = await loadVerdict('wasm', false);
    let release!: () => void;
    let started!: () => void;
    const running = new Promise<void>((resolve) => {
      started = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.model.mockImplementationOnce(async () => {
      started();
      await blocked;

      return { last_hidden_state: 'hidden' };
    });
    const first = client.request(payload);
    await running;
    const second = client.request(payload);
    const closing = client.dispose();
    expect(mocks.model).toHaveBeenCalledTimes(1);
    expect(mocks.dispose).not.toHaveBeenCalled();
    await expect(client.request(payload)).rejects.toThrow('disposed');
    release();
    await Promise.all([first, second, closing]);
    expect(mocks.model).toHaveBeenCalledTimes(2);
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });

  it('pads real tokenizer batches beyond its original 96-token limit without truncation', async () => {
    const { PreTrainedTokenizer } = await vi.importActual<
      typeof import('@huggingface/transformers')
    >('@huggingface/transformers');
    const tokenizer = new PreTrainedTokenizer(
      {
        version: '1.0',
        added_tokens: [],
        normalizer: null,
        pre_tokenizer: { type: 'Whitespace' },
        post_processor: null,
        decoder: null,
        model: {
          type: 'WordLevel',
          vocab: { '[PAD]': 0, '[UNK]': 1, word: 2 },
          unk_token: '[UNK]',
        },
      },
      { model_max_length: 96, pad_token: '[PAD]', unk_token: '[UNK]' }
    );
    const texts = [100, 200].map((length) =>
      Array(length).fill('word').join(' ')
    );
    const options = { padding: true, truncation: false, max_length: 512 };
    expect(() => tokenizer(texts, options)).toThrow();
    mocks.loadTokenizer.mockResolvedValueOnce(
      tokenizer as unknown as typeof mocks.tokenizer
    );
    const client = await loadVerdict('wasm', true);
    expect(tokenizer.model_max_length).toBe(512);
    const inputs = tokenizer(texts, options);
    expect(inputs.input_ids.dims).toEqual([2, 200]);
    expect(inputs.attention_mask.dims).toEqual([2, 200]);
    expect(
      inputs.attention_mask
        .tolist()
        .map((row: bigint[]) => row.reduce((sum, value) => sum + value, 0n))
    ).toEqual([100n, 200n]);
    expect(
      inputs.input_ids
        .tolist()
        .map((row: bigint[], index: number) =>
          row.slice(0, index === 0 ? 100 : 200)
        )
    ).toEqual([Array(100).fill(2n), Array(200).fill(2n)]);
    await client.dispose();
  });

  it('releases the model when tokenizer loading fails', async () => {
    mocks.loadTokenizer.mockRejectedValueOnce(new Error('tokenizer failed'));
    await expect(loadVerdict('wasm', false)).rejects.toThrow(
      'tokenizer failed'
    );
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });
});
