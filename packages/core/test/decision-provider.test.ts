import { it } from '@effect/vitest';
import { Effect, Layer, Schema } from 'effect';
import { AiError, Decision, DecisionModel } from 'effect/ai';
import { FetchHttpClient } from 'effect/http';
import { describe, expect } from 'vitest';
import { askQuestion } from '../src/decision';
import { DecisionModelLayer } from '../src/decision-provider';

const settings = {
  apiUrl: 'https://decision.example/v1/evaluate?tenant=alpha',
  apiModel: 'custom-model',
  apiKey: 'secret',
};

const modelLayer = (fetch: typeof globalThis.fetch, configured = settings) =>
  DecisionModelLayer(configured).pipe(
    Layer.provide(
      Layer.provide(
        FetchHttpClient.layer,
        Layer.succeed(FetchHttpClient.Fetch, fetch)
      )
    )
  );

const classify = () =>
  Decision.make({
    input: Schema.Struct({ text: Schema.String }),
    decisions: {
      mood: Decision.classify({
        instructions: 'Classify mood',
        criteria: { positive: 'good', negative: 'bad' },
      }),
    },
  });

const choiceResponse = (overrides: Record<string, unknown> = {}) => ({
  model: 'custom-model',
  answers: {
    mood: {
      type: 'choice',
      choice: 'positive',
      probabilities: { positive: 0.67, negative: 0.33 },
      confidence: 0.8,
      ...overrides,
    },
  },
  usage: { input_tokens: 12, output_tokens: 5 },
});

describe('DecisionModel', () => {
  it.effect('uses the TypeSafe request and response contract', () =>
    Effect.gen(function* () {
      let requestUrl: string | undefined;
      let requestHeaders: Headers | undefined;
      let received: Record<string, unknown> | undefined;
      const layer = modelLayer(async (input, init) => {
        requestUrl = String(input);
        requestHeaders = new Headers(init?.headers);
        received = JSON.parse(String(init?.body));
        return new Response(JSON.stringify(choiceResponse()));
      });
      const result = yield* DecisionModel.decide(classify(), {
        input: { text: 'hello' },
      }).pipe(Effect.provide(layer), Effect.withSpan('browser-api-request'));

      expect(requestHeaders?.has('b3')).toBe(false);
      expect(requestHeaders?.has('traceparent')).toBe(false);
      expect(requestUrl).toBe(settings.apiUrl);
      expect(requestHeaders?.get('authorization')).toBe('Bearer secret');
      expect(received).toEqual({
        model: 'custom-model',
        state: { text: 'hello' },
        questions: {
          mood: {
            type: 'choice',
            instructions: 'Classify mood',
            criteria: { positive: 'good', negative: 'bad' },
          },
        },
      });
      expect(result.answers.mood.label).toBe('positive');
      expect(result.answers.mood.confidence).toBe(0.8);
      expect(result.answers.mood.probabilities).toEqual({
        positive: 0.67,
        negative: 0.33,
      });
      expect(result.usage.inputTokens).toBe(12);
      expect(result.usage.outputTokens).toBe(5);
    })
  );

  it.effect('accepts rounded probabilities within official precision', () =>
    Effect.gen(function* () {
      const layer = modelLayer(
        async () =>
          new Response(
            JSON.stringify({
              ...choiceResponse(),
              answers: {
                mood: {
                  ...choiceResponse().answers.mood,
                  probabilities: { positive: 0.68, negative: 0.32 },
                },
              },
            })
          )
      );
      const result = yield* DecisionModel.decide(classify(), {
        input: { text: 'hello' },
      }).pipe(Effect.provide(layer));

      expect(result.answers.mood.probabilities).toEqual({
        positive: 0.68,
        negative: 0.32,
      });
    })
  );

  it.effect('preserves __proto__ decision identifiers', () =>
    Effect.gen(function* () {
      let received: Record<string, unknown> | undefined;
      const layer = modelLayer(async (_input, init) => {
        received = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            model: 'custom-model',
            answers: {
              ['__proto__']: {
                type: 'choice',
                choice: 'positive',
                probabilities: { positive: 1, negative: 0 },
                confidence: 1,
              },
            },
          })
        );
      });
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
      }).pipe(Effect.provide(layer));

      expect(
        Object.hasOwn((received?.['questions'] ?? {}) as object, '__proto__')
      ).toBe(true);
      expect(result.answers['__proto__'].label).toBe('positive');
    })
  );
});

it.effect('rejects missing required fields and malformed answer data', () =>
  Effect.gen(function* () {
    const invalidResponses = [
      { ...choiceResponse(), answers: {} },
      {
        ...choiceResponse(),
        answers: {
          mood: {
            ...choiceResponse().answers.mood,
            choice: 'unknown',
          },
        },
      },
      {
        ...choiceResponse(),
        answers: {
          mood: {
            ...choiceResponse().answers.mood,
            probabilities: { positive: 1 },
          },
        },
      },
    ];

    for (const response of invalidResponses) {
      const error = yield* DecisionModel.decide(classify(), {
        input: { text: 'hello' },
      }).pipe(
        Effect.provide(
          modelLayer(async () => new Response(JSON.stringify(response)))
        ),
        Effect.flip
      );
      expect(AiError.isAiError(error)).toBe(true);
      if (AiError.isAiError(error))
        expect(['UnknownError', 'InvalidOutputError']).toContain(
          error.reason._tag
        );
    }
  })
);

it.effect('retains the original transport error cause', () =>
  Effect.gen(function* () {
    const cause = new Error('network');
    const error = yield* DecisionModel.decide(classify(), {
      input: { text: 'hello' },
    }).pipe(
      Effect.provide(
        modelLayer(async () => {
          throw cause;
        })
      ),
      Effect.flip
    );

    expect(AiError.isAiError(error)).toBe(true);
    if (AiError.isAiError(error)) {
      expect(error.reason._tag).toBe('NetworkError');
      expect(String(error.reason)).toContain('NetworkError');
    }
  })
);

it.effect('does not expose credentials or transport details to players', () =>
  Effect.gen(function* () {
    const error = yield* askQuestion(
      {
        id: 'soup',
        title: 'title',
        surface: 'surface',
        truth: 'truth',
        judgmentPoints: [{ id: 'fact', description: 'fact' }],
      },
      'question'
    ).pipe(
      Effect.provide(
        DecisionModelLayer(settings).pipe(
          Layer.provide(
            Layer.provide(
              FetchHttpClient.layer,
              Layer.succeed(
                FetchHttpClient.Fetch,
                async () => new Response('not json', { status: 401 })
              )
            )
          )
        )
      ),
      Effect.flip
    );
    expect(error.message).not.toContain('secret');
    expect(error.message).not.toContain('decision.example');
  })
);
