import { Context, Effect, Layer, Match, Schema } from 'effect';
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from 'effect/http';
import { type ChoiceAnswer, JevRequest, responseFor } from './jev-schema';
import { type JevSettings, RequestSettings } from './types';

export const JEV_ERROR_MESSAGE =
  'Jev 请求失败，请检查 API URL、API Key 或网络状态。';

export class JevError extends Schema.TaggedError<JevError>()('JevError', {
  message: Schema.String,
  cause: Schema.Unknown,
}) {}
export class SettingsError extends Schema.TaggedError<SettingsError>()(
  'SettingsError',
  {
    message: Schema.String,
  }
) {}

export const normalizeSettings = (
  settings: JevSettings
): Effect.Effect<RequestSettings, SettingsError> =>
  Schema.decodeUnknownEffect(RequestSettings)(settings).pipe(
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
  settings: JevSettings
): Effect.Effect<void, SettingsError> =>
  normalizeSettings(settings).pipe(Effect.asVoid);

export class JevClient extends Context.Service<
  JevClient,
  {
    request(
      payload: JevRequest
    ): Effect.Effect<Record<string, ChoiceAnswer>, JevError>;
  }
>()('@turtle-soup/core/JevClient') {}

export const JevClientLayer = (settings: JevSettings) =>
  Layer.effect(
    JevClient,
    Effect.gen(function* () {
      const valid = yield* normalizeSettings(settings);
      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.filterStatusOk,
        HttpClient.withScope
      );
      const request = Effect.fnUntraced(function* (payload: JevRequest) {
        return yield* Effect.gen(function* () {
          const request = yield* HttpClientRequest.post(valid.apiUrl).pipe(
            HttpClientRequest.bearerToken(valid.apiKey),
            HttpClientRequest.schemaBodyJson(JevRequest)(payload)
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
            (cause) => new JevError({ message: JEV_ERROR_MESSAGE, cause })
          )
        );
      });
      return JevClient.of({ request });
    })
  );

export const JevClientLive = (settings: JevSettings) =>
  JevClientLayer(settings).pipe(Layer.provide(FetchHttpClient.layer));
