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
    expect(puzzles.length).toBeGreaterThanOrEqual(3);
    expect(puzzles.length).toBeLessThanOrEqual(5);
    expect(new Set(puzzles.map((puzzle) => puzzle.id)).size).toBe(
      puzzles.length
    );
  })
);
