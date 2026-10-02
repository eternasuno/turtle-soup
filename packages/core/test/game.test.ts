import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  questionLabels,
  selectPuzzle,
  solutionLabels,
  solutionStatus,
} from '../src/game';
import type { Puzzle } from '../src/types';

const puzzles: Puzzle[] = ['first', 'second', 'third'].map((id) => ({
  id,
  title: id,
  surface: '谜面',
  truth: '谜底',
  keyFacts: ['事实'],
}));

afterEach(() => vi.restoreAllMocks());

describe('game', () => {
  it('provides labels for every question and solution result', () => {
    expect(questionLabels).toEqual({
      yes: '是',
      no: '不是',
      irrelevant: '无关',
      unknown: '无法确定',
    });
    expect(solutionLabels).toEqual({
      correct: '解密成功',
      partial: '已经接近真相，但还缺少关键部分。',
      wrong: '这个解释还没有触及核心真相。',
    });
  });

  it.each([0, 0.49, 0.99])(
    'excludes the previous puzzle at random value %s',
    (random) => {
      vi.spyOn(Math, 'random').mockReturnValue(random);
      const selected = selectPuzzle(puzzles, 'second');
      expect(puzzles).toContain(selected);
      expect(selected.id).not.toBe('second');
    }
  );

  it('supports a singleton even when it was the previous puzzle', () => {
    expect(selectPuzzle([puzzles[0]!], 'first')).toBe(puzzles[0]);
  });

  it('rejects an empty puzzle bank', () => {
    expect(() => selectPuzzle([])).toThrow('题库为空');
  });

  it.each([
    [[true, true], 'correct'],
    [[true, false], 'partial'],
    [[false, true], 'partial'],
    [[false, false], 'wrong'],
    [[], 'wrong'],
  ] as const)('classifies fact matches %j as %s', (matches, status) => {
    expect(
      solutionStatus(matches.map((matched) => ({ fact: '事实', matched })))
    ).toBe(status);
  });
});
