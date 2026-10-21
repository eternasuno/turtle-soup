import { Schema } from 'effect';
import { loadModel } from './model-loader';
import { WorkerCommand, WorkerResponse } from './worker-protocol';

type Operation = Exclude<WorkerCommand, { type: 'cancel' }>;

const scope = globalThis as unknown as {
  postMessage(value: WorkerResponse): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void
  ): void;
};

const queued = new Map<number, Operation>();

let running = false;

let model: Awaited<ReturnType<typeof loadModel>> | undefined;

function post(response: WorkerResponse) {
  scope.postMessage(Schema.decodeUnknownSync(WorkerResponse)(response));
}

async function execute(command: Operation) {
  try {
    if (command.type === 'init') {
      if (model) throw new Error('Laya worker is already initialized');

      model = await loadModel(command.backend, command.cacheOnly, (progress) =>
        post({ type: 'progress', id: command.id, progress })
      );
      post({ type: 'success', id: command.id, value: undefined });

      return;
    }

    if (!model) throw new Error('Laya worker is not initialized');

    const value = await model.request(command.payload);
    post({ type: 'success', id: command.id, value });
  } catch (cause) {
    post({
      type: 'error',
      id: command.id,
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

async function drain() {
  if (running) return;

  running = true;
  try {
    for (const [id, command] of queued) {
      queued.delete(id);
      await execute(command);
    }
  } finally {
    running = false;
  }
}

scope.addEventListener('message', (event) => {
  const command = Schema.decodeUnknownSync(WorkerCommand)(event.data);
  if (command.type === 'cancel') {
    queued.delete(command.id);

    return;
  }

  queued.set(command.id, command);
  void drain();
});
