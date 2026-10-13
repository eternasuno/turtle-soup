import { Option, Redacted, Schema } from 'effect';

export const NonBlankString = Schema.String.check(
  Schema.makeFilter((value) => value.trim().length > 0)
);
export const Confidence = Schema.Number.check(
  Schema.isFinite(),
  Schema.isBetween({ minimum: 0, maximum: 1 })
);
export const JudgmentPoint = Schema.Struct({
  id: NonBlankString,
  description: NonBlankString,
});
export type JudgmentPoint = typeof JudgmentPoint.Type;
export const PuzzleDefinition = Schema.Struct({
  id: NonBlankString,
  title: NonBlankString,
  surface: NonBlankString,
  truth: NonBlankString,
  judgmentPoints: Schema.Array(JudgmentPoint)
    .check(Schema.isMinLength(1))
    .check(
      Schema.makeFilter((points) =>
        points.every(
          (point, index) =>
            points.findIndex((candidate) => candidate.id === point.id) === index
        )
      )
    ),
});
export type PuzzleDefinition = typeof PuzzleDefinition.Type;
export const Puzzle = PuzzleDefinition;
export type Puzzle = PuzzleDefinition;
export const PuzzleView = Schema.Struct({
  id: NonBlankString,
  title: NonBlankString,
  surface: NonBlankString,
});
export type PuzzleView = typeof PuzzleView.Type;
export const GameResult = Schema.Struct({
  truth: NonBlankString,
  reason: Schema.Literals(['solved', 'revealed']),
});
export type GameResult = typeof GameResult.Type;

export const LocalModelId = Schema.Literals([
  'onnx-community/laya-multilingual-ONNX',
  'Manav2op/verdict-small',
  'onnx-community/d1-omni-600M-ONNX',
]);
export type LocalModelId = typeof LocalModelId.Type;

export const DecisionSettings = Schema.Struct({
  provider: Schema.optionalKey(Schema.Literals(['api', 'local'])),
  backend: Schema.optionalKey(Schema.Literals(['wasm', 'webgpu'])),
  apiUrl: Schema.String,
  apiKey: Schema.String,
  apiModel: Schema.optionalKey(Schema.String),
  modelId: Schema.optionalKey(Schema.String),
});
export type DecisionSettings = typeof DecisionSettings.Type;

export const RequestSettings = Schema.Struct({
  apiUrl: Schema.Trim.check(
    Schema.makeFilter((value) =>
      Option.exists(
        Option.liftThrowable((input: string) => new URL(input))(value),
        (url) =>
          (url.protocol === 'http:' || url.protocol === 'https:') &&
          !url.username &&
          !url.password
      )
    )
  ),
  apiKey: Schema.Trim.check(Schema.isMinLength(1)),
});
export type RequestSettings = typeof RequestSettings.Type;

export const DecisionConfiguration = Schema.Union([
  Schema.Struct({
    provider: Schema.Literal('api'),
    url: RequestSettings.fields.apiUrl,
    model: Schema.Trim.check(Schema.isMinLength(1)),
    key: Schema.Redacted(Schema.String).check(
      Schema.makeFilter((value) => Redacted.value(value).trim().length > 0)
    ),
  }),
  Schema.Struct({
    provider: Schema.Literal('local'),
    modelId: LocalModelId,
    backend: Schema.Literals(['wasm', 'webgpu']),
  }),
]);
export type DecisionConfiguration = typeof DecisionConfiguration.Type;

export const GameMode = Schema.Literals(['question', 'solve']);
export type GameMode = typeof GameMode.Type;
export const GameStatus = Schema.Literals(['playing', 'solved', 'revealed']);
export type GameStatus = typeof GameStatus.Type;
export const Message = Schema.Union([
  Schema.Struct({
    role: Schema.Literal('user'),
    mode: GameMode,
    content: NonBlankString,
  }),
  Schema.Struct({ role: Schema.Literal('host'), content: NonBlankString }),
]);
export type Message = typeof Message.Type;
export const QuestionAnswer = Schema.Literals([
  'yes',
  'no',
  'irrelevant',
  'unknown',
]);
export type QuestionAnswer = typeof QuestionAnswer.Type;
export const QuestionResult = Schema.Struct({ answer: QuestionAnswer });
export type QuestionResult = typeof QuestionResult.Type;
export const FactMatch = Schema.Struct({
  fact: NonBlankString,
  matched: Schema.Boolean,
  confidence: Schema.Option(Confidence),
});
export type FactMatch = typeof FactMatch.Type;
export const SolutionStatus = Schema.Literals(['correct', 'partial', 'wrong']);
export type SolutionStatus = typeof SolutionStatus.Type;
export const SolutionResult = Schema.Struct({
  status: SolutionStatus,
  facts: Schema.Array(FactMatch),
});
export type SolutionResult = typeof SolutionResult.Type;
export const SubmissionResult = Schema.Struct({
  content: NonBlankString,
  status: Schema.Literals(['playing', 'solved']),
});
export type SubmissionResult = typeof SubmissionResult.Type;
