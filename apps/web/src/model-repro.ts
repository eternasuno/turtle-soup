const key = 'turtle-soup:minimal-model-repro';

const log = document.querySelector<HTMLPreElement>('#log')!;

const wasm = document.querySelector<HTMLButtonElement>('#wasm')!;

const webgpu = document.querySelector<HTMLButtonElement>('#webgpu')!;

let worker: Worker | undefined;

function record(stage: string): void {
  log.textContent += `${new Date().toISOString()} ${stage}\n`;
  try {
    localStorage.setItem(key, log.textContent);
  } catch {
    log.textContent += '无法持久化记录，刷新后记录可能丢失。\n';
  }
}

try {
  log.textContent = localStorage.getItem(key) ?? '尚未测试。\n';
} catch {
  log.textContent = '无法读取持久化记录。\n';
}

function stop(): void {
  if (!worker) return;

  worker.terminate();
  worker = undefined;
  wasm.disabled = false;
  webgpu.disabled = false;
  record('Worker 已终止');
}

function start(backend: 'wasm' | 'webgpu'): void {
  if (worker) return;

  log.textContent = '';
  record(`独立加载测试：${backend}；Transformers.js 4.3.1；Laya fp16`);
  wasm.disabled = true;
  webgpu.disabled = true;
  try {
    worker = new Worker(new URL('./model-repro.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (typeof event.data === 'string') record(event.data);
    });
    worker.addEventListener('error', (event) => {
      record(`Worker 错误：${event.message || '无法启动或运行'}`);
      stop();
    });
    worker.addEventListener('messageerror', () => {
      record('Worker 消息解码失败');
      stop();
    });
    record('发送加载请求');
    worker.postMessage(backend);
  } catch (cause) {
    record(
      `启动异常：${cause instanceof Error ? cause.message : String(cause)}`
    );
    wasm.disabled = false;
    webgpu.disabled = false;
    stop();
  }
}

wasm.addEventListener('click', () => start('wasm'));
webgpu.addEventListener('click', () => start('webgpu'));
document.querySelector('#stop')!.addEventListener('click', stop);
window.addEventListener('pagehide', stop);
