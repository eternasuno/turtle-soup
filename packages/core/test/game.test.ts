import { expect, it } from '@effect/vitest';
import { Effect, Layer, Option, Random } from 'effect';
import { AiError, DecisionModel } from 'effect/ai';
import {
  puzzleView,
  selectPuzzle,
  solutionStatus,
  submitQuestion,
  submitSolution,
} from '../src/game';
import type { Puzzle } from '../src/types';

const puzzles: Puzzle[] = ['first', 'second', 'third'].map((id) => ({
  id,
  title: id,
  surface: '谜面',
  truth: '隐藏谜底',
  judgmentPoints: [{ id: 'p1', description: '隐藏事实' }],
}));
it('projects only player-visible puzzle fields', () => {
  expect(puzzleView(puzzles[0]!)).toEqual({
    id: 'first',
    title: 'first',
    surface: '谜面',
  });
});

const fake = (answers: Record<string, string>) =>
  Layer.effect(
    DecisionModel.DecisionModel,
    DecisionModel.make({
      decide: ({ decisions }) =>
        Effect.succeed({
          answers: Object.fromEntries(
            Object.entries(decisions).map(([id, decision]) => {
              const label = answers[id]!;
              return [
                id,
                {
                  _tag: 'Classify',
                  label,
                  probabilities: Object.fromEntries(
                    Object.keys(
                      decision.criteria as Record<string, unknown>
                    ).map((choice) => [choice, choice === label ? 1 : 0])
                  ),
                },
              ];
            })
          ),
          usage: { inputTokens: undefined, outputTokens: undefined },
        }),
    })
  );

it.effect.each(['seed-a', 'seed-b', 'seed-c'])(
  'excludes previous puzzle with seed %s',
  (seed) =>
    Effect.gen(function* () {
      const selected = yield* selectPuzzle(puzzles, Option.some('second')).pipe(
        Random.withSeed(seed)
      );
      expect(puzzles).toContain(selected);
      expect(selected.id).not.toBe('second');
    })
);
it.effect('supports a singleton even when previously selected', () =>
  Effect.gen(function* () {
    expect(yield* selectPuzzle([puzzles[0]!], Option.some('first'))).toBe(
      puzzles[0]
    );
  })
);
it.effect('rejects an empty puzzle bank with a tagged error', () =>
  Effect.gen(function* () {
    expect(yield* Effect.flip(selectPuzzle([]))).toMatchObject({
      _tag: 'EmptyPuzzleBankError',
      message: '题库为空',
    });
  })
);
it.each([
  [[true, true], 'correct'],
  [[true, false], 'partial'],
  [[false, true], 'partial'],
  [[false, false], 'wrong'],
  [[], 'wrong'],
] as const)('classifies %j as %s', (matches, status) => {
  expect(
    solutionStatus(
      matches.map((matched) => ({
        fact: '事实',
        matched,
        confidence: Option.none(),
      }))
    )
  ).toBe(status);
});

it.effect.each([
  ['yes', '是'],
  ['no', '不是'],
  ['irrelevant', '无关'],
  ['unknown', '无法确定'],
] as const)('maps %s to player-visible %s', ([choice, content]) =>
  Effect.gen(function* () {
    const result = yield* submitQuestion(puzzles[0]!, '问题').pipe(
      Effect.provide(fake({ answer: choice }))
    );
    expect(result).toEqual({ content, status: 'playing' });
  })
);

it.effect.each([
  ['matched', 'matched', '解密成功', 'solved'],
  ['matched', 'missing', '已经接近真相，但还缺少关键部分。', 'playing'],
  ['missing', 'missing', '这个解释还没有触及核心真相。', 'playing'],
] as const)(
  'maps %s/%s without exposing facts',
  ([first, second, content, status]) =>
    Effect.gen(function* () {
      const result = yield* submitSolution(
        {
          ...puzzles[0]!,
          judgmentPoints: [
            { id: 'a', description: '秘密甲' },
            { id: 'b', description: '秘密乙' },
          ],
        },
        '答案'
      ).pipe(Effect.provide(fake({ a: first, b: second })));
      expect(result).toEqual({ content, status });
      expect(JSON.stringify(result)).not.toContain('秘密');
      expect(JSON.stringify(result)).not.toContain('隐藏谜底');
    })
);

it.effect('maps model failures to the fixed player-visible error', () =>
  Effect.gen(function* () {
    const layer = Layer.effect(
      DecisionModel.DecisionModel,
      DecisionModel.make({
        decide: () =>
          Effect.fail(
            AiError.make({
              module: 'test',
              method: 'decide',
              reason: new AiError.UnknownError({ description: 'failed' }),
            })
          ),
      })
    );
    const error = yield* submitQuestion(puzzles[0]!, '玩家输入').pipe(
      Effect.provide(layer),
      Effect.flip
    );
    expect(error.message).toBe(
      'Decision 请求失败，请检查 API URL、API Key 或网络状态。'
    );
  })
);
