import type { DecisionError } from '@turtle-soup/core/decision-error';
import {
  choiceAnswersToProvider,
  providerOptionsToRequest,
} from '@turtle-soup/core/decision-provider';
import type { ChoiceAnswer } from '@turtle-soup/core/decision-schema';
import { Effect, Layer } from 'effect';
import { AiError, DecisionModel } from 'effect/ai';
import { createRoot } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { useGame } from '../../src/lib/game';

const requestClient =
  vi.fn<
    (
      payload: DecisionModel.ProviderOptions
    ) => Effect.Effect<Record<string, ChoiceAnswer>, DecisionError>
  >();
const answer = () => ({ answer: { type: 'choice' as const, choice: 'yes' } });
const makeModel = DecisionModel.make({
  decide: (options) =>
    requestClient(options).pipe(
      Effect.flatMap((answers) =>
        providerOptionsToRequest(options).pipe(
          Effect.map((payload) =>
            choiceAnswersToProvider(payload.questions, answers)
          )
        )
      ),
      Effect.mapError((cause) =>
        AiError.make({
          module: 'TestModel',
          method: 'decide',
          reason: Object.assign(new AiError.UnknownError({}), { cause }),
        })
      )
    ),
});
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
  const acquire = vi.fn(() => makeModel);
  createRoot((cleanup) => {
    dispose = cleanup;
    game = useGame(
      Layer.effect(DecisionModel.DecisionModel, Effect.suspend(acquire))
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
      game = useGame(Layer.effect(DecisionModel.DecisionModel, makeModel));
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
