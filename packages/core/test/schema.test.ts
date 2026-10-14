import { expect, it } from '@effect/vitest';
import { Effect, Option, Schema } from 'effect';
import {
  Confidence,
  FactMatch,
  GameResult,
  JudgmentPoint,
  Message,
  Puzzle,
  PuzzleDefinition,
  PuzzleView,
} from '../src/types';

const puzzle = {
  id: 'soup',
  title: 'title',
  surface: 'surface',
  truth: 'truth',
  judgmentPoints: [{ id: 'fact-1', description: 'fact' }],
};

it.effect.each([NaN, Infinity, -Infinity, -0.1, 1.1, '0.5', null])(
  'rejects invalid confidence %s',
  (confidence) =>
    Effect.gen(function* () {
      yield* Effect.flip(Schema.decodeUnknownEffect(Confidence)(confidence));
    })
);
it.effect(
  'exports the Puzzle alias and validates projections and results',
  () =>
    Effect.gen(function* () {
      expect(
        yield* Schema.decodeUnknownEffect(PuzzleDefinition)(puzzle)
      ).toEqual(puzzle);
      expect(
        yield* Schema.decodeUnknownEffect(JudgmentPoint)(
          puzzle.judgmentPoints[0]
        )
      ).toEqual(puzzle.judgmentPoints[0]);
      expect(
        yield* Schema.decodeUnknownEffect(PuzzleView)({
          id: 'id',
          title: 'title',
          surface: 'surface',
        })
      ).toEqual({ id: 'id', title: 'title', surface: 'surface' });
      expect(
        yield* Schema.decodeUnknownEffect(GameResult)({
          truth: 'truth',
          reason: 'solved',
        })
      ).toEqual({ truth: 'truth', reason: 'solved' });
      expect(Puzzle).toBe(PuzzleDefinition);
    })
);

it.effect.each(['id', 'title', 'surface', 'truth'] as const)(
  'rejects blank puzzle %s',
  (field) =>
    Effect.gen(function* () {
      yield* Effect.flip(
        Schema.decodeUnknownEffect(Puzzle)({ ...puzzle, [field]: ' ' })
      );
    })
);
it.effect.each([
  [],
  [{ id: 'point', description: ' ' }],
  [
    { id: 'duplicate', description: 'first' },
    { id: 'duplicate', description: 'second' },
  ],
])('rejects empty, blank, or duplicate judgment points %#', (judgmentPoints) =>
  Effect.gen(function* () {
    yield* Effect.flip(
      Schema.decodeUnknownEffect(Puzzle)({ ...puzzle, judgmentPoints })
    );
  })
);

it.effect.each(['question', 'solve'] as const)(
  'requires user mode %s',
  (mode) =>
    Effect.gen(function* () {
      expect(
        yield* Schema.decodeUnknownEffect(Message)({
          role: 'user',
          mode,
          content: 'text',
        })
      ).toEqual({ role: 'user', mode, content: 'text' });
    })
);
it.effect(
  'supports host messages without mode and rejects users without mode',
  () =>
    Effect.gen(function* () {
      expect(
        yield* Schema.decodeUnknownEffect(Message)({
          role: 'host',
          content: 'text',
        })
      ).toEqual({ role: 'host', content: 'text' });
      yield* Effect.flip(
        Schema.decodeUnknownEffect(Message)({ role: 'user', content: 'text' })
      );
    })
);
it.effect('requires domain confidence as an Option', () =>
  Effect.gen(function* () {
    for (const confidence of [Option.none(), Option.some(0), Option.some(1)]) {
      expect(
        yield* Schema.decodeUnknownEffect(FactMatch)({
          fact: 'fact',
          matched: true,
          confidence,
        })
      ).toEqual({ fact: 'fact', matched: true, confidence });
    }
    for (const confidence of [undefined, 0.5, Option.some(1.1)]) {
      yield* Effect.flip(
        Schema.decodeUnknownEffect(FactMatch)({
          fact: 'fact',
          matched: true,
          confidence,
        })
      );
    }
  })
);
