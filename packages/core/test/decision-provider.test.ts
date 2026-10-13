import { it } from '@effect/vitest';
import { Effect, Layer, Schema } from 'effect';
import { AiError, Decision, DecisionModel } from 'effect/ai';
import { describe, expect } from 'vitest';
import { DecisionClient, DecisionError } from '../src/decision-client';
import { JevDecisionModel } from '../src/decision-provider';
import type { DecisionRequest } from '../src/decision-schema';

describe('JevDecisionModel', () => {
  it.effect('maps classify labels and provided probabilities', () =>
    Effect.gen(function* () {
      let received: typeof DecisionRequest.Type | undefined;
      const clientLayer = Layer.succeed(
        DecisionClient,
        DecisionClient.of({
          request: (payload) => {
            received = payload;
            return Effect.succeed({
              mood: {
                type: 'choice',
                choice: 'positive',
                probabilities: { positive: 0.7, negative: 0.3 },
              },
            });
          },
        })
      );
      const modelLayer = JevDecisionModel.pipe(Layer.provide(clientLayer));
      const definition = Decision.make({
        input: Schema.Struct({ text: Schema.String }),
        decisions: {
          mood: Decision.classify({
            instructions: 'Classify mood',
            criteria: { positive: 'good', negative: 'bad' },
          }),
        },
      });
      const result = yield* DecisionModel.decide(definition, {
        input: { text: 'hello' },
      }).pipe(Effect.provide(modelLayer));
      expect(result.answers.mood.label).toBe('positive');
      expect(result.answers.mood.probabilities).toEqual({
        positive: 0.7,
        negative: 0.3,
      });
      expect(received?.questions['mood']).toEqual({
        type: 'choice',
        instructions: 'Classify mood',
        criteria: { positive: 'good', negative: 'bad' },
      });
      expect(received?.state).toBe('{"text":"hello"}');
    })
  );

  it.effect(
    'uses one-hot probabilities when absent, without inferring confidence',
    () =>
      Effect.gen(function* () {
        const modelLayer = JevDecisionModel.pipe(
          Layer.provide(
            Layer.succeed(
              DecisionClient,
              DecisionClient.of({
                request: () =>
                  Effect.succeed({
                    mood: {
                      type: 'choice',
                      choice: 'positive',
                      confidence: 0.2,
                    },
                  }),
              })
            )
          )
        );
        const definition = Decision.make({
          input: Schema.String,
          decisions: {
            mood: Decision.classify({
              instructions: 'Classify',
              criteria: { positive: 'good', negative: 'bad' },
            }),
          },
        });
        const result = yield* DecisionModel.decide(definition, {
          input: 'hi',
        }).pipe(Effect.provide(modelLayer));
        expect(result.answers.mood.probabilities).toEqual({
          positive: 1,
          negative: 0,
        });
        expect(result.answers.mood.confidence).toBe(0.2);
        expect(result.usage).toEqual({
          inputTokens: undefined,
          outputTokens: undefined,
        });
      })
  );

  it.effect(
    'preserves __proto__ classify keys through official decisions',
    () =>
      Effect.gen(function* () {
        let received: typeof DecisionRequest.Type | undefined;
        const modelLayer = JevDecisionModel.pipe(
          Layer.provide(
            Layer.succeed(
              DecisionClient,
              DecisionClient.of({
                request: (payload) => {
                  received = payload;

                  return Effect.succeed({
                    ['__proto__']: {
                      type: 'choice',
                      choice: 'positive',
                      probabilities: { positive: 1, negative: 0 },
                    },
                  });
                },
              })
            )
          )
        );
        const definition = Decision.make({
          input: Schema.String,
          decisions: {
            ['__proto__']: Decision.classify({
              instructions: 'Classify',
              criteria: { positive: 'good', negative: 'bad' },
            }),
          },
        });
        const result = yield* DecisionModel.decide(definition, {
          input: 'hi',
        }).pipe(Effect.provide(modelLayer));
        expect(Object.hasOwn(received!.questions, '__proto__')).toBe(true);
        expect(received?.questions['__proto__']).toEqual({
          type: 'choice',
          instructions: 'Classify',
          criteria: { positive: 'good', negative: 'bad' },
        });
        expect(result.answers['__proto__'].label).toBe('positive');
        expect(result.answers['__proto__'].probabilities).toEqual({
          positive: 1,
          negative: 0,
        });
      })
  );

  it.effect('rejects non-classify decisions with UnsupportedSchemaError', () =>
    Effect.gen(function* () {
      const modelLayer = JevDecisionModel.pipe(
        Layer.provide(
          Layer.succeed(
            DecisionClient,
            DecisionClient.of({ request: () => Effect.die('must not request') })
          )
        )
      );
      const definition = Decision.make({
        input: Schema.String,
        decisions: {
          score: Decision.probability({ instructions: 'Estimate' }),
        },
      });
      const error = yield* DecisionModel.decide(definition, {
        input: 'hi',
      }).pipe(Effect.provide(modelLayer), Effect.flip);
      expect(AiError.isAiError(error)).toBe(true);
      if (AiError.isAiError(error)) {
        expect(error.reason._tag).toBe('UnsupportedSchemaError');
        if (error.reason._tag === 'UnsupportedSchemaError')
          expect(error.reason.description).toContain(
            'Unsupported decision type: Probability'
          );
      }
    })
  );
});

it.effect('preserves partial distributions for official validation', () =>
  Effect.gen(function* () {
    const definition = Decision.make({
      input: Schema.String,
      decisions: {
        mood: Decision.classify({
          instructions: 'Classify',
          criteria: { positive: 'good', negative: 'bad' },
        }),
      },
    });
    const error = yield* DecisionModel.decide(definition, { input: 'hi' }).pipe(
      Effect.provide(
        JevDecisionModel.pipe(
          Layer.provide(
            Layer.succeed(
              DecisionClient,
              DecisionClient.of({
                request: () =>
                  Effect.succeed({
                    mood: {
                      type: 'choice',
                      choice: 'positive',
                      probabilities: { positive: 1 },
                    },
                  }),
              })
            )
          )
        )
      ),
      Effect.flip
    );
    expect(error.reason._tag).toBe('InvalidOutputError');
  })
);

it.effect('retains the original transport error cause', () =>
  Effect.gen(function* () {
    const cause = new DecisionError({
      message: 'failed',
      cause: new Error('network'),
    });
    const definition = Decision.make({
      input: Schema.String,
      decisions: {
        mood: Decision.classify({
          instructions: 'Classify',
          criteria: { positive: 'good', negative: 'bad' },
        }),
      },
    });
    const error = yield* DecisionModel.decide(definition, { input: 'hi' }).pipe(
      Effect.provide(
        JevDecisionModel.pipe(
          Layer.provide(
            Layer.succeed(
              DecisionClient,
              DecisionClient.of({
                request: () => Effect.fail(cause),
              })
            )
          )
        )
      ),
      Effect.flip
    );
    expect(error.reason._tag).toBe('UnknownError');
    if (error.reason._tag === 'UnknownError')
      expect(error.reason.cause).toBe(cause);
  })
);
