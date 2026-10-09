# 海龟汤 MVP

SolidJS **2.0.0-rc.6**、TypeScript、Vite、Tailwind CSS 和 DaisyUI 的纯静态推理游戏。保留 pnpm / Turborepo workspace，核心状态使用 Effect，界面使用 Solid signals；没有后端、数据库、SSR、登录或路由。

桌面采用左侧题目、右侧对话的单屏布局，题目和聊天记录在各自面板内滚动；移动端紧凑上下排列。解密成功自动弹窗显示完整谜底，可回顾本题或直接进入下一题。

## 安装与运行

需要 Node.js 22.19+ 和 pnpm（根目录指定版本）。本仓库使用 `workspace:*` 依赖，不能直接使用 `npm install` 安装，请使用：

```bash
corepack enable
pnpm install
pnpm dev
```

打开 `http://localhost:3000`。

```bash
pnpm check
pnpm test
pnpm build
pnpm --filter web preview
```

部署 `apps/web/dist` 到静态托管即可，不需要服务端进程。preview 仅用于本地验证。

## GitHub Pages

`.github/workflows/deploy-pages.yml` 在推送到 `main` 或手动触发时执行检查、测试和构建，并将 `apps/web/dist` 部署到 GitHub Pages。

仓库 Settings → Pages → Build and deployment 的 Source 需选择 **GitHub Actions**。提交并推送代码后，在 Actions 中查看 `Deploy GitHub Pages` 的运行结果和部署地址。

Vite 使用相对资源路径，支持仓库子路径及自定义域名。部署不需要 Decision API Key 或其他应用密钥；用户仍在浏览器中填写自己的设置。

## Decision 设置

点击「Decision 设置」，选择 API 模式时填写**完整 POST API 端点**和 API Key，再点击「保存」。URL 不会自动追加路径。

API 模式保留原生 Jev System One 协议：Bearer 认证，请求 `{ model: "jev-latest", state, questions }`，响应 `{ answers: { [id]: { type: "choice", choice, confidence? } } }`。端点必须支持此协议、模型别名和浏览器 CORS；不支持 Chat Completions 或不兼容的请求格式。

- 询问：四选一 Choice，页面只显示固定标签。
- 解密：一个请求包含全部关键事实的独立二选一 Choice，由程序计算整体结果，不透露缺失事实。
- API 请求可能产生费用；设置底部不再提供单独的测试按钮。
- API 请求 30 秒超时；失败可重试；放弃、换题或退出时取消请求并忽略过期结果。

选择「本地模型」后，可选择 WebGPU（速度优先）或 WASM/CPU（兼容性优先）；未保存后端的旧配置默认 WASM。两种后端都使用 `onnx-community/laya-multilingual-ONNX` 的 fp16 权重，约 650 MB，不自动下载 fp32。

模型卡片检查实际浏览器缓存：文件不完整时显示「下载模型」，完整时显示「使用」，检查失败时显示错误及「重新检查缓存」，不会误判为未下载。下载将模型存入 Transformers.js 浏览器缓存并通过 WASM 加载检查，不执行 choice 判定、不保存配置。点击「使用」仅从缓存加载并测试所选后端，成功后选中 Laya；再点击「保存」应用配置。保存后重新打开，缓存完整且后端未变时显示「使用中」；切换后端需重新点击「使用」测试。仅显示按钮忙碌提示，不显示下载百分比进度条。

「删除缓存」只删除 Laya 模型文件（包括不完整下载），不清除其他模型或保存的设置，删除后恢复「下载模型」。已加载到内存的模型不会因删除缓存立即卸载，但后续加载前需重新下载。游戏运行只使用缓存，不自动下载。当前只提供 Laya 模型。

缓存不在系统下载文件夹或 localStorage，而在当前网站来源的浏览器 Cache Storage。Chrome/Edge：DevTools → Application → Cache Storage → `transformers-cache`；Firefox：开发者工具 → 存储 → 缓存存储。查找 `onnx-community/laya-multilingual-ONNX` 的 `config.json`、`tokenizer.json`、`tokenizer_config.json`、`onnx/model_fp16.onnx` 及配置要求的外部权重文件。不同浏览器、域名或端口不共享缓存。

开发注意：缓存专用加载需启用 `env.allowLocalModels`；下载时禁用网站本地模型路径查找，避免静态 SPA 将 `/models/...` 回退到首页 HTML 并触发 JSON 解析错误。删除缓存后应能重新下载，缓存缺失的游戏加载应明确报错而非请求首页。

ONNX Runtime 固定 stable `1.30.0`。用户已验证 Chrome/M1 的 WebGPU 和 Firefox/M1 的 WASM fp16 可运行；Firefox WebGPU 仍出现 Clip shader 错误。Safari 和完整三浏览器回归尚未验证。WASM 延迟较高，需要足够内存。

更新依赖后重启开发服务（必要时运行 `pnpm --filter web dev --force`），强制刷新，分别验证下载、所选后端测试、保存、中文询问和解密。浏览器间不共享模型缓存；无需主动删除已有权重。

模型加载和判定可能失败；WASM fp16 不兼容时请使用 API。超长 state 会报错，不会静默截断。关闭设置会忽略过期反馈，但 Transformers.js 的底层下载不能保证立即停止，加载完成后会释放资源。连接测试只证明模型能执行样例，不保证海龟汤判定准确；模型卡公开基准准确率约 35%。

**API Key 仅保存在当前浏览器，并直接用于请求用户配置的 Decision API。**

设置保存在 `localStorage` 的 `turtle-soup-  decision-settings` 中，读取时兼容旧的 `turtle-soup-jev-settings`；旧配置默认使用 API。只填写你信任的端点；API Key 并非加密存储，共享设备可通过 DevTools 删除该存储项。游戏进度和对话仅在内存中，刷新重新开始。

## 结构与题库

```text
apps/web/src/
  components/       游戏界面与设置弹窗
  data/puzzles.json 本地题库
  lib/              Effect runtime / Solid 适配与 localStorage
packages/core/src/
  types.ts          领域 Schema 与推导类型
  game.ts           Effect 随机抽题、询问与解密用例
  session.ts        会话状态、请求生命周期与游戏命令
  settings.ts       设置读写用例与 SettingsStorage Service
  solution.ts       关键事实评分规则
       decision.ts            Decision 判定操作与 payload
       decision-client.ts     配置绑定的 DecisionClient、HttpClient、超时与错误
       decision-schema.ts     请求、响应及动态判定约束
packages/local-model/src/
  client.ts         本地 DecisionClient Effect Layer 与资源释放
  laya.ts           Laya fp16 加载、缓存检查/删除与推理队列
  laya-encoding.ts  choice 编码、张量构建与输出校准

```

核心包使用 Effect 4 的 Schema、HttpClient、Service/Layer、Random 管理数据契约、规则与状态，不依赖 Solid、DOM 或 localStorage。`session.ts` 通过 SubscriptionRef 发布会话快照，用 scoped Fibers、请求身份与终结器处理重复提交、取消及过期结果。询问和解密用例仅返回固定的玩家可见内容与游戏状态，不返回隐藏事实。领域可选值（如前题 ID、置信度、会话错误）使用 Option；消息是按 role 区分的联合类型，仅 user 消息含 mode；模式与结果等领域分支使用 Match。

`DecisionClientLayer(settings)` 依赖 HttpClient，`DecisionClientLive(settings)` 提供 FetchHttpClient；配置在 Layer 构建时校验、规范化一次，客户端调用为 `request(payload)`，请求不再传设置。web 为每份游戏配置保留一个 ManagedRuntime，保存新配置时取消在途请求、替换并释放旧 runtime，不重置会话；退出时清理订阅、会话 Scope 与 runtime。连接测试使用独立的临时 Layer。测试可注入 DecisionClient 或 HTTP transport Layer，Effect 测试使用 @effect/vitest、TestClock 和 Fiber。

web 的 Solid signals 订阅核心快照用于渲染，并管理弹窗等 DOM 状态，不另写游戏状态机。`settings.ts` 负责 Schema JSON 编解码与设置用例；web 的 `SettingsStorageLive` 将 SettingsStorage Service 适配到 localStorage。读取允许空白草稿；保存必须通过核心校验、规范化并成功写入存储，才更新运行配置。@effect/atom-solid 4.0.0 只支持 Solid 1，因此暂不引入。共用依赖版本统一维护在 pnpm-workspace.yaml 的 catalog。浏览器消费 TypeScript 源码，由 Vite 打包。

题库：`apps/web/src/data/puzzles.json`。

```ts
interface Puzzle {
  id: string;
  title: string;
  surface: string;
  truth: string;
  keyFacts: string[];
}
```

添加新题：向数组添加对象，使用唯一 `id`，填写标题、谜面、完整真相及至少一个原子关键事实。事实必须由 `truth` 明确支持，避免仅是枝节；全部命中才算成功。题库测试会检查结构和 ID。

## 静态应用限制

谜底和关键事实实际存在于前端 bundle 中，DevTools 用户可以查看，这是 MVP 的已知限制，不提供防作弊保证。谜底和输入也会发送给配置的 Decision 服务；模型判定可能出错，不应输入敏感信息。

本地 choice 编码与校准实现参考 [open-jev laya-family](https://github.com/shreyaskarnik/open-jev/tree/baefb88e7285cde8b7d3f2aa91b1d6f297c5a282)，不依赖 open-jev 包。Laya 模型采用 Apache-2.0；参考代码许可证如下：

```text
MIT License

Copyright (c) 2026 Nico Martin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
