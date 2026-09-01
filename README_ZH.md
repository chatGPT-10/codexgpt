<p align="center">
  <img src="docs/favicon.svg" width="72" height="72" alt="CodexGPT logo">
</p>

<h1 align="center">CodexGPT</h1>

<p align="center">
  让 ChatGPT Web 看见你的本地仓库，并像本地代码代理一样工作。
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/codexgpt"><img alt="npm" src="https://img.shields.io/npm/v/codexgpt?style=flat-square"></a>
  <a href="https://github.com/chatGPT-10/codexgpt/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/chatGPT-10/codexgpt/ci.yml?branch=main&style=flat-square"></a>
  <a href="https://github.com/chatGPT-10/codexgpt/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/chatGPT-10/codexgpt?style=flat-square"></a>
  <a href="https://rebel0789.github.io/codexgpt/zh.html"><img alt="中文站点" src="https://img.shields.io/badge/site-%E4%B8%AD%E6%96%87%E6%96%87%E6%A1%A3-67e8f9?style=flat-square"></a>
</p>

<p align="center">
  <a href="README.md">English</a>
  ·
  <a href="https://rebel0789.github.io/codexgpt/zh.html">中文网站</a>
  ·
  <a href="https://github.com/chatGPT-10/codexgpt">GitHub 点星</a>
  ·
  <a href="https://www.npmjs.com/package/codexgpt">npm</a>
  ·
  <a href="DOMAIN_SETUP.md">稳定 URL 指南</a>
  ·
  <a href="FAQ_ZH.md">中文 FAQ</a>
  ·
  <a href="SECURITY.md">安全说明</a>
</p>

## 当前项目状态

- 首个稳定版本为 `codexgpt@1.0.0`；当前 npm 补丁版本为 `codexgpt@1.0.5`。package metadata、runtime 自报版本与 npm `latest` 必须保持一致；每个发布版本还必须能对应到精确 source commit。
- Phase 5、Phase 6 和 Phase 7 Core 均已通过完整 Ubuntu/Windows Node 20/24 验证矩阵并正式关闭。Phase 7 Core 的关闭提交为 `a0b9f46e2297297959527f7570c9cb7942cc8fb3`，exact-head CI run 为 `30171313296`；Contract V5 仍是显式 `standard` opt-in，不是默认公开契约。
- Phase 8 Tasks 8A1–8A9 已在 source checkout 中实现并完成本地验证：Windows DPAPI CurrentUser 状态保护、物理分离的 public/local listener、受限 DCR + PKCE S256、ES256 access token、rotating refresh family、durable revoke/replay、request-local policy identity、精确 per-tool scope、受支持的 setup/本地管理/恢复、专用 Tunnel ownership 检查、迁移与回滚文档、package integration、合成端到端 OAuth/MCP 验证，以及完成态 runtime 对抗性修复。真实 Gate G8-U 已通过 Journeys U2–U7，STEP-470 也已通过修复后的 managed Node 20/24 ordinary 与 protected Smoke 完成本地 G8-X。U6 已通过 service/protocol 双路由回滚、重建 Legacy App 的真实读取、精确无参数 OAuth 恢复，以及恢复后现有 OAuth App 的真实读取；已删除的原 Legacy App 身份连续性不作宣称。U7 已证明 shared/unowned Tunnel config 在任何 mutation 前失败并保持字节不变，同时完成 live public-loopback/local-admin 边界验收。Phase 8 exact-head closure 已在 `55b2b5664aae322ec992968a41c87a289fb75282`、CI run `30274857996` 通过；`1.0.0` 打包这一已验证基线。

## 安装

CodexGPT 需要 Node.js 20+，以及能使用 Apps / Developer Mode 的 ChatGPT 账号。可用性取决于账户计划、工作区设置和产品 rollout；请以 ChatGPT 当前界面显示的资格为准。

先安装 CLI：

```bash
npm install -g codexgpt
```

npm badge 与 package metadata 均应显示 `1.0.5`。source checkout 用于开发、验证特定 commit/branch，或使用 npm package 尚未包含的改动；依赖它之前先核对 package version 与 commit。

已有 source checkout 时，使用仓库脚本以保留公开入口层：

```powershell
Set-Location D:\Dev\codexgpt
npm install
npm run build
npm run connect:setup -- --root D:\Dev\your-repo
```

之后从该 source checkout 日常启动：

```powershell
npm run connect -- --root D:\Dev\your-repo
```

## OAuth 一条命令设置

迁移期间保留现有 Legacy App，并另外创建 OAuth App。所有 OAuth 命令都必须通过 `--root` 绑定到精确目标仓库。

已发布的全局安装：

```powershell
codexgpt auth setup `
  --root D:\Dev\your-repo `
  --hostname mcp.example.com `
  --tunnel-name codexgpt
```

源码检出（开发或分支版本）：

```powershell
Set-Location D:\Dev\codexgpt
npm install
npm run build
node .\scripts\codexgpt-entry.mjs auth setup `
  --root D:\Dev\your-repo `
  --hostname mcp.example.com `
  --tunnel-name codexgpt
```

该流程要求稳定的 named Cloudflare Tunnel。它只复用 owner marker 与当前 workspace/deployment 精确匹配的专用 Tunnel；setup journal 支持续跑；OAuth mode 只在 candidate listener 的公开 metadata、JWKS 和 health 完成外部探测后才提交。Cloudflare/DNS 变更会先打印并要求明确批准；使用 `--no-tunnel-changes` 可执行确定性的无外部变更预检。

ChatGPT Server URL 不含 token：

```text
https://mcp.example.com/mcp
```

在 ChatGPT Web 中启用 Developer Mode，创建 custom App，粘贴该 URL，选择 OAuth（若界面显示），执行 **Scan Tools**，并完成浏览器授权。首次 grant 必须在 Windows PC 本地批准：

```powershell
codexgpt auth pending --root D:\Dev\your-repo
codexgpt auth open --root D:\Dev\your-repo
# 或批准界面显示的 correlation code：
codexgpt auth approve <correlation-code> --root D:\Dev\your-repo
```

正常前台重启保持 issuer、binding、Tunnel、client 和 refresh family 不变：

```powershell
codexgpt start --root D:\Dev\your-repo
```

仅 scope 改变不要求 **Scan Tools**。启用或移除 tool descriptor/capability 时，必须先针对精确 `--root` 重启；如果 App 工具快照发生变化，再执行一次 **Scan Tools**。旧 token 不会因为本地新增 capability 而自动获得权限。

常用管理命令：

```powershell
codexgpt auth status --root D:\Dev\your-repo
codexgpt auth clients --root D:\Dev\your-repo
codexgpt auth client remove <client-id> --root D:\Dev\your-repo
codexgpt auth revoke <grant-id> --root D:\Dev\your-repo
codexgpt auth rotate-signing-key --root D:\Dev\your-repo
codexgpt auth recover inspect --root D:\Dev\your-repo
```

backup restore 与 `auth reinitialize --revoke-all` 会保留 stable binding 和专用 Tunnel，发布新的 incarnation/key authority，使全部旧 access/refresh credential 失效并强制 relink；它们不会复活旧 grant。DPAPI 只绑定当前 Windows user profile；其他用户、丢失的 profile，以及同一用户权限下的恶意进程不在其保护边界内。

### 双 App 回滚与返回 OAuth

Phase 8 Core 迁移期间不得删除 Legacy App 或旧凭据。回滚时，先停止当前 OAuth 前台进程，只切换 workspace profile，重启后使用单独保留的 Legacy App：

```powershell
codexgpt auth rollback --root D:\Dev\your-repo
codexgpt start --root D:\Dev\your-repo
```

服务重启不会自动让 ChatGPT 客户端回滚。OAuth App 不会获得 legacy query-token URL；OAuth state、key、grant、client、audit、Tunnel config 和 owner marker 均保留。

使用保留的 OAuth App 幂等返回 OAuth：

```powershell
codexgpt auth setup --root D:\Dev\your-repo
```

命令会推导已保存的 hostname、Tunnel、port 与 ownership marker，并在重新提交 OAuth mode 前探测 candidate public surface。Profile 现在分别保存不含凭据的 `authRoutes.legacy` 与 `authRoutes.oauth`，所以回滚会切换完整 route，而不是只改 `authMode` 后在 OAuth hostname 上运行 Legacy authentication。旧 profile 若缺少 retained Legacy route 会 fail closed，并要求一次显式 route migration；query token 不会被复制进 route selector。

若环境变量覆盖 profile，先清除再重启：

```powershell
Remove-Item Env:CODEXGPT_AUTH_MODE -ErrorAction SilentlyContinue
[Environment]::SetEnvironmentVariable('CODEXGPT_AUTH_MODE', $null, 'User')
```

public listener 默认是 `127.0.0.1:8787`；owner administration 使用物理分离的 `127.0.0.1:8788`，不得通过 Cloudflare 暴露。Quick Tunnel 的 hostname 每次变化，因此不适用。项目不宣称 ChatGPT static Bearer、Cloudflare Access、mTLS、多 owner tenancy 或 OS isolation。

截至 2026-07-26，OpenAI 官方说明要求在 ChatGPT Web 的 Apps/Developer Mode 中创建 custom App，并通过 **Scan Tools** 刷新工具；可用性取决于 plan/workspace。官方同时建议支持 refresh token，并对 OIDC provider 建议声明 `offline_access`。CodexGPT 是 OAuth authorization server 而不是 OIDC provider，并签发 rotating refresh token。Journeys U2–U4 已通过 DCR/连接、本地批准、scope reauthorization、descriptor refresh、post-restart refresh continuity 与本地 revoke/relink。Journey U5 已通过真实 denial、replay、bounded admission、环境变量覆盖与 verified-backup recovery；Recovery 仍是有意的 security reset：stable binding、hostname 与 Tunnel 保持不变，所有旧 client/grant/token authority 失效。U6 已通过 separate-route Legacy/OAuth round-trip、exact OAuth schemes、query-token denial、重建 Legacy App 的真实读取、精确 OAuth 返回，以及现有 OAuth App 的返回后读取；已删除的原 Legacy App 身份连续性不作宣称。U7 已通过 shared/unowned Tunnel config 的 fail-early 字节保持拒绝和 live public-loopback/local-admin 边界验收。Gate G8-U、本地 G8-X 与 exact-head Ubuntu/Windows Node 20/24 CI 均已完成，关闭基线为 `55b2b5664aae322ec992968a41c87a289fb75282` / run `30274857996`。

## Legacy query-token 兼容设置

进入你想让 ChatGPT 工作的仓库，然后运行 setup：

```bash
cd /path/to/your/repo
codexgpt setup
```

CodexGPT 会尝试复制包含 `codexgpt_token` query 凭据的完整 ChatGPT Server URL，但启动日志默认隐藏这个秘密 URL。剪贴板不可用时，在 CodexGPT 终端按 `u` 显式显示。在 ChatGPT 当前的 Apps / Plugins 连接管理页面创建连接；若界面提供 Developer Mode，先启用它。粘贴完整 URL；若表单显示 Authentication，选择 `No Authentication / None`。

本节只描述保留的 Legacy App URL-token 流程，不要删除其中的 `codexgpt_token`。前文的 source-checkout OAuth 路径已有独立真实 G8-U 证据，并使用另一个保留的 App 与 token-free URL；不要混用两种模式，也不要改成手动 static Bearer。请把 Legacy App 的完整 URL 当成等同密码的秘密：它可能泄露到浏览器历史、剪贴板、截图、日志和复制的链接中。不要分享、发布或提交这个 URL。

以后同一个仓库日常启动只需要：

```bash
codexgpt start
```

CodexGPT 把 ChatGPT Developer Mode 变成本地仓库的 MCP 代码代理。ChatGPT 可以读取文件、搜索代码、查看 git 状态、写入或精确编辑文件，并运行安全范围内的验证命令。

CodexGPT 不是速率限制绕过工具。它不会绕过、提升、合并、转售或修改 ChatGPT、Codex、OpenAI 或第三方模型的限制。它只是通过官方 Developer Mode / MCP App 路径，把你自己的 ChatGPT 会话连接到你自己的本地仓库。

如果 Codex 当前工作流暂时不可用，而你的 ChatGPT 页面仍然可用，CodexGPT 可以让你继续在同一个本地仓库上工作。反过来也一样：ChatGPT 负责高上下文规划，Codex、OpenCode、Pi 或其他本地执行器负责终端里的实际执行。

## 适合谁

CodexGPT 适合已经有 ChatGPT Apps / Developer Mode 权限并希望做本地开发的人：

- 想让 ChatGPT Web 直接读取本地代码，而不是反复复制文件片段。
- 想把 `AGENTS.md`、`.ai-bridge`、git diff、源码文件这些 Codex 风格上下文给 ChatGPT。
- 想在 ChatGPT 里完成规划、审查、改小文件、跑安全验证。
- 想在某些模型不能调用工具时，导出一个持久上下文包给它做规划。
- 想把 ChatGPT 的计划交给 Codex、OpenCode、Pi 或自定义本地代理执行。

请以 ChatGPT 当前界面是否显示 Apps / Developer Mode 或连接管理入口为准。可用性会受账号、工作区策略和 rollout 影响，CodexGPT 不会解锁这些能力。

## 它能做什么

```text
ChatGPT Web 可以看到：
  AGENTS.md
  .ai-bridge 计划、状态和执行记录
  git status
  show_changes 审查摘要和可选 diff
  文件树、搜索结果、指定源码文件

ChatGPT Web 可以操作：
  read    读取文件
  search  搜索代码
  write   在工作区内写文件
  edit    精确替换文本
  bash    运行安全验证命令
  show_changes 查看当前改动摘要

本地执行器仍然有价值：
  Codex / OpenCode / Pi 执行计划
  终端重任务留在本地
  ChatGPT 回看执行结果和 diff
```

默认 `CODEXGPT_TOOL_MODE=standard`，只暴露常用编码循环、`codexgpt_self_test`、`show_changes`、上下文导出和 handoff。演示时可以用 `--tool-mode minimal`，需要完整兼容工具时用 `--tool-mode full`。

默认工具数量较少是故意的：ChatGPT 面对少量高信号工具时更稳定。Phase 6 项目指导现在默认启用，直接运行 `codexgpt start` 即可。首次 workspace open 的模型侧 `context_snapshot` 只给出指令路径和 implicit-eligible workspace Skill 元数据，不重复正文；既有结构化兼容字段仍保留根指导。首次修改前，ChatGPT 必须调用 `codex_context(target_path)` 获取精确的 root-to-target 指令链和 target-scoped `.agents/skills`，再用返回的同一个 `target_path` 最多加载一个匹配 Skill。Skill 正文及 `references/`、`scripts/`、`assets/` 文本按需加载，任何脚本、依赖或 metadata 都不会自动执行。user/plugin Skills 默认不暴露，只有工具调用显式请求 global discovery（例如 `include_global_skills=true` 或 `source: "user"`）才扫描。要有意加载已配置的用户级 Skill，请在 `load_skill` 中传入 `source: "user"`，并提供其 `name` 或显示出来的 selector，例如 `$CODEX_DIR/skills/neat-freak/SKILL.md`；该读取只限于配置的用户 Skill root，不会增加 workspace root，也不会改变 `--allow-root`。

普通代码定位统一使用 `semantic` 的 `operation: "navigate"`（或 V5 `codexgpt` 的 `action: "navigate_code"`；其 `args` 只需 intent/query 等导航字段）。服务端会按 `definition`、`references`、`implementation`、`text`、`file`、`diagnostics` 意图，在自有 semantic provider、有界 lexical search 与文件发现之间选择路径。只有明确需要原始目录层级时才直接用 `tree`，明确需要原始词法命中时才直接用 `search`。修改与进程边界保持独立：整文件替换用 `write`，单处精确替换用 `edit`，多位置协调修改用 `apply_patch`，有限验证用 `run_command`，持久或交互任务用仅 full mode 可用的 `start_process`。这些说明不会增加权限或绕过审批。

Phase 6 更新前创建的 App 可能保留冻结的旧工具快照；此时需要执行一次 **Scan Tools** 或重建该 App，不宣称透明自动刷新。若旧快照中已有稳定的 `codexgpt` supertool，它仍可兼容调用 `open` 和 `codex_context`。同一二进制回滚只需设置 `$env:CODEXGPT_GUIDANCE_MODE = "legacy"` 并重启。`codexgpt doctor` 会报告 readiness、无效 metadata、命名冲突及 scan/catalog 截断。省略该变量时现在使用 `standard`；由于 `minimal` 不暴露 `codex_context`，省略 guidance 配置的 `--tool-mode minimal` 会使用精确的 legacy 兼容投影，显式 `standard + minimal` 则在启动时失败。

### Phase 7 Core 语义导航

Phase 7 Core 新增显式 `standard` 的 Contract V5，并通过一个零配置 `semantic` 工具为 JavaScript/TypeScript 提供定义、引用、单文件诊断和重命名预览。只有符号唯一时才允许省略路径；名称有歧义时返回有界候选，不会猜测。结果只显示工作区相对路径，并明确返回 `actual_provider` 与 `result_quality`，因此 lexical fallback 不会伪装成语义结果。

P3 在不增加第 53 个直接工具、且保持 V1–V5 精确数量 `28/31/39/51/52` 的前提下，增加兼容的高层 `navigate` 操作。标准化结果强制返回实际 `provider`、`quality`、`fallback` 和 `truncated`：TypeScript 定义/引用优先使用自有 semantic provider；Python、provider 不可用/崩溃或分析期间 source stale 时，重新执行有界 lexical search 并明确标记 `lexical_fallback`；文本与文件名直接走对应 lexical backend；诊断不存在可靠 lexical 等价物，因此不会伪造 fallback。既有 `definition`、`references`、`diagnostics`、`rename_preview` 调用保持不变。

P4 在不增加直接工具的前提下闭合修改流程。V5 的 `write`、`edit`、`apply_patch`、`move_paths` 或 `undo_change_set` 提交成功后，会在 `data.workflow` 返回精确 change set、变更路径、当前已确认的项目检查和待完成的 diff 复核；系统不会自动执行命令。当 Contract V5、`codexgpt` wrapper 与可用的 `full_access` execution profile 同时就绪时，显式调用 `codexgpt(action="verify_change")`，且只能选择结果中返回的检查类别；服务端会重新确认 P2 命令，并复用原有受 Policy、审批和审计保护的 `run_command` 链路。这不要求 full tool mode：standard tool mode 已暴露有限 `run_command` 路径，但 execution profile 与本机审批仍决定命令能否执行。随后使用相同 `change_set_id` 调用 `show_changes`，并设置 `include_diff=true`、`mark_reviewed=true`。返回的清单要求在完整 diff 中检查 unexpected files、formatting、generated artifacts、dependency changes 与 accidental deletion，不会用路径启发式伪造自动批准。验证到达终态且完整 workspace diff 已检查时 `complete=true`，只有验证通过时才 `ready=true`。V1–V4 保持精确，V5 仍是 52 个直接工具。

P5 在不增加工具或权限的前提下完成本地长任务/进程体验。V5 进程成功结果统一使用 `starting | running | exited | failed | terminated` 生命周期；`state` 是权威字段，保留的 `status` 只是值必须相等的迁移别名。后端启动和 required start audit 尚未完成时，`list_processes` 可以真实显示 `starting`，但 `start_process` 只有进入 `running` 后才会成功返回。启动期间撤销、workspace/transport 关闭、到期、显式终止与服务退出都会 join 现有进程生命周期和 Job 进程树清理。V3/V4 wire shape 保持精确。

若现有 V5 App 已有开放 schema 的稳定 `codexgpt` wrapper，服务端更新后即可用 `action: "navigate_code"`。若要直接调用 `semantic(operation="navigate")`，ChatGPT 仍需一次单独授权的 **Scan Tools（扫描工具）** 或重建 App，以取得新增 descriptor 字段；本次仓库修改不会执行该刷新。

为当前工作区启用 builtin engine 后重启；已有 51 工具快照的 ChatGPT App 需要执行一次 **Scan Tools（扫描工具）** 或重建 App：

```powershell
codexgpt semantic use builtin
codexgpt start
```

本地查看健康状态、engine 版本和有界 worker 参数：

```powershell
codexgpt semantic status
codexgpt semantic status --verbose
```

重命名分为两个明确步骤。`semantic` 的 `rename_preview` 只生成完整、绑定文件 hash 与稳定 identity 的内存计划，不写文件；随后 V5 `apply_patch` 使用一次性 `semantic_preview_id`，通过现有审批、原子事务、audit、change set、review 和 undo 路径整体提交。预览不是审批，Provider 也不能获得工作区或 mutation 权限。

同一 binary 的回滚只需禁用并重启，普通 read/search/edit 不受影响：

```powershell
codexgpt semantic disable
codexgpt start
```

builtin worker 仍以当前 Windows 用户权限运行，不是 execution、filesystem、credential 或 network sandbox。Serena 与直接 LSP 仍是未实现、未捆绑的 post-Core 扩展，本功能不会安装它们。

CodexGPT 默认给 ChatGPT 暴露纯 MCP 工具描述，不附带 widget/card metadata。需要紧凑 v9 卡片时用 `CODEXGPT_TOOL_CARDS=1` 启动；server config、自测、workspace 摘要、读写 diff、bash 验证、git/tree/search/context 和 handoff/export 都有结构化视图。git、skills、tree、terminal 输出、context 和 raw diff 会折叠或截断，避免在聊天里刷出大段原始数据。`CODEXGPT_WIDGET_DOMAIN` 用于设置 ChatGPT widget iframe 的专用 HTTPS origin，正式提交 app 前应换成你控制的独立域名。

## 其他启动方式

不想全局安装时，也可以用：

```bash
npx codexgpt@latest start --root /absolute/path/to/your/repo
```

但普通用户更推荐全局安装，这样命令就是固定的 `codexgpt setup` 和 `codexgpt start`。

## ChatGPT 中的 App 设置

打开 ChatGPT 当前的 Apps / Plugins 连接管理页面；若界面提供 Developer Mode，先启用它：

```text
ChatGPT Settings -> Plugins / Apps -> + / Create
```

若当前 Developer Mode 页面显示 CSP 开关，保持开启。CodexGPT 的卡片和小组件就是按 CSP 开启的路径设计的，不需要远程脚本、外部字体、iframe 或第三方图片。

在创建 Plugin 页面填写：

```text
Name: CodexGPT
Description: Local workspace bridge for ChatGPT coding
Connection: Server URL
Server URL: 粘贴 CodexGPT 自动复制的完整地址，包括 codexgpt_token query string
Authentication: No Authentication / None（若显示该字段）
```

不要删除 URL 的 query string。这个完整 URL 就是当前个人 ChatGPT 兼容流程的凭据；ChatGPT Web 不需要、也不应按照本指南手动配置静态 Bearer header。

保持终端里的 CodexGPT 进程运行。你停止它之后，ChatGPT 就无法继续连接本地仓库。Cloudflare quick tunnel 的 URL 也会失效。

## 三种主要模式

### 1. Normal coding

默认模式。ChatGPT 可以在工作区内读取、搜索、写入、精确编辑文件，并运行安全验证命令。

```bash
codexgpt start
```

适合小改动、文档更新、定位 bug、查看 diff、跑 lint/test/build。

如果你正在另一个 Codex 会话里工作，不希望 ChatGPT 触发任何 shell 命令，用：

```bash
codexgpt start --no-bash
```

如果想保留 bash，但要求 ChatGPT 明确命中你启动的这个 CodexGPT 终端会话标签，用：

```bash
codexgpt start --bash-session main --require-bash-session
```

开启后，`bash` 工具调用必须带上 `session_id: "main"` 才会执行。

### 2. Handoff

规划模式。ChatGPT 不直接写源码，只写入：

```text
.ai-bridge/current-plan.md
```

然后你在本地终端决定是否执行：

```bash
codexgpt execute-handoff --agent opencode --model provider/model --dry-run
codexgpt execute-handoff --agent opencode --model provider/model
```

也可以启动监听器，让本地终端在计划变更后执行：

```bash
codexgpt start --mode handoff
codexgpt start --mode handoff --no-bash
codexgpt watch-handoff --agent opencode --model provider/model --yes
```

执行结果会写回：

```text
.ai-bridge/agent-status.md
.ai-bridge/implementation-diff.patch
.ai-bridge/execution-log.jsonl
```

然后让 ChatGPT 通过 `read_handoff` 或 `codex_context` 审查结果。

### 3. Pro context fallback

有些 ChatGPT 模型或产品界面不能直接调用 Developer Mode Apps、连接器或 MCP 工具。即使同一个符合条件的账号可以创建 CodexGPT app，某个具体模型界面仍然可能没有工具调用能力。

这时不要强行让它调用工具。先导出一个持久上下文包：

```bash
codexgpt pro-bundle --root /absolute/path/to/your/repo --copy
```

它会写入：

```text
.ai-bridge/pro-context.md
```

把这个上下文粘贴给不能调用工具的模型，让它产出窄范围实现计划。然后保存计划并应用：

```bash
codexgpt pro-apply --root /absolute/path/to/your/repo --file plan.md
```

这会写入 `.ai-bridge/current-plan.md`，再交给 Codex、OpenCode、Pi 或自定义本地代理执行。

如果你的 ChatGPT 账号已经在 Web 产品里提供 GPT-5.5 或更强模型，并且该模型界面可以调用 Developer Mode Apps，CodexGPT 可以让它通过 MCP 使用本地仓库工具。CodexGPT 不提供、不代理、不转售、也不解锁模型。

## Legacy query-token 的稳定 URL 怎么选

推荐的 OAuth 路径只使用前文 `codexgpt auth setup` 创建或验证的专用 Cloudflare named Tunnel。若你仍保留 Legacy query-token App，它有三个常用 URL 选择：

```text
Cloudflare quick tunnel   Legacy 最快演示路径。每次重启 URL 都变。
ngrok free dev domain     Legacy 的简单稳定 URL。免费账号给一个 dev domain。
Cloudflare named tunnel   Legacy 自定义域名路径；OAuth 请使用 auth setup。
```

### Cloudflare quick tunnel

最适合录 demo 或临时试用：

```bash
codexgpt start
```

缺点很明确：quick tunnel 的 URL 每次重启都会变。如果你把 quick URL 放进 ChatGPT App，下一次启动时需要重新编辑 ChatGPT App 的 Server URL。

### ngrok free dev domain

如果需要简单的 Legacy 稳定 URL，创建一个免费 ngrok 账号，在 ngrok Dashboard 的 Universal Gateway -> Domains 找到你的 dev domain，比如：

```text
your-name.ngrok-free.dev
```

一次性认证 ngrok：

```bash
ngrok config add-authtoken YOUR_NGROK_TOKEN
```

保存到 CodexGPT：

```bash
codexgpt settings set --tunnel ngrok --hostname your-name.ngrok-free.dev
```

以后启动：

```bash
codexgpt start
```

ChatGPT 里的 Server URL 可以保持不变。

### Cloudflare named tunnel

如果你有自己的域名，可以用 Cloudflare named tunnel：

```bash
cloudflared tunnel login
cloudflared tunnel create codexgpt
cloudflared tunnel route dns codexgpt codexgpt.example.com
```

之后日常启动：

```bash
codexgpt stable --hostname codexgpt.example.com --tunnel-name codexgpt
```

更多域名细节见 [DOMAIN_SETUP.md](DOMAIN_SETUP.md)。

## Codex 风格上下文

CodexGPT 不读取 Codex 的隐藏运行时记忆。它给 ChatGPT 的是显式工作区上下文：

```text
open_current_workspace  bounded context_snapshot：项目/命令/Git/Guidance/能力元数据
codex_context           AGENTS 链、.ai-bridge 文件、可选 git status/diff
read_handoff            只读 .ai-bridge 文件
workspace_snapshot      更大的项目快照和 handoff 上下文
```

`codex_context` 会读取从仓库根目录到目标路径上的指令文件：

```text
AGENTS.override.md
AGENTS.md
agents.md
.agents.md
```

并加入：

```text
.ai-bridge/current-plan.md
.ai-bridge/agent-status.md
.ai-bridge/implementation-diff.patch
.ai-bridge/codex-status.md
.ai-bridge/decisions.md
.ai-bridge/open-questions.md
.ai-bridge/execution-log.jsonl
git status
可选 git diff
```

推荐流程：

```text
正常任务先调用一次 open_current_workspace；切换到用户指定目录时才用 open_workspace
直接使用 context_snapshot 里的项目、命令来源/置信度、Git、指令/Skill 路径和能力状态
只有目标文件需要更深指导时才调用 codex_context(target_path)
只有确实需要时才调用 load_skill、tree 或 git_diff
server_config 和 codexgpt_self_test 留给连接/运行时诊断，不作为每个任务的固定前置调用
```

`context_snapshot` 最多 12,000 个序列化字符，并明确报告省略的指令、Skill 或项目元数据。它只包含指令文件路径和 Skill 的 `name`、`description`、`source`、`applicability`，不包含正文；项目命令同时带精确 `source` 和 `confirmed|inferred`，不会把惯例猜测伪装成已确认配置。`open_workspace` 默认不再扫描 tree。这样 ChatGPT 在一次 open 后已经知道自己在哪里，同时仍以 lazy-load 保持上下文短而稳定。

## Policy Kernel 迁移

Phase 2A 新增本地 Policy Kernel，并提供三个明确的迁移状态：

- `CODEXGPT_POLICY_ENGINE=legacy` 是当前迁移周期默认值，保持原有执行路径。
- `CODEXGPT_POLICY_ENGINE=shadow` 仍执行 legacy 路径，只生成经过脱敏的策略比较事实。
- `CODEXGPT_POLICY_ENGINE=enforce` 让编译后的 Policy Kernel 成为权威判断；策略、身份、审批或执行能力事实不可用时直接失败关闭。

可选的 `CODEXGPT_PERMISSION_PROFILE=<id>` 会选择 `~/.codexgpt/permissions/<id>.json` 下的严格 JSON 权限文件。Runtime Profile 与 Permission Profile 是两个不同概念：`toolMode` 只控制工具是否可见；文件、Git、Shell、Process 和 Network 的权限上限由身份 scopes、immutable hard policy、Permission Profile、受限 SessionGrant 与已证明的执行能力共同决定。

Contract V1 与 V2 会精确保留原有行为，不会创建 pending approval。显式启用 Contract V3 后，confirmed root 与可信代码进程执行可使用仅限本机的审批 CLI；CodexGPT 不会向 MCP 暴露审批工具，也不会把远程客户端请求当作真人确认。Safe Bash 仍只是命令策略过滤器，不是操作系统沙箱。Cloudflare Tunnel 只保护入站路由，不负责本地授权或出站网络限制。

迁移周期内只允许回滚到经过审查的 `legacy` 行为、生成的兼容 Permission Profile，或更窄的只读 profile。Policy 加载失败不会自动退回无策略执行。

## 原子事务与持久审计

Phase 3 已把 transaction、change-set、persistent audit、recovery 与 move 后端接入真实的 HTTP 与 STDIO Server 生命周期：

- `CODEXGPT_FILE_TRANSACTIONS=legacy|atomic`；`legacy` 仍是兼容默认值。启用 `atomic` 后，受支持的工作区 writer 会先准备一个受保护事务，绝不会静默回退为直接写入。
- 可写 atomic 操作必须持久化终态审计；不能使用 `CODEXGPT_AUDIT_MODE=off`。审计或 participant 失败会先完成一致性协调或回滚已可见变化，而不是返回未经审计的成功。
- `CODEXGPT_AUDIT_MODE=auto|off|best_effort|required`；默认是 `auto`，Policy 使用 `enforce` 时也不能设为 `off`。
- `CODEXGPT_AUDIT_RETENTION_DAYS` 默认保留 30 天，`CODEXGPT_AUDIT_RETENTION_BYTES` 默认允许已闭合分段总计 100 MiB。
- 审计、经过认证的 change-set 与 transaction 状态位于工作区和 Git 之外，不记录原始文件内容、完整 diff、命令输出、凭据或规范工作区根路径。

Contract V1 仍是默认的精确 28 工具公开表面。显式选择 Contract V2（`CODEXGPT_TOOL_CONTRACT_VERSION=2`）时，必须同时启用 atomic transaction 与 persistent audit，并使用精确的 31 个子工具集合。standard/full 模式新增 `move_paths` 与 `undo_change_set`；只有 full 模式再新增 `query_audit_events`；minimal 与 connection-test 不暴露这三个工具。`move_paths` 最多处理同一工作区、同一卷内 64 个带 SHA-256 前置条件的普通文件，不覆盖无关目标；preview 只证明当前验证通过，不承诺稍后的 hard-link 执行一定成功。恢复、完整性、保留期、owner binding、undo 和信任边界详见 [SECURITY.md](SECURITY.md)。

## 类型化本地 Git 与托管任务 Worktree（Contract V4）

Contract V4 需要显式启用，精确包含 51 个工具。它保留 V1/V2/V3，并新增类型化的纯本地 Git 读写与 owner-bound 托管任务 worktree。受支持的 STDIO/HTTP 启动路径会先验证唯一 Git 可执行文件并完成 Gate R 恢复，之后才接受 transport 连接。

```powershell
$env:CODEXGPT_TOOL_CONTRACT_VERSION = "4"
$env:CODEXGPT_FILE_TRANSACTIONS = "atomic"
$env:CODEXGPT_AUDIT_MODE = "required"
$env:CODEXGPT_POLICY_ENGINE = "enforce"
$env:CODEXGPT_TOOL_MODE = "full"
$env:CODEXGPT_PERMISSION_PROFILE = "trusted-local" # 必须只授予所需 V4 Git/worktree scopes
$env:CODEXGPT_GIT_MODE = "local"                   # 设为 "read" 会禁用全部 Git mutation
$env:CODEXGPT_GIT_INTEGRATIONS = "off"
$env:CODEXGPT_TASK_WORKTREE_ROOT = "D:\CodexGPTTasks"
codexgpt start --root D:\Dev\your-repo --write workspace --bash off
```

安全 Git capsule 固定可执行文件身份、参数、环境、prompt、网络/lazy fetch 与 repository integration。它仍以当前 Windows 用户权限运行，是执行策略边界，不是操作系统 sandbox。CodexGPT lock 只协调 CodexGPT 自己的操作；外部 Git 进程仍可能制造竞态，此时系统会失败关闭或要求人工恢复。

创建任务的第一次调用只返回不可变审查，不创建 branch、管理目录或任务根。通过本机一次性审批后的重试才会创建生成的 `codex/*` branch，并把精确本地 Git blob 原始物化到配置的托管根。任务 workspace handle 仅在当前 session 有效；owner-bound 任务记录、branch、commit、私有 stash 与 audit 可以跨重启保留。`remove_task_worktree` 只删除经过证明的干净 checkout 及其精确 CodexGPT registration，保留 branch、commit 和私有 stash。

Merge prepare 不更新 live target。fast-forward prepare 无副作用；divergent merge 先在 quarantine 内计算并完整扫描，再要求一次与 candidate 绑定的新本机审批，之后才提升 immutable object 和一个应用私有 candidate ref。Execute 会重新验证 plan、task/target/candidate OID、干净 checkout 或两次证明未 checkout 的 target、normalization 事实与一次性审批，再执行 file/index/ref CAS。候选检查通过不代表稍后的 live-target execute 必然成功。

受支持默认值是 `CODEXGPT_GIT_INTEGRATIONS=off`：不会执行 hook、filter、signing program、merge helper、fsmonitor、editor、pager、credential helper 或 remote command。需要这些程序的仓库会返回 integration/normalization 错误，不会静默切换到 ambient execution。V4 类型化工具不提供 remote、credential、force、branch delete、reset、clean、GC、共享 stash stack 或调用者自选任意 Git command。

只有同时显式设置 `CODEXGPT_GIT_INTEGRATIONS=approved_full_access`、本地 Git mutation mode 和 `full_access` execution profile，才能选择 Gate X。每次新鲜且精确的 R3 批准会绑定 repository/worktree、Git 可执行文件、已发现的 integration 身份、语义状态、tool 和 canonical action。运行时随后只允许四类固定类型化 builder：私有 index stage、shadow Git dir commit、quarantine 内 object-only merge，以及写入私有目标的 checkout。调用方不能传入 Git command、subcommand、参数向量、remote/credential/force 动作或 config mutation。其子进程仍具有当前用户的 ambient `full_access`；批准卡和公开结果都会明确显示不存在 filesystem、credential、registry、network 或 broker isolation。

把配置回滚到 V3 只会隐藏 V4 工具，不会删除持久任务、`codex/*` branch、私有 stash、candidate recovery state 或 audit。删除状态前应使用同版本 binary 的 cleanup/recovery 路径。

## 可信代码 Windows 执行（Contract V3）

Contract V3 需要显式启用，精确包含 39 个工具：继承 V2 中除 `bash` 外的工具，再加入 `open_full_access_workspace`、`run_command`、`start_process` 和六个类型化进程管理工具。它要求 atomic transaction、durable audit、Policy Kernel `enforce`、稳定会话身份和本机审批 runtime。

在 Windows PowerShell 中，可按下面的最小配置为可信仓库启用：

```powershell
$env:CODEXGPT_FILE_TRANSACTIONS = "atomic"
$env:CODEXGPT_AUDIT_MODE = "required"
$env:CODEXGPT_POLICY_ENGINE = "enforce"
$env:CODEXGPT_TOOL_CONTRACT_VERSION = "3"
$env:CODEXGPT_TOOL_MODE = "full"
$env:CODEXGPT_PERMISSION_PROFILE = "trusted-local"
$env:CODEXGPT_EXECUTION_PROFILE = "full_access"
$env:CODEXGPT_LOCAL_FILE_ACCESS = "confirmed_roots" # 可选
codexgpt start --root D:\Dev\your-repo --write workspace --bash off
```

启动前创建 `%USERPROFILE%\.codexgpt\permissions\trusted-local.json`。下面的 profile 明确接受当前 Windows 用户权限；请把 root 替换成你实际信任的精确目录：

```json
{
  "schemaVersion": 3,
  "id": "trusted-local",
  "description": "Trusted repositories on this Windows account",
  "workspaceRoots": ["D:\\Dev\\your-repo"],
  "shell": { "mode": "execute", "requireSandbox": false },
  "process": { "manage": true, "persistent": true, "requireSandbox": false },
  "network": {
    "enabled": true,
    "rules": [],
    "allowLoopback": true,
    "allowPrivate": true,
    "allowLinkLocal": true,
    "requireEnforcement": false
  },
  "fullAccess": {
    "ambientFilesystem": true,
    "ambientCredentials": true,
    "ambientRegistry": true,
    "unrestrictedNetwork": true,
    "requireBlockedPathEnforcement": false,
    "requireCredentialIsolation": false,
    "requireRegistryIsolation": false,
    "requireDeviceIsolation": false,
    "requireNetworkEnforcement": false,
    "requireSandbox": false
  }
}
```

ChatGPT 请求 V3 R3 操作时，CodexGPT 会返回 approval ID 和本机 server ID。你需要在另一个本机终端中检查并批准，然后让 ChatGPT 重试完全相同的 tool call：

```powershell
codexgpt approvals list --server <server_id>
codexgpt approvals approve <approval_id> --server <server_id>
# 或：codexgpt approvals deny <approval_id> --server <server_id>
```

即使远程客户端不可用，持久进程仍可在本机列出和终止：

```powershell
codexgpt processes list --server <server_id>
codexgpt processes terminate <process_id> --server <server_id>
```

V3–V5 的进程工具按任务生命周期选择：

- `run_command` 只用于预期会退出的单个有限命令，例如 test、build、lint 或 typecheck。standard tool mode 提供这条有限执行路径；不要用它维持 server、watcher 或 REPL。
- `start_process` 用于 dev server、watcher 或交互式 REPL，仅 full tool mode 可用。Windows 下需要终端交互时选择 ConPTY；每次把 `read_process_output` 返回的非空 `next_cursor` 传入下一次读取，并在不再需要时调用 `terminate_process`。

两条路径都使用当前 Windows 用户的 `full_access` 环境权限，不是沙箱。`read_process_output.wait_ms` 为正时，最多等待输出或生命周期收尾 30 秒；`eof=true` 后立即返回。

V5 结果以 `state` 为生命周期真相，`status` 仅保留为相同值的迁移别名。`list_processes` 可能短暂返回 `starting`，而 `start_process` 本身只会以 `running` 成功。把每次非空的 `output.next_cursor` 作为下一次调用的 `cursor`；`max_bytes` 限制单页大小，省略 cursor 才会从保留输出起点重新读取。

`full_access` 只适用于你信任的代码。进程拥有当前 Windows 用户的环境权限，**不会**隔离文件、凭据、registry、设备、COM/WMI/service broker 或网络。Job Object 只控制实际加入 Job 的进程；ConPTY 只提供终端输入输出；输出脱敏只识别已知模式，不是 DLP。保留的 `workspace` execution profile 当前不可用，也绝不会自动回退到 `full_access`。

## 工作区会话

`workspace_id` 是随机不透明 capability handle，不由仓库路径哈希推导。OAuth 模式默认使用 deployment-runtime-scoped 的 configured-root registry：同一个 deployment incarnation、owner、OAuth client、grant/revision、resource 和 policy revision 下，`open_workspace` 返回的句柄可以跨 ChatGPT Web 的 MCP transport rotation 继续显式复用；transport/session id 本身不再是 OAuth continuity authority。不同 owner/client/grant/incarnation/resource 复制同一个句柄仍会得到统一的 unavailable 结果，也不能借 lookup/close 破坏合法句柄。

调用 `close_workspace` 可以立即使句柄失效。空闲句柄按 `CODEXGPT_WORKSPACE_TTL_MS` 过期；未设置时跟随 `CODEXGPT_HTTP_SESSION_TTL_MS`，通常为 30 分钟，成功使用会刷新空闲期限。OAuth service/runtime restart 会清空这类 configured-root capability，重启后需要重新 `open_workspace` 一次；正常 access-token refresh 不会改变同一 grant 的句柄 authority。

Legacy/query-token 和 STDIO 仍保持原来的 session/process-local 行为。一个兼容周期内，省略 `workspace_id` 仍只会解析当前 server session 的默认 root；但 OAuth 下如果用户已经显式打开非默认 root，后续调用应继续显式传入返回的 `workspace_id`，不得用省略参数回退到默认 root。需要临时回滚 OAuth continuity 时可设置 `CODEXGPT_OAUTH_WORKSPACE_CAPABILITY_MODE=session_local`。

## 安全边界

CodexGPT 是本地开发桥，不是操作系统级沙箱。

默认安全行为：

- OAuth 公网模式要求有效 OAuth grant，ChatGPT Server URL 不含 token。
- 保留的 Legacy 公开 CLI 使用个人 ChatGPT query-token 兼容流程；该完整 URL 等同密码。只有能主动发送 Bearer header 的高级兼容客户端才应显式设置 `CODEXGPT_ALLOW_QUERY_TOKEN=0`。
- 写入限制在配置的工作区 root 内。
- 常见敏感路径会被拒绝：`.env`、私钥、`.git`、`node_modules`、生成目录、缓存目录。
- symlink 逃逸会被阻止。
- safe bash 只允许常见检查、搜索、git、lint、test、typecheck、build 等命令。
- Bash 默认使用收窄后的子进程环境，不复制任意宿主变量。Windows 下会从 `USERPROFILE` 派生 `APPDATA`、`LOCALAPPDATA` 和 `GH_CONFIG_DIR`，让 GitHub CLI 等工具复用配置和系统 keyring，但不会复制 `GH_TOKEN` 或无关 API 变量。
- `CODEXGPT_INHERIT_ENV=1` 会改为继承完整宿主环境，只应在受信任的本地仓库中使用。
- Contract V3 默认 execution `off`；只有显式 V3 Permission Profile 和本机一次性审批才能启用 `full_access`。保留的 `workspace` sandbox profile 当前不可用。
- `codexgpt start --no-bash` 会完全关闭 ChatGPT 可调用的 bash 工具。
- `execute-handoff` 和 `watch-handoff` 是本地 CLI 命令，不是远程 MCP 工具。

只有在你信任当前仓库和命令时，才考虑更宽的权限，例如 full bash、自定义执行器、额外 allow root。

### Codex 会话边界

CodexGPT 不能绑定、读取或复用某一个 Codex App 会话 id。MCP 里的 session id 只是 ChatGPT 和 CodexGPT HTTP 服务器之间的传输会话，不代表 Codex 里的某个聊天或终端会话。

`bash` 工具属于你启动的 CodexGPT 本地服务器进程，并在配置的 workspace root 下运行。想并行处理另一个任务时，请为另一个仓库、端口或 tunnel profile 启动单独的 CodexGPT；不要把它理解成“远程控制当前 Codex 会话”。

如果要减少误触发，可以给这个本地 CodexGPT 进程设置 bash session guard：

```bash
codexgpt start --bash-session main --require-bash-session
```

这不是 Codex App 聊天会话 id，而是 CodexGPT 本地 bash 工具的显式匹配标签。

bash 结果默认使用紧凑 transcript，避免 ChatGPT 对话里突然铺开大段 stdout/stderr。完整 stdout/stderr 仍在结构化工具数据里，CodexGPT 卡片里的输出预览默认折叠。需要旧行为时可以显式打开：

```bash
codexgpt start --bash-transcript full
```

CodexGPT 也可以在 full tools 下显式开启只读的本地 Codex 会话列表：

```bash
codexgpt start --tool-mode full --codex-sessions metadata
codexgpt start --tool-mode full --codex-sessions read
```

`metadata` 会增加 `codex_sessions` 工具，从 `~/.codex/sessions` 和 `~/.codex/archived_sessions` 读取本地 JSONL 历史，列出 session id、标题、cwd、来源文件和 `codex resume <session-id>` 命令。`read` 还会增加 `read_codex_session`，用于有限长度的 transcript 读取。它类似本地 session manager 扫描 Codex 历史文件，但仍然不会附加到正在运行的 Codex App 聊天，也不会在那个会话里执行命令或绕过产品限制。

如果 Codex 历史不在默认位置，可以用 `--codex-dir <dir>`。

如果只想让 ChatGPT 规划、由你本地决定是否执行：

```bash
codexgpt start --mode handoff --no-bash
```

## 常用命令

```bash
codexgpt setup
codexgpt start
codexgpt doctor [--json]
codexgpt settings
codexgpt settings list
codexgpt settings set --tunnel ngrok --hostname your-name.ngrok-free.dev
codexgpt settings delete --yes
codexgpt config explain --root D:\Dev\your-repo
codexgpt config explain auth.mode --root D:\Dev\your-repo --json
codexgpt pro-bundle --copy
codexgpt execute-handoff --agent opencode --model provider/model --dry-run
codexgpt watch-handoff --agent opencode --model provider/model --yes
```

`config explain` 只读复用真实启动配置规划，不会启动服务、探测端口或创建 profile。文本输出说明每个公共输入为什么生效，并给出安全的重启命令；`--json` 还会返回完整的有效运行时快照。秘密值及被覆盖的 token 来源始终只显示为 `set` 或 `missing`。

`doctor --json` 返回机器可读的诊断结果，并在 `configuration` 中原样嵌入同一份脱敏 `config explain` 文档；唯一受支持的公共 CLI 还会加入 Bash、保存配置和 OAuth 包装层检查。任一结构化检查为 `fail` 时，`ok` 为 `false`，命令以非零状态退出。

兼容变量 `CODEBASE_BRIDGE_HTTP_TOKEN` 在迁移期内仍可读取。仅当它实际成为 token 来源时，`config explain` 与 `doctor` 才会返回 `CONFIG_COMPATIBILITY_INPUT`，并给出迁移到 `CODEXGPT_HTTP_TOKEN` 的脱敏 PowerShell 命令；配置的 token 本身不会进入输出。canonical 来源已经生效时不会误报警告。

兼容变量 `CODEBASE_BRIDGE_REPO_ROOT` 在迁移期内也仍可读取。只有没有 `--root` 和 `CODEXGPT_ROOT` 时，受支持的公共入口才用它选择 workspace 和保存的 profile。`config explain` 与 `doctor` 会保留这个来源，并返回不包含路径值的 PowerShell 迁移命令 `$env:CODEXGPT_ROOT = $env:CODEBASE_BRIDGE_REPO_ROOT; Remove-Item Env:CODEBASE_BRIDGE_REPO_ROOT`；CLI 或 canonical root 已生效时不会误报警告。

`CODEXGPT_HOSTNAME` 仍是 `CODEXGPT_PUBLIC_HOSTNAME` 的值等价兼容输入。它实际生效时，公共入口会保留原始来源，同时保持有效 hostname 和公共配置指纹不变；`config explain` 与 `doctor` 返回不嵌入 hostname 值的命令 `$env:CODEXGPT_PUBLIC_HOSTNAME = $env:CODEXGPT_HOSTNAME; Remove-Item Env:CODEXGPT_HOSTNAME`。`--hostname`、`--url` 或 `CODEXGPT_PUBLIC_HOSTNAME` 生效时不会出现兼容警告。

`NGROK_DOMAIN` 仍与 `CODEXGPT_PUBLIC_HOSTNAME` 值等价，即使 tunnel 模式不是 ngrok 也保持既有行为。公共入口现在会保留这个原始来源；`config explain` 以及 `doctor --json` 内的 configuration 会把它标为 mode-ambiguous：变量名指向 ngrok，实际生效范围却是所有 tunnel 模式。本步没有安排删除或迁移警告；新配置应使用 `CODEXGPT_PUBLIC_HOSTNAME`。CLI、canonical 和 `CODEXGPT_HOSTNAME` 的既有优先级不变。

终端控制键：

```text
Enter  打开 ChatGPT connector 设置
c      再次复制 Server URL
u      显式显示秘密 Server URL
o      打开本地 admin dashboard
h      显示帮助
q      停止 CodexGPT
```

本地 admin dashboard 是带 token 保护的 setup/settings 页面。它会显示当前 workspace、local MCP endpoint、安全模式、安装/启动命令、ChatGPT 连接步骤、saved profile 设置和 allowed roots。

页面也提供 GitHub、npm、docs 链接，以及 global install、guided setup、daily start、source checkout setup 和高级重启命令的复制按钮。它能修改下一次启动使用的 saved profile：tunnel provider、public hostname、port、mode、bash mode、transcript、Codex session 模式、write mode、tool mode、widget origin 和 tunnel config 路径。修改后需要重新运行 `codexgpt start` 才会生效。

浏览器 admin 页面只负责 setup/settings/status 和 MCP endpoint；不能切换 ChatGPT 账号，不能直接保存原始 Cloudflare tunnel token，也不能把 CodexGPT 作为后台服务开关。Cloudflare dashboard-managed tunnel 请把 token 放在本地文件里，再填写 Cloudflare token file。

## FAQ

中文常见问题见 [FAQ_ZH.md](FAQ_ZH.md)。

核心结论：

- 需要能访问 Apps / Developer Mode 的 ChatGPT 账号。
- 可用性以当前 Apps / Developer Mode 或连接管理入口为准，并受账号、工作区策略和 rollout 影响。
- CodexGPT 不绕过任何速率限制。
- 某些 Pro / planning 模型界面不能直接连接 MCP 工具，使用 `pro-bundle` 作为上下文回退。
- quick tunnel 每次重启 URL 会变。
- 想每天同一个 URL，用 ngrok free dev domain 或 Cloudflare named tunnel。

## 开发

测试和本地任务应使用带清理生命周期的正式入口：

```bash
npm run test:focused -- test/example.test.mjs
npm run task:run -- node scripts/example.mjs
npm run task:runner -- start --kind example -- node scripts/example.mjs
npm run task:cleanup
```

这些入口会把 `TEMP`、`TMP`、`TMPDIR` 定向到带所有权标记的 CodexGPT 临时目录，并在任务成功、失败或可处理的中断后删除完整目录树。detached runner 默认保留按完成时间排序的前 20 个终态 run，并删除超过 14 天的终态证据；可用 `--retention-count` 和 `--retention-days` 调整。`task:cleanup` 只删除具有有效 marker、路径/身份校验通过且 owner 已失效的 `codexgpt-owned-v1-*` 目录；校验或删除不完整时返回非零。它不会删除未标记的其他程序临时文件、托管 task worktree、candidate、recovery state、凭据或受管 Node toolchain。Windows 强制终止无法执行 JavaScript `finally`，这类残留由下一次正式任务或 `task:cleanup` 精确回收。

## 开源与贡献

项目地址：[github.com/chatGPT-10/codexgpt](https://github.com/chatGPT-10/codexgpt)

欢迎提 issue、补文档、补平台兼容性、补测试。提交 PR 前请至少运行：

```bash
npm run build
npm run smoke
npm audit --omit=dev
```

如果 CodexGPT 对你有用，请在 GitHub 点星。这样其他使用 ChatGPT、Codex、OpenCode、Pi 和 MCP 的开发者更容易找到它。
