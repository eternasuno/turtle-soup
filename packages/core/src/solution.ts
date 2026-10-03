import { Array as Arr, Match } from 'effect';
import type { FactMatch, SolutionStatus } from './types';

export function solutionStatus(
  facts: ReadonlyArray<FactMatch>
): SolutionStatus {
  return Match.value(facts).pipe(
    Match.when(
      (facts) =>
        Arr.isReadonlyArrayNonEmpty(facts) &&
        Arr.every(facts, (fact) => fact.matched),
      () => 'correct' as const
    ),
    Match.when(
      (facts) => Arr.some(facts, (fact) => fact.matched),
      () => 'partial' as const
    ),
    Match.orElse(() => 'wrong' as const)
  );
}
