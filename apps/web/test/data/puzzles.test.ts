import { expect, it } from 'vitest';
import puzzles from '../../src/data/puzzles.json';

it('ships playable puzzles with unique ids and nonempty atomic facts', () => {
  expect(puzzles.length).toBeGreaterThanOrEqual(3);
  expect(puzzles.length).toBeLessThanOrEqual(5);
  expect(new Set(puzzles.map((puzzle) => puzzle.id)).size).toBe(puzzles.length);
  for (const puzzle of puzzles) {
    for (const field of [puzzle.id, puzzle.title, puzzle.surface, puzzle.truth])
      expect(field.trim()).not.toBe('');
    expect(puzzle.keyFacts.length).toBeGreaterThan(0);
    for (const fact of puzzle.keyFacts) expect(fact.trim()).not.toBe('');
  }
});
