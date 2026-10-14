import { Context, Effect, Option, Redacted, Schema } from 'effect';
import { DecisionConfiguration, DecisionSettings } from './types';

export class SettingsError extends Schema.TaggedError<SettingsError>()(
  'SettingsError',
  { message: Schema.String }
) {}

function settingsValidationMessage(settings: DecisionSettings): string {
  if (settings.provider === 'local') {
    return settings.modelId !== undefined &&
      settings.modelId.trim() !== 'onnx-community/laya-multilingual-ONNX'
      ? `不支持的本地模型：${settings.modelId}。仅支持 Laya，请重新选择并保存。`
      : '请填写有效的本地模型配置。';
  }

  if (!settings.apiUrl.trim()) {
    return '请填写 API URL。';
  }

  if (!settings.apiKey.trim()) {
    return '请填写 API Key。';
  }

  if (settings.apiModel !== undefined && !settings.apiModel.trim()) {
    return '请填写 API Model。';
  }

  return '请填写有效的 HTTP(S) API URL。';
}

export const resolveDecisionConfiguration = (
  settings: DecisionSettings
): Effect.Effect<DecisionConfiguration, SettingsError> =>
  Schema.decodeUnknownEffect(DecisionSettings)(settings).pipe(
    Effect.flatMap((draft) =>
      Schema.decodeUnknownEffect(DecisionConfiguration)(
        draft.provider === 'local'
          ? {
              provider: 'local',
              modelId:
                draft.modelId?.trim() ??
                'onnx-community/laya-multilingual-ONNX',
              backend: draft.backend ?? 'wasm',
            }
          : {
              provider: 'api',
              url: draft.apiUrl,
              model: draft.apiModel ?? 'jev-latest',
              key: Redacted.make(draft.apiKey.trim()),
            }
      )
    ),
    Effect.mapError(
      () =>
        new SettingsError({
          message: settingsValidationMessage(settings),
        })
    )
  );

export const normalizeSettings = (settings: DecisionSettings) =>
  resolveDecisionConfiguration(settings).pipe(
    Effect.map(
      (configuration): DecisionSettings => ({
        ...settings,
        ...(configuration.provider === 'api'
          ? {
              apiUrl: configuration.url,
              apiKey: Redacted.value(configuration.key),
            }
          : {}),
        ...(settings.apiModel === undefined
          ? {}
          : { apiModel: settings.apiModel.trim() }),
        ...(settings.modelId === undefined
          ? {}
          : { modelId: settings.modelId.trim() }),
      })
    )
  );

export const validateSettings = (settings: DecisionSettings) =>
  normalizeSettings(settings).pipe(Effect.asVoid);

export class SettingsReadError extends Schema.TaggedError<SettingsReadError>()(
  'SettingsReadError',
  { message: Schema.String, cause: Schema.Unknown }
) {}

export class SettingsWriteError extends Schema.TaggedError<SettingsWriteError>()(
  'SettingsWriteError',
  { message: Schema.String, cause: Schema.Unknown }
) {}

export class SettingsStorage extends Context.Service<
  SettingsStorage,
  {
    readonly read: Effect.Effect<Option.Option<string>, SettingsReadError>;
    readonly write: (value: string) => Effect.Effect<void, SettingsWriteError>;
  }
>()('@turtle-soup/core/SettingsStorage') {}

const emptySettings: DecisionSettings = { apiUrl: '', apiKey: '' };
const settingsJson = Schema.fromJsonString(DecisionSettings);

export const loadSettings = Effect.fnUntraced(function* () {
  const value = yield* (yield* SettingsStorage).read;
  return yield* Option.match(value, {
    onNone: () => Effect.succeed(emptySettings),
    onSome: (value) =>
      Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(
        value
      ).pipe(
        Effect.mapError(
          (cause) => new SettingsReadError({ message: '无法读取设置。', cause })
        ),
        Effect.flatMap((parsed) =>
          Schema.decodeUnknownEffect(DecisionSettings)(parsed).pipe(
            Effect.catch(() => Effect.succeed(emptySettings))
          )
        )
      ),
  });
});

export const loadInitialSettings = () =>
  loadSettings().pipe(
    Effect.catchTag('SettingsReadError', () => Effect.succeed(emptySettings))
  );

export const saveSettings = Effect.fnUntraced(function* (
  settings: DecisionSettings
) {
  const valid = yield* normalizeSettings(settings);
  const value = yield* Schema.encodeEffect(settingsJson)(valid).pipe(
    Effect.mapError(
      (cause) => new SettingsWriteError({ message: '无法保存设置。', cause })
    )
  );
  yield* (yield* SettingsStorage).write(value);
  return valid;
});
