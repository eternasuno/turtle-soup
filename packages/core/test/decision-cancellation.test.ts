import { expect, it } from '@effect/vitest';
import { Cause, Deferred, Effect, Exit, Fiber, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { TestClock } from 'effect/testing';
import {
  askQuestion,
  DECISION_ERROR_MESSAGE,
  DecisionClientLive,
  evaluateSolution,
  testConnection,
} from '../src/decision';

const puzzle = {
  id: 'soup',
  title: '海龟汤',
  surface: '谜面',
  truth: '谜底',
  keyFacts: ['事实'],
};
const settings = { apiUrl: 'https://decision.example', apiKey: 'secret' };
const operations = [
  { name: 'question', operation: () => askQuestion(puzzle, '问题') },
  {
    name: 'solution',
    operation: () => evaluateSolution(puzzle, '答案'),
  },
  { name: 'connection', operation: () => testConnection() },
];

it.effect.each(operations)('aborts $name at 30 seconds', ({ operation }) =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    let signal: AbortSignal | null | undefined;
    const fetch: typeof globalThis.fetch = (_url, init) => {
      signal = init?.signal;
      Deferred.doneUnsafe(started, Exit.void);
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        });
      });
    };
    const layer = DecisionClientLive(settings).pipe(
      Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch))
    );
    const fiber = yield* Effect.forkChild(
      operation().pipe(Effect.provide(layer), Effect.flip)
    );
    yield* Deferred.await(started);
    yield* TestClock.adjust(29_999);
    expect(signal?.aborted).toBe(false);
    yield* TestClock.adjust(1);
    const error = yield* Fiber.join(fiber);
    expect(error).toMatchObject({
      _tag: 'DecisionError',
      message: DECISION_ERROR_MESSAGE,
    });
    expect(signal?.aborted).toBe(true);
  })
);

it.effect.each(operations)(
  'aborts $name on caller interruption without a typed error',
  ({ operation }) =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      let signal: AbortSignal | null | undefined;
      const fetch: typeof globalThis.fetch = (_url, init) => {
        signal = init?.signal;
        Deferred.doneUnsafe(started, Exit.void);
        return new Promise((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            { once: true }
          );
        });
      };
      const layer = DecisionClientLive(settings).pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch))
      );
      const fiber = yield* Effect.forkChild(
        operation().pipe(Effect.provide(layer))
      );
      yield* Deferred.await(started);
      yield* Fiber.interrupt(fiber);
      const exit = yield* Fiber.await(fiber);
      expect(signal?.aborted).toBe(true);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit))
        expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
    })
);

it.effect.each(['status', 'body'] as const)(
  'releases an errored streaming response after %s failure while the client remains alive',
  (failure) =>
    Effect.gen(function* () {
      let signal: AbortSignal | null | undefined;
      const fetch: typeof globalThis.fetch = async (_url, init) => {
        signal = init?.signal;
        return new Response(
          new ReadableStream({
            start(controller) {
              if (failure === 'body')
                controller.error(new Error('stream failed'));
            },
          }),
          { status: failure === 'status' ? 503 : 200 }
        );
      };
      yield* Effect.gen(function* () {
        const error = yield* Effect.flip(askQuestion(puzzle, '问题'));
        expect(error).toMatchObject({
          _tag: 'DecisionError',
          message: DECISION_ERROR_MESSAGE,
        });
        expect(signal?.aborted).toBe(true);
      }).pipe(
        Effect.provide(
          DecisionClientLive(settings).pipe(
            Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch))
          )
        )
      );
    })
);

it.effect('keeps body decoding within the request scope and timeout', () =>
  Effect.gen(function* () {
    const reading = yield* Deferred.make<void>();
    let signal: AbortSignal | null | undefined;
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      signal = init?.signal;
      return new Response(
        new ReadableStream({
          start(controller) {
            signal?.addEventListener(
              'abort',
              () => controller.error(new Error('aborted')),
              { once: true }
            );
          },
          pull() {
            Deferred.doneUnsafe(reading, Exit.void);
          },
        })
      );
    };
    const fiber = yield* Effect.forkChild(
      askQuestion(puzzle, '问题').pipe(
        Effect.provide(
          DecisionClientLive(settings).pipe(
            Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch))
          )
        ),
        Effect.flip
      )
    );
    yield* Deferred.await(reading);
    expect(signal?.aborted).toBe(false);
    yield* TestClock.adjust(30_000);
    expect(yield* Fiber.join(fiber)).toMatchObject({ _tag: 'DecisionError' });
    expect(signal?.aborted).toBe(true);
  })
);
