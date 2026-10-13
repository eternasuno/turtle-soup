import { JevDecisionModelLive } from '@turtle-soup/core/decision-provider';
import type { SettingsError } from '@turtle-soup/core/settings';
import { resolveDecisionConfiguration } from '@turtle-soup/core/settings';
import type { DecisionSettings } from '@turtle-soup/core/types';
import { LocalDecisionModelLayer } from '@turtle-soup/local-model';
import type { LayaProgress } from '@turtle-soup/local-model/laya';
import { Effect, Layer, Redacted } from 'effect';
import type { AiError, DecisionModel } from 'effect/ai';

export const configuredDecision = (
  settings: DecisionSettings,
  onProgress?: (progress: LayaProgress) => void
) =>
  Layer.unwrap(
    resolveDecisionConfiguration(settings).pipe(
      Effect.map(
        (
          configuration
        ): Layer.Layer<
          DecisionModel.DecisionModel,
          AiError.AiError | SettingsError
        > =>
          configuration.provider === 'local'
            ? LocalDecisionModelLayer(
                configuration.modelId,
                configuration.backend,
                onProgress
              )
            : JevDecisionModelLive({
                provider: 'api',
                apiUrl: configuration.url,
                apiKey: Redacted.value(configuration.key),
                apiModel: configuration.model,
              })
      )
    )
  );
