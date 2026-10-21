import { expect, it, vi } from 'vitest';
import { downloadProgressReporter } from '../../src/lib/download-progress';

it('throttles file updates but preserves file changes, completion and stages', () => {
  const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
  const update = vi.fn();
  let current = true;
  const report = downloadProgressReporter(() => current, update);
  try {
    report({ file: 'a', loaded: 1, total: 10 });
    report({ file: 'a', loaded: 2, total: 10 });
    report({ file: 'b', loaded: 0, total: 0 });
    report({ file: 'b', loaded: 10, total: 10 });
    report({ file: '', loaded: 0, total: 0, status: 'initializing' });
    current = false;
    report({ file: 'old', loaded: 1, total: 2 });
    expect(update.mock.calls.map(([event]) => event)).toEqual([
      { file: 'a', loaded: 1, total: 10 },
      { file: 'b', loaded: 0, total: 0 },
      { file: 'b', loaded: 10, total: 10 },
      { file: '', loaded: 0, total: 0, status: 'initializing' },
    ]);
  } finally {
    clock.mockRestore();
  }
});
