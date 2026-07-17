<p align="center">
  <img src="docs/favicon.svg" width="72" height="72" alt="CodexPro logo">
</p>

<h1 align="center">CodexPro</h1>

<p align="center">
  让 ChatGPT Web 看见你的本地仓库，并像本地代码代理一样工作。
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/codexpro"><img alt="npm" src="https://img.shields.io/npm/v/codexpro?style=flat-square"></a>
  <a href="https://github.com/chatGPT-10/codexgpt/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/chatGPT-10/codexgpt/ci.yml?branch=main&style=flat-square"></a>
  <a href="https://github.com/chatGPT-10/codexgpt/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/chatGPT-10/codexgpt?style=flat-square"></a>
  <a href="https://rebel0789.github.io/codexpro/zh.html"><img alt="中文站点" src="https://img.shields.io/badge/site-%E4%B8%AD%E6%96%87%E6%96%87%E6%A1%A3-67e8f9?style=flat-square"></a>
</p>

<p align="center">
  <a href="README.md">English</a>
  ·
  <a href="https://rebel0789.github.io/codexpro/zh.html">中文网站</a>
  ·
  <a href="https://github.com/chatGPT-10/codexgpt">GitHub 点星</a>
  ·
  <a href="https://www.npmjs.com/package/codexpro">npm</a>
  ·
  <a href="DOMAIN_SETUP.md">稳定 URL 指南</a>
  ·
  <a href="FAQ_ZH.md">中文 FAQ</a>
  ·
  <a href="SECURITY.md">安全说明</a>
</p>

## 安装

CodexPro 需要 Node.js 20+，以及能使用 Apps / Developer Mode 的 ChatGPT 账号。OpenAI 当前文档列出的 web 端 Developer Mode 账号范围包括 Pro、Plus、Business、Enterprise 和 Education。

先安装 CLI：

```bash
npm install -g codexpro
```

GitHub `main` 文档可能早于 npm 发布；用 `npm install -g codexpro` 前请看 npm badge/version，未发布的 `main` 行为请用下面的 source checkout 方式。

进入你想让 ChatGPT 工作的仓库，然后运行 setup：

```bash
cd /path/to/your/repo
codexpro setup
```

CodexPro 会自动复制包含 `codexpro_token` query 凭据的完整 ChatGPT Server URL。先到 `Settings -> Security and login` 打开 Developer mode，再到 `Settings -> Plugins` 创建连接，粘贴完整 URL，并选择 `Authentication: No Authentication / None`。

当前支持的个人 ChatGPT 兼容方案使用这个 URL-token 流程，OAuth 2.1 仍延后实现。请把完整 URL 当成等同密码的秘密：它可能泄露到浏览器历史、剪贴板、截图、日志和复制的链接中。不要分享、发布或提交这个 URL。

以后同一个仓库日常启动只需要：

```bash
codexpro start
```

CodexPro 把 ChatGPT Developer Mode 变成本地仓库的 MCP 代码代理。ChatGPT 可以读取文件、搜索代码、查看 git 状态、写入或精确编辑文件，并运行安全范围内的验证命令。

CodexPro 不是速率限制绕过工具。它不会绕过、提升、合并、转售或修改 ChatGPT、Codex、OpenAI 或第三方模型的限制。它只是通过官方 Developer Mode / MCP App 路径，把你自己的 ChatGPT 会话连接到你自己的本地仓库。

如果 Codex 当前工作流暂时不可用，而你的 ChatGPT 页面仍然可用，CodexPro 可以让你继续在同一个本地仓库上工作。反过来也一样：ChatGPT 负责高上下文规划，Codex、OpenCode、Pi 或其他本地执行器负责终端里的实际执行。

## 适合谁

CodexPro 适合已经有 ChatGPT Apps / Developer Mode 权限并希望做本地开发的人：

- 想让 ChatGPT Web 直接读取本地代码，而不是反复复制文件片段。
- 想把 `AGENTS.md`、`.ai-bridge`、git diff、源码文件这些 Codex 风格上下文给 ChatGPT。
- 想在 ChatGPT 里完成规划、审查、改小文件、跑安全验证。
- 想在某些模型不能调用工具时，导出一个持久上下文包给它做规划。
- 想把 ChatGPT 的计划交给 Codex、OpenCode、Pi 或自定义本地代理执行。

当前测试显示，ChatGPT Free / Go 账号不暴露 CodexPro 需要的 Apps / Developer Mode 创建流程。请使用 ChatGPT 中能看到 Apps / Developer Mode 的账号层级。

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

默认 `CODEXPRO_TOOL_MODE=standard`，只暴露常用编码循环、`codexpro_self_test`、`show_changes`、上下文导出和 handoff。演示时可以用 `--tool-mode minimal`，需要完整兼容工具时用 `--tool-mode full`。

默认工具数量较少是故意的：ChatGPT 面对少量高信号工具时更稳定。workspace open 默认不做 skill discovery；需要 repo-local skills 时传 `include_skills=true`，需要 user/plugin skills 时再加 `include_global_skills=true`。然后用 `load_skill` 按名称、source 和显示出的 path 加载需要的 `SKILL.md`；如果仍有重名匹配，CodexPro 会报歧义错误，不会随便选一个，也不会把几十个 skill 变成单独 action。

CodexPro 默认给 ChatGPT 暴露纯 MCP 工具描述，不附带 widget/card metadata。需要紧凑 v9 卡片时用 `CODEXPRO_TOOL_CARDS=1` 启动；server config、自测、workspace 摘要、读写 diff、bash 验证、git/tree/search/context 和 handoff/export 都有结构化视图。git、skills、tree、terminal 输出、context 和 raw diff 会折叠或截断，避免在聊天里刷出大段原始数据。`CODEXPRO_WIDGET_DOMAIN` 用于设置 ChatGPT widget iframe 的专用 HTTPS origin，正式提交 app 前应换成你控制的独立域名。

## 其他启动方式

不想全局安装时，也可以用：

```bash
npx codexpro@latest start --root /absolute/path/to/your/repo
```

但普通用户更推荐全局安装，这样命令就是固定的 `codexpro setup` 和 `codexpro start`。

## ChatGPT 中的 App 设置

先在 ChatGPT 打开 Developer Mode：

```text
ChatGPT Settings
-> Security and login
-> Developer mode: on
-> Enforce CSP in developer mode: on

ChatGPT Settings
-> Plugins
-> Create
```

保留 CSP 开启。CodexPro 的卡片和小组件就是按 CSP 开启的路径设计的，不需要远程脚本、外部字体、iframe 或第三方图片。

在创建 Plugin 页面填写：

```text
Name: CodexPro
Description: Local workspace bridge for ChatGPT coding
Connection: Server URL
Server URL: 粘贴 CodexPro 自动复制的完整地址，包括 codexpro_token query string
Authentication: No Authentication / None
```

不要删除 URL 的 query string。这个完整 URL 就是当前个人 ChatGPT 兼容流程的凭据；ChatGPT Web 不需要、也不应按照本指南手动配置静态 Bearer header。

保持终端里的 CodexPro 进程运行。你停止它之后，ChatGPT 就无法继续连接本地仓库。Cloudflare quick tunnel 的 URL 也会失效。

## 三种主要模式

### 1. Normal coding

默认模式。ChatGPT 可以在工作区内读取、搜索、写入、精确编辑文件，并运行安全验证命令。

```bash
codexpro start
```

适合小改动、文档更新、定位 bug、查看 diff、跑 lint/test/build。

如果你正在另一个 Codex 会话里工作，不希望 ChatGPT 触发任何 shell 命令，用：

```bash
codexpro start --no-bash
```

如果想保留 bash，但要求 ChatGPT 明确命中你启动的这个 CodexPro 终端会话标签，用：

```bash
codexpro start --bash-session main --require-bash-session
```

开启后，`bash` 工具调用必须带上 `session_id: "main"` 才会执行。

### 2. Handoff

规划模式。ChatGPT 不直接写源码，只写入：

```text
.ai-bridge/current-plan.md
```

然后你在本地终端决定是否执行：

```bash
codexpro execute-handoff --agent opencode --model provider/model --dry-run
codexpro execute-handoff --agent opencode --model provider/model
```

也可以启动监听器，让本地终端在计划变更后执行：

```bash
codexpro start --mode handoff
codexpro start --mode handoff --no-bash
codexpro watch-handoff --agent opencode --model provider/model --yes
```

执行结果会写回：

```text
.ai-bridge/agent-status.md
.ai-bridge/implementation-diff.patch
.ai-bridge/execution-log.jsonl
```

然后让 ChatGPT 通过 `read_handoff` 或 `codex_context` 审查结果。

### 3. Pro context fallback

有些 ChatGPT 模型或产品界面不能直接调用 Developer Mode Apps、连接器或 MCP 工具。即使同一个符合条件的账号可以创建 CodexPro app，某个具体模型界面仍然可能没有工具调用能力。

这时不要强行让它调用工具。先导出一个持久上下文包：

```bash
codexpro pro-bundle --root /absolute/path/to/your/repo --copy
```

它会写入：

```text
.ai-bridge/pro-context.md
```

把这个上下文粘贴给不能调用工具的模型，让它产出窄范围实现计划。然后保存计划并应用：

```bash
codexpro pro-apply --root /absolute/path/to/your/repo --file plan.md
```

这会写入 `.ai-bridge/current-plan.md`，再交给 Codex、OpenCode、Pi 或自定义本地代理执行。

如果你的 ChatGPT 账号已经在 Web 产品里提供 GPT-5.5 或更强模型，并且该模型界面可以调用 Developer Mode Apps，CodexPro 可以让它通过 MCP 使用本地仓库工具。CodexPro 不提供、不代理、不转售、也不解锁模型。

## 稳定 URL 怎么选

ChatGPT App 需要一个可访问的 Server URL。你有三个常用选择：

```text
Cloudflare quick tunnel   最快演示路径。每次重启 URL 都变。
ngrok free dev domain     推荐给大多数用户。免费账号给一个稳定 dev domain。
Cloudflare named tunnel   适合已有自定义域名的用户。
```

### Cloudflare quick tunnel

最适合录 demo 或临时试用：

```bash
codexpro start
```

缺点很明确：quick tunnel 的 URL 每次重启都会变。如果你把 quick URL 放进 ChatGPT App，下一次启动时需要重新编辑 ChatGPT App 的 Server URL。

### ngrok free dev domain

推荐给大多数用户。创建一个免费 ngrok 账号，在 ngrok Dashboard 的 Universal Gateway -> Domains 找到你的 dev domain，比如：

```text
your-name.ngrok-free.dev
```

一次性认证 ngrok：

```bash
ngrok config add-authtoken YOUR_NGROK_TOKEN
```

保存到 CodexPro：

```bash
codexpro settings set --tunnel ngrok --hostname your-name.ngrok-free.dev
```

以后启动：

```bash
codexpro start
```

ChatGPT 里的 Server URL 可以保持不变。

### Cloudflare named tunnel

如果你有自己的域名，可以用 Cloudflare named tunnel：

```bash
cloudflared tunnel login
cloudflared tunnel create codexpro
cloudflared tunnel route dns codexpro codexpro.example.com
```

之后日常启动：

```bash
codexpro stable --hostname codexpro.example.com --tunnel-name codexpro
```

更多域名细节见 [DOMAIN_SETUP.md](DOMAIN_SETUP.md)。

## Codex 风格上下文

CodexPro 不读取 Codex 的隐藏运行时记忆。它给 ChatGPT 的是显式工作区上下文：

```text
open_current_workspace  当前 root、安全模式、AGENTS 状态、git 状态
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
先调用 server_config 和 codexpro_self_test
如果 self-test 失败，先停下来报告失败项
先调用 open_current_workspace，include_tree=false
再调用 codex_context，target_path 指向要改的文件，include_diff=false
然后只读取当前任务需要的文件
```

这样 ChatGPT 会更接近 Codex 的指令模型，同时不会依赖隐藏状态或大范围重复扫描。

## Policy Kernel 迁移

Phase 2A 新增本地 Policy Kernel，并提供三个明确的迁移状态：

- `CODEXPRO_POLICY_ENGINE=legacy` 是当前迁移周期默认值，保持原有执行路径。
- `CODEXPRO_POLICY_ENGINE=shadow` 仍执行 legacy 路径，只生成经过脱敏的策略比较事实。
- `CODEXPRO_POLICY_ENGINE=enforce` 让编译后的 Policy Kernel 成为权威判断；策略、身份、审批或执行能力事实不可用时直接失败关闭。

可选的 `CODEXPRO_PERMISSION_PROFILE=<id>` 会选择 `~/.codexpro/permissions/<id>.json` 下的严格 JSON 权限文件。Runtime Profile 与 Permission Profile 是两个不同概念：`toolMode` 只控制工具是否可见；文件、Git、Shell、Process 和 Network 的权限上限由身份 scopes、immutable hard policy、Permission Profile、受限 SessionGrant 与已证明的执行能力共同决定。

Contract V1 与 V2 会精确保留原有行为，不会创建 pending approval。显式启用 Contract V3 后，confirmed root 与可信代码进程执行可使用仅限本机的审批 CLI；CodexPro 不会向 MCP 暴露审批工具，也不会把远程客户端请求当作真人确认。Safe Bash 仍只是命令策略过滤器，不是操作系统沙箱。Cloudflare Tunnel 只保护入站路由，不负责本地授权或出站网络限制。

迁移周期内只允许回滚到经过审查的 `legacy` 行为、生成的兼容 Permission Profile，或更窄的只读 profile。Policy 加载失败不会自动退回无策略执行。

## 原子事务与持久审计

Phase 3 已把 transaction、change-set、persistent audit、recovery 与 move 后端接入真实的 HTTP 与 STDIO Server 生命周期：

- `CODEXPRO_FILE_TRANSACTIONS=legacy|atomic`；`legacy` 仍是兼容默认值。启用 `atomic` 后，受支持的工作区 writer 会先准备一个受保护事务，绝不会静默回退为直接写入。
- 可写 atomic 操作必须持久化终态审计；不能使用 `CODEXPRO_AUDIT_MODE=off`。审计或 participant 失败会先完成一致性协调或回滚已可见变化，而不是返回未经审计的成功。
- `CODEXPRO_AUDIT_MODE=auto|off|best_effort|required`；默认是 `auto`，Policy 使用 `enforce` 时也不能设为 `off`。
- `CODEXPRO_AUDIT_RETENTION_DAYS` 默认保留 30 天，`CODEXPRO_AUDIT_RETENTION_BYTES` 默认允许已闭合分段总计 100 MiB。
- 审计、经过认证的 change-set 与 transaction 状态位于工作区和 Git 之外，不记录原始文件内容、完整 diff、命令输出、凭据或规范工作区根路径。

Contract V1 仍是默认的精确 28 工具公开表面。显式选择 Contract V2（`CODEXPRO_TOOL_CONTRACT_VERSION=2`）时，必须同时启用 atomic transaction 与 persistent audit，并使用精确的 31 个子工具集合。standard/full 模式新增 `move_paths` 与 `undo_change_set`；只有 full 模式再新增 `query_audit_events`；minimal 与 connection-test 不暴露这三个工具。`move_paths` 最多处理同一工作区、同一卷内 64 个带 SHA-256 前置条件的普通文件，不覆盖无关目标；preview 只证明当前验证通过，不承诺稍后的 hard-link 执行一定成功。恢复、完整性、保留期、owner binding、undo 和信任边界详见 [SECURITY.md](SECURITY.md)。

## 可信代码 Windows 执行（Contract V3）

Contract V3 需要显式启用，精确包含 39 个工具：继承 V2 中除 `bash` 外的工具，再加入 `open_full_access_workspace`、`run_command`、`start_process` 和六个类型化进程管理工具。它要求 atomic transaction、durable audit、Policy Kernel `enforce`、稳定会话身份和本机审批 runtime。

在 Windows PowerShell 中，可按下面的最小配置为可信仓库启用：

```powershell
$env:CODEXPRO_FILE_TRANSACTIONS = "atomic"
$env:CODEXPRO_AUDIT_MODE = "required"
$env:CODEXPRO_POLICY_ENGINE = "enforce"
$env:CODEXPRO_TOOL_CONTRACT_VERSION = "3"
$env:CODEXPRO_TOOL_MODE = "full"
$env:CODEXPRO_PERMISSION_PROFILE = "trusted-local"
$env:CODEXPRO_EXECUTION_PROFILE = "full_access"
$env:CODEXPRO_LOCAL_FILE_ACCESS = "confirmed_roots" # 可选
codexpro start --root D:\Dev\your-repo --write workspace --bash off
```

启动前创建 `%USERPROFILE%\.codexpro\permissions\trusted-local.json`。下面的 profile 明确接受当前 Windows 用户权限；请把 root 替换成你实际信任的精确目录：

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

ChatGPT 请求 V3 R3 操作时，CodexPro 会返回 approval ID 和本机 server ID。你需要在另一个本机终端中检查并批准，然后让 ChatGPT 重试完全相同的 tool call：

```powershell
codexpro approvals list --server <server_id>
codexpro approvals approve <approval_id> --server <server_id>
# 或：codexpro approvals deny <approval_id> --server <server_id>
```

即使远程客户端不可用，持久进程仍可在本机列出和终止：

```powershell
codexpro processes list --server <server_id>
codexpro processes terminate <process_id> --server <server_id>
```

`full_access` 只适用于你信任的代码。进程拥有当前 Windows 用户的环境权限，**不会**隔离文件、凭据、registry、设备、COM/WMI/service broker 或网络。Job Object 只控制实际加入 Job 的进程；ConPTY 只提供终端输入输出；输出脱敏只识别已知模式，不是 DLP。保留的 `workspace` execution profile 当前不可用，也绝不会自动回退到 `full_access`。

## 工作区会话

`workspace_id` 是只属于一个 MCP Server 会话的随机不透明句柄，不再由仓库路径哈希推导。同一活动会话重复打开同一 root 会复用本会话句柄；另一个 HTTP transport session 或 STDIO Server 进程会获得不同句柄，也不能使用或列出前一个会话的工作区。

调用 `close_workspace` 可以立即使句柄失效。空闲句柄按 `CODEXPRO_WORKSPACE_TTL_MS` 过期；未设置时跟随 `CODEXPRO_HTTP_SESSION_TTL_MS`，通常为 30 分钟，成功使用会刷新空闲期限。

为保留一个兼容周期，省略 `workspace_id` 的工具仍只会解析当前会话自己的默认 root，不会恢复跨会话共享。

## 安全边界

CodexPro 是本地开发桥，不是操作系统级沙箱。

默认安全行为：

- 公网 tunnel 默认需要私有 CodexPro token。
- 受支持的公开 CLI 默认使用个人 ChatGPT query-token 兼容流程；只有能主动发送 Bearer header 的高级兼容客户端才应显式设置 `CODEXPRO_ALLOW_QUERY_TOKEN=0`。
- 写入限制在配置的工作区 root 内。
- 常见敏感路径会被拒绝：`.env`、私钥、`.git`、`node_modules`、生成目录、缓存目录。
- symlink 逃逸会被阻止。
- safe bash 只允许常见检查、搜索、git、lint、test、typecheck、build 等命令。
- Bash 默认使用收窄后的子进程环境，不复制任意宿主变量。Windows 下会从 `USERPROFILE` 派生 `APPDATA`、`LOCALAPPDATA` 和 `GH_CONFIG_DIR`，让 GitHub CLI 等工具复用配置和系统 keyring，但不会复制 `GH_TOKEN` 或无关 API 变量。
- `CODEXPRO_INHERIT_ENV=1` 会改为继承完整宿主环境，只应在受信任的本地仓库中使用。
- Contract V3 默认 execution `off`；只有显式 V3 Permission Profile 和本机一次性审批才能启用 `full_access`。保留的 `workspace` sandbox profile 当前不可用。
- `codexpro start --no-bash` 会完全关闭 ChatGPT 可调用的 bash 工具。
- `execute-handoff` 和 `watch-handoff` 是本地 CLI 命令，不是远程 MCP 工具。

只有在你信任当前仓库和命令时，才考虑更宽的权限，例如 full bash、自定义执行器、额外 allow root。

### Codex 会话边界

CodexPro 不能绑定、读取或复用某一个 Codex App 会话 id。MCP 里的 session id 只是 ChatGPT 和 CodexPro HTTP 服务器之间的传输会话，不代表 Codex 里的某个聊天或终端会话。

`bash` 工具属于你启动的 CodexPro 本地服务器进程，并在配置的 workspace root 下运行。想并行处理另一个任务时，请为另一个仓库、端口或 tunnel profile 启动单独的 CodexPro；不要把它理解成“远程控制当前 Codex 会话”。

如果要减少误触发，可以给这个本地 CodexPro 进程设置 bash session guard：

```bash
codexpro start --bash-session main --require-bash-session
```

这不是 Codex App 聊天会话 id，而是 CodexPro 本地 bash 工具的显式匹配标签。

bash 结果默认使用紧凑 transcript，避免 ChatGPT 对话里突然铺开大段 stdout/stderr。完整 stdout/stderr 仍在结构化工具数据里，CodexPro 卡片里的输出预览默认折叠。需要旧行为时可以显式打开：

```bash
codexpro start --bash-transcript full
```

CodexPro 也可以在 full tools 下显式开启只读的本地 Codex 会话列表：

```bash
codexpro start --tool-mode full --codex-sessions metadata
codexpro start --tool-mode full --codex-sessions read
```

`metadata` 会增加 `codex_sessions` 工具，从 `~/.codex/sessions` 和 `~/.codex/archived_sessions` 读取本地 JSONL 历史，列出 session id、标题、cwd、来源文件和 `codex resume <session-id>` 命令。`read` 还会增加 `read_codex_session`，用于有限长度的 transcript 读取。它类似本地 session manager 扫描 Codex 历史文件，但仍然不会附加到正在运行的 Codex App 聊天，也不会在那个会话里执行命令或绕过产品限制。

如果 Codex 历史不在默认位置，可以用 `--codex-dir <dir>`。

如果只想让 ChatGPT 规划、由你本地决定是否执行：

```bash
codexpro start --mode handoff --no-bash
```

## 常用命令

```bash
codexpro setup
codexpro start
codexpro doctor
codexpro settings
codexpro settings list
codexpro settings set --tunnel ngrok --hostname your-name.ngrok-free.dev
codexpro settings delete --yes
codexpro pro-bundle --copy
codexpro execute-handoff --agent opencode --model provider/model --dry-run
codexpro watch-handoff --agent opencode --model provider/model --yes
```

终端控制键：

```text
Enter  打开 ChatGPT connector 设置
c      再次复制 Server URL
o      打开本地 admin dashboard
h      显示帮助
q      停止 CodexPro
```

本地 admin dashboard 是带 token 保护的 setup/settings 页面。它会显示当前 workspace、local MCP endpoint、安全模式、安装/启动命令、ChatGPT 连接步骤、saved profile 设置和 allowed roots。

页面也提供 GitHub、npm、docs 链接，以及 global install、guided setup、daily start、source checkout setup 和高级重启命令的复制按钮。它能修改下一次启动使用的 saved profile：tunnel provider、public hostname、port、mode、bash mode、transcript、Codex session 模式、write mode、tool mode、widget origin 和 tunnel config 路径。修改后需要重新运行 `codexpro start` 才会生效。

浏览器 admin 页面只负责 setup/settings/status 和 MCP endpoint；不能切换 ChatGPT 账号，不能直接保存原始 Cloudflare tunnel token，也不能把 CodexPro 作为后台服务开关。Cloudflare dashboard-managed tunnel 请把 token 放在本地文件里，再填写 Cloudflare token file。

## FAQ

中文常见问题见 [FAQ_ZH.md](FAQ_ZH.md)。

核心结论：

- 需要能访问 Apps / Developer Mode 的 ChatGPT 账号。
- Free / Go 在当前测试中不支持这个 App 创建流程。
- CodexPro 不绕过任何速率限制。
- 某些 Pro / planning 模型界面不能直接连接 MCP 工具，使用 `pro-bundle` 作为上下文回退。
- quick tunnel 每次重启 URL 会变。
- 想每天同一个 URL，用 ngrok free dev domain 或 Cloudflare named tunnel。

## 开源与贡献

项目地址：[github.com/chatGPT-10/codexgpt](https://github.com/chatGPT-10/codexgpt)

欢迎提 issue、补文档、补平台兼容性、补测试。提交 PR 前请至少运行：

```bash
npm run build
npm run smoke
npm audit --omit=dev
```

如果 CodexPro 对你有用，请在 GitHub 点星。这样其他使用 ChatGPT、Codex、OpenCode、Pi 和 MCP 的开发者更容易找到它。
