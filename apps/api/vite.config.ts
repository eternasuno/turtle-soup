import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    ssr: 'src/server.ts',
    target: 'node22',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
