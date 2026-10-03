import { expect, it } from '@effect/vitest';
import {
  SettingsReadError,
  SettingsStorage,
  SettingsWriteError,
} from '@turtle-soup/core/settings';
import { Effect, Option } from 'effect';
import { afterEach, vi } from 'vitest';
import { SettingsStorageLive } from '../../src/lib/storage';

const key = 'turtle-soup-jev-settings';
afterEach(() => vi.unstubAllGlobals());

for (const value of [null, '', 'stored value']) {
  it.effect(`reads localStorage as an Option: ${JSON.stringify(value)}`, () =>
    Effect.gen(function* () {
      const getItem = vi.fn(() => value);
      vi.stubGlobal('localStorage', { getItem });
      const storage = yield* SettingsStorage;
      expect(yield* storage.read).toEqual(
        value === null ? Option.none() : Option.some(value)
      );
      expect(getItem).toHaveBeenCalledExactlyOnceWith(key);
    }).pipe(Effect.provide(SettingsStorageLive))
  );
}

it.effect('writes the supplied string to the settings localStorage key', () =>
  Effect.gen(function* () {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    const storage = yield* SettingsStorage;
    expect(yield* storage.write('stored value')).toBeUndefined();
    expect(setItem).toHaveBeenCalledExactlyOnceWith(key, 'stored value');
  }).pipe(Effect.provide(SettingsStorageLive))
);

for (const operation of ['read', 'write'] as const) {
  it.effect(`surfaces blocked storage ${operation} as a tagged failure`, () =>
    Effect.gen(function* () {
      const cause = new Error('blocked');
      vi.stubGlobal('localStorage', {
        getItem: () => {
          throw cause;
        },
        setItem: () => {
          throw cause;
        },
      });
      const storage = yield* SettingsStorage;
      const error = yield* operation === 'read'
        ? storage.read.pipe(Effect.flip)
        : storage.write('stored value').pipe(Effect.flip);
      expect(error).toBeInstanceOf(
        operation === 'read' ? SettingsReadError : SettingsWriteError
      );
      expect(error.cause).toBe(cause);
      expect(error.message).toBe(
        operation === 'read'
          ? '无法读取设置。'
          : '无法保存设置，请允许当前浏览器使用本地存储。'
      );
    }).pipe(Effect.provide(SettingsStorageLive))
  );
}
