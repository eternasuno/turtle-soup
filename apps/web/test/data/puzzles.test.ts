import { it } from '@effect/vitest';
import { Puzzle } from '@turtle-soup/core/types';
import { Effect, Schema } from 'effect';
import { expect } from 'vitest';
import puzzleSources from '../../src/data/puzzle-sources.json';
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

    expect(puzzles.length).toBeGreaterThanOrEqual(50);
    expect(puzzleSources.license).toBe('CC BY-SA 4.0');
    expect(puzzleSources.puzzles.map((source) => source.id).sort()).toEqual(
      puzzles.map((puzzle) => puzzle.id).sort()
    );
    for (const source of puzzleSources.puzzles) {
      expect(source.id).toBe(`pse-${source.question.id}`);
      for (const post of [source.question, source.answer]) {
        expect(post.author.trim()).not.toBe('');
        expect(post.url).toMatch(/^https:\/\/puzzling\.stackexchange\.com\//);
        expect(['CC BY-SA 3.0', 'CC BY-SA 4.0']).toContain(post.license);
      }
    }

    expect(new Set(puzzles.map((puzzle) => puzzle.id)).size).toBe(
      puzzles.length
    );
  })
);
