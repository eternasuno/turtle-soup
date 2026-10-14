import { Schema } from 'effect';
import { AiError } from 'effect/ai';

export const DECISION_ERROR_MESSAGE = '判定失败，请重试或检查模型配置。';

export class DecisionError extends Schema.TaggedError<DecisionError>()(
  'DecisionError',
  { message: Schema.String, cause: Schema.Unknown }
) {}

export class DecisionFailureReason extends AiError.UnknownError {
  constructor(
    readonly userMessage: string,
    override readonly cause: unknown
  ) {
    super({});
  }
}
