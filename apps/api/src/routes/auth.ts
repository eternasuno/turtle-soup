import { Effect } from 'effect';
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/unstable/http';
import { Auth, AuthUnavailable } from '../runtime/auth';

export const authRoutes = HttpRouter.add('*', '/api/auth/*', (request) =>
  Effect.gen(function* () {
    const auth = yield* Auth;
    const webRequest = yield* HttpServerRequest.toWeb(request);
    const response = yield* Effect.tryPromise({
      try: () => auth.handler(webRequest),
      catch: (cause) => new AuthUnavailable({ cause }),
    });

    return HttpServerResponse.fromWeb(response);
  }).pipe(
    Effect.tapError((error) =>
      Effect.logWarning('Authentication unavailable', error.cause)
    ),
    Effect.catchTag('AuthUnavailable', () =>
      HttpServerResponse.json(
        { error: 'Authentication unavailable' },
        { status: 500 }
      )
    )
  )
);
