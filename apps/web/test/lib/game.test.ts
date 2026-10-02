import { askQuestion, evaluateSolution } from '@turtle-soup/core/jev';
import { createRoot, flush } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGame } from '../../src/lib/game';

vi.mock('@turtle-soup/core/jev', () => ({
  askQuestion: vi.fn(),
  evaluateSolution: vi.fn(),
  JEV_ERROR_MESSAGE: '请求失败',
}));
let dispose: () => void;
let game: ReturnType<typeof useGame>;
beforeEach(() => {
  vi.clearAllMocks();
  createRoot((cleanup) => {
    dispose = cleanup;
    game = useGame();
  });
});
afterEach(() => dispose());

it('shows only fixed host results and resets the next game', async () => {
  vi.mocked(askQuestion).mockResolvedValue({ answer: 'no' });
  game.setInput('有人吗？');
  flush();
  await game.submit();
  flush();
  expect(game.messages().map((message) => message.content)).toEqual([
    '有人吗？',
    '不是',
  ]);
  game.setMode('solve');
  vi.mocked(evaluateSolution).mockResolvedValue({
    status: 'partial',
    facts: [{ fact: '秘密', matched: true }],
  });
  game.setInput('我的猜测');
  flush();
  await game.submit();
  flush();
  expect(game.messages().at(-1)?.content).toBe(
    '已经接近真相，但还缺少关键部分。'
  );
  expect(JSON.stringify(game.messages())).not.toContain('秘密');
  expect(game.status()).toBe('playing');
  vi.mocked(evaluateSolution).mockResolvedValue({
    status: 'correct',
    facts: [],
  });
  game.setInput('完整真相');
  flush();
  await game.submit();
  flush();
  expect(game.status()).toBe('solved');
  const previous = game.puzzle().id;
  game.startNewGame();
  flush();
  expect(game.puzzle().id).not.toBe(previous);
  expect(game.messages()).toEqual([]);
  expect(game.mode()).toBe('question');
  expect(game.input()).toBe('');
  expect(game.status()).toBe('playing');
});
it('preserves input and game on failure and supports retry', async () => {
  vi.mocked(askQuestion)
    .mockRejectedValueOnce(new Error('请求失败'))
    .mockResolvedValue({ answer: 'yes' });
  game.setInput('问题');
  flush();
  await game.submit();
  flush();
  expect(game.error()).toBe('请求失败');
  expect(game.input()).toBe('问题');
  expect(game.messages()).toEqual([]);
  expect(game.loading()).toBe(false);
  expect(game.status()).toBe('playing');
  flush();
  await game.submit();
  flush();
  expect(game.error()).toBe('');
  expect(game.messages().at(-1)?.content).toBe('是');
});
it('cancels a pending request and ignores stale results after revealing and changing puzzles', async () => {
  let resolve: (result: { answer: 'yes' }) => void = () => undefined;
  vi.mocked(askQuestion).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  game.setInput('问题');
  flush();
  const pending = game.submit();
  flush();
  const signal = vi.mocked(askQuestion).mock.calls[0]?.[3];
  expect(game.loading()).toBe(true);
  flush();
  await game.submit();
  flush();
  expect(askQuestion).toHaveBeenCalledTimes(1);
  game.reveal();
  flush();
  expect(signal?.aborted).toBe(true);
  expect(game.status()).toBe('revealed');
  flush();
  await game.submit();
  flush();
  expect(askQuestion).toHaveBeenCalledTimes(1);
  game.startNewGame();
  flush();
  resolve({ answer: 'yes' });
  await pending;
  flush();
  expect(game.messages()).toEqual([]);
  expect(game.status()).toBe('playing');
  expect(game.loading()).toBe(false);
});
it('aborts requests when the owner is disposed', async () => {
  vi.mocked(askQuestion).mockResolvedValue({ answer: 'yes' });
  game.setInput('问题');
  flush();
  const pending = game.submit();
  flush();
  const signal = vi.mocked(askQuestion).mock.calls[0]?.[3];
  dispose();
  await pending;
  flush();
  expect(signal?.aborted).toBe(true);
  expect(game.messages()).toEqual([]);
});
