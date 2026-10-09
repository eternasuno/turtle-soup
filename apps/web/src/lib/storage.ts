import {
  SettingsReadError,
  SettingsStorage,
  SettingsWriteError,
} from '@turtle-soup/core/settings';
import { Effect, Layer, Option } from 'effect';

const SETTINGS_KEY = 'turtle-soup-decision-settings';

export const SettingsStorageLive = Layer.succeed(SettingsStorage, {
  read: Effect.try({
    try: () =>
      Option.fromNullishOr(
        localStorage.getItem(SETTINGS_KEY) ??
          localStorage.getItem('turtle-soup-jev-settings')
      ),
    catch: (cause) =>
      new SettingsReadError({ message: '无法读取设置。', cause }),
  }),
  write: (value) =>
    Effect.try({
      try: () => localStorage.setItem(SETTINGS_KEY, value),
      catch: (cause) =>
        new SettingsWriteError({
          message: '无法保存设置，请允许当前浏览器使用本地存储。',
          cause,
        }),
    }),
});
