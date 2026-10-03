import {
  Array as Arr,
  Effect,
  Fiber,
  Match,
  Option,
  Ref,
  Schema,
  Scope,
  SubscriptionRef,
} from 'effect';
import { selectPuzzle, submitQuestion, submitSolution } from './game';
import { GameMode, GameStatus, Message, Puzzle } from './types';

export const SessionState = Schema.Struct({
  puzzle: Puzzle,
  mode: GameMode,
  input: Schema.String,
  loading: Schema.Boolean,
  status: GameStatus,
  messages: Schema.Array(Message),
  error: Schema.Option(Schema.String),
});
export type SessionSnapshot = typeof SessionState.Type;

type PendingRequest = {
  readonly token: object;
  readonly fiber: Option.Option<Fiber.Fiber<void>>;
};
interface SessionOwner {
  readonly scope: Scope.Closeable;
  readonly state: SubscriptionRef.SubscriptionRef<SessionSnapshot>;
  readonly active: Ref.Ref<Option.Option<PendingRequest>>;
  readonly closed: Ref.Ref<boolean>;
}

const initial = (puzzle: Puzzle): SessionSnapshot => ({
  puzzle,
  mode: 'question',
  input: '',
  loading: false,
  status: 'playing',
  messages: [],
  error: Option.none(),
});
const update = (owner: SessionOwner, patch: Partial<SessionSnapshot>) =>
  SubscriptionRef.update(owner.state, (previous) => ({
    ...previous,
    ...patch,
  }));
const current = (owner: SessionOwner, token: object) =>
  Ref.get(owner.active).pipe(
    Effect.map(
      (request) => Option.isSome(request) && request.value.token === token
    )
  );

const cancelRequest = (owner: SessionOwner) =>
  Effect.gen(function* () {
    const previous = yield* Ref.getAndSet(owner.active, Option.none());
    yield* update(owner, { loading: false, error: Option.none() });
    if (Option.isSome(previous) && Option.isSome(previous.value.fiber)) {
      yield* Effect.forkIn(
        Fiber.interrupt(previous.value.fiber.value),
        owner.scope,
        {
          startImmediately: true,
        }
      );
    }
  }).pipe(Effect.uninterruptible);

const requestTask = (
  owner: SessionOwner,
  token: object,
  snapshot: SessionSnapshot,
  content: string
) => {
  const request = Match.value(snapshot.mode).pipe(
    Match.when('question', () => submitQuestion(snapshot.puzzle, content)),
    Match.when('solve', () => submitSolution(snapshot.puzzle, content)),
    Match.exhaustive
  );
  return request.pipe(
    Effect.matchEffect({
      onFailure: (error) =>
        Effect.gen(function* () {
          if (yield* current(owner, token))
            yield* update(owner, { error: Option.some(error.message) });
        }),
      onSuccess: (result) =>
        Effect.gen(function* () {
          if (!(yield* current(owner, token))) return;
          yield* update(owner, {
            messages: [
              ...snapshot.messages,
              { role: 'user', mode: snapshot.mode, content },
              { role: 'host', content: result.content },
            ],
            input: '',
            status: result.status,
          });
        }),
    }),
    Effect.ensuring(
      Effect.gen(function* () {
        if (!(yield* current(owner, token))) return;
        yield* Ref.set(owner.active, Option.none());
        yield* update(owner, { loading: false });
      })
    ),
    Effect.interruptible
  );
};

const submitRequest = (owner: SessionOwner) =>
  Effect.gen(function* () {
    const snapshot = yield* SubscriptionRef.get(owner.state);
    const content = snapshot.input.trim();
    if (
      !content ||
      snapshot.status !== 'playing' ||
      Option.isSome(yield* Ref.get(owner.active)) ||
      (yield* Ref.get(owner.closed))
    ) {
      return Option.none<Fiber.Fiber<void>>();
    }
    const token = {};
    yield* Ref.set(owner.active, Option.some({ token, fiber: Option.none() }));
    yield* update(owner, { loading: true, error: Option.none() });
    const fiber = yield* Effect.forkIn(
      requestTask(owner, token, snapshot, content),
      owner.scope,
      {
        startImmediately: true,
      }
    );
    if (yield* current(owner, token)) {
      yield* Ref.set(
        owner.active,
        Option.some({ token, fiber: Option.some(fiber) })
      );
    }
    return Option.some(fiber);
  }).pipe(Effect.uninterruptible);

export const makeSession = Effect.fnUntraced(function* (
  puzzles: ReadonlyArray<Puzzle>
) {
  const bank = Arr.map(puzzles, (puzzle) => ({
    ...puzzle,
    keyFacts: Arr.copy(puzzle.keyFacts),
  }));
  const owner: SessionOwner = {
    scope: yield* Scope.make(),
    state: yield* SubscriptionRef.make(initial(yield* selectPuzzle(bank))),
    active: yield* Ref.make(Option.none<PendingRequest>()),
    closed: yield* Ref.make(false),
  };
  const cancel = cancelRequest(owner);
  yield* Effect.addFinalizer((exit) =>
    Effect.gen(function* () {
      yield* Ref.set(owner.closed, true);
      yield* Ref.set(owner.active, Option.none());
      yield* update(owner, { loading: false, error: Option.none() });
      yield* Scope.close(owner.scope, exit);
    })
  );
  return {
    snapshot: SubscriptionRef.get(owner.state),
    changes: SubscriptionRef.changes(owner.state),
    setInput: (input: string) => update(owner, { input }),
    setMode: (mode: GameMode) => update(owner, { mode }),
    cancel,
    reveal: cancel.pipe(Effect.andThen(update(owner, { status: 'revealed' }))),
    startNewGame: Effect.gen(function* () {
      yield* cancel;
      const previous = yield* SubscriptionRef.get(owner.state);
      const puzzle = yield* selectPuzzle(bank, Option.some(previous.puzzle.id));
      yield* SubscriptionRef.set(owner.state, initial(puzzle));
    }),
    submit: submitRequest(owner),
  };
});
export type GameSession = Effect.Success<ReturnType<typeof makeSession>>;
