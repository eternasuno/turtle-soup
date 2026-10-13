import { expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { DECISION_ERROR_MESSAGE, testConnection } from '../src/decision';
import { JevDecisionModelLive } from '../src/decision-provider';

it.effect.each(['ready', 'unavailable', 'invalid', undefined] as const)(
  'tests connection %s',
  (choice) =>
    Effect.gen(function* () {
      const operation = testConnection().pipe(
        Effect.provide(
          JevDecisionModelLive({
            apiUrl: 'https://decision.example/evaluate',
            apiKey: 'secret',
          }).pipe(
            Layer.provide(
              Layer.succeed(
                FetchHttpClient.Fetch,
                async () =>
                  new Response(
                    JSON.stringify({
                      answers: { connection: { type: 'choice', choice } },
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
