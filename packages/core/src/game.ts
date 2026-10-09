import { Array as Arr, Effect, Match, Option, Random, Schema } from 'effect';
import {
  askQuestion,
  type DecisionClient,
  type DecisionError,
  evaluateSolution,
  type InvalidPuzzleError,
} from './decision';

import type { Puzzle, SubmissionResult } from './types';

export { solutionStatus } from './solution';

export const questionLabels = {
  yes: '是',
  no: '不是',
  irrelevant: '无关',
  unknown: '无法确定',
};
export const solutionLabels = {
  correct: '解密成功',
  partial: '已经接近真相，但还缺少关键部分。',
  wrong: '这个解释还没有触及核心真相。',
};
export class EmptyPuzzleBankError extends Schema.TaggedError<EmptyPuzzleBankError>()(
  'EmptyPuzzleBankError',
  { message: Schema.String }
) {}

export function selectPuzzle(
  puzzles: ReadonlyArray<Puzzle>,
  previousId: Option.Option<string> = Option.none()
): Effect.Effect<Puzzle, EmptyPuzzleBankError> {
  const candidates = Arr.filter(
    puzzles,
    (puzzle) => !Option.contains(previousId, puzzle.id)
  );
  return Random.choice(
    Arr.isArrayNonEmpty(candidates) ? candidates : puzzles
  ).pipe(
    Effect.mapError(() => new EmptyPuzzleBankError({ message: '题库为空' }))
  );
}
export const submitQuestion = Effect.fnUntraced(function* (
  puzzle: Puzzle,
  input: string
): Effect.fn.Return<SubmissionResult, DecisionError, DecisionClient> {
  const result = yield* askQuestion(puzzle, input);
  return { content: questionLabels[result.answer], status: 'playing' };
});

export const submitSolution = Effect.fnUntraced(function* (
  puzzle: Puzzle,
  input: string
): Effect.fn.Return<
  SubmissionResult,
  DecisionError | InvalidPuzzleError,
  DecisionClient
> {
  const result = yield* evaluateSolution(puzzle, input);
  return {
    content: solutionLabels[result.status],
    status: Match.value(result.status).pipe(
      Match.when('correct', () => 'solved' as const),
      Match.whenOr('partial', 'wrong', () => 'playing' as const),
      Match.exhaustive
    ),
  };
});
