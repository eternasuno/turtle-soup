import { Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/unstable/http';
import { authRoutes } from './routes/auth';
import { Auth } from './runtime/auth';

export const AppLive = Layer.unwrap(
  Effect.gen(function* () {
    const auth = yield* Auth;

    return authRoutes.pipe(
      HttpRouter.provideRequest(Layer.succeed(Auth, auth))
    );
  })
);
