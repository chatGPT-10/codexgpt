# CodexGPT 中文 FAQ

## 我应该用什么 ChatGPT 账号？

使用当前界面能显示 Apps、Developer Mode 或连接管理入口的 ChatGPT 账号。可用性会受账号、工作区策略和 rollout 影响；以 ChatGPT 当前界面为准。

CodexGPT 不解锁 Developer Mode，不解锁模型，不绕过账号限制，也不提供账号访问。它只连接你自己的 ChatGPT App 界面和你自己的本地仓库。

## 推荐安装方式是什么？

注意：这个 FAQ 跟随 GitHub `main`。假设某个 `main` 功能已经进入 `codexgpt@latest` 前，请先看 npm badge/version。

全局安装一次：

```bash
npm install -g codexgpt
```

然后进入目标仓库运行：

```bash
codexgpt setup
```

以后每天从同一个仓库启动：

```bash
codexgpt start
```

`npx codexgpt@latest start` 仍然可用，但普通用户更容易理解全局安装。

## ChatGPT 里要打开什么设置？

打开 ChatGPT 当前的 Apps / Plugins 连接管理页面；若界面提供 Developer Mode，先启用它：

```text
Settings -> Plugins / Apps -> + / Create
```

创建 Plugin 时使用当前支持的个人 ChatGPT 兼容流程：

```text
Name: CodexGPT
Description: Local workspace bridge for ChatGPT coding
Connection: Server URL
Server URL: 粘贴 CodexGPT 复制的完整地址，包括 codexgpt_token
Authentication: No Authentication / None（若显示该字段）
```

完整 Server URL 包含 query-token 凭据。请把它当成等同密码的秘密，因为它可能泄露到浏览器历史、剪贴板、截图、日志和复制的链接中。不要分享、发布或提交它。未发布的 source checkout 已完成本地验证的 Phase 8 Tasks 8A1–8A9、真实 Gate G8-U Journeys U2–U7 和本地 G8-X，并继续通过独立 OAuth App 与 token-free URL 工作；exact-head CI 与 publication 仍未完成。本节只说明保留的 Legacy 兼容 App。不要混用两个 App，也不要把任一路径改成手动 static Bearer。

## CSP 要保持开启吗？

要保持开启。

CodexGPT 的小组件按 CSP 开启的路径构建。它不需要远程脚本、外部字体、iframe、第三方图片或任意外部请求。

## CodexGPT 会绕过速率限制吗？

不会。

CodexGPT 不绕过、不提升、不合并、不转售、不修改 ChatGPT、Codex、OpenAI 或第三方模型限制。所有请求仍然通过你自己的 ChatGPT 会话，并受该账号当前限制约束。

它的价值在于 ChatGPT 和 Codex 是不同产品界面。某个工作流暂时不可用时，如果另一个你本来就有权限的界面仍可用，CodexGPT 可以让它继续操作同一个本地仓库。

## CodexGPT 可以使用 GPT-5.5 吗？

前提是你的 ChatGPT 账号已经在 Web 产品里提供这个模型或同级更强模型，并且该模型界面可以调用 Developer Mode Apps。

CodexGPT 不提供、不代理、不转售、也不解锁模型。它只给兼容的 ChatGPT 会话提供本地仓库工具。

如果某个模型不能直接调用工具，用上下文包回退：

```bash
codexgpt pro-bundle --root /path/to/repo --copy
```

然后把生成的 `.ai-bridge/pro-context.md` 粘贴给该模型，让它做规划，再用本地执行器执行。

## 项目指令和 Skills 是怎么工作的？

普通 `standard` 模式默认启用项目指导。首次打开 workspace 时会返回有界的根 `AGENTS.md` 正文和可隐式使用的 workspace Skill 简表；首次修改前，以及切换到另一个子树后，ChatGPT 应调用 `codex_context(target_path)`，获取精确的 root-to-target 指令链和目标范围内的 Skill catalog。

匹配 Skill 只会按需读取，并且始终只是指令文本。Skill 脚本不会自动执行，声明的依赖不会自动安装或视为已验证；AGENTS 和 Skills 都不能启用工具、扩大 root、批准修改，也不能绕过 Policy、Approval、Audit、blocked path 或执行模式。user/plugin Skills 只有显式请求全局发现时才会出现。

`--tool-mode minimal` 不暴露 `codex_context`。因此省略 guidance 配置时，minimal 模式使用精确的 `legacy` 兼容投影；若显式组合 `CODEXGPT_GUIDANCE_MODE=standard` 与 minimal，启动会失败。Phase 6 工具更新前创建的 App 可能需要执行一次 **Scan Tools** 或重建。

## 为什么 Pro 账号也可能连不上某个模型？

账号权限和模型工具能力是两回事。

即使当前界面提供 Apps / Developer Mode，某个具体模型界面仍可能不能调用连接器或 MCP 工具。遇到这种情况时，用 `codexgpt pro-bundle --copy` 导出上下文，再把计划交给本地代理执行。

## ChatGPT 能通过 CodexGPT 看到什么？

ChatGPT 能看到工具显式暴露的工作区内容：

- `AGENTS.md`
- `.ai-bridge` 计划、状态、执行记录
- git status
- git diff
- 文件树和搜索结果
- 你让它读取的源码文件

它不能读取 Codex 的隐藏运行时记忆，也不能读取工作区外的文件，除非你明确允许额外 root。

## ChatGPT 可以编辑什么？

Normal coding 模式下，ChatGPT 可以在配置的工作区内写入和精确编辑文件。

默认会阻止：

- `.env`
- 私钥
- `.git`
- `node_modules`
- 生成目录和缓存目录
- symlink 逃逸
- 工作区外路径

如果你只想让 ChatGPT 规划，不想让它直接改源码，用 handoff 模式。

## workspace_id 会在不同 ChatGPT 会话之间共享吗？

不会。`workspace_id` 现在是随机、不可从路径推导的句柄，只属于一个 MCP Server 会话：HTTP 模式下属于一个 transport session，STDIO 模式下属于一个进程会话。同一活动会话重复打开同一 root 会复用本会话句柄；另一个会话会获得不同句柄，也不能使用或列出前一个会话的工作区。

调用 `close_workspace` 可以立即使句柄失效；重新打开同一 root 会生成新句柄。空闲句柄按 `CODEXGPT_WORKSPACE_TTL_MS` 过期，默认跟随 HTTP session TTL，通常为 30 分钟；成功使用会刷新空闲期限。

为保留一个兼容周期，省略 `workspace_id` 时仍会选择当前会话自己的默认 root，但不会恢复跨会话共享。

## CodexGPT 能把 bash 绑定到某个会话 id 吗？

CodexGPT 不能附加到、读取或复用某一个 Codex App 聊天会话或终端会话。

MCP 的 `bash` 工具是在你启动的 CodexGPT 本地服务器进程里，针对配置的 workspace root 执行。MCP session id 只是 ChatGPT 和 CodexGPT HTTP 服务器之间的传输状态，不是 Codex 会话 id。

但 CodexGPT 可以要求 bash 调用带上匹配的本地 session 标签：

```bash
codexgpt start --bash-session main --require-bash-session
```

之后 `bash` 调用必须包含 `session_id: "main"`。这能避免误触发到错误的 CodexGPT 终端，但不是远程控制某个已有的 Codex App 聊天。

如果你显式开启，CodexGPT 可以列出本地 Codex session id 和标题：

```bash
codexgpt start --tool-mode full --codex-sessions metadata
```

它会读取 `~/.codex/sessions` 和 `~/.codex/archived_sessions` 下的本地 Codex JSONL 历史，返回 metadata 和 `codex resume <session-id>` 命令。只有需要有限长度 transcript 读取时才使用 `--codex-sessions read`。它不会附加到正在运行的 Codex App 聊天。

如果你正在 Codex 里工作，不希望 ChatGPT 触发 shell 命令，可以关闭 bash：

```bash
codexgpt start --no-bash
```

如果只想让 ChatGPT 写计划，由 Codex 或其他本地 agent 执行：

```bash
codexgpt start --mode handoff --no-bash
```

## 选择哪种 tunnel？

按这个规则选：

```text
快速 demo：          Cloudflare quick tunnel
推荐稳定 URL：       ngrok free dev domain
自定义域名：          Cloudflare named tunnel
Tailnet 用户：        Tailscale Funnel
无公网 URL：          local-only，只适合能访问 localhost 的 MCP 客户端
```

Cloudflare quick tunnel 每次重启 URL 都变。把 quick URL 填到 ChatGPT 后，每次重启都要改 ChatGPT App 的 Server URL。

大多数用户建议用 ngrok free dev domain。创建免费 ngrok 账号，在 Universal Gateway -> Domains 找到分配给你的 dev domain，并在 `codexgpt setup` 里保存。

如果你有自己的域名，用 Cloudflare named tunnel，把 DNS 路由到例如 `codexgpt.example.com` 的主机名。

## ChatGPT 创建 connector 时显示 “Something went wrong” 怎么办？

通常是 ChatGPT 无法访问公网 MCP URL。生成 `trycloudflare.com` URL 不代表 `cloudflared` 一直连通。

运行连接测试：

```bash
codexgpt connection-test --root /path/to/repo
```

这个模式保留 `read`、`tree`、`search` 和 `load_skill`，关闭文件写入、bash 和 tool cards，并记录请求是否到达本地 MCP endpoint。在 ChatGPT 当前的 Apps / Plugins 连接管理页面创建 development plugin，粘贴包含 `codexgpt_token` query string 的完整 Server URL；若显示 Authentication 字段，选择 `No Authentication / None`。

- 没有 `POST /mcp received`：请求没有到达 CodexGPT，检查 ChatGPT Plugins 页面和 tunnel。
- `POST /mcp -> 401`：没有使用完整 URL、query token 被删除，或凭据与当前 CodexGPT 进程不匹配。
- `POST /mcp -> 2xx`：ChatGPT 已到达 CodexGPT，MCP endpoint 也已响应。

测试期间保持 CodexGPT 运行。Cloudflare quick tunnel 每次重启都会更换 URL。如果 Cloudflare 返回 `530` / `Error 1033`，检查运行 `cloudflared` 的机器上的 DNS 或代理客户端 DNS 设置。

ChatGPT 现在在 Plugins 中管理 development app。浏览器错误 `Failed to execute 'removeChild' on 'Node'` 发生在 ChatGPT 页面中，早于任何 CodexGPT MCP 请求。请在 Plugins 页面删除或重建旧条目，再使用当前 URL 重试；CodexGPT 无法修复浏览器端的旧条目。

## 能每天使用同一个 ChatGPT App URL 吗？

可以，前提是使用稳定 hostname。

推荐简单路径：

```bash
codexgpt setup
# 选择 ngrok
# 输入你的 ngrok free dev domain
```

之后：

```bash
codexgpt start
```

同一个 hostname 和 CodexGPT token 会被当前工作区复用。请保护包含凭据的完整 Server URL；每次轮换 token 后，都要在 ChatGPT 中替换这个完整 URL。

## quick mode 为什么每次都要改 URL？

Cloudflare quick tunnel 是一次性的临时地址。每次重新启动 tunnel，Cloudflare 会分配一个新的 `trycloudflare.com` URL。

如果你不想改 ChatGPT 设置，用 ngrok free dev domain 或 Cloudflare named tunnel。

## 同时跑两个仓库怎么办？

给每个仓库使用不同本地端口和不同 tunnel hostname。

示例：

```text
repo A: port 8787, hostname A
repo B: port 8788, hostname B
```

分别在两个仓库里运行 `codexgpt setup` 并保存 profile。

## 能不能用 codexgpt.github.io？

GitHub Pages 的 `owner.github.io` 只能由名为 `owner` 的 GitHub 用户或组织使用。

`codexgpt` 这个 GitHub 用户名已经存在，所以 `rebel0789` 账号下的项目不能使用 `codexgpt.github.io`。

当前干净的 GitHub Pages 地址是：

```text
https://rebel0789.github.io/codexgpt/
```

中文页面是：

```text
https://rebel0789.github.io/codexgpt/zh.html
```

## CodexGPT 是否违反服务条款？

CodexGPT 使用 ChatGPT 的官方 Developer Mode / MCP App 接入路径，让你自己的 ChatGPT 会话连接到你自己的本地工具。

它不绕过限制，不抓取隐藏接口，不共享账号，不转售模型，不伪造请求来源，也不把第三方模型包装成别的模型。

用户仍然需要遵守 ChatGPT、Codex、OpenAI 和任何第三方服务的条款。

## CodexGPT 生产环境安全吗？

CodexGPT 是本地开发桥，不是操作系统级沙箱。

只在你信任的仓库里使用。公网 tunnel 保持 token auth 开启。保持 safe bash，除非你明确知道为什么需要 full bash。公网暴露前先读 [SECURITY.md](SECURITY.md)。

## 保存的设置在哪里？

工作区配置保存在：

```text
~/.codexgpt/profiles/
```

当前运行连接文件保存在：

```text
~/.codexgpt/runtime/
```

严格的 Policy Kernel Permission Profile 保存在：

```text
~/.codexgpt/permissions/
```

使用共享凭据身份时，CodexGPT 会把安装级 HMAC 密钥保存在 `~/.codexgpt/policy/identity-hmac.key`。它属于私有本地状态，不要分享或手工编辑；替换后，后续生成的 credential reference 会改变。设置 `CODEXGPT_HOME` 可以移动整个 CodexGPT 状态目录。

管理命令：

```bash
codexgpt settings
codexgpt settings list
codexgpt settings delete --yes
```

显示设置时，保存的 token 会被打码。

## CodexGPT 能帮助 ChatGPT 维持上下文吗？

可以帮助，但方式是显式文件和上下文包，不是隐藏记忆。

推荐使用：

- `AGENTS.md` 写项目规则。
- `.ai-bridge/decisions.md` 写关键决策。
- `.ai-bridge/current-plan.md` 写当前计划。
- `.ai-bridge/agent-status.md` 写本地执行结果。
- `codexgpt pro-bundle --copy` 给不能调用工具的模型生成上下文包。

这样 ChatGPT 断线、换模型或换会话后，仍然可以通过文件恢复上下文。

## Policy Kernel 的 `legacy`、`shadow` 和 `enforce` 分别是什么？

`legacy` 是迁移周期默认值，保持原有执行路径。`shadow` 仍执行原路径，同时只计算经过脱敏的比较结果。`enforce` 让编译后的 Policy Kernel 成为权威判断；策略或所需执行能力事实不可用时直接失败关闭。

Contract V1 与 V2 保留原有严格行为，不会创建 pending approval。显式 Contract V3 为 confirmed root 和可信代码 Windows 进程执行增加仅限本机的审批 CLI；远程 MCP 客户端不能批准自己的请求。`full_access` 仍具有当前 Windows 用户的环境权限，不是沙箱。由于 AppContainer/LPAC 隔离门没有通过，保留的 `workspace` profile 仍不可用。

Permission Profile 是 `~/.codexgpt/permissions/` 下的严格本地 JSON 文件，与保存的运行连接 Profile 分离。`toolMode` 只改变工具是否可见，不会扩大 Permission Profile、hard policy、身份 scope 或执行能力。启用方式和本机审批流程见 [README_ZH.md](README_ZH.md) 的 Contract V3 章节。

迁移周期内可以回滚到经过审查的 `legacy` 行为、生成的兼容 profile，或更窄的只读 profile。Policy Kernel 启动或 profile 错误不会自动退回无策略执行。
