import { expect, it } from '@effect/vitest';
import { Deferred, Effect, Exit, Fiber, Layer, Option, Scope } from 'effect';
import {
  type ChoiceAnswer,
  DecisionClient,
  DecisionError,
} from '../src/decision';
import { makeSession } from '../src/session';
import type { Puzzle } from '../src/types';

const bank: Puzzle[] = ['first', 'second'].map((id) => ({
  id,
  title: id,
  surface: '谜面',
  truth: '隐藏谜底',
  keyFacts: ['隐藏事实'],
}));
const answer = (choice: string): Record<string, ChoiceAnswer> => ({
  answer: { type: 'choice', choice },
});
const client = (request: DecisionClient['Service']['request']) =>
  Layer.succeed(DecisionClient, { request });

it.effect(
  'guards blank, duplicate and ended submissions with authoritative state',
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const result = yield* Deferred.make<Record<string, ChoiceAnswer>>();
        let calls = 0;
        const session = yield* makeSession(bank);
        const submit = session.submit.pipe(
          Effect.provide(
            client(() => {
              calls += 1;
              return Deferred.await(result);
            })
          )
        );
        expect(yield* submit).toEqual(Option.none());
        yield* session.setInput('  问题  ');
        const first = yield* submit;
        expect(yield* submit).toEqual(Option.none());
        expect(calls).toBe(1);
        yield* Deferred.succeed(result, answer('yes'));
        if (Option.isSome(first)) yield* Fiber.join(first.value);
        expect((yield* session.snapshot).messages).toEqual([
          { role: 'user', mode: 'question', content: '问题' },
          { role: 'host', content: '是' },
        ]);
        yield* session.reveal;
        yield* session.setInput('不能发送');
        expect(yield* submit).toEqual(Option.none());
        expect(calls).toBe(1);
      })
    )
);

it.effect('preserves retry input and resets every game field', () =>
  Effect.scoped(
    Effect.gen(function* () {
      const session = yield* makeSession(bank);
      yield* session.setInput('我的答案');
      yield* session.setMode('solve');
      const pending = yield* session.submit.pipe(
        Effect.provide(
          client(() =>
            Effect.fail(
              new DecisionError({ message: '网络失败', cause: 'network' })
            )
          )
        )
      );
      if (Option.isSome(pending)) yield* Fiber.join(pending.value);
      const failed = yield* session.snapshot;
      expect(failed).toMatchObject({
        input: '我的答案',
        mode: 'solve',
        loading: false,
        status: 'playing',
        messages: [],
      });
      expect(failed.error).toEqual(Option.some('网络失败'));
      const retry = yield* session.submit.pipe(
        Effect.provide(
          client(() =>
            Effect.succeed({
              fact_0: { type: 'choice', choice: 'matched' },
            })
          )
        )
      );
      if (Option.isSome(retry)) yield* Fiber.join(retry.value);
      const solved = yield* session.snapshot;
      expect(solved.status).toBe('solved');
      expect(JSON.stringify(solved.messages)).not.toContain('隐藏事实');
      yield* session.startNewGame;
      const reset = yield* session.snapshot;
      expect(reset.puzzle.id).not.toBe(solved.puzzle.id);
      expect(reset).toMatchObject({
        mode: 'question',
        input: '',
        loading: false,
        status: 'playing',
        messages: [],
      });
      expect(reset.error).toEqual(Option.none());
    })
  )
);

it.effect.each(['success', 'failure'] as const)(
  'ignores stale %s and finalization while another request is pending',
  (outcome) =>
    Effect.scoped(
      Effect.gen(function* () {
        const old = yield* Deferred.make<
          Record<string, ChoiceAnswer>,
          DecisionError
        >();
        const next = yield* Deferred.make<Record<string, ChoiceAnswer>>();
        const session = yield* makeSession(bank);
        yield* session.setInput('旧问题');
        const first = yield* session.submit.pipe(
          Effect.provide(
            client(() => Effect.uninterruptible(Deferred.await(old)))
          )
        );
        yield* session.startNewGame;
        yield* session.setInput('新问题');
        const second = yield* session.submit.pipe(
          Effect.provide(client(() => Deferred.await(next)))
        );
        if (outcome === 'success') yield* Deferred.succeed(old, answer('yes'));
        else
          yield* Deferred.fail(
            old,
            new DecisionError({ message: '旧错误', cause: 'old' })
          );
        if (Option.isSome(first)) yield* Fiber.await(first.value);
        expect(yield* session.snapshot).toMatchObject({
          input: '新问题',
          loading: true,
          messages: [],
          error: Option.none(),
        });
        yield* Deferred.succeed(next, answer('no'));
        if (Option.isSome(second)) yield* Fiber.join(second.value);
        expect(
          (yield* session.snapshot).messages.map((message) => message.content)
        ).toEqual(['新问题', '不是']);
      })
    )
);

it.effect(
  'refuses submission while scope closure waits for a cancelled request',
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const scope = yield* Scope.make();
        const started = yield* Deferred.make<void>();
        const result = yield* Deferred.make<Record<string, ChoiceAnswer>>();
        let calls = 0;
        const session = yield* makeSession(bank).pipe(Scope.provide(scope));
        const submit = session.submit.pipe(
          Effect.provide(
            client(() =>
              Effect.gen(function* () {
                calls += 1;
                yield* Deferred.succeed(started, undefined);
                return yield* Deferred.await(result);
              }).pipe(Effect.uninterruptible)
            )
          )
        );
        yield* session.setInput('旧问题');
        yield* submit;
        yield* Deferred.await(started);
        yield* session.cancel;
        expect((yield* session.snapshot).loading).toBe(false);
        const closing = yield* Effect.forkIn(
          Scope.close(scope, Exit.void),
          yield* Effect.scope,
          { startImmediately: true }
        );
        yield* Effect.gen(function* () {
          expect(closing.pollUnsafe()).toBeUndefined();
          yield* session.setInput('新问题');
          expect(yield* submit).toEqual(Option.none());
          expect(calls).toBe(1);
          expect(yield* session.snapshot).toMatchObject({
            input: '新问题',
            loading: false,
            messages: [],
            error: Option.none(),
          });
        }).pipe(Effect.ensuring(Deferred.succeed(result, answer('yes'))));
        yield* Fiber.join(closing);
        expect(yield* session.snapshot).toMatchObject({
          input: '新问题',
          loading: false,
          messages: [],
          error: Option.none(),
        });
      })
    )
);

it.effect(
  'cancels the request on scope closure and forbids later submission',
  () =>
    Effect.gen(function* () {
      let interrupted = false;
      const session = yield* Effect.scoped(
        Effect.gen(function* () {
          const session = yield* makeSession(bank);
          yield* session.setInput('问题');
          yield* session.submit.pipe(
            Effect.provide(
              client(() =>
                Effect.never.pipe(
                  Effect.onInterrupt(() =>
                    Effect.sync(() => {
                      interrupted = true;
                    })
                  )
                )
              )
            )
          );
          return session;
        })
      );
      expect(interrupted).toBe(true);
      expect((yield* session.snapshot).loading).toBe(false);
      expect(
        yield* session.submit.pipe(
          Effect.provide(client(() => Effect.succeed(answer('yes'))))
        )
      ).toEqual(Option.none());
    })
);
