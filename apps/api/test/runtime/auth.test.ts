import { expect, it } from '@effect/vitest';
import { ConfigProvider, Effect, Layer } from 'effect';
import { authOptions } from '../../src/runtime/auth';
import { DatabaseLive } from '../../src/runtime/db';

const TestConfigLive = ConfigProvider.layer(
  ConfigProvider.fromUnknown({
    SURREAL: {
      ENDPOINT: 'mem://',
      NAMESPACE: 'auth-test',
      DATABASE: 'configured',
    },
    BETTER_AUTH: {
      URL: 'http://localhost:5173',
      SECRET: 'api-test-secret-at-least-32-characters',
    },
  })
);

const DatabaseTestLive = DatabaseLive.pipe(Layer.provideMerge(TestConfigLive));

it.effect('builds project authentication options', () =>
  Effect.gen(function* () {
    const options = yield* authOptions;

    expect(options.appName).toBe('Solid Surreal API');
    expect(options.baseURL).toBe('http://localhost:5173/');
    expect(options.emailAndPassword).toEqual({
      enabled: true,
      autoSignIn: false,
    });
    expect(options.telemetry).toEqual({ enabled: false });
  }).pipe(Effect.provide(DatabaseTestLive))
);
