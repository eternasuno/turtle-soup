import {
  type LocalModelDefinition,
  localModelDefinitions,
} from '@turtle-soup/core/model-management';
import type { DecisionSettings } from '@turtle-soup/core/types';
import { For, type JSX, Show } from 'solid-js';

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

export function LocalSettings(props: {
  model: LocalModelDefinition;
  backend: 'wasm' | 'webgpu';
  testing: boolean;
  cached: boolean | null | undefined;
  usingSavedModel: boolean;
  deleting: boolean;
  selected: boolean;
  modelRef: (element: HTMLSelectElement) => void;
  onModelChange: () => void;
  onBackendChange: (backend: 'wasm' | 'webgpu') => void;
  onAction: () => void;
  onRemove: () => void;
}) {
  const actionLabel = () => {
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
      <select
        id="local-model"
        class="select mt-2 w-full"
        ref={props.modelRef}
        value={props.model.id}
        onChange={props.onModelChange}
      >
        <For each={localModelDefinitions}>
          {(model) => (
            <option value={model.id}>
              {model.name} · {model.precision}
            </option>
          )}
        </For>
      </select>
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
          {props.model.name} · {props.model.precisionByBackend[props.backend]}
        </p>
        <p class="mt-1 text-xs">精度：{props.model.precision}</p>
        <p class="mt-1 text-xs">
          许可证：
          {props.model.license === 'lfm1.0'
            ? 'LFM Open License v1.0'
            : props.model.license}
        </p>
        <Show when={props.model.license === 'lfm1.0'}>
          <p class="mt-1 text-xs">
            仅文本推理，不支持音频或其他模态。商业使用存在收入门槛（commercial
            threshold），请先确认 LFM Open License v1.0 条款。
          </p>
        </Show>
        <p class="mt-1 text-xs leading-relaxed text-base-content/70">
          首次下载所选后端的模型文件，之后会缓存于此设备。模型在本地运行，不会发送对话内容到服务器；回答准确性可能低于在线
          API。
        </p>
        <button
          type="button"
          class="btn btn-outline btn-sm mt-3"
          disabled={
            props.testing || props.cached === undefined || props.usingSavedModel
          }
          onClick={props.onAction}
        >
          {actionLabel()}
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm mt-3 ml-2"
          disabled={props.testing || props.cached === undefined}
          onClick={props.onRemove}
        >
          删除缓存
        </button>
        <p class="mt-2 text-xs">
          {props.cached
            ? '已下载。点击使用会测试当前后端，成功后选中此模型。'
            : '下载只准备模型，不执行判定。'}
          WebGPU 在部分 Firefox 上存在兼容问题，可改选 WASM。
        </p>
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
