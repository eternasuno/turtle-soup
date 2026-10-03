import { Context, Effect, Option, Schema } from 'effect';
import { normalizeSettings } from './jev-client';
import { JevSettings } from './types';

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

const emptySettings: JevSettings = { apiUrl: '', apiKey: '' };
const settingsJson = Schema.fromJsonString(JevSettings);

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
          Schema.decodeUnknownEffect(JevSettings)(parsed).pipe(
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
  settings: JevSettings
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
