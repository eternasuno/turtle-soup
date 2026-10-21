import type {
  ChoiceAnswer,
  DecisionRequest,
} from '@turtle-soup/core/decision-schema';
import type { LocalModelId } from '@turtle-soup/core/types';
import { Schema } from 'effect';
import type { LayaProgress } from './laya';
import {
  recordWorkerStage,
  registerWorker,
  releaseWorker,
} from './runtime-diagnostic';
import { WorkerCommand, WorkerResponse } from './worker-protocol';

type Pending = {
  command: Exclude<WorkerCommand, { type: 'cancel' }>;
  resolve(value: unknown): void;
  reject(error: Error): void;
  cleanup(): void;
  onProgress?: (progress: LayaProgress) => void;
};

function validateAnswers(
  payload: DecisionRequest,
  answers: Extract<WorkerResponse, { type: 'success' }>['value']
) {
  if (
    answers === undefined ||
    Object.keys(answers).length !== Object.keys(payload.questions).length ||
    Object.entries(payload.questions).some(
      ([id, question]) =>
        !Object.hasOwn(answers, id) ||
        !Object.hasOwn(question.criteria, answers[id]?.choice ?? '')
    )
  ) {
    throw new Error('Invalid Laya answers');
  }

  return answers;
}

export function createLayaWorker() {
  try {
    return new LayaWorker(
      new Worker(new URL('./laya.worker.ts', import.meta.url), {
        type: 'module',
      })
    );
  } catch (cause) {
    throw new Error('Unable to create Laya worker', { cause });
  }
}

class LayaWorker {
  private readonly pending = new Map<number, Pending>();
  private readonly diagnosticId = registerWorker();
  private nextId = 0;
  private closed = false;

  constructor(private readonly worker: Worker) {
    worker.addEventListener('message', this.message);
    worker.addEventListener('error', this.failed);
    worker.addEventListener('messageerror', this.failed);
  }

  private close(error: Error) {
    if (this.closed) return;

    this.closed = true;
    this.worker.removeEventListener('message', this.message);
    this.worker.removeEventListener('error', this.failed);
    this.worker.removeEventListener('messageerror', this.failed);
    this.worker.terminate();
    releaseWorker(this.diagnosticId);
    for (const entry of this.pending.values()) {
      entry.cleanup();
      entry.reject(error);
    }

    this.pending.clear();
  }

  private settle(id: number, error?: Error, value?: unknown) {
    const entry = this.pending.get(id);
    if (!entry) return;

    this.pending.delete(id);
    entry.cleanup();
    if (error) entry.reject(error);
    else entry.resolve(value);
  }

  private readonly message = (event: MessageEvent<unknown>) => {
    try {
      const response = Schema.decodeUnknownSync(WorkerResponse)(event.data);
      const entry = this.pending.get(response.id);
      if (!entry) return;

      if (response.type === 'stage') {
        recordWorkerStage(this.diagnosticId, response.stage);

        return;
      }

      if (response.type === 'progress') {
        if (entry.command.type === 'init')
          entry.onProgress?.(response.progress);

        return;
      }

      if (response.type === 'error') {
        recordWorkerStage(this.diagnosticId, `${entry.command.type}-failed`);
        this.settle(response.id, new Error(response.message));
        return;
      }

      if (entry.command.type === 'init' && response.value !== undefined) {
        throw new Error('Invalid Laya initialization result');
      }

      const value =
        entry.command.type === 'request'
          ? validateAnswers(entry.command.payload, response.value)
          : Schema.decodeUnknownSync(Schema.Void)(response.value);
      this.settle(response.id, undefined, value);
    } catch (cause) {
      this.close(new Error('Invalid Laya worker response', { cause }));
    }
  };

  private readonly failed = () => {
    this.close(new Error('Laya worker failed'));
  };

  private send(
    command: Pending['command'],
    signal: AbortSignal,
    onProgress?: Pending['onProgress']
  ) {
    return new Promise<unknown>((resolve, reject) => {
      if (this.closed || signal.aborted) {
        reject(
          this.closed
            ? new Error('Laya worker is disposed')
            : new DOMException('Aborted', 'AbortError')
        );
        return;
      }

      const abort = () => this.cancel(command);
      this.pending.set(command.id, {
        command,
        resolve,
        reject,
        cleanup: () => signal.removeEventListener('abort', abort),
        ...(onProgress ? { onProgress } : {}),
      });
      signal.addEventListener('abort', abort, { once: true });
      try {
        this.worker.postMessage(
          Schema.decodeUnknownSync(WorkerCommand)(command)
        );
      } catch (cause) {
        this.close(new Error('Unable to send Laya worker command', { cause }));
      }
    });
  }

  private cancel(command: Pending['command']) {
    const error = new DOMException('Aborted', 'AbortError');
    if (command.type === 'init') {
      this.close(error);
      return;
    }

    this.settle(command.id, error);
    try {
      this.worker.postMessage({ type: 'cancel', id: command.id });
    } catch (cause) {
      this.close(new Error('Unable to cancel Laya worker command', { cause }));
    }
  }

  async load(
    backend: 'wasm' | 'webgpu',
    signal: AbortSignal,
    onProgress?: Pending['onProgress'],
    cacheOnly = true,
    modelId: LocalModelId = 'onnx-community/laya-multilingual-ONNX'
  ): Promise<void> {
    recordWorkerStage(this.diagnosticId, 'load-requested', backend);
    await this.send(
      { type: 'init', id: ++this.nextId, backend, cacheOnly, modelId },
      signal,
      onProgress
    );
  }

  async request(
    payload: DecisionRequest,
    signal: AbortSignal
  ): Promise<Record<string, ChoiceAnswer>> {
    return (await this.send(
      { type: 'request', id: ++this.nextId, payload },
      signal
    )) as Record<string, ChoiceAnswer>;
  }

  dispose() {
    this.close(new Error('Laya worker is disposed'));
  }
}
