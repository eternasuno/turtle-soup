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

Vite 使用相对资源路径，支持仓库子路径及自定义域名。部署不需要 Jev API Key 或其他应用密钥；用户仍在浏览器中填写自己的设置。

## Jev 设置

点击「Jev 设置」，填写**完整 POST API 端点**和 API Key，再测试连接并保存。URL 不会自动追加路径。

实现原生 Jev System One 协议：Bearer 认证，请求 `{ model: "jev-latest", state, questions }`，响应 `{ answers: { [id]: { type: "choice", choice, confidence? } } }`。端点必须支持此协议、模型别名和浏览器 CORS；不支持 Chat Completions 或不兼容的请求格式。

- 询问：四选一 Choice，页面只显示固定标签。
- 解密：一个请求包含全部关键事实的独立二选一 Choice，由程序计算整体结果，不透露缺失事实。
- 测试连接会发送小型请求，可能产生费用。
- 30 秒超时；失败可重试；放弃、换题或退出时取消请求并忽略过期结果。

**API Key 仅保存在当前浏览器，并直接用于请求用户配置的 Jev API。**

设置保存在 `localStorage` 的 `turtle-soup-jev-settings` 中。只填写你信任的端点；API Key 并非加密存储，共享设备可通过 DevTools 删除该存储项。游戏进度和对话仅在内存中，刷新重新开始。

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
  jev.ts            Jev 判定操作与 payload
  jev-client.ts     配置绑定的 JevClient、HttpClient、超时与错误
  jev-schema.ts     请求、响应及动态判定约束
```

核心包使用 Effect 4 的 Schema、HttpClient、Service/Layer、Random 管理数据契约、规则与状态，不依赖 Solid、DOM 或 localStorage。`session.ts` 通过 SubscriptionRef 发布会话快照，用 scoped Fibers、请求身份与终结器处理重复提交、取消及过期结果。询问和解密用例仅返回固定的玩家可见内容与游戏状态，不返回隐藏事实。领域可选值（如前题 ID、置信度、会话错误）使用 Option；消息是按 role 区分的联合类型，仅 user 消息含 mode；模式与结果等领域分支使用 Match。

`JevClientLayer(settings)` 依赖 HttpClient，`JevClientLive(settings)` 提供 FetchHttpClient；配置在 Layer 构建时校验、规范化一次，客户端调用为 `request(payload)`，请求不再传设置。web 为每份游戏配置保留一个 ManagedRuntime，保存新配置时取消在途请求、替换并释放旧 runtime，不重置会话；退出时清理订阅、会话 Scope 与 runtime。连接测试使用独立的临时 Layer。测试可注入 JevClient 或 HTTP transport Layer，Effect 测试使用 @effect/vitest、TestClock 和 Fiber。

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

谜底和关键事实实际存在于前端 bundle 中，DevTools 用户可以查看，这是 MVP 的已知限制，不提供防作弊保证。谜底和输入也会发送给配置的 Jev 服务；模型判定可能出错，不应输入敏感信息。

## License

沿用根目录 MIT License。本版四道题未复制或改编 `wangyufanshuai/turtle-soup` 仓库内容（第一道根据需求示例改写，其余为原创），没有引入该仓库版权材料。后续如果复制或改编第三方 MIT 题库，必须随分发保留原作者版权声明和完整 MIT 许可，不能只注明仓库地址。
