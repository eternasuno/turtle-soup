import type {
  LocalModelDefinition,
  ModelDownloadProgress,
} from '@turtle-soup/core/model-management';
import type { DecisionSettings } from '@turtle-soup/core/types';
import { type JSX, Show } from 'solid-js';

export function ApiSettings(props: {
  settings: DecisionSettings;
  local: boolean;
  urlRef: (element: HTMLInputElement) => void;
  keyRef: (element: HTMLInputElement) => void;
  modelRef: (element: HTMLInputElement) => void;
  onInput: () => void;
}) {
  return (
    <fieldset disabled={props.local} hidden={props.local}>
      <label class="mb-2 mt-4 block text-sm font-semibold" for="api-url">
        API URL
      </label>
      <input
        class="input w-full"
        id="api-url"
        type="url"
        required
        placeholder="完整的 Decision API 请求端点"
        ref={props.urlRef}
        value={props.settings.apiUrl}
        onInput={props.onInput}
      />
      <p class="mt-2 text-xs leading-relaxed text-base-content/60">
        填写支持 state / questions / answers
        协议的完整端点，不是网站首页或聊天接口。
      </p>
      <label class="mb-2 mt-4 block text-sm font-semibold" for="api-model">
        API Model
      </label>
      <input
        id="api-model"
        class="input w-full"
        required
        ref={props.modelRef}
        value={props.settings.apiModel ?? 'jev-latest'}
        onInput={props.onInput}
      />
      <label class="mb-2 mt-4 block text-sm font-semibold" for="api-key">
        API Key
      </label>
      <input
        class="input w-full"
        id="api-key"
        type="password"
        required
        autocomplete="off"
        ref={props.keyRef}
        value={props.settings.apiKey}
        onInput={props.onInput}
      />
      <p class="mt-4 rounded-lg bg-base-200 p-3 text-xs leading-relaxed">
        API Key 仅保存在当前浏览器，并直接用于请求用户配置的 Decision
        API。仅使用你信任的端点，请求可能产生费用。
      </p>
    </fieldset>
  );
}

export function ApiTestButton(props: {
  testing: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      class="btn btn-outline w-full"
      disabled={props.testing}
      onClick={props.onClick}
    >
      {props.testing ? '测试中…' : '测试连接'}
    </button>
  );
}

export function LocalSettings(props: {
  model: LocalModelDefinition;
  downloadProgress?: ModelDownloadProgress | undefined;
  backend: 'wasm' | 'webgpu';
  testing: boolean;
  cached: boolean | null | undefined;
  usingSavedModel: boolean;
  deleting: boolean;
  selected: boolean;
  onBackendChange: (backend: 'wasm' | 'webgpu') => void;
  onAction: () => void;
  onRemove: () => void;
}) {
  const percent = () => {
    const progress = props.downloadProgress;
    if (
      !progress ||
      (progress.status && progress.status !== 'downloading') ||
      progress.total <= 0
    )
      return undefined;

    return Math.min(100, Math.floor((progress.loaded / progress.total) * 100));
  };
  const bytes = (value: number) => `${(value / 1_000_000).toFixed(1)} MB`;
  const downloadLabel = () => {
    if (props.downloadProgress?.status === 'initializing') return '初始化中…';
    if (props.downloadProgress?.status === 'checking') return '检查缓存中…';
    return percent() === undefined ? '连接 / 下载中…' : `下载中 ${percent()}%`;
  };
  const actionLabel = () => {
    if (props.downloadProgress) return downloadLabel();
    if (props.deleting) return '删除中…';
    if (props.cached === undefined) return '检查缓存中…';
    if (props.cached === null) return '重新检查缓存';
    if (props.testing) return props.cached ? '测试中…' : '下载中…';
    if (!props.cached) return `下载 ${props.model.name}`;
    if (props.usingSavedModel) return '使用中';

    return props.selected ? '已选中 · 使用' : '使用';
  };

  return (
    <>
      <label class="mt-4 block text-sm font-semibold" for="local-model">
        本地模型
      </label>
      <p class="mt-2 text-sm">
        {props.model.name} · {props.model.precision}
      </p>
      <label class="mt-4 block text-sm font-semibold" for="local-backend">
        推理后端
      </label>
      <select
        id="local-backend"
        class="select mt-2 w-full"
        value={props.backend}
        onChange={(event) =>
          props.onBackendChange(
            event.currentTarget.value === 'webgpu' ? 'webgpu' : 'wasm'
          )
        }
      >
        <option value="wasm">WASM / CPU（兼容性优先）</option>
        <option value="webgpu">WebGPU（速度优先）</option>
      </select>
      <div class="mt-4 rounded-lg bg-base-200 p-3 text-sm">
        <p class="font-semibold">
          {props.model.name} · {props.model.precision}
        </p>
        <p class="mt-1 text-xs">精度：{props.model.precision}</p>
        <p class="mt-1 text-xs">
          许可证：
          {props.model.license}
        </p>
        <p class="mt-1 text-xs leading-relaxed text-base-content/70">
          首次下载所选后端的模型文件，之后会缓存于此设备。模型在本地运行，不会发送对话内容到服务器；回答准确性可能低于在线
          API。
        </p>
        <button
          type="button"
          class="btn btn-outline btn-sm relative h-9 w-48 max-w-full overflow-hidden mt-3 disabled:text-base-content disabled:opacity-100"
          disabled={
            props.testing || props.cached === undefined || props.usingSavedModel
          }
          onClick={props.onAction}
        >
          <Show when={percent() !== undefined}>
            <span
              class="pointer-events-none absolute inset-y-0 left-0 bg-primary/20"
              style={{ width: `${percent() ?? 0}%` }}
              aria-hidden="true"
            />
          </Show>
          <span
            class="relative flex items-center justify-center gap-2"
            role="progressbar"
            aria-label={props.downloadProgress ? '当前文件下载进度' : undefined}
            aria-valuemin={props.downloadProgress ? 0 : undefined}
            aria-valuemax={props.downloadProgress ? 100 : undefined}
            aria-valuenow={percent()}
          >
            <Show when={props.downloadProgress && percent() === undefined}>
              <span
                class="loading loading-spinner loading-xs"
                aria-hidden="true"
              />
            </Show>
            {actionLabel()}
          </span>
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm mt-3 ml-2"
          disabled={props.testing || props.cached === undefined}
          onClick={props.onRemove}
        >
          删除缓存
        </button>
        <div class="mt-2 h-10 min-w-0 text-xs leading-5" aria-live="polite">
          <Show
            when={props.downloadProgress}
            fallback={
              <>
                <p
                  class="truncate"
                  title="下载只准备模型；点击使用测试当前后端，成功后选中，再保存应用。"
                >
                  {props.cached
                    ? '已下载。点击使用测试后，再保存应用。'
                    : '下载只准备模型，不执行判定。'}
                </p>
                <p
                  class="truncate"
                  title="WebGPU 在部分 Firefox 上存在兼容问题，可改选 WASM。"
                >
                  Firefox WebGPU 如不兼容，可改选 WASM。
                </p>
              </>
            }
          >
            {(progress) => (
              <>
                <p class="truncate" title={progress().file}>
                  {progress().file
                    ? `当前文件：${progress().file}`
                    : '正在准备模型，请稍候…'}
                </p>
                <p class="truncate">
                  {progress().file
                    ? `${bytes(progress().loaded)}${progress().total > 0 ? ` / ${bytes(progress().total)}` : ' · 总大小未知'}`
                    : '准备完成后可点击使用，测试当前后端。'}
                </p>
              </>
            )}
          </Show>
        </div>
      </div>
    </>
  );
}

export function SettingsHeading() {
  return (
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
  );
}

export function ProviderSettings(props: {
  provider: 'api' | 'local';
  selectRef: (element: HTMLSelectElement) => void;
  onChange: (value: 'api' | 'local') => void;
}) {
  return (
    <>
      <label
        class="mb-2 mt-4 block text-sm font-semibold"
        for="decision-provider"
      >
        提供方式
      </label>
      <select
        id="decision-provider"
        class="select w-full"
        ref={props.selectRef}
        value={props.provider}
        onChange={(event) =>
          props.onChange(
            event.currentTarget.value === 'local' ? 'local' : 'api'
          )
        }
      >
        <option value="api">Decision API</option>
        <option value="local">本地模型</option>
      </select>
    </>
  );
}

export function SettingsFeedback(props: {
  error: string;
  feedback: string;
  testing: boolean;
}) {
  return (
    <>
      <Show when={props.error}>
        <p class="mt-2 text-xs text-error" role="alert">
          {props.error}
        </p>
      </Show>
      <Show when={props.feedback}>
        <p class="mt-2 text-sm text-success" role="status">
          {props.feedback}
        </p>
      </Show>
      <div class="modal-action">
        <button
          class="btn btn-primary btn-sm"
          type="submit"
          disabled={props.testing}
        >
          保存
        </button>
      </div>
    </>
  );
}

export function SettingsClose() {
  return (
    <form method="dialog" class="absolute top-4 right-4">
      <button class="btn btn-ghost btn-sm" type="submit" aria-label="关闭设置">
        关闭
      </button>
    </form>
  );
}

export function SettingsFormDialog(props: {
  children: JSX.Element;
  dialogRef: (element: HTMLDialogElement) => void;
  error: string;
  feedback: string;
  testing: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <dialog
      ref={props.dialogRef}
      class="modal"
      aria-labelledby="settings-title"
      onClose={props.onClose}
    >
      <div class="modal-box max-h-[calc(100dvh-3rem)] overflow-y-auto">
        <form
          id="decision-settings"
          onSubmit={(event) => {
            event.preventDefault();
            props.onSave();
          }}
        >
          <SettingsHeading />
          {props.children}
          <SettingsFeedback
            error={props.error}
            feedback={props.feedback}
            testing={props.testing}
          />
        </form>
        <SettingsClose />
      </div>
    </dialog>
  );
}
