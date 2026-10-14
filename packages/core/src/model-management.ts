import { Context, Effect, Schema } from 'effect';
import { resolveDecisionConfiguration } from './settings';
import {
  type DecisionConfiguration,
  type DecisionSettings,
  LocalModelId,
} from './types';

export const LocalModelDefinition = Schema.Struct({
  id: LocalModelId,
  name: Schema.String,
  precision: Schema.String,
  license: Schema.String,
});
export type LocalModelDefinition = typeof LocalModelDefinition.Type;

export const localModelDefinitions: readonly LocalModelDefinition[] = [
  {
    id: 'onnx-community/laya-multilingual-ONNX',
    name: 'Laya Multilingual',
    precision: 'fp16',
    license: 'apache-2.0',
  },
];

export const ModelAvailability = Schema.Union([
  Schema.Struct({ tag: Schema.Literal('complete') }),
  Schema.Struct({ tag: Schema.Literal('missing') }),
]);
export type ModelAvailability = typeof ModelAvailability.Type;

export class ModelResourceError extends Schema.TaggedError<ModelResourceError>()(
  'ModelResourceError',
  { message: Schema.String }
) {}

export class LocalModelResources extends Context.Service<
  LocalModelResources,
  {
    readonly inspect: (
      modelId: string
    ) => Effect.Effect<ModelAvailability, ModelResourceError>;
    readonly download: (
      modelId: string
    ) => Effect.Effect<void, ModelResourceError>;
    readonly remove: (
      modelId: string
    ) => Effect.Effect<void, ModelResourceError>;
  }
>()('@turtle-soup/core/LocalModelResources') {}

export class DecisionConfigurationTestError extends Schema.TaggedError<DecisionConfigurationTestError>()(
  'DecisionConfigurationTestError',
  { message: Schema.String }
) {}

export class DecisionConfigurationTester extends Context.Service<
  DecisionConfigurationTester,
  {
    readonly test: (
      configuration: DecisionConfiguration
    ) => Effect.Effect<void, DecisionConfigurationTestError>;
  }
>()('@turtle-soup/core/DecisionConfigurationTester') {}

export const prepareLocalModel = Effect.fnUntraced(function* (modelId: string) {
  const resources = yield* LocalModelResources;
  const availability = yield* resources.inspect(modelId);
  if (availability.tag === 'complete') return availability;

  yield* resources.download(modelId);
  const downloaded = yield* resources.inspect(modelId);
  if (downloaded.tag !== 'complete') {
    return yield* Effect.fail(
      new ModelResourceError({ message: '模型下载后缓存仍不完整，请重试。' })
    );
  }

  return downloaded;
});

export const testDecisionConfiguration = Effect.fnUntraced(function* (
  settings: DecisionSettings
) {
  const configuration = yield* resolveDecisionConfiguration(settings);
  const tester = yield* DecisionConfigurationTester;
  yield* tester.test(configuration);

  return configuration.provider === 'api'
    ? ({ provider: 'api', model: configuration.model } as const)
    : ({
        provider: 'local',
        model: configuration.modelId,
        backend: configuration.backend,
      } as const);
});
