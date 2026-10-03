import { onCleanup } from 'solid-js';

export function ResultDialog(props: {
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
