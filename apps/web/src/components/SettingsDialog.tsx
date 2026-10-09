import { Show } from '@solidjs/web';
import { testConnection } from '@turtle-soup/core/decision';
import { saveSettings } from '@turtle-soup/core/settings';
import type { DecisionSettings } from '@turtle-soup/core/types';
import { Effect, Exit } from 'effect';
import { createSignal, onCleanup } from 'solid-js';
import { configuredDecision } from '../lib/decision';
import { SettingsStorageLive } from '../lib/storage';

export function SettingsDialog(props: {
  settings: DecisionSettings;
  onSave: (settings: DecisionSettings) => void;
  onClose: () => void;
}) {
  let apiUrl: HTMLInputElement | undefined;
  let apiKey: HTMLInputElement | undefined;
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
    backend() === (props.settings.backend ?? 'wasm');
  const [feedback, setFeedback] = createSignal('');
  const [error, setError] = createSignal('');
  let dialog: HTMLDialogElement | undefined;
  let active: AbortController | undefined;
  const draft = (): DecisionSettings => ({
    provider: providerSelect?.value === 'local' ? 'local' : 'api',
    backend: selectedBackend,
    apiUrl: apiUrl?.value.trim() ?? '',
    apiKey: apiKey?.value.trim() ?? '',
  });
  const invalidate = () => {
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
    const controller = active;
    active = undefined;
    controller?.abort();
    dialog?.close();
  });
  const checkCache = async () => {
    try {
      const { isLayaCached } = await import('@turtle-soup/local-model/laya');
      const available = await isLayaCached();
      if (!disposed) setCached(available);
    } catch (cause) {
      if (!disposed) {
        setCached(null);
        setError(cause instanceof Error ? cause.message : '无法检查模型缓存。');
      }
    }
  };
  const modelActionLabel = () => {
    if (deleting()) return '删除中…';
    if (cached() === undefined) return '检查缓存中…';
    if (cached() === null) return '重新检查缓存';
    if (testing()) return cached() ? '测试中…' : '下载中…';
    if (!cached()) return '下载模型（约 650 MB）';

    if (usingSavedModel()) return '使用中';

    return selected() ? '已选中 · 使用' : '使用';
  };
  const save = () => {
    if (active || disposed) return;
    const settings = draft();
    setError('');
    Effect.runSync(
      saveSettings(settings).pipe(
        Effect.provide(SettingsStorageLive),
        Effect.match({
          onFailure: (cause) => setError(cause.message),
          onSuccess: (valid) => {
            props.onSave(valid);
            dialog?.close();
          },
        })
      )
    );
  };
  const test = async () => {
    if (active || disposed) return;

    setSelected(false);
    const controller = new AbortController();
    active = controller;
    setTesting(true);
    setError('');
    setFeedback('');
    const settings = { ...draft(), provider: 'local' as const };
    const exit = await Effect.runPromiseExit(
      testConnection().pipe(
        Effect.provide(configuredDecision(settings)),
        Effect.match({
          onFailure: (cause) => {
            if (active === controller) {
              console.error('Decision connection test failed', cause);
              setError(cause.message);
            }
          },
          onSuccess: () => {
            if (active !== controller) return;
            if (providerSelect) providerSelect.value = 'local';
            setProvider('local');
            setSelected(true);
            setFeedback('测试成功，已选中 Laya；点击保存应用设置。');
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
    if (!controller.signal.aborted && !disposed) await checkCache();

    if (Exit.isFailure(exit) && !controller.signal.aborted) {
      console.error(exit.cause);
    }
  };
  const removeCache = async () => {
    if (active || disposed) return;

    const controller = new AbortController();
    active = controller;
    setTesting(true);
    setDeleting(true);
    setError('');
    setFeedback('');
    try {
      const { deleteLayaCache } = await import('@turtle-soup/local-model/laya');
      await deleteLayaCache();
      if (active !== controller) return;

      setCached(false);
      setSelected(false);
      setFeedback('Laya 缓存已删除；再次使用前需要重新下载。');
    } catch (cause) {
      if (active === controller)
        setError(cause instanceof Error ? cause.message : '删除模型缓存失败。');
    } finally {
      if (active === controller) {
        active = undefined;
        setTesting(false);
        setDeleting(false);
      }
    }
  };
  const download = async () => {
    if (active || disposed) return;
    const controller = new AbortController();
    active = controller;
    setTesting(true);
    setError('');
    setFeedback('');
    try {
      const { loadLaya } = await import('@turtle-soup/local-model/laya');
      const model = await loadLaya(undefined, controller.signal, 'wasm');
      await model.dispose();
      if (active === controller) {
        await checkCache();
        if (active === controller)
          setFeedback('模型已准备好，点击使用测试并选中。');
      }
    } catch (cause) {
      if (active === controller)
        setError(cause instanceof Error ? cause.message : '模型下载失败。');
    } finally {
      if (active === controller) {
        active = undefined;
        setTesting(false);
      }
    }
  };
  return (
    <dialog
      ref={dialog}
      class="modal"
      aria-labelledby="settings-title"
      onClose={() => {
        invalidate();
        if (!disposed) props.onClose();
      }}
    >
      <div class="modal-box max-h-[calc(100dvh-3rem)] overflow-y-auto">
        <form
          id="decision-settings"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <div class="mb-6 flex items-center justify-between gap-3">
            <div>
              <span class="text-[11px] font-bold tracking-wider text-primary">
                连接你的主持人
              </span>
              <h2 id="settings-title" class="mt-2 text-2xl font-bold">
                Decision 设置
              </h2>
            </div>
          </div>
          <label
            class="mb-2 mt-4 block text-sm font-semibold"
            for="decision-provider"
          >
            提供方式
          </label>
          <select
            id="decision-provider"
            class="select w-full"
            ref={providerSelect}
            value={provider()}
            onChange={(event) => {
              invalidate();
              setProvider(event.currentTarget.value as 'api' | 'local');
            }}
          >
            <option value="api">Decision API</option>
            <option value="local">本地模型</option>
          </select>
          <fieldset
            disabled={provider() === 'local'}
            hidden={provider() === 'local'}
          >
            <label class="mb-2 mt-4 block text-sm font-semibold" for="api-url">
              API URL
            </label>
            <input
              class="input w-full"
              id="api-url"
              type="url"
              required
              placeholder="完整的 Decision API 请求端点"
              ref={apiUrl}
              value={props.settings.apiUrl}
              onInput={invalidate}
            />
            <p class="mt-2 text-xs leading-relaxed text-base-content/60">
              填写支持 state / questions / answers
              协议的完整端点，不是网站首页或聊天接口。
            </p>
            <label class="mb-2 mt-4 block text-sm font-semibold" for="api-key">
              API Key
            </label>
            <input
              class="input w-full"
              id="api-key"
              type="password"
              required
              autocomplete="off"
              ref={apiKey}
              value={props.settings.apiKey}
              onInput={invalidate}
            />
            <p class="mt-4 rounded-lg bg-base-200 p-3 text-xs leading-relaxed">
              API Key 仅保存在当前浏览器，并直接用于请求用户配置的 Decision
              API。仅使用你信任的端点，请求可能产生费用。
            </p>
          </fieldset>
          <Show when={provider() === 'local'}>
            <label class="mt-4 block text-sm font-semibold" for="local-backend">
              推理后端
            </label>
            <select
              id="local-backend"
              class="select mt-2 w-full"
              value={backend()}
              onChange={(event) => {
                selectedBackend =
                  event.currentTarget.value === 'webgpu' ? 'webgpu' : 'wasm';
                setBackend(selectedBackend);
                invalidate();
              }}
            >
              <option value="wasm">WASM / CPU（兼容性优先）</option>
              <option value="webgpu">WebGPU（速度优先）</option>
            </select>
            <div class="mt-4 rounded-lg bg-base-200 p-3 text-sm">
              <p class="font-semibold">Laya multilingual · fp16</p>
              <p class="mt-1 text-xs leading-relaxed text-base-content/70">
                首次下载约
                650MB，之后会缓存于此设备。模型在本地运行，不会发送对话内容到服务器；回答准确性可能低于在线
                API。
              </p>
              <button
                type="button"
                class="btn btn-outline btn-sm mt-3"
                disabled={
                  testing() || cached() === undefined || usingSavedModel()
                }
                onClick={() => {
                  if (cached() === null) void checkCache();
                  else if (cached()) void test();
                  else void download();
                }}
              >
                {modelActionLabel()}
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-sm mt-3 ml-2"
                disabled={testing() || cached() === undefined}
                onClick={() => {
                  void removeCache();
                }}
              >
                删除缓存
              </button>
              <p class="mt-2 text-xs">
                {cached()
                  ? '已下载。点击使用会测试当前后端，成功后选中此模型。'
                  : '下载只准备模型，不执行判定。'}
                WebGPU 在部分 Firefox 上存在兼容问题，可改选 WASM。
              </p>
            </div>
          </Show>
          <Show when={error()}>
            <p class="mt-2 text-xs text-error" role="alert">
              {error()}
            </p>
          </Show>
          <Show when={feedback()}>
            <p class="mt-2 text-sm text-success" role="status">
              {feedback()}
            </p>
          </Show>
          <div class="modal-action">
            <button
              class="btn btn-primary btn-sm"
              type="submit"
              disabled={testing()}
            >
              保存
            </button>
          </div>
        </form>
        <form method="dialog" class="absolute top-4 right-4">
          <button
            class="btn btn-ghost btn-sm"
            type="submit"
            aria-label="关闭设置"
          >
            关闭
          </button>
        </form>
      </div>
    </dialog>
  );
}
