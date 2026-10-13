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

it.effect.each([
  'onnx-community/laya-multilingual-ONNX',
  'Manav2op/verdict-small',
  'onnx-community/d1-omni-600M-ONNX',
])('returns local backend only after a successful test for %s', (modelId) =>
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
        Layer.succeed(DecisionConfigurationTester, { test: () => Effect.void })
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

it.effect('defines backend precision and complete text cache manifests', () =>
  Effect.gen(function* () {
    expect(localModelDefinitions.map((model) => model.id)).toEqual([
      'onnx-community/laya-multilingual-ONNX',
      'Manav2op/verdict-small',
      'onnx-community/d1-omni-600M-ONNX',
    ]);
    for (const model of localModelDefinitions) {
      expect(
        yield* Schema.decodeUnknownEffect(LocalModelDefinition)(model)
      ).toEqual(model);
      expect(model.backends).toEqual(['wasm', 'webgpu']);
      expect(model.files).toEqual(
        expect.arrayContaining([
          'config.json',
          'tokenizer.json',
          'tokenizer_config.json',
        ])
      );
    }

    const [laya, verdict, d1] = localModelDefinitions;
    expect(laya?.precisionByBackend).toEqual({ wasm: 'fp16', webgpu: 'fp16' });
    expect(laya?.files).toContain('onnx/model_fp16.onnx_data');
    expect(verdict?.precisionByBackend).toEqual({ wasm: 'q8', webgpu: 'fp16' });
    expect(verdict?.files).toEqual(
      expect.arrayContaining([
        'onnx/model_quantized.onnx',
        'onnx/model_fp16.onnx',
      ])
    );
    expect(d1?.precisionByBackend).toEqual({ wasm: 'q8', webgpu: 'q8' });
    expect(d1?.license).toBe('lfm1.0');
    expect(d1?.files.filter((file) => file.startsWith('onnx/'))).toEqual([
      'onnx/model_quantized.onnx',
      'onnx/model_quantized.onnx_data',
    ]);
    expect(
      yield* Schema.decodeUnknownEffect(LocalModelDefinition)({
        ...laya,
        id: 'unknown',
      }).pipe(Effect.result)
    ).toMatchObject({ _tag: 'Failure' });
  })
);
