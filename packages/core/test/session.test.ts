import { expect, it } from '@effect/vitest';
import { Deferred, Effect, Exit, Fiber, Layer, Option, Scope } from 'effect';
import { AiError, type Decision, DecisionModel } from 'effect/ai';
import { makeSession } from '../src/session';
import type { Puzzle } from '../src/types';

const bank: Puzzle[] = ['first', 'second'].map((id) => ({
  id,
  title: id,
  surface: '谜面',
  truth: '隐藏谜底',
  judgmentPoints: [{ id: 'p1', description: '隐藏事实' }],
}));
const answer = (choice: string) => ({ answer: choice });
const response = (
  decisions: Record<string, Decision.Any>,
  answers: Record<string, string>
): DecisionModel.ProviderResponse => ({
  answers: Object.fromEntries(
    Object.entries(decisions).map(([id, decision]) => {
      const label = answers[id]!;
      return [
        id,
        {
          _tag: 'Classify' as const,
          label,
          probabilities: Object.fromEntries(
            Object.keys(decision.criteria as Record<string, unknown>).map(
              (choice) => [choice, choice === label ? 1 : 0]
            )
          ),
        },
      ];
    })
  ),
  usage: { inputTokens: undefined, outputTokens: undefined },
});
const client = (
  decide: (
    decisions: Record<string, Decision.Any>
  ) => Effect.Effect<DecisionModel.ProviderResponse, AiError.AiError>
) =>
  Layer.effect(
    DecisionModel.DecisionModel,
    DecisionModel.make({ decide: ({ decisions }) => decide(decisions) })
  );

it.effect(
  'guards blank, duplicate and ended submissions with authoritative state',
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const result = yield* Deferred.make<Record<string, string>>();
        let calls = 0;
        const session = yield* makeSession(bank);
        const submit = session.submit.pipe(
          Effect.provide(
            client((decisions) => {
              calls += 1;
              return Deferred.await(result).pipe(
                Effect.map((answers) => response(decisions, answers))
              );
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
        expect((yield* session.snapshot).result).toEqual(Option.none());
        yield* session.reveal;
        expect((yield* session.snapshot).result).toEqual(
          Option.some({ truth: '隐藏谜底', reason: 'revealed' })
        );
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
              AiError.make({
                module: 'test',
                method: 'decide',
                reason: new AiError.UnknownError({ description: '网络失败' }),
              })
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
      expect(failed.error).toEqual(
        Option.some('Decision 请求失败，请检查 API URL、API Key 或网络状态。')
      );
      const retry = yield* session.submit.pipe(
        Effect.provide(
          client((decisions) =>
            Effect.succeed(response(decisions, { p1: 'matched' }))
          )
        )
      );
      if (Option.isSome(retry)) yield* Fiber.join(retry.value);
      const solved = yield* session.snapshot;
      expect(solved.status).toBe('solved');
      expect(solved.result).toEqual(
        Option.some({ truth: '隐藏谜底', reason: 'solved' })
      );
      expect(solved.puzzle).toEqual({
        id: solved.puzzle.id,
        title: solved.puzzle.title,
        surface: '谜面',
      });
      expect(JSON.stringify(solved)).not.toContain('隐藏事实');
      expect(JSON.stringify(solved.puzzle)).not.toContain('隐藏谜底');
      expect(JSON.stringify(solved.messages)).not.toContain('隐藏事实');
      yield* session.startNewGame;
      const reset = yield* session.snapshot;
      expect(reset.puzzle.id).not.toBe(solved.puzzle.id);
      expect(reset.result).toEqual(Option.none());
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
          Record<string, string>,
          AiError.AiError
        >();
        const next = yield* Deferred.make<Record<string, string>>();
        const session = yield* makeSession(bank);
        yield* session.setInput('旧问题');
        const first = yield* session.submit.pipe(
          Effect.provide(
            client((decisions) =>
              Effect.uninterruptible(Deferred.await(old)).pipe(
                Effect.map((answers) => response(decisions, answers))
              )
            )
          )
        );
        yield* session.startNewGame;
        yield* session.setInput('新问题');
        const second = yield* session.submit.pipe(
          Effect.provide(
            client((decisions) =>
              Deferred.await(next).pipe(
                Effect.map((answers) => response(decisions, answers))
              )
            )
          )
        );
        if (outcome === 'success') yield* Deferred.succeed(old, answer('yes'));
        else
          yield* Deferred.fail(
            old,
            AiError.make({
              module: 'test',
              method: 'decide',
              reason: new AiError.UnknownError({ description: '旧错误' }),
            })
          );
        if (Option.isSome(first)) yield* Fiber.await(first.value);
        expect(yield* session.snapshot).toMatchObject({
          input: '',
          loading: true,
          messages: [{ role: 'user', mode: 'question', content: '新问题' }],
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
        const result = yield* Deferred.make<Record<string, string>>();
        let calls = 0;
        const session = yield* makeSession(bank).pipe(Scope.provide(scope));
        const submit = session.submit.pipe(
          Effect.provide(
            client((decisions) =>
              Effect.gen(function* () {
                calls += 1;
                yield* Deferred.succeed(started, undefined);
                return response(decisions, yield* Deferred.await(result));
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
          Effect.provide(
            client((decisions) =>
              Effect.succeed(response(decisions, answer('yes')))
            )
          )
        )
      ).toEqual(Option.none());
    })
);
