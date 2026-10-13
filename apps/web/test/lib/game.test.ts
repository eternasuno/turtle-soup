import {
  type ChoiceAnswer,
  DecisionClient,
  DecisionError,
} from '@turtle-soup/core/decision';
import { JevDecisionModel } from '@turtle-soup/core/decision-provider';
import { Effect, Layer, Option } from 'effect';
import { createRoot } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import puzzles from '../../src/data/puzzles.json';
import { useGame } from '../../src/lib/game';

const requestClient = vi.fn<DecisionClient['Service']['request']>();
const transportLayer = Layer.succeed(
  DecisionClient,
  DecisionClient.of({ request: requestClient })
);
const clientLayer = JevDecisionModel.pipe(Layer.provide(transportLayer));
const judgmentPoints = () =>
  puzzles.find((puzzle) => puzzle.id === game.puzzle().id)!.judgmentPoints;
const answer = (choice: string): Record<string, ChoiceAnswer> => ({
  answer: { type: 'choice', choice },
});
let dispose: () => void;
let game: ReturnType<typeof useGame>;
beforeEach(() => {
  vi.resetAllMocks();
  createRoot((cleanup) => {
    dispose = cleanup;
    game = useGame(clientLayer);
  });
});
afterEach(() => {
  dispose();
  vi.unstubAllGlobals();
});

it.each(['malformed JSON', 'blocked storage'])(
  'recovers %s during initialization',
  (failure) => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        if (failure === 'blocked storage') throw new Error('blocked');
        return 'invalid';
      },
    });
    dispose();
    createRoot((cleanup) => {
      dispose = cleanup;
      game = useGame(clientLayer);
    });
    expect(game.settings()).toEqual({ apiUrl: '', apiKey: '' });
  }
);

function pendingQuestion() {
  let resolve!: (result: Record<string, ChoiceAnswer>) => void;
  let reject!: (cause: Error) => void;
  let signal!: AbortSignal;
  const promise = new Promise<Record<string, ChoiceAnswer>>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  const effect = Effect.tryPromise({
    try: (requestSignal) => {
      signal = requestSignal;
      return promise;
    },
    catch: (cause) =>
      new DecisionError({
        message: cause instanceof Error ? cause.message : '请求失败',
        cause,
      }),
  });
  return { effect, resolve, reject, signal: () => signal };
}
function enter(content = '问题') {
  game.setInput(content);
}

it('shows fixed question labels without message IDs', async () => {
  requestClient.mockReturnValue(Effect.succeed(answer('no')));
  enter('有人吗？');
  await game.submit();
  expect(game.messages()).toEqual([
    { role: 'user', mode: 'question', content: '有人吗？' },
    { role: 'host', content: '不是' },
  ]);
});
it('keeps partial solution facts private and the game playing', async () => {
  game.setMode('solve');
  requestClient.mockReturnValue(
    Effect.succeed(
      Object.fromEntries(
        judgmentPoints().map((point, index) => [
          point.id,
          {
            type: 'choice' as const,
            choice: index === 0 ? 'matched' : 'missing',
          },
        ])
      )
    )
  );
  enter('我的猜测');
  await game.submit();
  expect(game.messages().at(-1)?.content).toBe(
    '已经接近真相，但还缺少关键部分。'
  );
  for (const fact of judgmentPoints()) {
    expect(JSON.stringify(game.messages())).not.toContain(fact.description);
  }
  expect(game.status()).toBe('playing');
});
it('solves and completely resets the next game', async () => {
  game.setMode('solve');
  requestClient.mockReturnValue(
    Effect.succeed(
      Object.fromEntries(
        judgmentPoints().map((point) => [
          point.id,
          { type: 'choice' as const, choice: 'matched' },
        ])
      )
    )
  );
  enter('完整真相');
  await game.submit();
  expect(game.status()).toBe('solved');
  expect(game.result()).toEqual(
    Option.some({
      truth: puzzles.find((puzzle) => puzzle.id === game.puzzle().id)!.truth,
      reason: 'solved',
    })
  );
  expect(Object.keys(game.puzzle()).sort()).toEqual(['id', 'surface', 'title']);
  const previous = game.puzzle().id;
  game.startNewGame();
  expect(game.puzzle().id).not.toBe(previous);
  expect(game.messages()).toEqual([]);
  expect(game.mode()).toBe('question');
  expect(game.input()).toBe('');
  expect(game.error()).toEqual(Option.none());
  expect(game.loading()).toBe(false);
  expect(game.status()).toBe('playing');
  expect(game.result()).toEqual(Option.none());
});
it('preserves input and game on failure and supports retry', async () => {
  requestClient
    .mockReturnValueOnce(
      Effect.fail(new DecisionError({ message: '请求失败', cause: 'network' }))
    )
    .mockReturnValue(Effect.succeed(answer('yes')));
  enter();
  await game.submit();
  expect(game.error()).toEqual(
    Option.some('Decision 请求失败，请检查 API URL、API Key 或网络状态。')
  );
  expect(game.input()).toBe('问题');
  expect(game.messages()).toEqual([]);
  expect(game.loading()).toBe(false);
  expect(game.status()).toBe('playing');
  await game.submit();
  expect(game.error()).toEqual(Option.none());
  expect(game.messages().at(-1)?.content).toBe('是');
});
it('guards duplicate submissions synchronously before awaiting either submission', async () => {
  const request = pendingQuestion();
  requestClient.mockReturnValue(request.effect);
  enter();
  const first = game.submit();
  const duplicate = game.submit();
  await vi.waitFor(() => expect(requestClient).toHaveBeenCalledTimes(1));
  request.resolve(answer('yes'));
  await Promise.all([first, duplicate]);
  expect(game.messages()).toHaveLength(2);
  expect(game.loading()).toBe(false);
});
it('reveal aborts requests, ignores late results and disables sending', async () => {
  const request = pendingQuestion();
  requestClient.mockReturnValue(request.effect);
  enter();
  const pending = game.submit();
  await vi.waitFor(() => expect(request.signal()).toBeDefined());
  game.reveal();
  expect(request.signal().aborted).toBe(true);
  expect(game.status()).toBe('revealed');
  request.resolve(answer('yes'));
  await pending;
  await game.submit();
  expect(requestClient).toHaveBeenCalledTimes(1);
  expect(game.messages()).toEqual([]);
  expect(game.error()).toEqual(Option.none());
  expect(game.loading()).toBe(false);
});
it.each(['success', 'failure'] as const)(
  'isolates old A %s and finalization while new B is active',
  async (outcome) => {
    const old = pendingQuestion();
    const current = pendingQuestion();
    requestClient
      .mockReturnValueOnce(Effect.uninterruptible(old.effect))
      .mockReturnValueOnce(current.effect);
    enter('旧问题');
    const first = game.submit();
    await vi.waitFor(() => expect(old.signal()).toBeDefined());
    game.startNewGame();
    enter('新问题');
    const second = game.submit();
    await vi.waitFor(() => expect(current.signal()).toBeDefined());
    if (outcome === 'success') old.resolve(answer('yes'));
    else old.reject(new Error('旧请求失败'));
    await first;
    expect(game.messages()).toEqual([
      { role: 'user', mode: 'question', content: '新问题' },
    ]);
    expect(game.error()).toEqual(Option.none());
    expect(game.input()).toBe('');
    expect(game.loading()).toBe(true);
    expect(game.status()).toBe('playing');
    await game.submit();
    expect(requestClient).toHaveBeenCalledTimes(2);
    current.resolve(answer('no'));
    await second;
    expect(game.messages().map((message) => message.content)).toEqual([
      '新问题',
      '不是',
    ]);
    expect(game.loading()).toBe(false);
  }
);
it('cleanup aborts a pending request without rejecting submit or mutating history', async () => {
  const request = pendingQuestion();
  requestClient.mockReturnValue(request.effect);
  enter();
  const pending = game.submit();
  await vi.waitFor(() => expect(request.signal()).toBeDefined());
  dispose();
  expect(request.signal().aborted).toBe(true);
  request.reject(new Error('late failure'));
  await expect(pending).resolves.toBeUndefined();
  expect(game.messages()).toEqual([
    { role: 'user', mode: 'question', content: '问题' },
  ]);
  expect(game.error()).toEqual(Option.none());
});
