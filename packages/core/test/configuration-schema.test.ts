import { expect, it } from '@effect/vitest';
import { Effect, Layer, Redacted, Schema } from 'effect';
import { DecisionModel } from 'effect/ai';
import { FetchHttpClient } from 'effect/http';
import { askQuestion } from '../src/decision';
import {
  DecisionModelLayer,
  DecisionModelLive,
} from '../src/decision-provider';
import { normalizeSettings, validateSettings } from '../src/settings';
import { DecisionConfiguration, DecisionSettings } from '../src/types';

const puzzle = {
  id: 'soup',
  title: 'title',
  surface: 'surface',
  truth: 'truth',
  judgmentPoints: [{ id: 'fact-1', description: 'fact' }],
};
const settings = {
  apiUrl: ' https://decision.example/evaluate ',
  apiKey: ' secret ',
};
const transport = (fetch: typeof globalThis.fetch, config = settings) =>
  DecisionModelLive(config).pipe(
    Layer.provide(
      Layer.provide(
        FetchHttpClient.layer,
        Layer.succeed(FetchHttpClient.Fetch, fetch)
      )
    )
  );

it.effect.each([
  { apiUrl: ' ', apiKey: 'key' },
  { apiUrl: 'https://decision.example', apiKey: ' ' },
  { apiUrl: 'not a url', apiKey: 'key' },
  { apiUrl: 'ftp://decision.example', apiKey: 'key' },
  { apiUrl: 'https://user:password@jev.example', apiKey: 'key' },
  { apiUrl: 'https://user@jev.example', apiKey: 'key' },
  { apiUrl: 'https://:password@jev.example', apiKey: 'key' },
])('rejects invalid settings before transport %#', (invalid) =>
  Effect.gen(function* () {
    let calls = 0;
    const error = yield* askQuestion(puzzle, '问题').pipe(
      Effect.provide(
        transport(async () => {
          calls++;
          return new Response();
        }, invalid)
      ),
      Effect.flip
    );
    expect(error).toMatchObject({ _tag: 'SettingsError' });
    yield* Effect.flip(validateSettings(invalid));
    expect(calls).toBe(0);
  })
);

it.effect(
  'accepts blank stored drafts but normalizes valid HTTP(S) request settings',
  () =>
    Effect.gen(function* () {
      expect(
        yield* Schema.decodeUnknownEffect(DecisionSettings)({
          apiUrl: '',
          apiKey: '',
        })
      ).toEqual({ apiUrl: '', apiKey: '' });
      expect(yield* normalizeSettings(settings)).toEqual({
        apiUrl: settings.apiUrl.trim(),
        apiKey: 'secret',
      });
      yield* validateSettings({
        apiUrl: 'http://localhost:3000',
        apiKey: 'key',
      });
    })
);

it.effect('fails layer initialization before running its consumer', () =>
  Effect.gen(function* () {
    let consumed = false;
    const error = yield* Effect.sync(() => {
      consumed = true;
    }).pipe(
      Effect.provide(DecisionModelLive({ apiUrl: '', apiKey: '' })),
      Effect.flip
    );
    expect(error).toMatchObject({
      _tag: 'SettingsError',
      message: '请填写 API URL。',
    });
    expect(consumed).toBe(false);
  })
);

it.effect('captures normalized configuration once when the layer builds', () =>
  Effect.gen(function* () {
    const config = { ...settings };
    let calls = 0;
    const layer = transport(async (url, init) => {
      calls++;
      expect(String(url)).toBe(settings.apiUrl.trim());
      expect(new Headers(init?.headers).get('authorization')).toBe(
        'Bearer secret'
      );
      return new Response(
        JSON.stringify({
          model: 'jev-latest',
          answers: {
            answer: {
              type: 'choice',
              choice: 'yes',
              confidence: 0.9,
              probabilities: { yes: 1, no: 0, irrelevant: 0, unknown: 0 },
            },
          },
        })
      );
    }, config);
    yield* Effect.gen(function* () {
      yield* DecisionModel.DecisionModel;
      config.apiUrl = 'invalid';
      config.apiKey = '';
      yield* askQuestion(puzzle, 'first');
      yield* askQuestion(puzzle, 'second');
    }).pipe(Effect.provide(layer));
    expect(calls).toBe(2);
  })
);

it.effect.each([
  [{ apiUrl: '', apiKey: '' }, '请填写 API URL。'],
  [{ apiUrl: 'invalid', apiKey: '' }, '请填写 API Key。'],
  [{ apiUrl: 'invalid', apiKey: 'key' }, '请填写有效的 HTTP(S) API URL。'],
] as const)('preserves validation message priority %#', ([config, message]) =>
  Effect.gen(function* () {
    expect((yield* Effect.flip(normalizeSettings(config))).message).toBe(
      message
    );
  })
);

it.effect('validates effective configuration union boundaries', () =>
  Effect.gen(function* () {
    for (const modelId of ['onnx-community/laya-multilingual-ONNX']) {
      for (const backend of ['wasm', 'webgpu']) {
        expect(
          yield* Schema.decodeUnknownEffect(DecisionConfiguration)({
            provider: 'local',
            modelId,
            backend,
          })
        ).toEqual({ provider: 'local', modelId, backend });
      }
    }

    for (const invalid of [
      { provider: 'local', modelId: 'unknown', backend: 'wasm' },
      {
        provider: 'local',
        modelId: 'onnx-community/laya-multilingual-ONNX',
        backend: 'cpu',
      },
      {
        provider: 'api',
        url: 'https://user@example.com',
        model: 'custom',
        key: Redacted.make('secret'),
      },
      {
        provider: 'api',
        url: 'ftp://example.com',
        model: 'custom',
        key: Redacted.make('secret'),
      },
      {
        provider: 'api',
        url: 'https://example.com',
        model: ' ',
        key: Redacted.make('secret'),
      },
      {
        provider: 'api',
        url: 'https://example.com',
        model: 'custom',
        key: Redacted.make(' '),
      },
    ]) {
      yield* Schema.decodeUnknownEffect(DecisionConfiguration)(invalid).pipe(
        Effect.flip
      );
    }
  })
);

it.effect(
  'uses configured API model instead of the request payload model',
  () =>
    Effect.gen(function* () {
      yield* askQuestion(puzzle, 'choose');
    }).pipe(
      Effect.provide(
        DecisionModelLayer({ ...settings, apiModel: ' custom-model ' }).pipe(
          Layer.provide(
            Layer.provide(
              FetchHttpClient.layer,
              Layer.succeed(FetchHttpClient.Fetch, async (_url, init) => {
                expect(JSON.parse(String(init?.body)).model).toBe(
                  'custom-model'
                );
                return new Response(
                  JSON.stringify({
                    model: 'custom-model',
                    answers: {
                      answer: {
                        type: 'choice',
                        choice: 'yes',
                        probabilities: {
                          yes: 1,
                          no: 0,
                          irrelevant: 0,
                          unknown: 0,
                        },
                        confidence: 1,
                      },
                    },
                  })
                );
              })
            )
          )
        )
      )
    )
);
