import { createServer } from 'node:http';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import { Config, Layer } from 'effect';
import { HttpRouter } from 'effect/unstable/http';
import { AppLive } from './app';
import { AuthLive } from './runtime/auth';
import { DatabaseLive } from './runtime/db';

const DEFAULT_PORT = 3001;

const server = NodeHttpServer.layerConfig(createServer, {
  port: Config.Port('API_PORT').pipe(Config.withDefault(DEFAULT_PORT)),
});

const main = AppLive.pipe(
  Layer.provide(AuthLive.pipe(Layer.provide(DatabaseLive))),
  HttpRouter.serve,
  Layer.provide(server),
  Layer.launch
);

NodeRuntime.runMain(main);
