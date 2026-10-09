import {
  DecisionClient,
  DecisionError,
  type SettingsError,
} from '@turtle-soup/core/decision';
import { makeSession } from '@turtle-soup/core/session';
import { loadInitialSettings } from '@turtle-soup/core/settings';
import { type DecisionSettings, Puzzle } from '@turtle-soup/core/types';
import {
  Cause,
  Effect,
  Exit,
  Fiber,
  Layer,
  ManagedRuntime,
  Option,
  Schema,
  Scope,
  Stream,
} from 'effect';
import { createSignal, onCleanup } from 'solid-js';
import puzzles from '../data/puzzles.json';
import { configuredDecision } from './decision';
import { SettingsStorageLive } from './storage';

const puzzleBank = Schema.decodeUnknownSync(Schema.Array(Puzzle))(puzzles);
type ClientLayer = Layer.Layer<DecisionClient, SettingsError | DecisionError>;

export function useGame(
  configuredClient:
    | ClientLayer
    | ((settings: DecisionSettings) => ClientLayer) = configuredDecision
) {
  const scope = Effect.runSync(Scope.make());
  const session = Effect.runSync(
    makeSession(puzzleBank).pipe(Effect.provideService(Scope.Scope, scope))
  );
  const [state, setState] = createSignal(Effect.runSync(session.snapshot));
  const [settings, setSettingsSignal] = createSignal(
    Effect.runSync(
      loadInitialSettings().pipe(Effect.provide(SettingsStorageLive))
    )
  );
  const makeRuntime = (settings: DecisionSettings) => {
    const layer =
      typeof configuredClient === 'function'
        ? configuredClient(settings)
        : configuredClient;
    return ManagedRuntime.make(
      layer.pipe(
        Layer.catch((error) =>
          Layer.succeed(DecisionClient, {
            request: () =>
              Effect.fail(
                new DecisionError({ message: error.message, cause: error })
              ),
          })
        )
      )
    );
  };
  let runtime = makeRuntime(settings());
  let disposed = false;
  let acquisition = Option.none<object>();
  const subscription = Effect.runFork(
    session.changes.pipe(
      Stream.runForEach((snapshot) =>
        Effect.sync(() => {
          if (!disposed) setState(snapshot);
        })
      )
    )
  );
  const execute = <A, E>(command: Effect.Effect<A, E>) => {
    const result = Effect.runSync(command);
    setState(Effect.runSync(session.snapshot));
    return result;
  };
  onCleanup(() => {
    disposed = true;
    acquisition = Option.none();
    execute(session.cancel);
    subscription.interruptUnsafe();
    void Effect.runPromise(Scope.close(scope, Exit.void));
    void runtime.dispose();
  });
  const submit = async () => {
    if (disposed || Option.isSome(acquisition)) return;
    const configured = runtime;
    const token = {};
    acquisition = Option.some(token);
    const pending = configured.runPromiseExit(
      Effect.gen(function* () {
        if (
          disposed ||
          runtime !== configured ||
          !Option.exists(acquisition, (current) => current === token)
        )
          return;
        acquisition = Option.none();
        const request = yield* session.submit;
        if (Option.isSome(request)) return yield* Fiber.join(request.value);
      })
    );
    setState(Effect.runSync(session.snapshot));
    const exit = await pending;
    if (Option.exists(acquisition, (current) => current === token))
      acquisition = Option.none();
    if (Exit.isFailure(exit) && !Cause.hasInterrupts(exit.cause))
      console.error(exit.cause);
    if (!disposed) setState(Effect.runSync(session.snapshot));
  };
  const setSettings = (settings: DecisionSettings) => {
    if (disposed) return;
    acquisition = Option.none();
    execute(session.cancel);
    const previous = runtime;
    runtime = makeRuntime(settings);
    setSettingsSignal({ ...settings });
    void previous.dispose();
  };
  return {
    puzzle: () => state().puzzle,
    mode: () => state().mode,
    setMode: (mode: Parameters<typeof session.setMode>[0]) =>
      execute(session.setMode(mode)),
    messages: () => state().messages,
    input: () => state().input,
    setInput: (input: string) => execute(session.setInput(input)),
    loading: () => state().loading,
    status: () => state().status,
    error: () => state().error,
    settings,
    setSettings,
    reveal: () => {
      acquisition = Option.none();
      return execute(session.reveal);
    },
    startNewGame: () => {
      acquisition = Option.none();
      return execute(session.startNewGame);
    },
    submit,
  };
}
