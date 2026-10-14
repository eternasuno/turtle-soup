import { expect, it } from '@effect/vitest';
import { Effect, Layer, Option, Redacted, Result } from 'effect';
import { vi } from 'vitest';
import {
  loadInitialSettings,
  loadSettings,
  normalizeSettings,
  resolveDecisionConfiguration,
  SettingsError,
  SettingsReadError,
  SettingsStorage,
  SettingsWriteError,
  saveSettings,
} from '../src/settings';

const storage = (read: SettingsStorage['Service']['read']) =>
  Layer.succeed(SettingsStorage, { read, write: () => Effect.void });
const emptySettings = { apiUrl: '', apiKey: '' };

it.effect('returns empty settings when storage has no value', () =>
  Effect.gen(function* () {
    expect(yield* loadSettings()).toEqual(emptySettings);
  }).pipe(Effect.provide(storage(Effect.succeed(Option.none()))))
);

for (const draft of [
  emptySettings,
  { apiUrl: ' unfinished URL ', apiKey: '' },
  { apiUrl: '', apiKey: ' draft key ' },
]) {
  it.effect(`preserves stored draft settings: ${JSON.stringify(draft)}`, () =>
    Effect.gen(function* () {
      expect(yield* loadSettings()).toEqual(draft);
      expect(yield* loadInitialSettings()).toEqual(draft);
    }).pipe(
      Effect.provide(
        storage(Effect.succeed(Option.some(JSON.stringify(draft))))
      )
    )
  );
}

for (const value of [
  'null',
  '{"apiUrl":1,"apiKey":"key"}',
  '{"apiUrl":"url"}',
  '[]',
]) {
  it.effect(`returns empty settings for invalid shape: ${value}`, () =>
    Effect.gen(function* () {
      expect(yield* loadSettings()).toEqual(emptySettings);
    }).pipe(Effect.provide(storage(Effect.succeed(Option.some(value)))))
  );
}

it.effect(
  'reports malformed JSON as a read failure and recovers on initialization',
  () =>
    Effect.gen(function* () {
      const error = yield* loadSettings().pipe(Effect.flip);
      expect(error).toBeInstanceOf(SettingsReadError);
      expect(error.message).toBe('无法读取设置。');
      expect(error.cause).toBeDefined();
      expect(yield* loadInitialSettings()).toEqual(emptySettings);
    }).pipe(Effect.provide(storage(Effect.succeed(Option.some('invalid')))))
);

it.effect(
  'preserves storage read failures and recovers on initialization',
  () => {
    const failure = new SettingsReadError({
      message: 'storage unavailable',
      cause: new Error('blocked'),
    });
    return Effect.gen(function* () {
      expect(yield* loadSettings().pipe(Effect.flip)).toBe(failure);
      expect(yield* loadInitialSettings()).toEqual(emptySettings);
    }).pipe(Effect.provide(storage(Effect.fail(failure))));
  }
);

it.effect(
  'normalizes valid request settings before encoding and writing them',
  () => {
    const write = vi.fn(() => Effect.void);
    return Effect.gen(function* () {
      const saved = yield* saveSettings({
        apiUrl: ' https://example.com/decision ',
        apiKey: ' test-key ',
      });
      expect(saved).toEqual({
        apiUrl: 'https://example.com/decision',
        apiKey: 'test-key',
      });
      expect(write).toHaveBeenCalledExactlyOnceWith(JSON.stringify(saved));
    }).pipe(
      Effect.provide(
        Layer.succeed(SettingsStorage, {
          read: Effect.succeed(Option.none()),
          write,
        })
      )
    );
  }
);

for (const settings of [
  emptySettings,
  { apiUrl: 'https://example.com/decision', apiKey: ' ' },
  { apiUrl: 'unfinished URL', apiKey: 'key' },
  { apiUrl: 'ftp://example.com/decision', apiKey: 'key' },
  { apiUrl: 'https://user@example.com/decision', apiKey: 'key' },
]) {
  it.effect(
    `rejects invalid settings without writing: ${JSON.stringify(settings)}`,
    () => {
      const write = vi.fn(() => Effect.void);
      return Effect.gen(function* () {
        expect(yield* saveSettings(settings).pipe(Effect.flip)).toBeInstanceOf(
          SettingsError
        );
        expect(write).not.toHaveBeenCalled();
      }).pipe(
        Effect.provide(
          Layer.succeed(SettingsStorage, {
            read: Effect.succeed(Option.none()),
            write,
          })
        )
      );
    }
  );
}

it.effect('preserves storage write failures', () => {
  const failure = new SettingsWriteError({
    message: 'storage unavailable',
    cause: new Error('blocked'),
  });
  return Effect.gen(function* () {
    expect(
      yield* saveSettings({
        apiUrl: 'https://example.com/decision',
        apiKey: 'test-key',
      }).pipe(Effect.flip)
    ).toBe(failure);
  }).pipe(
    Effect.provide(
      Layer.succeed(SettingsStorage, {
        read: Effect.succeed(Option.none()),
        write: () => Effect.fail(failure),
      })
    )
  );
});

it.effect('saves local settings without API credentials', () =>
  Effect.gen(function* () {
    const settings = { provider: 'local' as const, apiUrl: '', apiKey: '' };
    const write = vi.fn((_value: string) => Effect.void);
    const valid = yield* saveSettings(settings).pipe(
      Effect.provide(
        Layer.succeed(SettingsStorage, {
          read: Effect.succeed(Option.none()),
          write,
        })
      )
    );

    expect(valid).toEqual(settings);
    expect(JSON.parse(write.mock.calls[0]![0]!)).toEqual(settings);
  })
);

it.effect.each([
  { draft: emptySettings, valid: false },
  { draft: { apiUrl: 'ftp://example.com', apiKey: 'secret' }, valid: false },
  {
    draft: { apiUrl: 'https://example.com', apiKey: 'secret', apiModel: '' },
    valid: false,
  },
  { draft: { apiUrl: 'https://example.com', apiKey: 'secret' }, valid: true },
  { draft: { provider: 'local' as const, ...emptySettings }, valid: true },
])(
  'resolves loaded initial drafts for configuration readiness %#',
  ({ draft, valid }) =>
    Effect.gen(function* () {
      const loaded = yield* loadInitialSettings();
      expect(loaded).toEqual(draft);
      const result = yield* resolveDecisionConfiguration(loaded).pipe(
        Effect.result
      );
      expect(Result.isSuccess(result)).toBe(valid);
    }).pipe(
      Effect.provide(
        storage(Effect.succeed(Option.some(JSON.stringify(draft))))
      )
    )
);

it.effect('resolves defaults only for effective configurations', () =>
  Effect.gen(function* () {
    const api = yield* resolveDecisionConfiguration({
      apiUrl: ' https://example.com ',
      apiKey: ' secret ',
    });
    expect(api.provider).toBe('api');
    if (api.provider === 'api') {
      expect(api.url).toBe('https://example.com');
      expect(api.model).toBe('jev-latest');
      expect(Redacted.value(api.key)).toBe('secret');
      expect(String(api.key)).not.toContain('secret');
    }

    expect(
      yield* resolveDecisionConfiguration({
        provider: 'local',
        ...emptySettings,
      })
    ).toEqual({
      provider: 'local',
      modelId: 'onnx-community/laya-multilingual-ONNX',
      backend: 'wasm',
    });
  })
);

it.effect.each(['onnx-community/laya-multilingual-ONNX'])(
  'preserves %s and backend fields through save and load',
  (modelId) =>
    Effect.gen(function* () {
      const draft = {
        provider: 'api' as const,
        apiUrl: ' https://example.com ',
        apiKey: ' secret ',
        apiModel: ' custom-model ',
        modelId: ` ${modelId} `,
        backend: 'webgpu' as const,
      };
      let stored = '';
      const layer = Layer.succeed(SettingsStorage, {
        read: Effect.sync(() => Option.some(stored)),
        write: (value) =>
          Effect.sync(() => {
            stored = value;
          }),
      });
      const saved = yield* saveSettings(draft).pipe(Effect.provide(layer));
      expect(saved).toEqual({
        ...draft,
        apiUrl: 'https://example.com',
        apiKey: 'secret',
        apiModel: 'custom-model',
        modelId,
      });
      expect(yield* loadSettings().pipe(Effect.provide(layer))).toEqual(saved);
      expect(yield* normalizeSettings({ ...saved, provider: 'local' })).toEqual(
        {
          ...saved,
          provider: 'local',
        }
      );
      expect(
        yield* resolveDecisionConfiguration({ ...saved, provider: 'local' })
      ).toEqual({
        provider: 'local',
        modelId: saved.modelId,
        backend: 'webgpu',
      });
    })
);

it.effect.each([
  { apiUrl: 'https://example.com', apiKey: 'secret', apiModel: ' ' },
  { provider: 'local' as const, ...emptySettings, modelId: 'unknown' },
  { provider: 'local' as const, ...emptySettings, modelId: '' },
])('rejects invalid model configurations %#', (draft) =>
  Effect.gen(function* () {
    expect(
      yield* resolveDecisionConfiguration(draft).pipe(Effect.flip)
    ).toBeInstanceOf(SettingsError);
  })
);

it.effect.each(['Manav2op/verdict-small', 'onnx-community/d1-omni-600M-ONNX'])(
  'loads legacy %s drafts but rejects saving and running them',
  (modelId) =>
    Effect.gen(function* () {
      const draft = { provider: 'local' as const, ...emptySettings, modelId };
      let writes = 0;
      const layer = Layer.succeed(SettingsStorage, {
        read: Effect.succeed(Option.some(JSON.stringify(draft))),
        write: () =>
          Effect.sync(() => {
            writes++;
          }),
      });
      expect(yield* loadSettings().pipe(Effect.provide(layer))).toEqual(draft);
      expect(
        (yield* resolveDecisionConfiguration(draft).pipe(Effect.flip)).message
      ).toContain('不支持');
      expect(
        yield* saveSettings(draft).pipe(Effect.provide(layer), Effect.result)
      ).toMatchObject({ _tag: 'Failure' });
      expect(writes).toBe(0);
    })
);
