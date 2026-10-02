import { Show } from '@solidjs/web';
import {
  JEV_ERROR_MESSAGE,
  testConnection,
  validateSettings,
} from '@turtle-soup/core/jev';
import type { JevSettings } from '@turtle-soup/core/types';
import { createSignal, onCleanup } from 'solid-js';
import { saveSettings } from '../lib/storage';

export function SettingsDialog(props: {
  settings: JevSettings;
  onSave: (settings: JevSettings) => void;
  onClose: () => void;
}) {
  let apiUrl: HTMLInputElement | undefined;
  let apiKey: HTMLInputElement | undefined;
  const [testing, setTesting] = createSignal(false);
  const [feedback, setFeedback] = createSignal('');
  const [error, setError] = createSignal('');
  let dialog: HTMLDialogElement | undefined;
  let active: AbortController | undefined;
  const draft = () => ({
    apiUrl: apiUrl?.value.trim() ?? '',
    apiKey: apiKey?.value.trim() ?? '',
  });
  const invalidate = () => {
    active?.abort();
    active = undefined;
    setTesting(false);
    setFeedback('');
    setError('');
  };
  let disposed = false;
  queueMicrotask(() => {
    if (!disposed) dialog?.showModal();
  });
  onCleanup(() => {
    disposed = true;
    active?.abort();
    active = undefined;
    dialog?.close();
  });
  const save = () => {
    setError('');
    try {
      validateSettings(draft());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '请检查设置。');
      return;
    }
    try {
      saveSettings(draft());
    } catch {
      setError('无法保存设置，请允许当前浏览器使用本地存储。');
      return;
    }
    props.onSave(draft());
    dialog?.close();
  };
  const test = async () => {
    if (active) return;
    const controller = new AbortController();
    active = controller;
    setTesting(true);
    setError('');
    setFeedback('');
    try {
      await testConnection(draft(), controller.signal);
      if (active === controller) setFeedback('连接成功。');
    } catch (cause) {
      if (active === controller)
        setError(cause instanceof Error ? cause.message : JEV_ERROR_MESSAGE);
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
        if (!disposed) props.onClose();
      }}
    >
      <div class="modal-box max-h-[calc(100dvh-3rem)] overflow-y-auto">
        <form
          id="jev-settings"
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
                Jev 设置
              </h2>
            </div>
          </div>
          <label class="mb-2 mt-4 block text-sm font-semibold" for="api-url">
            API URL
          </label>
          <input
            class="input w-full"
            id="api-url"
            type="url"
            required
            placeholder="完整的 Jev API 请求端点"
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
            API Key 仅保存在当前浏览器，并直接用于请求用户配置的 Jev API。
          </p>
          <p class="mt-2 text-xs leading-relaxed text-base-content/60">
            仅使用你信任的端点；测试连接会发送一次小型 Jev 请求，可能产生费用。
          </p>
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
              type="button"
              class="btn btn-ghost btn-sm"
              disabled={testing()}
              onClick={() => {
                void test();
              }}
            >
              {testing() ? '测试中…' : '测试连接'}
            </button>
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
