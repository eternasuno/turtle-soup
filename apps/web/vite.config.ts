import solid from '@solidjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { PageFileSystemRouter } from 'filesystem-routing';
import { fileRoutes } from 'filesystem-routing/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const DEFAULT_PORT = 3000;
const ENV_DIR = '.';
const routeExtensions = ['js', 'jsx', 'ts', 'tsx'];

export default defineConfig(({ mode }) => {
  const { WEB_PORT } = loadEnv(mode, ENV_DIR, 'WEB_PORT');
  const port = Number(WEB_PORT) || DEFAULT_PORT;

  return {
    envDir: ENV_DIR,
    plugins: [
      solid({
        ssr: false,
        extensions: ['.jsx', '.tsx'],
      }),
      fileRoutes({
        routers: {
          client: new PageFileSystemRouter({
            dir: 'src/routes',
            extensions: routeExtensions,
          }),
        },
      }),
      tailwindcss(),
    ],
    server: {
      port,
      strictPort: true,
      proxy: {
        '/api': 'http://localhost:3001',
      },
    },
    preview: {
      port,
      strictPort: true,
      proxy: {
        '/api': 'http://localhost:3001',
      },
    },
    test: {
      environment: 'node',
    },
  };
});
