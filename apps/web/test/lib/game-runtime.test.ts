import {
  type ChoiceAnswer,
  DecisionClient,
  DecisionError,
} from '@turtle-soup/core/decision';
import { Effect, Layer, Option } from 'effect';
import { createRoot, flush } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGame } from '../../src/lib/game';

const requestClient = vi.fn<DecisionClient['Service']['request']>();
const answer = (choice: string): Record<string, ChoiceAnswer> => ({
  answer: { type: 'choice', choice },
});
let dispose: () => void;
let game: ReturnType<typeof useGame>;
beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => {
  dispose();
  vi.unstubAllGlobals();
});

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
  flush();
}

it('reuses the configured runtime and replaces it without resetting the session', async () => {
  let acquired = 0;
  let released = 0;
  const configurations: string[] = [];
  const configured = (settings: { apiUrl: string; apiKey: string }) =>
    Layer.effect(
      DecisionClient,
      Effect.acquireRelease(
        Effect.sync(() => {
          acquired += 1;
          configurations.push(settings.apiKey);
          return DecisionClient.of({ request: requestClient });
        }),
        () =>
          Effect.sync(() => {
            released += 1;
          })
      )
    );
  createRoot((cleanup) => {
    dispose = cleanup;
    game = useGame(configured);
  });
  requestClient.mockReturnValue(Effect.succeed(answer('yes')));
  enter('第一问');
  await game.submit();
  enter('第二问');
  await game.submit();
  flush();
  expect(acquired).toBe(1);
  const puzzle = game.puzzle();
  const messages = game.messages();
  const old = pendingQuestion();
  requestClient.mockReturnValueOnce(old.effect);
  enter('保留输入');
  const pending = game.submit();
  game.setSettings({ apiUrl: 'https://decision.example', apiKey: 'new-key' });
  flush();
  expect(old.signal().aborted).toBe(true);
  expect(game.puzzle()).toBe(puzzle);
  expect(game.messages()).toEqual(messages);
  expect(game.input()).toBe('保留输入');
  expect(game.loading()).toBe(false);
  old.resolve(answer('no'));
  await pending;
  await game.submit();
  flush();
  expect(acquired).toBe(2);
  expect(released).toBe(1);
  expect(configurations.at(-1)).toBe('new-key');
  expect(game.messages().at(-1)?.content).toBe('是');
});

function pendingClientLayer() {
  let resolve!: (client: DecisionClient['Service']) => void;
  const promise = new Promise<DecisionClient['Service']>((done) => {
    resolve = done;
  });
  const acquire = vi.fn(() => promise);
  return {
    layer: Layer.effect(DecisionClient, Effect.promise(acquire)),
    acquire,
    resolve: () => resolve(DecisionClient.of({ request: requestClient })),
  };
}

it('shows invalid initial settings through the default client without fetching', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null });
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  createRoot((cleanup) => {
    dispose = cleanup;
    game = useGame();
  });
  enter();
  await expect(game.submit()).resolves.toBeUndefined();
  flush();
  expect(game.error()).toEqual(Option.some('请填写 API URL。'));
  expect(game.input()).toBe('问题');
  expect(game.loading()).toBe(false);
  expect(game.messages()).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
});

it('admits one concurrent submission while asynchronously acquiring the client', async () => {
  const client = pendingClientLayer();
  createRoot((cleanup) => {
    dispose = cleanup;
    game = useGame(client.layer);
  });
  const request = pendingQuestion();
  requestClient.mockReturnValue(request.effect);
  enter();
  const first = game.submit();
  const duplicate = game.submit();
  expect(client.acquire).toHaveBeenCalledTimes(1);
  expect(requestClient).not.toHaveBeenCalled();
  client.resolve();
  await vi.waitFor(() => expect(requestClient).toHaveBeenCalledTimes(1));
  await game.submit();
  expect(requestClient).toHaveBeenCalledTimes(1);
  request.resolve(answer('yes'));
  await Promise.all([first, duplicate]);
  enter('下一问');
  requestClient.mockReturnValue(Effect.succeed(answer('no')));
  await game.submit();
  flush();
  expect(client.acquire).toHaveBeenCalledTimes(1);
  expect(requestClient).toHaveBeenCalledTimes(2);
  expect(game.messages().map((message) => message.content)).toEqual([
    '问题',
    '是',
    '下一问',
    '不是',
  ]);
});

it('never submits with an old client replaced during asynchronous acquisition', async () => {
  const old = pendingClientLayer();
  const current = pendingClientLayer();
  createRoot((cleanup) => {
    dispose = cleanup;
    game = useGame((settings) =>
      settings.apiKey === 'new-key' ? current.layer : old.layer
    );
  });
  requestClient.mockReturnValue(Effect.succeed(answer('yes')));
  enter();
  const first = game.submit();
  game.setSettings({ apiUrl: 'https://decision.example', apiKey: 'new-key' });
  const second = game.submit();
  expect(current.acquire).toHaveBeenCalledTimes(1);
  old.resolve();
  await expect(first).resolves.toBeUndefined();
  expect(requestClient).not.toHaveBeenCalled();
  await game.submit();
  expect(requestClient).not.toHaveBeenCalled();
  current.resolve();
  await second;
  flush();
  expect(requestClient).toHaveBeenCalledTimes(1);
  expect(game.messages().map((message) => message.content)).toEqual([
    '问题',
    '是',
  ]);
});

it.each(['dispose', 'reveal', 'reset'] as const)(
  'never starts a request after %s during asynchronous acquisition',
  async (action) => {
    const client = pendingClientLayer();
    createRoot((cleanup) => {
      dispose = cleanup;
      game = useGame(client.layer);
    });
    requestClient.mockReturnValue(Effect.succeed(answer('yes')));
    enter();
    const pending = game.submit();
    if (action === 'dispose') dispose();
    else if (action === 'reveal') game.reveal();
    else game.startNewGame();
    client.resolve();
    await expect(pending).resolves.toBeUndefined();
    flush();
    expect(requestClient).not.toHaveBeenCalled();
    expect(game.messages()).toEqual([]);
    expect(game.error()).toEqual(Option.none());
    expect(game.loading()).toBe(false);
  }
);
