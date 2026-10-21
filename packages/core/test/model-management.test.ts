import { expect, it } from '@effect/vitest';
import { Effect, Layer, Schema } from 'effect';
import {
  DecisionConfigurationTestError,
  DecisionConfigurationTester,
  LocalModelDefinition,
  LocalModelResources,
  localModelDefinitions,
  ModelResourceError,
  prepareLocalModel,
  testDecisionConfiguration,
} from '../src/model-management';

const modelId = 'onnx-community/laya-multilingual-ONNX';

const fakeLayer = (
  events: string[],
  states: ('complete' | 'missing' | 'failed')[]
) =>
  Layer.succeed(LocalModelResources, {
    inspect: (id) =>
      Effect.suspend(() => {
        events.push(`inspect:${id}`);
        const tag = states.shift()!;

        return tag === 'failed'
          ? Effect.fail(
              new ModelResourceError({ message: 'inspection failed' })
            )
          : Effect.succeed({ tag });
      }),
    download: (id) =>
      Effect.sync(() => {
        events.push(`download:${id}`);
      }),
    remove: (id) =>
      Effect.sync(() => {
        events.push(`remove:${id}`);
      }),
  });

for (const states of [
  ['complete'],
  ['missing', 'complete'],
  ['missing', 'missing'],
  ['failed'],
] as const) {
  it.effect(`prepares resources in order: ${states.join(',')}`, () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const result = yield* prepareLocalModel(modelId).pipe(
        Effect.provide(fakeLayer(events, [...states])),
        Effect.result
      );
      expect(events).toEqual(
        states[0] === 'missing'
          ? [`inspect:${modelId}`, `download:${modelId}`, `inspect:${modelId}`]
          : [`inspect:${modelId}`]
      );
      expect(result._tag).toBe(
        states.at(-1) === 'complete' ? 'Success' : 'Failure'
      );
    })
  );
}

it.effect(
  'resolves configuration before testing and returns no credentials',
  () =>
    Effect.gen(function* () {
      const result = yield* testDecisionConfiguration({
        apiUrl: ' https://example.test/decision ',
        apiKey: 'secret',
        apiModel: ' model ',
      }).pipe(
        Effect.provide(
          Layer.succeed(DecisionConfigurationTester, {
            test: (configuration) =>
              Effect.sync(() => {
                expect(configuration.provider).toBe('api');
                if (configuration.provider === 'api')
                  expect(configuration.url).toBe(
                    'https://example.test/decision'
                  );
              }),
          })
        )
      );
      expect(result).toEqual({ provider: 'api', model: 'model' });
    })
);

it.effect('rejects incompatible configuration without testing', () =>
  Effect.gen(function* () {
    let tested = false;
    const result = yield* testDecisionConfiguration({
      provider: 'local',
      modelId: 'unsupported',
      apiUrl: '',
      apiKey: '',
    }).pipe(
      Effect.provide(
        Layer.succeed(DecisionConfigurationTester, {
          test: () =>
            Effect.sync(() => {
              tested = true;
            }),
        })
      ),
      Effect.result
    );
    expect(result._tag).toBe('Failure');
    expect(tested).toBe(false);
  })
);

it.effect.each(['onnx-community/laya-multilingual-ONNX'])(
  'returns local backend only after a successful test for %s',
  (modelId) =>
    Effect.gen(function* () {
      const settings = {
        provider: 'local',
        modelId,
        backend: 'webgpu',
        apiUrl: '',
        apiKey: '',
      } as const;
      const success = yield* testDecisionConfiguration(settings).pipe(
        Effect.provide(
          Layer.succeed(DecisionConfigurationTester, {
            test: () => Effect.void,
          })
        )
      );
      expect(success).toEqual({
        provider: 'local',
        model: modelId,
        backend: 'webgpu',
      });
      const failure = yield* testDecisionConfiguration(settings).pipe(
        Effect.provide(
          Layer.succeed(DecisionConfigurationTester, {
            test: () =>
              Effect.fail(
                new DecisionConfigurationTestError({
                  message: 'backend incompatible',
                })
              ),
          })
        ),
        Effect.result
      );
      expect(failure._tag).toBe('Failure');
    })
);

it.effect('defines only Laya', () =>
  Effect.gen(function* () {
    expect(localModelDefinitions).toHaveLength(1);
    const model = localModelDefinitions[0]!;
    expect(model.id).toBe('onnx-community/laya-multilingual-ONNX');
    expect(model.precision).toBe('fp16');
    expect(
      yield* Schema.decodeUnknownEffect(LocalModelDefinition)(model)
    ).toEqual(model);
  })
);

it.effect(
  'forwards file progress and reports cache verification after download',
  () =>
    Effect.gen(function* () {
      const progress: unknown[] = [];
      let complete = false;
      yield* prepareLocalModel(modelId, (event) => progress.push(event)).pipe(
        Effect.provide(
          Layer.succeed(LocalModelResources, {
            inspect: () =>
              Effect.succeed({ tag: complete ? 'complete' : 'missing' }),
            download: (_id, report) =>
              Effect.sync(() => {
                report?.({ file: 'model.onnx', loaded: 20, total: 100 });
                complete = true;
              }),
            remove: () => Effect.void,
          })
        )
      );
      expect(progress).toEqual([
        { file: 'model.onnx', loaded: 20, total: 100 },
        { file: '', loaded: 0, total: 0, status: 'checking' },
      ]);
    })
);
