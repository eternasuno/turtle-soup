import {
  LocalModelResources,
  localModelDefinitions,
  prepareLocalModel,
  testDecisionConfiguration,
} from '@turtle-soup/core/model-management';
import type { DecisionSettings } from '@turtle-soup/core/types';
import { LocalModelResourcesLive } from '@turtle-soup/local-model/resources';
import { Effect } from 'effect';
import { createSignal, onCleanup, Show } from 'solid-js';
import { DecisionConfigurationTesterLive } from '../lib/model-management';
import { resourceOperation } from '../lib/resource-diagnostic';
import {
  ApiSettings,
  LocalSettings,
  ProviderSettings,
  SettingsFormDialog,
} from './DecisionSettingsFields';
import { readSettingsDraft, saveSettingsDraft } from './SettingsDraft';

export function SettingsDialog(props: {
  settings: DecisionSettings;
  onSave: (settings: DecisionSettings) => void;
  onClose: () => void;
}) {
  let apiUrl: HTMLInputElement | undefined;
  let apiKey: HTMLInputElement | undefined;
  let apiModel: HTMLInputElement | undefined;
  const selectedModel = localModelDefinitions[0]!;
  const modelId = selectedModel.id;
  let closed = false;
  let cacheRequest = 0;
  let cacheController: AbortController | undefined;
  let providerSelect: HTMLSelectElement | undefined;
  let selectedBackend: 'wasm' | 'webgpu' = props.settings.backend ?? 'wasm';
  const [backend, setBackend] = createSignal(selectedBackend);
  const [provider, setProvider] = createSignal(
    props.settings.provider ?? 'api'
  );
  const [testing, setTesting] = createSignal(false);
  const [cached, setCached] = createSignal<boolean | null>();
  const [selected, setSelected] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  const usingSavedModel = () =>
    cached() === true &&
    props.settings.provider === 'local' &&
    provider() === 'local' &&
    backend() === (props.settings.backend ?? 'wasm') &&
    modelId === (props.settings.modelId ?? selectedModel.id);
  const [feedback, setFeedback] = createSignal('');
  const [error, setError] = createSignal('');
  let dialog: HTMLDialogElement | undefined;
  let active: AbortController | undefined;
  const draft = () =>
    readSettingsDraft({
      providerSelect,
      selectedBackend,
      apiUrl,
      apiKey,
      apiModel,
      modelId: modelId,
    });
  const invalidate = () => {
    cacheRequest++;
    cacheController?.abort();
    cacheController = undefined;
    const controller = active;
    active = undefined;
    controller?.abort();
    setTesting(false);
    setDeleting(false);
    setFeedback('');
    setError('');
    setSelected(false);
  };
  let disposed = false;
  queueMicrotask(() => {
    if (!disposed) {
      dialog?.showModal();
      void checkCache();
    }
  });
  onCleanup(() => {
    disposed = true;
    cacheController?.abort();
    const controller = active;
    active = undefined;
    controller?.abort();
    dialog?.close();
  });
  const checkCache = async () => {
    const request = ++cacheRequest;
    const inspectingModelId = modelId;
    cacheController?.abort();
    const controller = new AbortController();
    cacheController = controller;
    await Effect.runPromiseExit(
      Effect.gen(function* () {
        const resources = yield* LocalModelResources;

        return yield* resources.inspect(inspectingModelId);
      }).pipe(
        Effect.provide(LocalModelResourcesLive),
        Effect.match({
          onSuccess: (availability) => {
            if (!disposed && !closed && request === cacheRequest)
              setCached(availability.tag === 'complete');
          },
          onFailure: () => {
            if (!disposed && !closed && request === cacheRequest) {
              setCached(null);
              setError('无法检查模型缓存，请重试。');
            }
          },
        })
      ),
      { signal: controller.signal }
    );
  };
  const save = () => {
    if (active || disposed || closed) return;
    const settings = draft();
    setError('');
    saveSettingsDraft(settings, setError, (valid) => {
      props.onSave(valid);
      dialog?.close();
    });
  };
  const test = async (api = false) => {
    if (active || disposed || closed) return;

    setSelected(false);
    const controller = new AbortController();
    active = controller;
    setTesting(true);
    setError('');
    setFeedback('');
    const settings = {
      ...draft(),
      provider: api ? ('api' as const) : ('local' as const),
    };
    await Effect.runPromiseExit(
      testDecisionConfiguration(settings).pipe(
        Effect.provide(DecisionConfigurationTesterLive),
        Effect.match({
          onFailure: (cause) => {
            if (active === controller) {
              setError(cause.message);
            }
          },
          onSuccess: () => {
            if (active !== controller) return;
            if (api) {
              setFeedback('连接测试成功；点击保存应用设置。');
              return;
            }

            if (providerSelect) providerSelect.value = 'local';
            setProvider('local');
            setSelected(true);
            setFeedback(
              `测试成功，已选中 ${selectedModel.name}；点击保存应用设置。`
            );
          },
        }),
        Effect.ensuring(
          Effect.sync(() => {
            if (active === controller) {
              active = undefined;
              setTesting(false);
            }
          })
        )
      ),
      { signal: controller.signal }
    );
    if (!api && !controller.signal.aborted && !disposed) await checkCache();
  };
  const isCurrent = (controller: AbortController) =>
    active === controller && !disposed && !closed && !controller.signal.aborted;
  const removeCache = async () => {
    if (active || disposed || closed) return;

    const controller = new AbortController();
    active = controller;
    setTesting(true);
    setDeleting(true);
    setError('');
    setFeedback('');
    const removingModelId = modelId;
    await Effect.runPromiseExit(
      resourceOperation(
        LocalModelResources.use((resources) =>
          resources.remove(removingModelId)
        ).pipe(Effect.provide(LocalModelResourcesLive)),
        removingModelId,
        'remove',
        () => isCurrent(controller),
        setError,
        () => {
          setCached(false);
          setSelected(false);
          setFeedback(
            `${selectedModel.name} 缓存已删除；再次使用前需要重新下载。`
          );
        }
      ),
      { signal: controller.signal }
    );
    if (active === controller) {
      active = undefined;
      setTesting(false);
      setDeleting(false);
    }
  };
  const download = async () => {
    if (active || disposed || closed) return;
    const controller = new AbortController();
    active = controller;
    setTesting(true);
    setError('');
    setFeedback('');
    const preparingModelId = modelId;
    await Effect.runPromiseExit(
      resourceOperation(
        prepareLocalModel(preparingModelId).pipe(
          Effect.provide(LocalModelResourcesLive)
        ),
        preparingModelId,
        'prepare',
        () => isCurrent(controller),
        setError,
        () =>
          setFeedback(`${selectedModel.name} 已准备好，点击使用测试并选中。`)
      ),
      { signal: controller.signal }
    );
    if (active === controller) {
      if (!controller.signal.aborted && !disposed && !closed)
        await checkCache();
      if (active === controller) {
        active = undefined;
        setTesting(false);
      }
    }
  };
  return (
    <SettingsFormDialog
      dialogRef={(element) => (dialog = element)}
      error={error()}
      feedback={feedback()}
      testing={testing()}
      onSave={save}
      onClose={() => {
        closed = true;
        cacheRequest++;
        invalidate();
        if (!disposed) props.onClose();
      }}
    >
      <ProviderSettings
        provider={provider()}
        selectRef={(element) => (providerSelect = element)}
        onChange={(value) => {
          invalidate();
          setProvider(value);
          if (value === 'local') {
            setCached(undefined);
            void checkCache();
          }
        }}
      />
      <ApiSettings
        settings={props.settings}
        local={provider() === 'local'}
        urlRef={(element) => (apiUrl = element)}
        keyRef={(element) => (apiKey = element)}
        modelRef={(element) => (apiModel = element)}
        onInput={invalidate}
      />
      <Show when={provider() === 'api'}>
        <button
          type="button"
          class="btn btn-outline w-full"
          disabled={testing()}
          onClick={() => void test(true)}
        >
          {testing() ? '测试中…' : '测试连接'}
        </button>
      </Show>
      <Show when={provider() === 'local'}>
        <LocalSettings
          model={selectedModel}
          backend={backend()}
          testing={testing()}
          cached={cached()}
          usingSavedModel={usingSavedModel()}
          deleting={deleting()}
          selected={selected()}
          onBackendChange={(value) => {
            selectedBackend = value;
            setBackend(value);
            invalidate();
          }}
          onAction={() => {
            if (cached() === null) void checkCache();
            else if (cached()) void test();
            else void download();
          }}
          onRemove={removeCache}
        />
      </Show>
    </SettingsFormDialog>
  );
}
