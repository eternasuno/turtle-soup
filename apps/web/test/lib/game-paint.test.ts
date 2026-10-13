import { DecisionClient } from '@turtle-soup/core/decision';
import { JevDecisionModel } from '@turtle-soup/core/decision-provider';
import { Effect, Layer } from 'effect';
import { createRoot } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { useGame } from '../../src/lib/game';

const requestClient = vi.fn<DecisionClient['Service']['request']>();
const answer = () => ({ answer: { type: 'choice' as const, choice: 'yes' } });
let dispose: () => void;
let game: ReturnType<typeof useGame>;
afterEach(() => {
  dispose();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

function enter(content = '问题') {
  game.setInput(content);
}

function controlledFrames() {
  let nextId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callbacks.set(++nextId, callback);
    return nextId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));

  return {
    callbacks,
    advance: () => {
      const current = [...callbacks.values()];
      callbacks.clear();
      for (const callback of current) callback(0);
    },
  };
}

it('publishes pending input and messages before inference on both cold and warm submissions', async () => {
  const frames = controlledFrames();
  const acquire = vi.fn(() => DecisionClient.of({ request: requestClient }));
  createRoot((cleanup) => {
    dispose = cleanup;
    game = useGame(
      JevDecisionModel.pipe(Layer.provide(Layer.sync(DecisionClient, acquire)))
    );
  });
  requestClient.mockReturnValue(Effect.succeed(answer()));
  for (const [index, content] of ['第一问', '第二问'].entries()) {
    enter(content);
    const pending = game.submit();
    expect(game.input()).toBe('');
    expect(game.loading()).toBe(true);
    expect(game.messages().at(-1)).toEqual({
      role: 'user',
      mode: 'question',
      content,
    });
    expect(requestClient).toHaveBeenCalledTimes(index);
    expect(frames.callbacks.size).toBe(1);
    frames.advance();
    await Promise.resolve();
    expect(requestClient).toHaveBeenCalledTimes(index);
    expect(game.loading()).toBe(true);
    frames.advance();
    await pending;
    expect(requestClient).toHaveBeenCalledTimes(index + 1);
    expect(game.loading()).toBe(false);
    expect(game.messages().at(-1)?.content).toBe('是');
    expect(frames.callbacks.size).toBe(0);
  }
  expect(acquire).toHaveBeenCalledTimes(1);
});

it.each(['dispose', 'reveal', 'reset', 'settings'] as const)(
  'cancels the paint wait without starting inference on %s',
  async (action) => {
    const frames = controlledFrames();
    createRoot((cleanup) => {
      dispose = cleanup;
      game = useGame(
        JevDecisionModel.pipe(
          Layer.provide(
            Layer.succeed(
              DecisionClient,
              DecisionClient.of({ request: requestClient })
            )
          )
        )
      );
    });
    requestClient.mockReturnValue(Effect.succeed(answer()));
    enter();
    const pending = game.submit();
    frames.advance();
    expect(frames.callbacks.size).toBe(1);
    if (action === 'dispose') dispose();
    else if (action === 'reveal') game.reveal();
    else if (action === 'reset') game.startNewGame();
    else
      game.setSettings({
        apiUrl: 'https://decision.example',
        apiKey: 'new-key',
      });

    await pending;
    expect(frames.callbacks.size).toBe(0);
    frames.advance();
    expect(requestClient).not.toHaveBeenCalled();
  }
);
