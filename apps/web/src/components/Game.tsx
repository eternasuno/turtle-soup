import { Show } from '@solidjs/web';
import { createSignal } from 'solid-js';
import puzzles from '../data/puzzles.json';
import { useGame } from '../lib/game';
import { Composer } from './Composer';
import { Conversation } from './Conversation';
import { ResultDialog } from './ResultDialog';
import { SettingsDialog } from './SettingsDialog';

export function Game() {
  const game = useGame();
  const [showSettings, setShowSettings] = createSignal(
    game.settings().provider !== 'local' &&
      (!game.settings().apiUrl.trim() || !game.settings().apiKey.trim())
  );
  const [resultDismissed, setResultDismissed] = createSignal(false);
  const nextPuzzle = () => {
    setResultDismissed(false);
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
          Decision 设置
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
              {puzzles.length} 道谜题 · Decision 担任主持人
            </span>
          </div>
        </section>
        <section
          class="card flex min-h-0 flex-col overflow-hidden border border-base-300 bg-base-100"
          aria-label="推理对话"
        >
          <div class="flex shrink-0 items-center justify-between gap-3 border-b border-base-300 px-4 py-3 md:px-5 md:py-4">
            <h2 class="text-sm font-bold">推理对话</h2>
            <span class="badge badge-ghost badge-sm">Decision 主持人</span>
          </div>
          <Conversation messages={game.messages()} loading={game.loading()} />
          <Composer game={game} />
        </section>
      </div>
      <Show when={game.status() === 'solved' && !resultDismissed()}>
        <ResultDialog
          truth={game.puzzle().truth}
          onClose={() => setResultDismissed(true)}
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
