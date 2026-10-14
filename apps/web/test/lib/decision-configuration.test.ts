import { it } from '@effect/vitest';
import { testConnection } from '@turtle-soup/core/decision';
import {
  localModelDefinitions,
  testDecisionConfiguration,
} from '@turtle-soup/core/model-management';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { configuredDecision } from '../../src/lib/decision';
import { DecisionConfigurationTesterLive } from '../../src/lib/model-management';

const localLayer = vi.hoisted(() => vi.fn());
vi.mock('@turtle-soup/local-model', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@turtle-soup/local-model')>();

  return {
    ...original,
    LocalDecisionModelLayer: localLayer.mockImplementation(
      (_modelId, backend, onProgress) =>
        original.LayaDecisionModelLayer(backend, onProgress)
    ),
  };
});

const model = vi.hoisted(() => ({
  dispose: vi.fn(async () => {}),
  load: vi.fn(async () => {}),
  request: vi.fn(async () => ({
    connection: { type: 'choice' as const, choice: 'ready' },
  })),
}));
vi.mock('../../../../packages/local-model/src/worker-client', () => ({
  createLayaWorker: vi.fn(() => ({
    ...model,
    load: model.load,
  })),
}));

const settings = {
  provider: 'local' as const,
  apiUrl: '',
  apiKey: '',
  backend: 'wasm' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('configured decision testing', () => {
  for (const definition of localModelDefinitions) {
    for (const backend of ['wasm', 'webgpu'] as const) {
      it.effect(
        `passes ${definition.id} and ${backend} to the local layer`,
        () =>
          Effect.gen(function* () {
            const onProgress = vi.fn();
            yield* testConnection().pipe(
              Effect.provide(
                configuredDecision(
                  { ...settings, modelId: definition.id, backend },
                  onProgress
                )
              )
            );
            expect(localLayer).toHaveBeenCalledWith(
              definition.id,
              backend,
              onProgress
            );
            expect(model.dispose).toHaveBeenCalledOnce();
          })
      );
    }
  }

  it.effect('defaults legacy local settings to Laya on WASM', () =>
    Effect.gen(function* () {
      yield* testConnection().pipe(
        Effect.provide(
          configuredDecision({ provider: 'local', apiUrl: '', apiKey: '' })
        )
      );
      expect(localLayer).toHaveBeenCalledWith(
        localModelDefinitions[0]!.id,
        'wasm',
        undefined
      );
    })
  );

  it.effect('tests a temporary model and releases it before completion', () =>
    Effect.gen(function* () {
      const result = yield* testDecisionConfiguration(settings).pipe(
        Effect.provide(DecisionConfigurationTesterLive)
      );
      expect(result).toEqual({
        provider: 'local',
        model: 'onnx-community/laya-multilingual-ONNX',
        backend: 'wasm',
      });
      expect(model.request).toHaveBeenCalledOnce();
      expect(model.dispose).toHaveBeenCalledOnce();
    })
  );

  it.effect('releases failed tests and preserves local technical details', () =>
    Effect.gen(function* () {
      model.request.mockRejectedValueOnce(new Error('WASM session failed'));
      const error = yield* testDecisionConfiguration(settings).pipe(
        Effect.provide(DecisionConfigurationTesterLive),
        Effect.flip
      );
      expect(error._tag).toBe('DecisionConfigurationTestError');
      expect(error.message).toContain('WASM session failed');
      expect(console.error).toHaveBeenCalledWith({
        modelId: 'onnx-community/laya-multilingual-ONNX',
        backend: 'wasm',
        stage: 'decide',
        reason: 'WASM session failed',
      });
      expect(model.dispose).toHaveBeenCalledOnce();
    })
  );

  it.effect('keeps API secrets and transport causes out of diagnostics', () =>
    Effect.gen(function* () {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('secret-key https://private.example input-payload');
        })
      );
      const error = yield* testDecisionConfiguration({
        provider: 'api',
        apiUrl: 'https://private.example',
        apiKey: 'secret-key',
      }).pipe(Effect.provide(DecisionConfigurationTesterLive), Effect.flip);
      expect(error.message).toBe(
        '连接测试失败，请检查配置、网络或本地推理后端。'
      );
      expect(console.error).not.toHaveBeenCalled();
    })
  );

  it.effect(
    'reports local acquisition failure stage without dumping a cause',
    () =>
      Effect.gen(function* () {
        model.load.mockRejectedValueOnce(
          new Error('Unsupported WASM operator')
        );
        const error = yield* testDecisionConfiguration(settings).pipe(
          Effect.provide(DecisionConfigurationTesterLive),
          Effect.flip
        );
        expect(error.message).toContain('Unsupported WASM operator');
        expect(console.error).toHaveBeenCalledWith(
          expect.objectContaining({
            stage: 'load',
            reason: 'Unsupported WASM operator',
          })
        );
      })
  );

  it.effect(
    'accepts a valid unexpected semantic label with one inference',
    () =>
      Effect.gen(function* () {
        model.request.mockResolvedValueOnce({
          connection: { type: 'choice', choice: 'unavailable' },
        });
        yield* testDecisionConfiguration(settings).pipe(
          Effect.provide(DecisionConfigurationTesterLive)
        );
        expect(model.request).toHaveBeenCalledOnce();
      })
  );

  it.effect('keeps local layer acquisition failures typed', () =>
    Effect.gen(function* () {
      model.load.mockRejectedValueOnce(new Error('backend failure'));
      const error = yield* testConnection().pipe(
        Effect.provide(configuredDecision(settings)),
        Effect.flip
      );
      expect(error._tag).toBe('AiError');
    })
  );

  it.effect('rejects invalid configurations before model acquisition', () =>
    Effect.gen(function* () {
      const error = yield* testConnection().pipe(
        Effect.provide(configuredDecision({ apiUrl: '', apiKey: '' })),
        Effect.flip
      );
      expect(error._tag).toBe('SettingsError');
      expect(model.request).not.toHaveBeenCalled();
    })
  );
});
