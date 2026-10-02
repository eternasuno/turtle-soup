import { expect, it } from '@effect/vitest';
import { ConfigProvider, Effect, Layer } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/unstable/http';
import {
  CurrentUser,
  currentUserMiddleware,
} from '../../src/middleware/session';
import { AuthLive } from '../../src/runtime/auth';
import { DatabaseLive } from '../../src/runtime/db';

const baseUrl = 'http://localhost:5173';

const TestConfigLive = ConfigProvider.layer(
  ConfigProvider.fromUnknown({
    SURREAL: {
      ENDPOINT: 'mem://',
      NAMESPACE: 'session-test',
      DATABASE: 'configured',
    },
    BETTER_AUTH: {
      URL: baseUrl,
      SECRET: 'api-test-secret-at-least-32-characters',
    },
  })
);

const AuthTestLive = AuthLive.pipe(
  Layer.provide(DatabaseLive),
  Layer.provide(TestConfigLive)
);

const ProtectedRouteLive = HttpRouter.add(
  'GET',
  '/protected',
  Effect.flatMap(CurrentUser, (user) => HttpServerResponse.json(user))
).pipe(Layer.provide(currentUserMiddleware.layer), Layer.provide(AuthTestLive));

it.effect('rejects requests without a session', () =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(ProtectedRouteLive, { disableLogger: true })
    ),
    ({ handler }) =>
      Effect.gen(function* () {
        const request = new Request(`${baseUrl}/protected`);
        const response = yield* Effect.tryPromise(() => handler(request));
        const body = yield* Effect.tryPromise(() => response.json());

        expect(response.status).toBe(401);
        expect(body).toEqual({ error: 'Unauthorized' });
      }),
    ({ dispose }) => Effect.promise(dispose)
  )
);
