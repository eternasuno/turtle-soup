const key = 'turtle-soup:local-model-runtime';

let nextWorkerId = 0;

const activeWorkers = new Set<number>();

export function registerWorker(): number {
  const id = ++nextWorkerId;
  activeWorkers.add(id);
  recordWorkerStage(id, 'worker-created');

  return id;
}

export function releaseWorker(id: number): void {
  activeWorkers.delete(id);
  recordWorkerStage(id, 'worker-terminated');
}

export function recordWorkerStage(
  workerId: number,
  stage: string,
  backend?: 'wasm' | 'webgpu'
): void {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    const history = Array.isArray(stored) ? stored.slice(-39) : [];
    history.push({
      time: new Date().toISOString(),
      workerId,
      stage,
      activeWorkers: activeWorkers.size,
      ...(backend ? { backend } : {}),
    });
    localStorage.setItem(key, JSON.stringify(history));
  } catch {
    return;
  }
}
