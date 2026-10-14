import { expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { testConnection } from '../src/decision';
import { DECISION_ERROR_MESSAGE } from '../src/decision-error';
import { DecisionModelLive } from '../src/decision-provider';

it.effect.each(['ready', 'unavailable', 'invalid', undefined] as const)(
  'tests connection %s',
  (choice) =>
    Effect.gen(function* () {
      const operation = testConnection().pipe(
        Effect.provide(
          DecisionModelLive({
            apiUrl: 'https://decision.example/evaluate',
            apiKey: 'secret',
          }).pipe(
            Layer.provide(
              Layer.succeed(
                FetchHttpClient.Fetch,
                async () =>
                  new Response(
                    JSON.stringify({
                      model: 'jev-latest',
                      answers: {
                        connection: {
                          type: 'choice',
                          choice,
                          confidence: 1,
                          probabilities: {
                            ready: choice === 'ready' ? 1 : 0,
                            unavailable: choice === 'unavailable' ? 1 : 0,
                          },
                        },
                      },
                    })
                  )
              )
            )
          )
        )
      );
      if (choice === 'ready' || choice === 'unavailable') {
        yield* operation;
      } else {
        expect((yield* Effect.flip(operation)).message).toBe(
          DECISION_ERROR_MESSAGE
        );
      }
    })
);
