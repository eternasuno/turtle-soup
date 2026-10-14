import { RegistryContext, useAtomValue } from '@effect/atom-solid';
import {
  type DecisionError,
  DecisionFailureReason,
} from '@turtle-soup/core/decision-error';
import { makeSession } from '@turtle-soup/core/session';
import type { SettingsError } from '@turtle-soup/core/settings';
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
} from 'effect';
import { AiError, DecisionModel } from 'effect/ai';
import { Atom, AtomRegistry } from 'effect/reactivity';
import {
  type Accessor,
  createComponent,
  createSignal,
  onCleanup,
} from 'solid-js';
import puzzles from '../data/puzzles.json';
import { configuredDecision } from './decision';
import { localFailure } from './local-diagnostic';
import { SettingsStorageLive } from './storage';

const puzzleBank = Schema.decodeUnknownSync(Schema.Array(Puzzle))(puzzles);
type ClientLayer = Layer.Layer<
  DecisionModel.DecisionModel,
  SettingsError | DecisionError | AiError.AiError
>;

const yieldForPaint = (signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    let frame: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    const complete = () => {
      cleanup();
      resolve();
    };
    if (signal.aborted) {
      abort();
      return;
    }

    signal.addEventListener('abort', abort, { once: true });
    if (typeof requestAnimationFrame === 'function') {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(complete);
      });
    } else {
      timer = setTimeout(complete, 0);
    }
  });

export function useGame(
  configuredClient:
    | ClientLayer
    | ((settings: DecisionSettings) => ClientLayer) = configuredDecision
) {
  const scope = Effect.runSync(Scope.make());
  const session = Effect.runSync(
    makeSession(puzzleBank).pipe(Effect.provideService(Scope.Scope, scope))
  );
  const registry = AtomRegistry.make();
  const changes = Atom.make(session.changes, {
    initialValue: Effect.runSync(session.snapshot),
  });
  const snapshot = Atom.make((get) => {
    get(changes);

    return Effect.runSync(session.snapshot);
  });
  let state!: Accessor<Atom.Type<typeof snapshot>>;
  createComponent(RegistryContext.Provider, {
    value: registry,
    get children() {
      state = useAtomValue(() => snapshot);

      return null;
    },
  });
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
          Layer.effect(
            DecisionModel.DecisionModel,
            DecisionModel.make({
              decide: () =>
                Effect.fail(
                  AiError.make({
                    module: 'Game',
                    method: 'configure',
                    reason: new AiError.UnknownError({
                      description: error.message,
                    }),
                  })
                ),
            })
          )
        )
      )
    );
  };
  let runtime = makeRuntime(settings());
  let disposed = false;

  const refresh = () => {
    registry.refresh(snapshot);
    registry.get(snapshot);
  };
  const execute = <A, E>(command: Effect.Effect<A, E>) => {
    const result = Effect.runSync(command);
    refresh();
    return result;
  };
  onCleanup(() => {
    execute(session.cancel);
    disposed = true;
    registry.dispose();
    void Effect.runPromise(Scope.close(scope, Exit.void));
    void runtime.dispose();
  });
  const submit = async () => {
    if (disposed) return;

    const configured = runtime;
    const configuration = settings();
    const model = DecisionModel.DecisionModel.of({
      [DecisionModel.TypeId]: DecisionModel.TypeId,
      decide: (definition, options) =>
        Effect.context<typeof definition.input.EncodingServices>().pipe(
          Effect.flatMap((context) =>
            Effect.tryPromise({
              try: async (signal) => {
                await yieldForPaint(signal);
                signal.throwIfAborted();

                return configured.runPromiseExit(
                  DecisionModel.DecisionModel.use((realModel) =>
                    realModel.decide(definition, options).pipe(
                      Effect.provideContext(context),
                      Effect.mapError((cause) => {
                        if (configuration.provider !== 'local') return cause;

                        const diagnostic = localFailure(cause);
                        console.error({
                          modelId:
                            configuration.modelId ??
                            'onnx-community/laya-multilingual-ONNX',
                          backend: configuration.backend ?? 'wasm',
                          ...diagnostic,
                        });

                        return AiError.make({
                          module: 'Game',
                          method: cause.method,
                          reason: new DecisionFailureReason(
                            `本地模型判定失败：${diagnostic.reason}`,
                            cause
                          ),
                        });
                      })
                    )
                  ),
                  { signal }
                );
              },
              catch: () =>
                AiError.make({
                  module: 'Game',
                  method: 'decide',
                  reason: new AiError.UnknownError({
                    description: 'Decision runtime failed',
                  }),
                }),
            }).pipe(
              Effect.flatMap((exit) =>
                Exit.isSuccess(exit)
                  ? Effect.succeed(exit.value)
                  : Effect.failCause(exit.cause)
              )
            )
          )
        ),
    });
    const request = execute(
      session.submit.pipe(
        Effect.provideService(DecisionModel.DecisionModel, model)
      )
    );
    if (Option.isNone(request)) return;

    const exit = await Effect.runPromiseExit(Fiber.join(request.value));
    if (Exit.isFailure(exit) && !Cause.hasInterrupts(exit.cause))
      console.error('Game request failed unexpectedly.');
    if (!disposed) refresh();
  };
  const setSettings = (settings: DecisionSettings) => {
    if (disposed) return;
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
    result: () => state().result,
    error: () => state().error,
    settings,
    setSettings,
    reveal: () => execute(session.reveal),
    startNewGame: () => execute(session.startNewGame),
    submit,
  };
}
