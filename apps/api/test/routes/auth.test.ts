import { expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/unstable/http';
import { authRoutes } from '../../src/routes/auth';
import { Auth } from '../../src/runtime/auth';

const baseUrl = 'http://localhost:5173';

const SuccessAuthLive = Layer.mock(Auth, {
  handler: async (request: Request) =>
    new Response(JSON.stringify({ method: request.method, url: request.url }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    }),
} as unknown as Auth['Service']);

const SuccessRoutesLive = authRoutes.pipe(
  HttpRouter.provideRequest(SuccessAuthLive)
);

it.effect('forwards and converts the authentication response', () =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(SuccessRoutesLive, { disableLogger: true })
    ),
    ({ handler }) =>
      Effect.gen(function* () {
        const request = new Request(`${baseUrl}/api/auth/session`);
        const response = yield* Effect.tryPromise(() => handler(request));
        const body = yield* Effect.tryPromise(() => response.json());

        expect(response.status).toBe(201);
        expect(body).toEqual({
          method: 'GET',
          url: `${baseUrl}/api/auth/session`,
        });
      }),
    ({ dispose }) => Effect.promise(dispose)
  )
);

const FailingAuthLive = Layer.mock(Auth, {
  handler: async () => {
    throw new Error('auth unavailable');
  },
} as unknown as Auth['Service']);

const FailingRoutesLive = authRoutes.pipe(
  HttpRouter.provideRequest(FailingAuthLive)
);

it.effect('converts authentication failures to a server error', () =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(FailingRoutesLive, { disableLogger: true })
    ),
    ({ handler }) =>
      Effect.gen(function* () {
        const request = new Request(`${baseUrl}/api/auth/session`);
        const response = yield* Effect.tryPromise(() => handler(request));
        const body = yield* Effect.tryPromise(() => response.json());

        expect(response.status).toBe(500);
        expect(body).toEqual({ error: 'Authentication unavailable' });
      }),
    ({ dispose }) => Effect.promise(dispose)
  )
);
