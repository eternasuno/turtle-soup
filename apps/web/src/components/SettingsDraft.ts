import { saveSettings } from '@turtle-soup/core/settings';
import type { DecisionSettings } from '@turtle-soup/core/types';
import { Effect } from 'effect';
import { SettingsStorageLive } from '../lib/storage';

export function readSettingsDraft(fields: {
  providerSelect: HTMLSelectElement | undefined;
  selectedBackend: 'wasm' | 'webgpu';
  apiUrl: HTMLInputElement | undefined;
  apiKey: HTMLInputElement | undefined;
  apiModel: HTMLInputElement | undefined;
  modelId: string;
}): DecisionSettings {
  return {
    provider: fields.providerSelect?.value === 'local' ? 'local' : 'api',
    backend: fields.selectedBackend,
    apiUrl: fields.apiUrl?.value.trim() ?? '',
    apiKey: fields.apiKey?.value.trim() ?? '',
    apiModel: fields.apiModel?.value.trim() ?? 'jev-latest',
    modelId: fields.modelId,
  };
}

export function saveSettingsDraft(
  settings: DecisionSettings,
  onError: (message: string) => void,
  onSaved: (settings: DecisionSettings) => void
) {
  Effect.runSync(
    saveSettings(settings).pipe(
      Effect.provide(SettingsStorageLive),
      Effect.match({
        onFailure: (cause) => onError(cause.message),
        onSuccess: onSaved,
      })
    )
  );
}
