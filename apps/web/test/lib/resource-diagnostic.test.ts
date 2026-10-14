import { ModelResourceError } from '@turtle-soup/core/model-management';
import { Effect } from 'effect';
import { afterEach, expect, it, vi } from 'vitest';
import { resourceOperation } from '../../src/lib/resource-diagnostic';

afterEach(() => vi.restoreAllMocks());

it('preserves preparation errors without exposing URLs', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const error = vi.fn();
  const success = vi.fn();
  await Effect.runPromise(
    resourceOperation(
      Effect.fail(
        new ModelResourceError({
          message: 'ONNX load failed https://example.com/private',
        })
      ),
      'onnx-community/d1-omni-600M-ONNX',
      'prepare',
      () => true,
      error,
      success
    )
  );
  expect(error).toHaveBeenCalledWith('模型准备失败：ONNX load failed [URL]');
  expect(log).toHaveBeenCalledWith({
    modelId: 'onnx-community/d1-omni-600M-ONNX',
    backend: 'wasm',
    stage: 'prepare',
    reason: 'ONNX load failed [URL]',
  });
  expect(success).not.toHaveBeenCalled();
});

it('suppresses feedback and logging for a closed or replaced operation', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const feedback = vi.fn();
  await Effect.runPromise(
    resourceOperation(
      Effect.fail(new ModelResourceError({ message: 'late failure' })),
      'Manav2op/verdict-small',
      'prepare',
      () => false,
      feedback,
      feedback
    )
  );
  expect(feedback).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});
