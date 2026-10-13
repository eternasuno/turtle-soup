import { Tensor } from '@huggingface/transformers';
import { ChoiceAnswer, DecisionRequest } from '@turtle-soup/core/decision';
import { Schema } from 'effect';

export type D1Config = { temperatures?: Record<string, number> };

export type D1Tokenizer = {
  encode(text: string, options: { add_special_tokens: boolean }): number[];
};

export type D1Model = {
  forward(inputs: Record<string, Tensor>): Promise<Record<string, Tensor>>;
};

function makeRow(
  payload: DecisionRequest,
  question: DecisionRequest['questions'][string],
  tokenizer: D1Tokenizer
) {
  const encode = (text: string) =>
    tokenizer.encode(text.replace(/<\|([A-Za-z0-9_]+)\|>/g, '<¦$1¦>'), {
      add_special_tokens: false,
    });
  const ids = [
    1,
    17,
    ...encode(payload.state),
    18,
    ...encode(question.instructions),
  ];
  const markers: number[] = [];
  for (const [label, description] of Object.entries(question.criteria)) {
    ids.push(19);
    markers.push(ids.length);
    ids.push(
      16,
      ...encode(` ${description ? `${label}: ${description}` : label}`),
      20
    );
  }

  ids.push(21);
  if (ids.length > 16384)
    throw new Error(
      `D1 input has ${ids.length} tokens; maximum is 16384 (no truncation).`
    );

  return { ids, markers };
}

function makeFeeds(rows: ReturnType<typeof makeRow>[]) {
  const batch = rows.length;
  const width = Math.max(...rows.map((row) => row.ids.length));
  const count = Math.max(...rows.map((row) => row.markers.length));
  const ids = new BigInt64Array(batch * width);
  const attention = new BigInt64Array(batch * width);
  const positions = new BigInt64Array(batch * count);
  const mask = new BigInt64Array(batch * count);
  rows.forEach((row, index) => {
    ids.set(row.ids.map(BigInt), index * width);
    attention.fill(1n, index * width, index * width + row.ids.length);
    positions.set(row.markers.map(BigInt), index * count);
    mask.fill(1n, index * count, index * count + row.markers.length);
  });
  const tensor = (data: BigInt64Array, dims: number[]) =>
    new Tensor('int64', data, dims);

  return {
    input_ids: tensor(ids, [batch, width]),
    attention_mask: tensor(attention, [batch, width]),
    prefix_len: tensor(new BigInt64Array(batch), [batch]),
    marker_pos: tensor(positions, [batch, count]),
    marker_mask: tensor(mask, [batch, count]),
    qtype: tensor(new BigInt64Array(batch), [batch]),
  };
}

function choiceTemperature(config: D1Config, count: number) {
  let bucket = '11+';
  if (count <= 2) bucket = '2';
  else if (count <= 5) bucket = '3-5';
  else if (count <= 10) bucket = '6-10';

  return (
    config.temperatures?.[`choice:${bucket}`] ??
    config.temperatures?.['choice'] ??
    1
  );
}

function decodeAnswers(
  payload: DecisionRequest,
  config: D1Config,
  output: Tensor,
  count: number
) {
  const entries = Object.entries(payload.questions);
  if (
    output.dims.length !== 2 ||
    output.dims[0] !== entries.length ||
    output.dims[1] !== count
  )
    throw new Error('D1 returned malformed logits dimensions.');
  const logits = Array.from(output.to('float32').data, Number);
  const answers = Object.fromEntries(
    entries.map(([id, question], index) => {
      const labels = Object.keys(question.criteria);
      const temperature = choiceTemperature(config, labels.length);
      if (!Number.isFinite(temperature) || temperature <= 0)
        throw new Error('D1 returned an invalid temperature.');
      const values = logits
        .slice(index * count, index * count + labels.length)
        .map((value) => value / temperature);
      if (
        values.length !== labels.length ||
        values.some((value) => !Number.isFinite(value))
      )
        throw new Error('D1 returned malformed logits.');
      const max = Math.max(...values);
      const weights = values.map((value) => Math.exp(value - max));
      const total = weights.reduce((sum, value) => sum + value, 0);
      const best = values.indexOf(max);

      return [
        id,
        Schema.decodeUnknownSync(ChoiceAnswer)({
          type: 'choice',
          choice: labels[best],
          confidence: weights[best]! / total,
          probabilities: Object.fromEntries(
            labels.map((label, i) => [label, weights[i]! / total])
          ),
        }),
      ];
    })
  );

  return answers;
}

export async function runD1Inference(
  raw: DecisionRequest,
  config: D1Config,
  tokenizer: D1Tokenizer,
  model: D1Model
): Promise<Record<string, ChoiceAnswer>> {
  const payload = Schema.decodeUnknownSync(DecisionRequest)(raw);
  const rows = Object.values(payload.questions).map((question) =>
    makeRow(payload, question, tokenizer)
  );
  if (!rows.length) return {};
  const feeds = makeFeeds(rows);
  const output = await model.forward(feeds);
  if (!output['logits']) throw new Error('D1 returned no logits.');

  return decodeAnswers(
    payload,
    config,
    output['logits'],
    feeds.marker_pos.dims[1]!
  );
}
