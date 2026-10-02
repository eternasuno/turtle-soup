import { For, Show } from '@solidjs/web';
import type { Message } from '@turtle-soup/core/types';
import { createSignal, onCleanup } from 'solid-js';
import puzzles from '../data/puzzles.json';
import { useGame } from '../lib/game';
import { SettingsDialog } from './SettingsDialog';

function Conversation(props: { messages: Message[]; loading: boolean }) {
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

function Composer(props: { game: ReturnType<typeof useGame> }) {
  return (
    <form
      class="group shrink-0 border-t border-base-300 p-3 md:p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void props.game.submit();
      }}
    >
      <div class="flex items-center justify-between gap-3">
        <fieldset
          class="join"
          aria-label="发言模式"
          disabled={props.game.loading() || props.game.status() !== 'playing'}
        >
          <input
            class="btn btn-sm join-item checked:btn-primary"
            type="radio"
            name="mode"
            value="question"
            aria-label="询问"
            checked={props.game.mode() === 'question'}
            onChange={() => props.game.setMode('question')}
          />
          <input
            class="btn btn-sm join-item checked:btn-primary"
            type="radio"
            name="mode"
            value="solve"
            aria-label="解密"
            checked={props.game.mode() === 'solve'}
            onChange={() => props.game.setMode('solve')}
          />
        </fieldset>
        <span class="hidden text-xs text-base-content/60 md:block">
          <span class="hidden group-has-[input[value=question]:checked]:inline">
            让线索浮出水面
          </span>
          <span class="hidden group-has-[input[value=solve]:checked]:inline">
            拼出完整的真相
          </span>
        </span>
      </div>
      <label class="sr-only" for="game-input">
        {props.game.mode() === 'question' ? '你的问题' : '你的解答'}
      </label>
      <textarea
        id="game-input"
        class="textarea my-2 block h-15 min-h-15 w-full resize-none bg-base-200 leading-relaxed md:my-3 md:h-19 md:min-h-19"
        rows={2}
        value={props.game.input()}
        disabled={props.game.loading() || props.game.status() !== 'playing'}
        onInput={(event) => props.game.setInput(event.currentTarget.value)}
        placeholder={
          props.game.mode() === 'question'
            ? '例如：他认识死者吗？'
            : '输入你认为完整的事件真相……'
        }
      />
      <div class="flex items-center justify-end gap-3 md:justify-between">
        <span class="hidden text-xs text-base-content/60 md:inline">
          {props.game.status() === 'playing'
            ? '真相只有一个，提问不限次数。'
            : '本题已结束，开启下一道谜题吧。'}
        </span>
        <button
          class="btn btn-primary btn-sm"
          type="submit"
          disabled={
            props.game.loading() ||
            props.game.status() !== 'playing' ||
            !props.game.input().trim()
          }
        >
          <Show
            when={props.game.loading()}
            fallback={
              <>
                <span class="hidden group-has-[input[value=question]:checked]:inline">
                  发送问题
                </span>
                <span class="hidden group-has-[input[value=solve]:checked]:inline">
                  提交答案
                </span>
              </>
            }
          >
            判断中…
          </Show>
        </button>
      </div>
      <Show when={props.game.error()}>
        <p class="mt-2 text-xs text-error" role="alert">
          {props.game.error()}
        </p>
      </Show>
    </form>
  );
}

function ResultDialog(props: {
  truth: string;
  onClose: () => void;
  onNext: () => void;
}) {
  let dialog: HTMLDialogElement | undefined;
  let disposed = false;
  queueMicrotask(() => {
    if (!disposed) dialog?.showModal();
  });
  onCleanup(() => {
    disposed = true;
    dialog?.close();
  });
  return (
    <dialog
      ref={dialog}
      class="modal"
      aria-labelledby="result-title"
      onClose={() => {
        if (!disposed) props.onClose();
      }}
    >
      <div class="modal-box max-h-[calc(100dvh-3rem)] overflow-y-auto">
        <span class="text-[11px] font-bold tracking-wider text-primary">
          所有关键事实已被覆盖
        </span>
        <h2 id="result-title" class="mt-3 text-2xl font-bold">
          解密成功
        </h2>
        <p class="mt-4 text-sm leading-loose">{props.truth}</p>
        <div class="modal-action">
          <form method="dialog">
            <button class="btn btn-ghost" type="submit">
              回顾本题
            </button>
          </form>
          <button class="btn btn-primary" type="button" onClick={props.onNext}>
            下一题
          </button>
        </div>
      </div>
    </dialog>
  );
}

export function Game() {
  const game = useGame();
  const [showSettings, setShowSettings] = createSignal(
    !game.settings().apiUrl.trim() || !game.settings().apiKey.trim()
  );
  const [dismissedResult, setDismissedResult] = createSignal('');
  const nextPuzzle = () => {
    setDismissedResult('');
    game.startNewGame();
  };
  return (
    <main class="mx-auto flex h-dvh max-w-7xl flex-col gap-3 overflow-hidden bg-base-200 p-3 text-base-content md:gap-5 md:p-6">
      <header class="flex shrink-0 items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <span
            class="grid size-9 place-items-center rounded-xl bg-primary font-serif text-xl text-primary-content md:size-10"
            aria-hidden="true"
          >
            汤
          </span>
          <div>
            <h1 class="text-lg font-bold tracking-wider md:text-xl">海龟汤</h1>
            <span class="text-xs text-base-content/60">真相之间</span>
          </div>
        </div>
        <button
          class="btn btn-ghost btn-sm"
          type="button"
          onClick={() => setShowSettings(true)}
        >
          Jev 设置
        </button>
      </header>
      <div class="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,2fr)] gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:grid-rows-1 md:gap-5">
        <section
          class="card min-h-0 overflow-y-auto border border-base-300 bg-base-100 p-4 md:p-7"
          aria-labelledby="puzzle-title"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-[11px] font-bold tracking-wider text-primary">
              一碗汤 · 一段隐藏的故事
            </span>
            <span class="badge badge-soft badge-primary badge-sm whitespace-nowrap">
              {
                {
                  playing: '推理进行中',
                  solved: '解密成功',
                  revealed: '谜底已揭晓',
                }[game.status()]
              }
            </span>
          </div>
          <h2
            id="puzzle-title"
            class="my-3 text-xl font-bold md:mt-5 md:text-3xl"
          >
            {game.puzzle().title}
          </h2>
          <p class="text-sm leading-relaxed md:text-base md:leading-loose">
            {game.puzzle().surface}
          </p>
          <div class="mt-6 hidden border-t border-base-300 pt-4 text-xs text-base-content/60 md:block">
            你可以提问，也可以直接说出你推理出的真相。
          </div>
          <Show when={game.status() !== 'playing'}>
            <section
              class="mt-5 rounded-r-lg border-l-4 border-primary bg-primary/10 p-4"
              aria-label="完整谜底"
            >
              <span class="text-[11px] font-bold tracking-wider text-primary">
                {game.status() === 'solved' ? '解密成功' : '故事的真相'}
              </span>
              <p class="mt-2 text-sm leading-relaxed">{game.puzzle().truth}</p>
            </section>
          </Show>
          <div class="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3 md:pt-6">
            <Show
              when={game.status() === 'playing'}
              fallback={
                <button
                  class="btn btn-primary btn-sm"
                  type="button"
                  onClick={nextPuzzle}
                >
                  下一题
                </button>
              }
            >
              <button
                class="btn btn-ghost btn-sm"
                type="button"
                onClick={game.reveal}
              >
                放弃并查看谜底
              </button>
            </Show>
            <span class="hidden text-xs text-base-content/60 md:inline">
              {puzzles.length} 道谜题 · Jev 担任主持人
            </span>
          </div>
        </section>
        <section
          class="card flex min-h-0 flex-col overflow-hidden border border-base-300 bg-base-100"
          aria-label="推理对话"
        >
          <div class="flex shrink-0 items-center justify-between gap-3 border-b border-base-300 px-4 py-3 md:px-5 md:py-4">
            <h2 class="text-sm font-bold">推理对话</h2>
            <span class="badge badge-ghost badge-sm">Jev 主持人</span>
          </div>
          <Conversation messages={game.messages()} loading={game.loading()} />
          <Composer game={game} />
        </section>
      </div>
      <Show
        when={
          game.status() === 'solved' && dismissedResult() !== game.puzzle().id
        }
      >
        <ResultDialog
          truth={game.puzzle().truth}
          onClose={() => setDismissedResult(game.puzzle().id)}
          onNext={nextPuzzle}
        />
      </Show>
      <footer class="hidden shrink-0 text-center text-[11px] text-base-content/50 md:block">
        保持好奇，答案往往不在第一眼看到的地方。
      </footer>
      <Show when={showSettings()}>
        <SettingsDialog
          settings={game.settings()}
          onSave={game.setSettings}
          onClose={() => setShowSettings(false)}
        />
      </Show>
    </main>
  );
}
