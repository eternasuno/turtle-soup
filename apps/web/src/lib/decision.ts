import {
  type DecisionClient,
  DecisionClientLive,
  type DecisionError,
  type SettingsError,
} from '@turtle-soup/core/decision';
import type { DecisionSettings } from '@turtle-soup/core/types';
import { LocalDecisionClientLive } from '@turtle-soup/local-model';
import type { LayaProgress } from '@turtle-soup/local-model/laya';
import type { Layer } from 'effect';

export const configuredDecision = (
  settings: DecisionSettings,
  onProgress?: (progress: LayaProgress) => void
): Layer.Layer<DecisionClient, DecisionError | SettingsError> => {
  if (settings.provider !== 'local') return DecisionClientLive(settings);

  return LocalDecisionClientLive(settings.backend ?? 'wasm', onProgress);
};
