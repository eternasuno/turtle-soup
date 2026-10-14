import { testConnection } from '@turtle-soup/core/decision';
import {
  DecisionConfigurationTestError,
  DecisionConfigurationTester,
} from '@turtle-soup/core/model-management';
import { Effect, Layer, Redacted } from 'effect';
import { configuredDecision } from './decision';
import { localFailure } from './local-diagnostic';

export const DecisionConfigurationTesterLive = Layer.succeed(
  DecisionConfigurationTester,
  {
    test: (configuration) =>
      testConnection().pipe(
        Effect.provide(
          configuredDecision(
            configuration.provider === 'local'
              ? { ...configuration, apiUrl: '', apiKey: '' }
              : {
                  provider: 'api',
                  apiUrl: configuration.url,
                  apiKey: Redacted.value(configuration.key),
                  apiModel: configuration.model,
                }
          )
        ),
        Effect.scoped,
        Effect.mapError((cause) => {
          const message = '连接测试失败，请检查配置、网络或本地推理后端。';
          if (configuration.provider === 'api') {
            return new DecisionConfigurationTestError({ message });
          }

          const diagnostic = {
            modelId: configuration.modelId,
            backend: configuration.backend,
            ...localFailure(cause),
          };
          console.error(diagnostic);

          return new DecisionConfigurationTestError({
            message: `${message} ${JSON.stringify(diagnostic)}`,
          });
        })
      ),
  }
);
