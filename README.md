# 海龟汤 MVP

SolidJS **1.9.17** + **@effect/atom-solid 4.0.0**、TypeScript、Vite、Tailwind CSS 和 DaisyUI 的纯静态推理游戏。保留 pnpm / Turborepo workspace，核心状态使用 Effect，界面通过 atom-solid 订阅会话快照，Solid signals 管理设置和展示状态；没有后端、数据库、SSR、登录或路由。

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

点击「Decision 设置」，选择 API 模式时填写**完整 POST API 端点**、API Key 和 API Model（默认 `jev-latest`，对应设置字段 `apiModel`），再点击「保存」。URL 不会自动追加路径。

API 模式保留原生 Jev System One 协议：Bearer 认证，请求 `{ model: apiModel, state, questions }`，响应 `{ answers: { [id]: { type: "choice", choice, confidence? } } }`。端点必须支持此协议、所填模型名和浏览器 CORS；不支持 Chat Completions 或不兼容的请求格式。

- 询问：四选一 Choice，页面只显示固定标签。
- 解密：一个请求包含全部关键事实的独立二选一 Choice，由程序计算整体结果，不透露缺失事实。
- API 请求可能产生费用；设置底部不再提供单独的测试按钮。
- API 请求 30 秒超时；失败可重试；放弃、换题或退出时取消请求并忽略过期结果。

选择「本地模型」后，可选择以下三个模型及 WebGPU（速度优先）或 WASM/CPU（兼容性优先）；旧配置默认 Laya / WASM。

| 模型 ID | WASM | WebGPU | 权重与输入限制 |
| --- | --- | --- | --- |
| `onnx-community/laya-multilingual-ONNX` | fp16 | fp16 | 约 650 MB，不自动下载 fp32；超长 state 拒绝而非截断 |
| `Manav2op/verdict-small` | q8 | fp16 | 下载同时准备两套权重；每个 query / passage 各最多 512 tokens，超长文本拒绝而非截断 |
| `onnx-community/d1-omni-600M-ONNX` | q8 | q8 | 仅文本 ONNX 与 external data；完整 prompt（含 state、问题和选项）最多 16384 tokens，超长拒绝而非截断，不下载图像/音频权重 |

模型卡片检查所选模型的实际浏览器缓存：文件不完整时显示「下载模型」，完整时显示「使用」，检查失败时显示错误及「重新检查缓存」，不会误判为未下载。切换模型须重新检查缓存。下载仅准备所选模型的文件（Verdict 包括 q8 和 fp16），不执行 choice 判定、不保存配置；各模型下载与缓存互相隔离。点击「使用」仅从缓存加载并测试所选模型及后端，成功后选中；再点击「保存」应用配置。保存后重新打开，只有缓存完整且模型、后端均匹配已保存配置才显示「使用中」；更换模型或后端需重新测试。

「删除缓存」只删除所选模型文件（包括不完整下载），不清除其他模型或保存的设置，删除后恢复「下载模型」。已加载到内存的模型不会因删除缓存立即卸载，但后续加载前需重新下载。游戏运行只使用所选后端所需的缓存，不自动下载。

缓存不在系统下载文件夹或 localStorage，而在当前网站来源的浏览器 Cache Storage。Chrome/Edge：DevTools → Application → Cache Storage → `transformers-cache`；Firefox：开发者工具 → 存储 → 缓存存储。按上表模型 ID 查找配置、tokenizer、ONNX 及所需 external data 文件。不同浏览器、域名或端口不共享缓存。

开发注意：缓存专用加载需启用 `env.allowLocalModels`；下载时禁用网站本地模型路径查找，避免静态 SPA 将 `/models/...` 回退到首页 HTML 并触发 JSON 解析错误。删除缓存后应能重新下载，缓存缺失的游戏加载应明确报错而非请求首页。

本地模型加载、推理、连接测试和下载均在 Worker 中运行。取消会移除排队请求并忽略已开始推理的结果，不保证立即中止底层计算；初始化取消、配置替换或 dispose 会终止对应 Worker，关闭设置也会取消工作并忽略过期反馈。

ONNX Runtime 固定 stable `1.30.0`。历史上用户已验证旧 Laya 实现的 Chrome/M1 WebGPU 和 Firefox/M1 WASM fp16 可运行；Firefox WebGPU 出现过 Clip shader 错误。这不是新模型或当前 Worker 实现的真实验证：此次验证均使用 mocks，未加载真实模型、未进行浏览器验证；Safari 和完整三浏览器回归仍未验证。WASM 延迟较高，需要足够内存。

更新依赖后重启开发服务（必要时运行 `pnpm --filter web dev --force`），强制刷新，分别验证各模型的下载、所选后端测试、保存、中文询问和解密。浏览器间不共享模型缓存；无需主动删除已有权重。

模型加载和判定可能失败；后端不兼容时请使用 API。连接测试只证明模型能执行样例，不保证海龟汤判定准确；历史 Laya 模型卡公开基准准确率约 35%，不能推广到其他模型。

**API Key 仅保存在当前浏览器，并直接用于请求用户配置的 Decision API。**

设置保存在 `localStorage` 的 `turtle-soup-decision-settings` 中，读取时兼容旧的 `turtle-soup-jev-settings`；旧配置默认使用 API。只填写你信任的端点；API Key 并非加密存储，共享设备可通过 DevTools 删除该存储项。游戏进度和对话仅在内存中，刷新重新开始。

## 结构与题库

```text
apps/web/src/
  components/       游戏界面与设置弹窗
  data/puzzles.json 本地题库
  lib/              runtime / atom-solid 适配、配置测试与 localStorage
packages/core/src/
  types.ts          领域 Schema、PuzzleView、配置判别 union
  game.ts           Effect 随机抽题、询问与解密用例
  session.ts        会话状态、请求生命周期与游戏命令
  settings.ts       设置读写、配置解析与 SettingsStorage Service
  model-management.ts save/test/prepare 用例与资源/测试能力接口
  solution.ts       关键事实评分规则
  decision.ts       official Effect Decision / DecisionModel 判定
  decision-provider.ts Jev DecisionModel provider 适配
  decision-client.ts HTTP 内部传输、超时与错误
  decision-schema.ts Jev 请求、响应及动态判定约束
packages/local-model/src/
  client.ts         LayaDecisionModelLayer 与 scoped 资源释放
  resources.ts      LocalModelResourcesLive 浏览器缓存适配
  laya.ts / verdict.ts / d1.ts 各模型加载与推理
  model-cache.ts    按模型隔离的缓存检查、下载与删除
  worker-client.ts / laya.worker.ts Worker 生命周期与任务队列
  laya-encoding.ts  choice 编码、张量构建与输出校准
```

核心包使用 Effect 4 的 Schema、Service/Layer、Random 和 official `effect/ai` 的 `Decision` / `DecisionModel`，不依赖 Solid、DOM 或 localStorage。游戏用例统一依赖 `DecisionModel.DecisionModel`：API 使用 `JevDecisionModelLayer` / `JevDecisionModelLive`，本地使用 `LayaDecisionModelLayer`。`DecisionClient.request(payload)` 是 Jev HTTP 内部传输接口，不再是游戏的统一模型边界。Jev choice 缺少 `probabilities` 时 provider 补 one-hot 分布，仅用于满足统一契约，不是真实概率或校准置信度；评分仍仅依据 matched 标签，全部判定点命中才成功，不因概率改变评分。

`session.ts` 通过 SubscriptionRef 发布快照，用 scoped Fibers、请求身份与终结器处理重复提交、取消及过期结果。完整 `PuzzleDefinition`（`Puzzle` 别名）只留在核心会话内部；快照只含 `PuzzleView`（id/title/surface），`result: Option<GameResult>` 仅在解密成功或放弃后提供 truth/reason，不暴露 judgmentPoints。部分解密不指出缺失事实。领域可选值使用 Option，消息按 role 区分（只有 user 有 mode）。

web 每个游戏 owner 保有一个 AtomRegistry，用 atom-solid 的 RegistryContext/useAtomValue 读取会话快照；同步命令刷新 registry，避免另写游戏状态机。每份运行配置复用一个 ManagedRuntime；保存成功后取消请求、替换并释放旧 runtime，不重置会话。退出时取消请求、dispose registry、关闭会话 Scope 并释放 runtime。配置测试用独立临时 Layer，不替换游戏 runtime；本地模型由 Layer 的 acquireRelease 释放。

`DecisionSettings` 是兼容旧存储的草稿 Schema，允许空白 URL/key 和缺省 provider/apiModel/modelId/backend；不是有效运行配置。`resolveDecisionConfiguration` 产生按 provider 判别的 `DecisionConfiguration`：API 为 url/model/Redacted key，本地为 modelId/backend；缺省为 API、jev-latest、Laya 和 WASM。Redacted 只保护运行值的常规展示，不加密 localStorage。`saveSettings` 校验、规范化并成功写入后才返回可应用设置；旧草稿与旧存储 key 读取兼容。

管理流程保留少量用例：`saveSettings` 负责保存，`testDecisionConfiguration` 通过 DecisionConfigurationTester 测试，`prepareLocalModel` 通过 LocalModelResources 检查→必要时下载→复查。inspect/download/remove 是资源能力，不要为每个按钮机械拆出用例；浏览器实现留在 local-model/web。共用依赖版本统一维护在 pnpm-workspace.yaml 的 catalog。

题库：`apps/web/src/data/puzzles.json`。

```ts
interface Puzzle {
  id: string;
  title: string;
  surface: string;
  truth: string;
  judgmentPoints: { id: string; description: string }[];
}
```

添加新题：向数组添加对象，使用唯一 `id`，填写标题、谜面、完整真相及至少一个 `judgmentPoints` 原子判定点。每点 id/description 均须非空，点 ID 在同一道题内唯一（description 不要求唯一）；描述必须由 `truth` 明确支持，避免仅是枝节。全部命中才算成功。题库测试检查结构和题目 ID，Schema 检查判定点 ID 唯一性。

## 静态应用限制

谜底和关键事实实际存在于前端 bundle 中，DevTools 用户可以查看，这是 MVP 的已知限制，不提供防作弊保证。谜底和输入也会发送给配置的 Decision 服务；模型判定可能出错，不应输入敏感信息。

本地 choice 编码与校准实现参考 [open-jev laya-family](https://github.com/shreyaskarnik/open-jev/tree/baefb88e7285cde8b7d3f2aa91b1d6f297c5a282)，不依赖 open-jev 包。Laya 和 Verdict 模型采用 Apache-2.0；d1 使用 [LFM Open License v1.0](https://huggingface.co/onnx-community/d1-omni-600M-ONNX/blob/main/LICENSE)，不是 Apache-2.0，商业使用受年收入 1000 万美元门槛约束，使用前须核对许可证第 5 条。参考代码许可证如下：

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
