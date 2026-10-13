import {
  AutoConfig,
  AutoModel,
  AutoTokenizer,
  env,
} from '@huggingface/transformers';
import type { ChoiceAnswer, DecisionRequest } from '@turtle-soup/core/decision';
import { Schema } from 'effect';
import { runD1Inference } from './d1-encoding';

const MODEL = 'onnx-community/d1-omni-600M-ONNX';

const Progress = Schema.Struct({
  status: Schema.Literal('progress'),
  file: Schema.String,
  loaded: Schema.Number.check(
    Schema.isFinite(),
    Schema.isGreaterThanOrEqualTo(0)
  ),
  total: Schema.Number.check(
    Schema.isFinite(),
    Schema.isGreaterThanOrEqualTo(0)
  ),
});

function prepareConfig(
  config: Awaited<ReturnType<typeof AutoConfig.from_pretrained>>
) {
  const temperatures = Schema.decodeUnknownSync(
    Schema.optional(Schema.Record(Schema.String, Schema.Number))
  )(Reflect.get(config, 'temperatures'));
  Reflect.set(config, 'transformers.js_config', {
    ...config['transformers.js_config'],
    dtype: 'q8',
    use_external_data_format: { 'model_quantized.onnx': 1 },
  });

  return temperatures;
}

export async function loadD1(
  backend: 'wasm' | 'webgpu',
  cacheOnly: boolean,
  onProgress?: (progress: {
    file: string;
    loaded: number;
    total: number;
  }) => void
): Promise<{
  request(payload: DecisionRequest): Promise<Record<string, ChoiceAnswer>>;
  dispose(): Promise<void>;
}> {
  env.allowLocalModels = cacheOnly;
  const options = {
    local_files_only: cacheOnly,
    progress_callback: (event: unknown) => {
      if (Schema.is(Progress)(event)) onProgress?.(event);
    },
  };
  const config = await AutoConfig.from_pretrained(MODEL, options);
  const temperatures = prepareConfig(config);
  const model = await AutoModel.from_pretrained(MODEL, {
    ...options,
    config,
    dtype: 'q8',
    device: backend,
    session_options: { executionProviders: [backend] },
  });
  let tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
  try {
    tokenizer = await AutoTokenizer.from_pretrained(MODEL, options);
  } catch (error) {
    await model.dispose();
    throw error;
  }

  let queue: Promise<unknown> = Promise.resolve();
  let closing: Promise<void> | undefined;

  return {
    request(payload) {
      if (closing) return Promise.reject(new Error('D1 model is disposed.'));
      const result = queue.then(() =>
        runD1Inference(
          payload,
          { temperatures: temperatures ?? {} },
          tokenizer,
          model
        )
      );
      queue = result.catch(() => undefined);

      return result;
    },
    dispose() {
      closing ??= queue.then(async () => {
        await model.dispose();
      });

      return closing;
    },
  };
}
