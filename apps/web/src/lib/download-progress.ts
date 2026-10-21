import type { ModelDownloadProgress } from '@turtle-soup/core/model-management';

const progressInterval = 100;

export function downloadProgressReporter(
  isCurrent: () => boolean,
  update: (progress: ModelDownloadProgress) => void
) {
  let lastUpdate = 0;
  let lastFile = '';

  return (progress: ModelDownloadProgress) => {
    if (!isCurrent()) return;

    const now = performance.now();
    if (
      progress.file === lastFile &&
      !progress.status &&
      progress.loaded !== progress.total &&
      now - lastUpdate < progressInterval
    )
      return;

    lastUpdate = now;
    lastFile = progress.file;
    update(progress);
  };
}

export function matchesSavedModel(
  settings: import('@turtle-soup/core/types').DecisionSettings,
  modelId: string,
  backend: 'wasm' | 'webgpu'
) {
  return (
    settings.provider === 'local' &&
    backend === (settings.backend ?? 'wasm') &&
    modelId === (settings.modelId ?? 'onnx-community/laya-multilingual-ONNX')
  );
}
