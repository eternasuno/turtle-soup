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
import {
  puzzleView,
  selectPuzzle,
  submitQuestion,
  submitSolution,
} from './game';
import {
  GameMode,
  GameResult,
  GameStatus,
  Message,
  type Puzzle,
  PuzzleView,
} from './types';

export const SessionState = Schema.Struct({
  puzzle: PuzzleView,
  result: Schema.Option(GameResult),
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
  readonly snapshot: SessionSnapshot;
  readonly fiber: Option.Option<Fiber.Fiber<void>>;
};
interface SessionOwner {
  readonly puzzles: ReadonlyArray<Puzzle>;
  readonly puzzle: Ref.Ref<Puzzle>;
  readonly scope: Scope.Closeable;
  readonly state: SubscriptionRef.SubscriptionRef<SessionSnapshot>;
  readonly active: Ref.Ref<Option.Option<PendingRequest>>;
  readonly closed: Ref.Ref<boolean>;
}

const initial = (puzzle: Puzzle): SessionSnapshot => ({
  puzzle: puzzleView(puzzle),
  result: Option.none(),
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
    yield* update(owner, {
      loading: false,
      error: Option.none(),
      ...(Option.isSome(previous)
        ? {
            input: previous.value.snapshot.input,
            messages: previous.value.snapshot.messages,
          }
        : {}),
    });
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
  puzzle: Puzzle,
  content: string
) => {
  const request = Match.value(snapshot.mode).pipe(
    Match.when('question', () => submitQuestion(puzzle, content)),
    Match.when('solve', () => submitSolution(puzzle, content)),
    Match.exhaustive
  );
  return request.pipe(
    Effect.matchEffect({
      onFailure: (error) =>
        Effect.gen(function* () {
          if (yield* current(owner, token))
            yield* update(owner, {
              error: Option.some(error.message),
              input: snapshot.input,
              messages: snapshot.messages,
            });
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
            status: result.status,
            result:
              result.status === 'solved'
                ? Option.some({
                    truth: puzzle.truth,
                    reason: 'solved' as const,
                  })
                : Option.none(),
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

const copyPuzzleBank = (puzzles: ReadonlyArray<Puzzle>) =>
  Arr.map(puzzles, (puzzle) => ({
    ...puzzle,
    judgmentPoints: Arr.map(puzzle.judgmentPoints, (point) => ({ ...point })),
  }));

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
    const puzzle = yield* Ref.get(owner.puzzle);
    const token = {};
    yield* Ref.set(
      owner.active,
      Option.some({ token, snapshot, fiber: Option.none() })
    );
    yield* update(owner, {
      loading: true,
      error: Option.none(),
      input: '',
      messages: [
        ...snapshot.messages,
        { role: 'user', mode: snapshot.mode, content },
      ],
    });
    const fiber = yield* Effect.forkIn(
      requestTask(owner, token, snapshot, puzzle, content),
      owner.scope,
      {
        startImmediately: true,
      }
    );
    if (yield* current(owner, token)) {
      yield* Ref.set(
        owner.active,
        Option.some({ token, snapshot, fiber: Option.some(fiber) })
      );
    }
    return Option.some(fiber);
  }).pipe(Effect.uninterruptible);

export const makeSession = Effect.fnUntraced(function* (
  puzzles: ReadonlyArray<Puzzle>
) {
  const bank = copyPuzzleBank(puzzles);
  if (new Set(Arr.map(bank, (puzzle) => puzzle.id)).size !== bank.length) {
    return yield* Effect.die(new Error('Puzzle ids must be unique'));
  }
  const puzzle = yield* selectPuzzle(bank);
  const owner: SessionOwner = {
    puzzles: bank,
    scope: yield* Scope.make(),
    puzzle: yield* Ref.make(puzzle),
    state: yield* SubscriptionRef.make(initial(puzzle)),
    active: yield* Ref.make(Option.none<PendingRequest>()),
    closed: yield* Ref.make(false),
  };
  const cancel = cancelRequest(owner);
  yield* Effect.addFinalizer((exit) =>
    Effect.gen(function* () {
      yield* Ref.set(owner.closed, true);
      yield* cancel;
      yield* Scope.close(owner.scope, exit);
    })
  );
  return {
    snapshot: SubscriptionRef.get(owner.state),
    changes: SubscriptionRef.changes(owner.state),
    setInput: (input: string) => update(owner, { input }),
    setMode: (mode: GameMode) => update(owner, { mode }),
    cancel,
    reveal: Effect.gen(function* () {
      yield* cancel;
      const snapshot = yield* SubscriptionRef.get(owner.state);
      if (snapshot.status === 'solved') return;
      const puzzle = yield* Ref.get(owner.puzzle);
      yield* update(owner, {
        status: 'revealed',
        result: Option.some({ truth: puzzle.truth, reason: 'revealed' }),
      });
    }),
    startNewGame: Effect.gen(function* () {
      yield* cancel;
      const previous = yield* SubscriptionRef.get(owner.state);
      const puzzle = yield* selectPuzzle(bank, Option.some(previous.puzzle.id));
      yield* Ref.set(owner.puzzle, puzzle);
      yield* SubscriptionRef.set(owner.state, initial(puzzle));
    }),
    submit: submitRequest(owner),
  };
});
export type GameSession = Effect.Success<ReturnType<typeof makeSession>>;
