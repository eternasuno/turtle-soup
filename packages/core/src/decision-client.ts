import { Context, Effect, Layer, Match, Schema } from 'effect';
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
import { DecisionSettings, RequestSettings } from './types';

export const DECISION_ERROR_MESSAGE =
  'Decision 请求失败，请检查 API URL、API Key 或网络状态。';

export class DecisionError extends Schema.TaggedError<DecisionError>()(
  'DecisionError',
  {
    message: Schema.String,
    cause: Schema.Unknown,
  }
) {}
export class SettingsError extends Schema.TaggedError<SettingsError>()(
  'SettingsError',
  {
    message: Schema.String,
  }
) {}

export const normalizeSettings = (
  settings: DecisionSettings
): Effect.Effect<DecisionSettings, SettingsError> =>
  (settings.provider === 'local'
    ? Schema.decodeUnknownEffect(DecisionSettings)(settings)
    : Schema.decodeUnknownEffect(RequestSettings)(settings).pipe(
        Effect.map((valid) =>
          settings.provider === 'api'
            ? { ...valid, provider: 'api' as const }
            : valid
        )
      )
  ).pipe(
    Effect.mapError(() => {
      const message = Match.value(settings).pipe(
        Match.when(
          ({ apiUrl }) => !apiUrl.trim(),
          () => '请填写 API URL。'
        ),
        Match.when(
          ({ apiKey }) => !apiKey.trim(),
          () => '请填写 API Key。'
        ),
        Match.orElse(() => '请填写有效的 HTTP(S) API URL。')
      );
      return new SettingsError({ message });
    })
  );

export const validateSettings = (
  settings: DecisionSettings
): Effect.Effect<void, SettingsError> =>
  normalizeSettings(settings).pipe(Effect.asVoid);

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
      const valid = yield* normalizeSettings(settings);
      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.filterStatusOk,
        HttpClient.withScope
      );
      const request = Effect.fnUntraced(function* (payload: DecisionRequest) {
        return yield* Effect.gen(function* () {
          const request = yield* HttpClientRequest.post(valid.apiUrl).pipe(
            HttpClientRequest.bearerToken(valid.apiKey),
            HttpClientRequest.schemaBodyJson(DecisionRequest)(payload)
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
