import { Show } from '@solidjs/web';
import { Option } from 'effect';
import type { useGame } from '../lib/game';

export function Composer(props: { game: ReturnType<typeof useGame> }) {
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
      <Show when={Option.getOrUndefined(props.game.error())}>
        <p class="mt-2 text-xs text-error" role="alert">
          {Option.getOrUndefined(props.game.error())}
        </p>
      </Show>
    </form>
  );
}
