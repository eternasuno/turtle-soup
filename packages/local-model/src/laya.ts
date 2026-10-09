import {
  AutoConfig,
  AutoModel,
  AutoTokenizer,
  env,
  ModelRegistry,
} from '@huggingface/transformers';
import {
  type ChoiceAnswer as ChoiceAnswerType,
  DecisionRequest,
  type DecisionRequest as DecisionRequestType,
} from '@turtle-soup/core/decision';
import { Schema } from 'effect';
import {
  type LayaConfig,
  type Model,
  runInference,
  type Tokenizer,
} from './laya-encoding';

export type LayaProgress = { file: string; loaded: number; total: number };

type LayaAssets = { config: LayaConfig; tokenizer: Tokenizer; model: Model };
type LayaClient = {
  request(
    payload: DecisionRequestType
  ): Promise<Record<string, ChoiceAnswerType>>;
  dispose(): Promise<void>;
};

const Limit = Schema.Number.pipe(
  Schema.check(Schema.isFinite(), Schema.isInt())
);
const Config = Schema.Struct({
  laya: Schema.Struct({
    head_max_len: Schema.optional(Limit),
    max_len: Schema.optional(Limit),
    split_words: Schema.optional(Schema.Boolean),
    temperature: Schema.optional(Schema.Array(Schema.Number)),
    temperature_by_options: Schema.optional(
      Schema.Record(Schema.String, Schema.Number)
    ),
  }),
});
const aborted = () => new DOMException('Aborted', 'AbortError');

class LayaModel {
  private queue = Promise.resolve();
  private disposed = false;
  private closing = false;
  private modelDisposed = false;
  private model: Model | undefined;
  private tokenizer: Tokenizer | undefined;

  constructor(
    private readonly config: LayaConfig,
    tokenizer: Tokenizer,
    model: Model
  ) {
    this.tokenizer = tokenizer;
    this.model = model;
  }

  request(
    payload: DecisionRequestType
  ): Promise<Record<string, ChoiceAnswerType>> {
    if (this.closing) throw new Error('Laya model is disposed.');
    const operation = this.queue.then(() => {
      if (this.disposed || !this.model || !this.tokenizer)
        throw new Error('Laya model is disposed.');
      return runInference(payload, this.config, this.tokenizer, this.model);
    });
    this.queue = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  }

  async dispose(): Promise<void> {
    this.closing = true;
    await this.queue;
    this.disposed = true;
    await this.disposeModel();
    this.model = undefined;
    this.tokenizer = undefined;
  }

  private async disposeModel(): Promise<void> {
    if (!this.model || this.modelDisposed) return;
    this.modelDisposed = true;
    await this.model.dispose?.();
  }
}

export async function deleteLayaCache(): Promise<void> {
  if (typeof caches === 'undefined') return;

  const cache = await caches.open(env.cacheKey);
  const keys = await cache.keys();
  const prefix = `${env.remoteHost}${env.remotePathTemplate
    .replace('{model}', 'onnx-community/laya-multilingual-ONNX')
    .replace('{revision}', 'main')}`;
  await Promise.all(
    keys
      .filter((key) => key.url.startsWith(prefix))
      .map((key) => cache.delete(key))
  );
  if ((await cache.keys()).some((key) => key.url.startsWith(prefix))) {
    throw new Error('模型缓存未完全删除，请重试。');
  }
}

export async function isLayaCached(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;

  const cache = await caches.open(env.cacheKey);
  const keys = await cache.keys();
  const prefix = `${env.remoteHost}${env.remotePathTemplate
    .replace('{model}', 'onnx-community/laya-multilingual-ONNX')
    .replace('{revision}', 'main')}`;
  const files = new Set(keys.map((key) => key.url));
  if (!files.has(`${prefix}config.json`)) return false;

  env.allowLocalModels = true;
  const config = await AutoConfig.from_pretrained(
    'onnx-community/laya-multilingual-ONNX',
    { local_files_only: true }
  );
  const modelFiles = await ModelRegistry.get_model_files(
    'onnx-community/laya-multilingual-ONNX',
    { config, dtype: 'fp16', device: 'wasm' }
  );

  return [...modelFiles, 'tokenizer.json', 'tokenizer_config.json'].every(
    (file) => files.has(`${prefix}${file}`)
  );
}

async function acquireAssets(
  device: 'wasm' | 'webgpu',
  localFilesOnly: boolean,
  onProgress?: (progress: LayaProgress) => void
): Promise<LayaAssets> {
  if (localFilesOnly && !(await isLayaCached())) {
    throw new Error('模型缓存不完整，请先下载模型。');
  }

  env.allowLocalModels = localFilesOnly;

  const progress_callback = (event: {
    status: string;
    file?: string;
    loaded?: number;
    total?: number;
  }) => {
    if (
      event.status !== 'progress' ||
      event.file === undefined ||
      event.loaded === undefined ||
      event.total === undefined
    )
      return;
    onProgress?.({
      file: event.file,
      loaded: event.loaded,
      total: event.total,
    });
  };
  const [rawConfig, tokenizer] = await Promise.all([
    AutoConfig.from_pretrained('onnx-community/laya-multilingual-ONNX', {
      progress_callback,
      local_files_only: localFilesOnly,
    }),
    AutoTokenizer.from_pretrained('onnx-community/laya-multilingual-ONNX', {
      progress_callback,
      local_files_only: localFilesOnly,
    }),
  ]);
  const { laya: config } = Schema.decodeUnknownSync(Config)(rawConfig);
  const model = await AutoModel.from_pretrained(
    'onnx-community/laya-multilingual-ONNX',
    {
      config: rawConfig,
      dtype: 'fp16',
      device,
      session_options: { executionProviders: [device] },
      progress_callback,
      local_files_only: localFilesOnly,
    }
  );
  return { config, tokenizer: tokenizer as Tokenizer, model: model as Model };
}

async function loadAssets(
  onProgress: ((progress: LayaProgress) => void) | undefined,
  signal: AbortSignal | undefined,
  device: 'wasm' | 'webgpu',
  localFilesOnly: boolean
): Promise<LayaAssets> {
  if (signal?.aborted) throw aborted();
  const assets = await acquireAssets(device, localFilesOnly, onProgress);
  if (signal?.aborted) {
    await assets.model.dispose?.();
    throw aborted();
  }
  return assets;
}

async function createClient(
  onProgress: ((progress: LayaProgress) => void) | undefined,
  signal: AbortSignal | undefined,
  device: 'wasm' | 'webgpu',
  localFilesOnly: boolean
): Promise<LayaClient> {
  const assets = await loadAssets(onProgress, signal, device, localFilesOnly);
  const owner = new LayaModel(assets.config, assets.tokenizer, assets.model);
  const onAbort = () => {
    void owner.dispose();
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) {
    signal.removeEventListener('abort', onAbort);
    await owner.dispose();
    throw aborted();
  }
  return {
    request: (payload) =>
      owner.request(Schema.decodeUnknownSync(DecisionRequest)(payload)),
    dispose: async () => {
      signal?.removeEventListener('abort', onAbort);
      await owner.dispose();
    },
  };
}

export function loadLaya(
  onProgress?: (progress: LayaProgress) => void,
  signal?: AbortSignal,
  device: 'wasm' | 'webgpu' = 'wasm',
  localFilesOnly = false
): Promise<LayaClient> {
  return createClient(onProgress, signal, device, localFilesOnly);
}
