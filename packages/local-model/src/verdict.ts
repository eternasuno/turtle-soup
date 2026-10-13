import {
  AutoModel,
  AutoTokenizer,
  env,
  mean_pooling,
} from '@huggingface/transformers';
import { ChoiceAnswer, DecisionRequest } from '@turtle-soup/core/decision';
import { Schema } from 'effect';

const MODEL = 'Manav2op/verdict-small';
const VERDICT_MAX_TOKENS = 512;
const Vector = Schema.Array(Schema.Number.check(Schema.isFinite())).check(
  Schema.isMinLength(1)
);
const Embeddings = Schema.Array(Vector);
const Progress = Schema.Struct({
  status: Schema.Literal('progress'),
  file: Schema.String,
  loaded: Schema.Number.check(
    Schema.isFinite(),
    Schema.isGreaterThanOrEqualTo(0)
  ),
  total: Schema.Number.check(
    Schema.isFinite(),
    Schema.isGreaterThanOrEqualTo(0)
  ),
});

type VerdictModel = Awaited<ReturnType<typeof AutoModel.from_pretrained>>;

type VerdictTokenizer = Awaited<
  ReturnType<typeof AutoTokenizer.from_pretrained>
>;

type VerdictProgress = (progress: Schema.Schema.Type<typeof Progress>) => void;

async function acquireModel(
  backend: 'wasm' | 'webgpu',
  cacheOnly: boolean,
  onProgress?: VerdictProgress
) {
  env.allowLocalModels = cacheOnly;
  const options = {
    local_files_only: cacheOnly,
    progress_callback: (event: unknown) => {
      if (Schema.is(Progress)(event)) onProgress?.(event);
    },
  };
  const model = await AutoModel.from_pretrained(MODEL, {
    ...options,
    device: backend,
    dtype: backend === 'wasm' ? 'q8' : 'fp16',
    session_options: { executionProviders: [backend] },
  });
  try {
    const tokenizer = await AutoTokenizer.from_pretrained(MODEL, options);
    tokenizer.config.model_max_length = VERDICT_MAX_TOKENS;

    return { model, tokenizer };
  } catch (error) {
    await model.dispose();
    throw error;
  }
}

function prepareRequest(raw: DecisionRequest, tokenizer: VerdictTokenizer) {
  const payload = structuredClone(
    Schema.decodeUnknownSync(DecisionRequest)(raw)
  );
  const texts = [
    `query: ${payload.state}`,
    ...Object.values(payload.questions).flatMap((question) =>
      Object.values(question.criteria).map(
        (description) => `passage: ${question.instructions} ${description}`
      )
    ),
  ];
  for (const text of texts) {
    const count = tokenizer.encode(text, { add_special_tokens: true }).length;
    if (count > VERDICT_MAX_TOKENS)
      throw new Error(
        `Verdict input has ${count} tokens; maximum is ${VERDICT_MAX_TOKENS} (no truncation).`
      );
  }

  return { payload, texts };
}

async function encode(
  texts: string[],
  model: VerdictModel,
  tokenizer: VerdictTokenizer
) {
  const inputs = tokenizer(texts, {
    padding: true,
    truncation: false,
    max_length: VERDICT_MAX_TOKENS,
  });
  const outputs = await model(inputs);
  const hidden =
    outputs.last_hidden_state ?? outputs.logits ?? outputs.token_embeddings;
  if (!hidden) {
    throw new Error(
      `Verdict returned no token embeddings (outputs: ${Object.keys(outputs).join(', ')}).`
    );
  }

  const vectors = Schema.decodeUnknownSync(Embeddings)(
    mean_pooling(hidden, inputs.attention_mask).normalize(2, -1).tolist()
  );
  if (
    vectors.length !== texts.length ||
    vectors.some(
      (v) => v.length !== vectors[0]!.length || !v.some((x) => x !== 0)
    )
  ) {
    throw new Error('Invalid Verdict embedding dimensions or zero vector.');
  }

  return vectors;
}

function chooseAnswer(labels: string[], logits: number[]): ChoiceAnswer {
  const max = Math.max(...logits);
  const weights = logits.map((value) => Math.exp(value - max));
  const total = weights.reduce((sum, value) => sum + value, 0);
  const probabilities = weights.map((value) => value / total);
  const best = logits.indexOf(max);

  return Schema.decodeUnknownSync(ChoiceAnswer)({
    type: 'choice',
    choice: labels[best],
    confidence: probabilities[best],
    probabilities: Object.fromEntries(
      labels.map((label, i) => [label, probabilities[i]])
    ),
  });
}

function judge(
  payload: DecisionRequest,
  vectors: readonly (readonly number[])[]
) {
  const query = vectors[0]!;
  let offset = 1;

  return Object.fromEntries(
    Object.entries(payload.questions).map(([id, question]) => {
      const labels = Object.keys(question.criteria);
      const logits = labels.map(() => {
        const vector = vectors[offset++]!;

        return (
          20 * vector.reduce((sum, value, i) => sum + value * query[i]!, 0)
        );
      });

      return [id, chooseAnswer(labels, logits)];
    })
  );
}

function createClient(model: VerdictModel, tokenizer: VerdictTokenizer) {
  let queue: Promise<unknown> = Promise.resolve();
  let closing: Promise<void> | undefined;

  return {
    request(raw: DecisionRequest): Promise<Record<string, ChoiceAnswer>> {
      if (closing)
        return Promise.reject(new Error('Verdict model is disposed.'));

      try {
        const { payload, texts } = prepareRequest(raw, tokenizer);
        const result = queue.then(async () => {
          const vectors = await encode(texts, model, tokenizer);

          return judge(payload, vectors);
        });
        queue = result.catch(() => undefined);

        return result;
      } catch (error) {
        return Promise.reject(error);
      }
    },
    dispose() {
      closing ??= queue.then(async () => {
        await model.dispose();
      });

      return closing;
    },
  };
}

export async function loadVerdict(
  backend: 'wasm' | 'webgpu',
  cacheOnly: boolean,
  onProgress?: VerdictProgress
) {
  const { model, tokenizer } = await acquireModel(
    backend,
    cacheOnly,
    onProgress
  );

  return createClient(model, tokenizer);
}
