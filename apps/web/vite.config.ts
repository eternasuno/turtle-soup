import { fileURLToPath } from 'node:url';
import solid from '@solidjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  plugins: [solid({ ssr: false }), tailwindcss()],
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  test: {
    environment: 'node',
    alias: {
      'solid-js': fileURLToPath(
        new URL('./node_modules/solid-js/dist/solid.js', import.meta.url)
      ),
    },
  },
});
