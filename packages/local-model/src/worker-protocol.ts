import { ChoiceAnswer, DecisionRequest } from '@turtle-soup/core/decision';
import { LocalModelId } from '@turtle-soup/core/types';
import { Schema } from 'effect';

const Id = Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0));
const Backend = Schema.Literals(['wasm', 'webgpu']);

export const WorkerCommand = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('init'),
    id: Id,
    backend: Backend,
    modelId: Schema.optionalKey(LocalModelId),
    cacheOnly: Schema.Boolean,
  }),
  Schema.Struct({
    type: Schema.Literal('request'),
    id: Id,
    payload: DecisionRequest,
  }),
  Schema.Struct({ type: Schema.Literal('cancel'), id: Id }),
]);

export type WorkerCommand = typeof WorkerCommand.Type;

export const WorkerAnswers = Schema.Record(Schema.String, ChoiceAnswer);

export const WorkerProgress = Schema.Struct({
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

export const WorkerResponse = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('success'),
    id: Id,
    value: Schema.Union([WorkerAnswers, Schema.Undefined]),
  }),
  Schema.Struct({
    type: Schema.Literal('error'),
    id: Id,
    message: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('progress'),
    id: Id,
    progress: WorkerProgress,
  }),
]);

export type WorkerResponse = typeof WorkerResponse.Type;
