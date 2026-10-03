import { expect, it } from '@effect/vitest';
import { Effect, Layer, Option, Schema } from 'effect';
import { FetchHttpClient } from 'effect/http';
import {
  askQuestion,
  JevClient,
  JevClientLive,
  normalizeSettings,
  validateSettings,
} from '../src/jev';
import {
  Confidence,
  FactMatch,
  JevSettings,
  Message,
  Puzzle,
} from '../src/types';

const puzzle = {
  id: 'soup',
  title: 'title',
  surface: 'surface',
  truth: 'truth',
  keyFacts: ['fact'],
};
const settings = {
  apiUrl: ' https://jev.example/evaluate ',
  apiKey: ' secret ',
};
const transport = (fetch: typeof globalThis.fetch, config = settings) =>
  JevClientLive(config).pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch))
  );

it.effect.each([
  { apiUrl: ' ', apiKey: 'key' },
  { apiUrl: 'https://jev.example', apiKey: ' ' },
  { apiUrl: 'not a url', apiKey: 'key' },
  { apiUrl: 'ftp://jev.example', apiKey: 'key' },
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
        yield* Schema.decodeUnknownEffect(JevSettings)({
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

it.effect.each([NaN, Infinity, -Infinity, -0.1, 1.1, '0.5', null])(
  'rejects invalid confidence %s',
  (confidence) =>
    Effect.gen(function* () {
      yield* Effect.flip(Schema.decodeUnknownEffect(Confidence)(confidence));
    })
);
it.effect.each(['id', 'title', 'surface', 'truth'] as const)(
  'rejects blank puzzle %s',
  (field) =>
    Effect.gen(function* () {
      yield* Effect.flip(
        Schema.decodeUnknownEffect(Puzzle)({ ...puzzle, [field]: ' ' })
      );
    })
);
it.effect.each([[], [' ']])('rejects empty or blank keyFacts %#', (keyFacts) =>
  Effect.gen(function* () {
    yield* Effect.flip(
      Schema.decodeUnknownEffect(Puzzle)({ ...puzzle, keyFacts })
    );
  })
);

it.effect('fails layer initialization before running its consumer', () =>
  Effect.gen(function* () {
    let consumed = false;
    const error = yield* Effect.sync(() => {
      consumed = true;
    }).pipe(
      Effect.provide(JevClientLive({ apiUrl: '', apiKey: '' })),
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
          answers: { answer: { type: 'choice', choice: 'yes' } },
        })
      );
    }, config);
    yield* Effect.gen(function* () {
      yield* JevClient;
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

it.effect.each(['question', 'solve'] as const)(
  'requires user mode %s',
  (mode) =>
    Effect.gen(function* () {
      expect(
        yield* Schema.decodeUnknownEffect(Message)({
          role: 'user',
          mode,
          content: 'text',
        })
      ).toEqual({ role: 'user', mode, content: 'text' });
    })
);
it.effect(
  'supports host messages without mode and rejects users without mode',
  () =>
    Effect.gen(function* () {
      expect(
        yield* Schema.decodeUnknownEffect(Message)({
          role: 'host',
          content: 'text',
        })
      ).toEqual({ role: 'host', content: 'text' });
      yield* Effect.flip(
        Schema.decodeUnknownEffect(Message)({ role: 'user', content: 'text' })
      );
    })
);
it.effect('requires domain confidence as an Option', () =>
  Effect.gen(function* () {
    for (const confidence of [Option.none(), Option.some(0), Option.some(1)]) {
      expect(
        yield* Schema.decodeUnknownEffect(FactMatch)({
          fact: 'fact',
          matched: true,
          confidence,
        })
      ).toEqual({ fact: 'fact', matched: true, confidence });
    }
    for (const confidence of [undefined, 0.5, Option.some(1.1)]) {
      yield* Effect.flip(
        Schema.decodeUnknownEffect(FactMatch)({
          fact: 'fact',
          matched: true,
          confidence,
        })
      );
    }
  })
);
