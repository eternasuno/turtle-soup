import { Context, Effect, Layer, Redacted, Schema } from 'effect';
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from 'effect/http';
import {
  type ChoiceAnswer,
  DecisionRequest,
  responseFor,
} from './decision-schema';
import { resolveDecisionConfiguration, SettingsError } from './settings';
import type { DecisionSettings } from './types';

export { normalizeSettings, SettingsError, validateSettings } from './settings';

export const DECISION_ERROR_MESSAGE =
  'Decision 请求失败，请检查 API URL、API Key 或网络状态。';

export class DecisionError extends Schema.TaggedError<DecisionError>()(
  'DecisionError',
  {
    message: Schema.String,
    cause: Schema.Unknown,
  }
) {}

export class DecisionClient extends Context.Service<
  DecisionClient,
  {
    request(
      payload: DecisionRequest
    ): Effect.Effect<Record<string, ChoiceAnswer>, DecisionError>;
  }
>()('@turtle-soup/core/DecisionClient') {}

export const DecisionClientLayer = (settings: DecisionSettings) =>
  Layer.effect(
    DecisionClient,
    Effect.gen(function* () {
      const valid = yield* resolveDecisionConfiguration(settings);
      if (valid.provider !== 'api') {
        return yield* Effect.fail(
          new SettingsError({ message: 'API 客户端需要 API 配置。' })
        );
      }

      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.filterStatusOk,
        HttpClient.withScope
      );
      const request = Effect.fnUntraced(function* (payload: DecisionRequest) {
        return yield* Effect.gen(function* () {
          const request = yield* HttpClientRequest.post(valid.url).pipe(
            HttpClientRequest.bearerToken(Redacted.value(valid.key)),
            HttpClientRequest.schemaBodyJson(DecisionRequest)({
              ...payload,
              model: valid.model,
            })
          );
          const response = yield* client.execute(request);
          const decoded = yield* HttpClientResponse.schemaBodyJson(
            responseFor(payload.questions)
          )(response);
          return decoded.answers;
        }).pipe(
          Effect.scoped,
          Effect.provideService(FetchHttpClient.RequestInit, {
            credentials: 'omit',
            redirect: 'error',
          }),
          Effect.timeout(30_000),
          Effect.mapError(
            (cause) =>
              new DecisionError({ message: DECISION_ERROR_MESSAGE, cause })
          )
        );
      });
      return DecisionClient.of({ request });
    })
  );

export const DecisionClientLive = (settings: DecisionSettings) =>
  DecisionClientLayer(settings).pipe(Layer.provide(FetchHttpClient.layer));
