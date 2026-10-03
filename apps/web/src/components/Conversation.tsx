import { For, Show } from '@solidjs/web';
import type { Message } from '@turtle-soup/core/types';

export function Conversation(props: {
  messages: ReadonlyArray<Message>;
  loading: boolean;
}) {
  return (
    <section
      class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3.5 break-words md:p-5"
      aria-label="对话历史"
      aria-live="polite"
      aria-busy={props.loading ? 'true' : 'false'}
    >
      <Show
        when={props.messages.length}
        fallback={
          <div class="flex min-h-full flex-col justify-center text-center text-base-content/60">
            <span class="text-[11px] font-bold tracking-wider text-primary">
              从一个问题开始
            </span>
            <p>每一次「是」与「不是」，都让你离真相更近一步。</p>
            <small>询问获得线索 · 解密提交完整真相</small>
          </div>
        }
      >
        <For each={props.messages}>
          {(message) => (
            <article
              class={`chat ${message.role === 'user' ? 'chat-end' : 'chat-start'}`}
            >
              <span class="text-[11px] font-semibold text-base-content/60">
                {message.role === 'host'
                  ? '主持人'
                  : `玩家 · ${message.mode === 'solve' ? '解密' : '询问'}`}
              </span>
              <p
                class={`chat-bubble max-w-full whitespace-pre-wrap text-sm leading-relaxed ${message.role === 'user' ? 'bg-primary/10 text-base-content' : 'bg-base-200 text-base-content'}`}
              >
                {message.content}
              </p>
            </article>
          )}
        </For>
      </Show>
      <Show when={props.loading}>
        <p class="my-2 text-sm text-primary" role="status">
          主持人正在判断，请稍候…
        </p>
      </Show>
    </section>
  );
}
