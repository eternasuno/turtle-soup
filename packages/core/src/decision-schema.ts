import { Record as Rec, Schema } from 'effect';
import { Confidence, NonBlankString } from './types';

export const ChoiceQuestion = Schema.Struct({
  type: Schema.Literal('choice'),
  instructions: NonBlankString,
  criteria: Schema.Record(NonBlankString, NonBlankString).check(
    Schema.isMinProperties(1)
  ),
});
export type ChoiceQuestion = typeof ChoiceQuestion.Type;
export const DecisionRequest = Schema.Struct({
  model: Schema.Literal('jev-latest'),
  state: NonBlankString,
  questions: Schema.Record(NonBlankString, ChoiceQuestion).check(
    Schema.isMinProperties(1)
  ),
});
export type DecisionRequest = typeof DecisionRequest.Type;
export const ChoiceAnswer = Schema.Struct({
  type: Schema.Literal('choice'),
  choice: NonBlankString,
  confidence: Schema.optionalKey(Confidence),
});
export type ChoiceAnswer = typeof ChoiceAnswer.Type;
export const DecisionResponse = Schema.Struct({
  answers: Schema.Record(NonBlankString, ChoiceAnswer),
});
export type DecisionResponse = typeof DecisionResponse.Type;

export function responseFor(questions: DecisionRequest['questions']) {
  return DecisionResponse.check(
    Schema.makeFilter(
      ({ answers }) =>
        Rec.size(answers) === Rec.size(questions) &&
        Rec.every(
          questions,
          (question, id) =>
            Rec.has(answers, id) &&
            Rec.has(question.criteria, answers[id]!.choice)
        )
    )
  );
}
