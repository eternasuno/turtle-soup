import { AutoModel, env } from '@huggingface/transformers';

const modelId = 'onnx-community/laya-multilingual-ONNX';

let started = false;

self.addEventListener('message', async (event: MessageEvent<unknown>) => {
  if (started || (event.data !== 'wasm' && event.data !== 'webgpu')) return;

  started = true;
  const backend = event.data;
  try {
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    self.postMessage('开始 AutoModel.from_pretrained');
    const model = await AutoModel.from_pretrained(modelId, {
      dtype: 'fp16',
      device: backend,
      session_options: { executionProviders: [backend] },
      local_files_only: true,
    });
    self.postMessage('模型加载完成，未执行推理');
    await model.dispose();
    self.postMessage('模型释放完成');
  } catch (cause) {
    self.postMessage(
      `加载异常：${cause instanceof Error ? cause.message : String(cause)}`
    );
  }
});
