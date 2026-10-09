import { Tensor } from '@huggingface/transformers';
import {
  ChoiceAnswer,
  type ChoiceAnswer as ChoiceAnswerType,
  type DecisionRequest as DecisionRequestType,
} from '@turtle-soup/core/decision';
import { Schema } from 'effect';

export type LayaConfig = {
  max_len?: number | undefined;
  head_max_len?: number | undefined;
  split_words?: boolean | undefined;
  temperature?: readonly number[] | undefined;
  temperature_by_options?: Record<string, number> | undefined;
};

export type Tokenizer = {
  (
    text: string,
    options: { add_special_tokens: boolean }
  ): { input_ids: { data: ArrayLike<number | bigint> } };
  config: {
    cls_token?: string;
    sep_token?: string;
    mask_token?: string;
    pad_token?: string;
  };
};
export type Model = {
  (
    inputs: Record<string, unknown>
  ): Promise<{
    logits: { to(type: string): { data: ArrayLike<number> } };
  }>;
  dispose(): Promise<unknown>;
};

type Row = { ids: number[]; markers: number[] };
type SpecialTokens = {
  cls: number;
  sep: number;
  mask: number;
  pad: number;
  space: number;
};
type TensorInput = {
  ids: BigInt64Array;
  attention: BigInt64Array;
  positions: BigInt64Array;
  markerMask: Uint8Array;
  batch: number;
  length: number;
  count: number;
};

const clampTemp = (value: number) => Math.min(5, Math.max(0.5, value));
const bucket = (kind: string, n: number) => {
  if (n <= 2) return `${kind}:2`;
  if (n <= 5) return `${kind}:3-5`;
  if (n <= 10) return `${kind}:6-10`;
  return `${kind}:11+`;
};

function encodeText(
  text: string,
  maskText: string,
  splitWords: boolean | undefined,
  special: SpecialTokens,
  raw: (text: string) => number[]
): number[] {
  const value = text.split(maskText).join(' ');
  if (!value) return [];
  if (!splitWords) return raw(value);
  const spaced = value.startsWith(' ') ? value : ` ${value}`;
  return spaced
    .split(/(?= )/)
    .flatMap((piece) =>
      piece.slice(1) ? raw(piece.slice(1)) : [special.space]
    );
}

function makeRow(
  instructions: string,
  criteria: Record<string, string>,
  stateIds: number[],
  maxLen: number,
  headMax: number,
  special: SpecialTokens,
  encode: (text: string) => number[]
): Row {
  const options = Object.keys(criteria).map((label) => [
    special.mask,
    ...encode(` ${label}: ${criteria[label]}`).slice(0, 48),
  ]);
  let budget =
    headMax - options.reduce((total, option) => total + option.length, 0);
  if (budget < 16) {
    const per = Math.max(4, Math.floor((headMax - 16) / options.length));
    options.forEach((option, index) => {
      options[index] = option.slice(0, per);
    });
    budget =
      headMax - options.reduce((total, option) => total + option.length, 0);
  }
  const head = encode(`choice question: ${instructions}`).slice(
    0,
    Math.max(8, budget)
  );
  const ids = [special.cls, ...head, special.sep];
  const markers = options.map((option) => {
    const position = ids.length;
    ids.push(...option);
    return position;
  });
  ids.push(special.sep);
  const room = Math.max(0, Math.min(8192, maxLen - ids.length - 1));
  if (stateIds.length > room || markers.some((position) => position >= maxLen))
    throw new Error(`Question does not fit within ${maxLen} tokens.`);
  ids.push(...stateIds, special.sep);
  return { ids: ids.slice(0, maxLen), markers };
}

function makeRows(
  entries: [string, DecisionRequestType['questions'][string]][],
  payload: DecisionRequestType,
  config: LayaConfig,
  special: SpecialTokens,
  encode: (text: string) => number[]
): Row[] {
  const maxLen = config.max_len ?? 512;
  const headMax = config.head_max_len ?? 192;
  const stateIds = encode(payload.state);
  return entries.map(([, question]) =>
    makeRow(
      question.instructions,
      question.criteria,
      stateIds,
      maxLen,
      headMax,
      special,
      encode
    )
  );
}

function makeTensorInput(rows: Row[], pad: number): TensorInput {
  const batch = rows.length;
  const length = Math.max(...rows.map((row) => row.ids.length));
  const count = Math.max(...rows.map((row) => row.markers.length));
  const ids = new BigInt64Array(batch * length).fill(BigInt(pad));
  const attention = new BigInt64Array(batch * length);
  const positions = new BigInt64Array(batch * count);
  const markerMask = new Uint8Array(batch * count);
  rows.forEach((row, index) => {
    row.ids.forEach((id, offset) => {
      ids[index * length + offset] = BigInt(id);
      attention[index * length + offset] = 1n;
    });
    row.markers.forEach((position, offset) => {
      positions[index * count + offset] = BigInt(position);
      markerMask[index * count + offset] = 1;
    });
  });
  return { ids, attention, positions, markerMask, batch, length, count };
}

function toTensor(input: TensorInput) {
  const { ids, attention, positions, markerMask, batch, length, count } = input;
  return {
    input_ids: new Tensor('int64', ids, [batch, length]),
    attention_mask: new Tensor('int64', attention, [batch, length]),
    marker_pos: new Tensor('int64', positions, [batch, count]),
    marker_mask: new Tensor('bool', markerMask, [batch, count]),
    qtype: new Tensor('int64', new BigInt64Array(batch), [batch]),
  };
}

function decodeAnswers(
  entries: [string, DecisionRequestType['questions'][string]][],
  logits: number[],
  count: number,
  config: LayaConfig
): Record<string, ChoiceAnswerType> {
  if (
    logits.length !== entries.length * count ||
    logits.some((value) => !Number.isFinite(value))
  )
    throw new Error('Laya returned malformed logits.');
  const temperatures = config.temperature_by_options ?? {};
  const result: Record<string, ChoiceAnswerType> = {};
  entries.forEach(([id, question], index) => {
    const choices = Object.keys(question.criteria);
    const temperature = clampTemp(
      temperatures[bucket('choice', choices.length)] ??
        config.temperature?.[0] ??
        1
    );
    const values = logits
      .slice(index * count, index * count + choices.length)
      .map((value) => value / temperature);
    const max = Math.max(...values);
    const exps = values.map((value) => Math.exp(value - max));
    const sum = exps.reduce((total, value) => total + value, 0);
    const best = values.indexOf(max);
    result[id] = Schema.decodeUnknownSync(ChoiceAnswer)({
      type: 'choice',
      choice: choices[best],
      confidence: exps[best]! / sum,
    });
  });
  return result;
}

function rawTokens(tokenizer: Tokenizer, text: string): number[] {
  return Array.from(
    tokenizer(text, { add_special_tokens: false }).input_ids.data,
    Number
  );
}

function oneToken(raw: (text: string) => number[], text: string): number {
  const ids = raw(text);
  if (ids.length !== 1)
    throw new Error(`Tokenizer does not know token ${text}`);
  return ids[0]!;
}

function makeSpecialTokens(tokenizer: Tokenizer): SpecialTokens {
  const raw = (text: string) => rawTokens(tokenizer, text);
  const config = tokenizer.config;
  return {
    cls: oneToken(raw, config.cls_token ?? '[CLS]'),
    sep: oneToken(raw, config.sep_token ?? '[SEP]'),
    mask: oneToken(raw, config.mask_token ?? '[MASK]'),
    pad: oneToken(raw, config.pad_token ?? '[PAD]'),
    space: raw(' ')[0] ?? 0,
  };
}

export async function runInference(
  payload: DecisionRequestType,
  config: LayaConfig,
  tokenizer: Tokenizer,
  model: Model
): Promise<Record<string, ChoiceAnswerType>> {
  const special = makeSpecialTokens(tokenizer);
  const encode = (text: string) =>
    encodeText(
      text,
      tokenizer.config.mask_token ?? '[MASK]',
      config.split_words,
      special,
      (value) => rawTokens(tokenizer, value)
    );
  const entries = Object.entries(payload.questions);
  const rows = makeRows(entries, payload, config, special, encode);
  if (!rows.length) return {};
  const input = makeTensorInput(rows, special.pad);
  const output = await model(toTensor(input));
  const logits = Array.from(output.logits.to('float32').data);
  return decodeAnswers(entries, logits, input.count, config);
}
