import type { FactMatch, Puzzle, SolutionStatus } from './types';

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
export function selectPuzzle(puzzles: Puzzle[], previousId?: string): Puzzle {
  const candidates = puzzles.filter((puzzle) => puzzle.id !== previousId);
  const pool = candidates.length ? candidates : puzzles;
  const puzzle = pool[Math.floor(Math.random() * pool.length)];
  if (!puzzle) throw new Error('题库为空');
  return puzzle;
}
export function solutionStatus(facts: FactMatch[]): SolutionStatus {
  if (facts.length && facts.every((fact) => fact.matched)) return 'correct';
  return facts.some((fact) => fact.matched) ? 'partial' : 'wrong';
}
