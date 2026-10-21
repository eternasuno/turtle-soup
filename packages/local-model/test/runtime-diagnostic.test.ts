import { afterEach, expect, it, vi } from 'vitest';
import {
  recordWorkerStage,
  registerWorker,
  releaseWorker,
} from '../src/runtime-diagnostic';

const key = 'turtle-soup:local-model-runtime';

afterEach(() => vi.unstubAllGlobals());

it('persists bounded stage history and overlapping worker counts', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => values.set(name, value),
  });
  const first = registerWorker();
  const second = registerWorker();
  recordWorkerStage(second, 'load-requested', 'webgpu');
  expect(JSON.parse(values.get(key)!)).toContainEqual(
    expect.objectContaining({
      stage: 'load-requested',
      activeWorkers: 2,
      backend: 'webgpu',
    })
  );
  releaseWorker(first);
  releaseWorker(second);
  for (let index = 0; index < 50; index++) {
    recordWorkerStage(second, 'inference-completed');
  }

  const history = JSON.parse(values.get(key)!);
  expect(history).toHaveLength(40);
  expect(history.at(-1)).toMatchObject({ activeWorkers: 0 });
});

it('does not interrupt model work when persistence is unavailable', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('denied');
    },
  });
  expect(() => recordWorkerStage(1, 'load-started')).not.toThrow();
});
