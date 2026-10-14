import { it } from '@effect/vitest';
import { Puzzle } from '@turtle-soup/core/types';
import { Effect, Schema } from 'effect';
import { expect } from 'vitest';
import bundledPuzzles from '../../src/data/puzzles.json';

it.effect('ships schema-valid puzzles with unique ids', () =>
  Effect.gen(function* () {
    const puzzles = yield* Schema.decodeUnknownEffect(Schema.Array(Puzzle))(
      bundledPuzzles
    );
    for (const puzzle of puzzles) {
      expect(new Set(puzzle.judgmentPoints.map((point) => point.id)).size).toBe(
        puzzle.judgmentPoints.length
      );
      expect(
        Schema.is(Puzzle)({
          ...puzzle,
          judgmentPoints: [puzzle.judgmentPoints[0], puzzle.judgmentPoints[0]],
        })
      ).toBe(false);
    }

    expect(puzzles.length).toBeGreaterThanOrEqual(3);
    expect(puzzles.length).toBeLessThanOrEqual(5);
    expect(new Set(puzzles.map((puzzle) => puzzle.id)).size).toBe(
      puzzles.length
    );
  })
);
