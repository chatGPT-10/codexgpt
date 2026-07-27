# CodexGPT 总体实施计划

> 版本：2.6
> 生效日期：2026-07-13
> 核对日期：2026-07-27
> 状态：当前权威实施路线
> 工作区：`D:\Dev\codexpro`
> 基线版本：`codexgpt@1.0.0`
> 当前阶段：Phase 1–8 Core 已关闭。Phase 8 关闭基线为 `55b2b5664aae322ec992968a41c87a289fb75282` / CI `30274857996`；首个稳定版本 `codexgpt@1.0.0` 已从 `main` merge commit `9131c393da3a1eb3c9514710b0b1569f55dd5acb` 发布，merged exact-head CI `30283923175`、npm `latest`、annotated tag `v1.0.0` 与 GitHub Release 均对齐该提交。
>
> 下一动作：不自动进入下一实施阶段；由 owner 从已审阅的 post-Phase-8 backlog 中明确选择并授权下一个最小切片，默认优先级为 configuration provenance、diagnostic foundation、current-user background lifecycle、incremental modularization。U6 继续保留“重建 Legacy App 兼容性通过、被删除旧 App 身份连续性不宣称”的证据替代。
>
> 授权状态：Phase 1 → Policy Kernel → Phase 2A–Phase 8 Core 与 `1.0.0` 发布均已完成。当前没有隐含的 post-`1.0.0` 实施或 deployment 授权；真实凭据迁移、无关 Cloudflare/Tunnel/DNS 变更、运行环境 deployment、Phase 7B/7C、force push 与破坏性历史操作仍单独受控。

本文件取代下载目录中的 `codexgpt_audit_and_implementation_spec_2026-07-11.md`，成为后续架构顺序、阶段边界和验收门禁的默认依据。旧文件保留为 2026-07-11 的历史审计快照，不继续原地修改。

---

## 0. 文档契约

### 0.1 每类文档负责什么

| 文档 | 唯一职责 |
|---|---|
| `AGENTS.md` | 不可绕过的工作方式、安全约束和审批规则 |
| 本文件 | 产品方向、架构边界、阶段顺序、设计门和阶段验收 |
| `docs/superpowers/specs/` | 一个具体切片或子系统的已审查设计 |
| `docs/superpowers/plans/` | 对应设计的可执行 TDD 实施步骤 |
| `docs/reviews/` | 绑定精确上游/本项目基线的只读审阅与差距分析 |
| `Memory.md` | 当前真实状态、下一动作、活跃决策和最终证据索引 |
| `docs/memory/archive/` | 逐 STEP 的完整、追加式实施记录 |
| `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md` | 2026-07-11 审计基线和历史路线图，不再负责当前排序 |

### 0.2 冲突处理

1. 系统级安全约束、用户指令和 `AGENTS.md` 高于本计划。
2. 本计划决定阶段依赖和禁止越界事项。
3. 已批准的专项设计可以细化本计划，但不能静默改变阶段边界。
4. 如专项设计需要偏离本计划，必须先修改本文件或记录一次显式例外并获得批准。
5. `Memory.md` 和代码/测试反映当前事实；若它们与计划状态不同，先核实并同步文档，不以计划文字覆盖事实。

### 0.3 本文件不是什么

2026-07-14 曾记录连续执行至 Phase 8 的条件授权。2026-07-22 的后续指令先完成 Phase 6 详细设计，随后显式授权 Phase 6 runtime implementation 与单一审计依赖；2026-07-23 又授权完成 Phase 6 formal closure 所需的有界修复、英文 commit、普通 push 和 exact-head attempt，并单独授权 Phase 7 详细设计与 TDD 计划。2026-07-24 follow-up 进一步授权剩余 Phase 7 Core closure，包括真实 G7-U、最终本地门禁、reviewed stage/commit、普通 push 与 bounded exact-head diagnosis/repair。2026-07-26 先完成 Phase 8 设计/审阅，随后追加授权 Phase 8 Core source/runtime、精确依赖、Windows DPAPI helper 与 disposable local credential tests；外部状态、发布与 Git publication 仍分开批准。每个工具切片和每个安全子系统仍必须单独经历：

```text
设计草稿
→ 用户或既有授权门确认
→ 可执行计划
→ TDD 实施
→ 本地验证
→ 结果审查与修正
→ 按已记录的授权范围发布；未覆盖的外部状态变更仍单独批准
→ 精确头 CI 验证
→ Memory 与归档同步
```

---

## 1. 第一性目标

CodexGPT 要解决的不是“增加更多 MCP 工具”，而是：

> 让 ChatGPT 能够通过用户自己的安全入口，可靠地操作用户明确授权的本地项目，同时让每一次能力扩大都可解释、可限制、可验证、可审计、可回滚。

目标链路保持：

```text
ChatGPT Web
  → HTTPS
mcp.<user-domain>
  → Cloudflare DNS / TLS / Tunnel
127.0.0.1:8787
  → customized CodexGPT
  → explicitly authorized local workspaces
```

硬约束：

1. Windows 原生优先，不把 WSL 变成必需依赖。
2. PowerShell 是核心 backend；Git Bash 可作为兼容 backend；Bash 可以保持可选。
3. 完全自托管。Cloudflare 只负责 DNS、TLS 和 Tunnel，不引入项目方托管的 Remote MCP relay。
4. 本地服务优先只监听 `127.0.0.1`，不直接开放本地入站端口。
5. 安全边界必须在本地执行，不能只依赖 Cloudflare。
6. Safe Bash 是策略过滤器，不是操作系统沙箱。
7. 不推倒重写；只在当前阶段抽取当前阶段需要的边界。
8. 用户体验优先：面向目标提供少量清晰预设，系统内部承担权限组合复杂性。
9. 工具可见性、授权、审批和操作系统隔离是四个不同问题，不能混为一谈。
10. 凭据、完整 Token、私钥和敏感内容不得进入日志、diff、文档、测试夹具或无必要展示的 URL。

---

## 2. 2026-07-13 当前基线

### 2.1 已完成状态

| 阶段 | 状态 | 事实 |
|---|---|---|
| Phase 0 | 完成 | 初始架构、安全、测试、工具和外部参考审计完成 |
| Phase 0.5 | 正式关闭 | Windows/Ubuntu CI、路径策略、Host/Origin、入口认证兼容、Doctor、Cloudflared 完整性与真实外部 Host 转发均已验证 |
| Phase 1 | 正式关闭 | 28 个切片已发布；统一实现 `021ab90` 与 Windows 修复 `e20d84e` 通过精确头四矩阵 CI run `29314923948` |
| Policy Kernel 设计门 | 已通过 | 2026-07-14 批准 compiled-kernel Approach B；四份设计规格完整并通过自审 |
| Phase 2A | 正式关闭 | 12 个 TDD 任务与 84 个步骤完成；实现 `e6798b6` 与 Linux 路径测试修复 `dea25ec` 通过 exact-head run `29326459987` 的 Ubuntu/Windows Node 20/24 四矩阵 |
| Phase 2B | 正式关闭 | 工作区生命周期实现与替换 CI 已通过 Ubuntu/Windows Node 20/24 四矩阵 |
| Phase 3 | 正式关闭 | runtime head `2df4a1f` 与 documentation closure head `3a04064` 均通过 Ubuntu/Windows Node 20/24 Build、Regression、完整 Smoke 与 Package |
| Phase 4 | 正式关闭 | closure head `d19e65b` 通过 exact-head run `29603060944` 的 repository policy 与 Ubuntu/Windows Node 20/24 完整矩阵；4B0 保留 blocked 诊断，`workspace` 与 Task 4B1–4B6 延期 |
| Phase 5 | 正式关闭 | closure head `9aa76b92d7894a2f013b2d6478897907c4010a7e` 通过 exact-head run `29698209894`；后续 Gate X 修复经 PR #4 合并到 `main`，STEP-379/380 follow-up head `576029b37c8b147e3fd1d0e383ba3bbdaa4f6ee4` 通过 run `29780813295` 的完整矩阵 |
| Phase 6 | 已关闭 | closure head `31631676fe254962a9a4f14d6e025e3edba82b8d` 的 run `30033293444` 已通过 Repository policy 与 Ubuntu/Windows Node 20/24 Build、Regression、Smoke、Package |
| Phase 7 | Core 已正式关闭 | owned-worker 零配置 JS/TS、symbol locator、exact inherited V5=52、quality-labeled fallback、approval/identity-bound atomic rename 已实现；真实 ChatGPT U2–U6 已通过 STEP-430，最终本地 G7-X 已通过 STEP-432，closure head `a0b9f46e2297297959527f7570c9cb7942cc8fb3` 与 run `30171313296` 已通过完整矩阵 |
| Phase 8 | 本地实现关闭；exact-head publication 待授权 | G8-0、Tasks 8A1–8A9、专用 OAuth Tunnel/App、Journeys U2–U7 与 STEP-470 local G8-X 已通过；U6 保留删除旧 Legacy App 后的证据替代，不宣称旧 App 身份连续性；exact-head CI、publication/deployment 尚未完成 |
| Phase 9 | 未批准 | Subagents 继续保留独立批准门 |

Phase 0.5 已验证的外部入口事实：公开 `https://codexgpt.drliang.uk/healthz` 已通过 Cloudflare 到达本地 CodexGPT，Host 校验通过后在认证层返回预期的 `401 Unauthorized`。

### 2.2 当前认证和入口事实

1. `scripts/codexgpt-entry.mjs` 是受支持的公开 CLI 入口。
2. 直接运行 `node scripts/codexgpt.mjs` 会绕过入口层保护，不是受支持的公开启动方式。
3. 当 `CODEXGPT_ALLOW_QUERY_TOKEN` 未设置时，受支持 CLI 使用面向 ChatGPT Web 的个人 query-token 兼容流程。
4. CLI 可以为此流程打印和复制含凭据的 Server URL，并必须提示 ChatGPT 配置为 `Authentication: None / No Authentication`。
5. 完整 Server URL 是秘密，可能通过历史记录、剪贴板、截图、日志或转发链接泄露。
6. `CODEXGPT_ALLOW_QUERY_TOKEN=0` 只适用于能主动发送 `Authorization: Bearer` 的兼容客户端。
7. 服务端 Bearer 支持仍保留，但文档不能声称 ChatGPT Web 支持手工静态 Bearer 配置。
8. OAuth 2.1 是当前 Phase 8 标准化方向。G8-0 与 Tasks 8A1–8A9 已在本地完成：DPAPI、atomic auth state、双 listener、constrained DCR/PKCE、ES256 access/rotating refresh、durable revoke/replay、request-local policy/scope enforcement、精确 tool metadata、supported setup/local administration、Tunnel ownership verification、protected recovery/rebind、no-deletion rollback、migration/security documentation、package boundary、complete synthetic OAuth/MCP integration 与完成态 adversarial repairs 已实现。真实 ChatGPT/Cloudflare 联调、凭据迁移、发布与外部门禁仍须单独获批。
9. 非 loopback 和 Tunnel 模式必须在没有认证时 fail closed；Host 和 Origin 校验必须在本地执行。

### 2.3 当前配置事实

当前真正存在的三个主要能力轴是：

```text
toolMode:  minimal | standard | full
writeMode: off | handoff | workspace
bashMode:  off | safe | full
```

`handoff` 不是 `toolMode`，`pro` 也不是当前 `toolMode`。当前 `minimal` 仍可能在其他轴允许时暴露写入或 Bash，因此它只是工具集合名称，不是安全等级。

### 2.4 Phase 1 已发布的 16 个切片

1. `server_config`
2. `tree`
3. `read`
4. `git_status`
5. `git_diff`
6. `show_changes`
7. `search`
8. `write`
9. `edit`
10. `apply_patch`
11. `bash`
12. `open_current_workspace`
13. `open_workspace`
14. `workspace_snapshot`
15. `list_workspaces`
16. `inspect_workspace`

这些切片已建立以下协议基础：

```text
tool identity
+ ok
+ data
+ error
+ meta
```

其中初始 `meta` 精确为：

```text
schemaVersion
durationMs
warnings
```

`requestId` 仍延后到能够建立可信 transport-aware 请求身份之后。

### 2.5 Phase 1 本地完成、纳入统一发布批次的 Slice 17–24

`codexgpt_inventory`、`load_skill`、`read_handoff`、`wait_for_handoff`、`codex_context`、`export_pro_context`、`handoff_to_agent` 和 `handoff_to_codex` 已完成设计、TDD 实现、消费者迁移、结果后审查、全部本地门禁和逐工具 `neat-freak` 对账。Slice 17–28 在本地连续实施；全部 12 个工具完成前保持未 staged、未 commit、未 push，目标完成后统一发布并以 Ubuntu/Windows Node 20/24 精确头 CI 验收。

### 2.6 Phase 1 尚余 4 个支持面

当前 `FULL_TOOL_NAMES` 包含 26 个核心工具，配置还可能额外广告 2 个 Codex Session 工具。Phase 1 的完成标准覆盖整个受支持广告面，而不只覆盖默认模式。

默认迁移顺序：

| 顺序 | 工具 | 排序理由 |
|---:|---|---|
| 25 | `codex_sessions` | 固定按配置启用的本地会话索引契约 |
| 26 | `read_codex_session` | 依赖会话索引、路径限制和有界读取 |
| 27 | `codexgpt_self_test` | 聚合自检应在被检查能力稳定后迁移 |
| 28 | `codexgpt` | 最后迁移 supertool，避免包装尚未稳定的子工具 |

如某个切片设计审查发现更小的硬前置，可以调整相邻顺序，但必须在 `Memory.md` 记录原因；不得因此越过 Phase 1 或开始 Policy Kernel 实现。

---

## 3. 已批准的总体路线

```text
Phase 1：完成全部受支持工具的精确输出契约
  ↓ 完成门
Policy Kernel 设计门：只设计，不改生产行为
  ↓ 设计验收通过；Phase 2–5 条件授权已于 2026-07-13 记录
Phase 2A：实现 Policy Kernel 与 RequestContext/Identity 基础
  ↓ 验收
Phase 2B：实现工作区生命周期与隔离
  ↓
Phase 3：原子编辑与持久审计
  ↓
Phase 4A：Windows Shell backend 与持久进程
  ↓
Phase 4B：保留诊断证据，强 OS Sandbox 延期
  ↓
Phase 5：Git 写能力与任务 Worktree
  ↓
Phase 6：Project Guidance 与 Agent Skills 可用性（无 generic Hooks）
  ↓
Phase 7：语义 Provider
  ↓
Phase 8：OAuth 2.1 与公网认证强化
  ↓
Phase 9：Subagents
```

四个硬门禁：

1. Phase 1 未完成，不开始 Policy Kernel 设计门。
2. Policy Kernel 设计门未满足全部设计验收项，不实施 Phase 2；通过后使用已记录授权继续，不再暂停索要重复批准。
3. Phase 2 未建立可执行权限与身份基础，不向 Shell、Hooks、Skills、Semantic 或 Subagents 扩权。
4. 任一阶段验收未通过，先修复该阶段，不得靠降级安全边界进入下一阶段。

---

## 4. 目标请求与安全架构

### 4.1 目标请求流

```text
Public entry / STDIO
  ↓
Transport security
  ├─ Host / Origin
  ├─ authentication mode
  ├─ transport session
  └─ request limits
  ↓
RequestContext
  ├─ RequestIdentity
  ├─ workspace/session binding
  ├─ selected PermissionProfile
  └─ current SessionGrant
  ↓
Tool Surface Profile
  └─ 决定客户端看得到哪些工具，但不授予权限
  ↓
Policy Kernel
  ├─ immutable hard policy
  ├─ identity scopes
  ├─ permission profile
  ├─ approval policy
  └─ effective-policy provenance
  ↓
Domain service
  ├─ Workspace / Files / Git
  ├─ Shell / Process
  ├─ Instructions / Hooks / Skills
  └─ Semantic
  ↓
SandboxBackend（需要时）
  ↓
Redacted audit event
  ↓
Exact tool-specific result envelope
```

### 4.2 四个必须分离的概念

| 层 | 回答的问题 | 不能代替什么 |
|---|---|---|
| Tool Surface | 这个客户端看得到哪些工具？ | 不能代替授权 |
| Policy | 这个身份对这个资源最多能做什么？ | 不能代替 OS 隔离 |
| Approval | 这次操作是否必须询问用户？ | 不能突破硬边界 |
| Sandbox | 进程在操作系统层实际能接触什么？ | 不能表达用户意图 |

“用户批准”绝不等于“使用当前 Windows 用户权限访问整台电脑”。审批只能在预先定义的上限内扩大当前会话授权。

### 4.3 有效权限公式

Policy Kernel 的基线公式为：

```text
effective ceiling
  = hardPolicy
  ∩ identityScopes
  ∩ permissionProfile

effective permission
  = effective ceiling
  ∩ sessionGrant
```

Approval 只能把 `sessionGrant` 扩大到 `effective ceiling`，不能越过以下任一项：

- 内置秘密文件禁止规则；
- allowed roots；
- 身份 scope；
- Permission Profile 上限；
- 禁止的网络地址类别；
- 当前部署明确关闭的能力。

### 4.4 两级 deny 语义

一级：不可覆盖的硬禁止。

```text
secret-content rules
Windows device / ADS / reserved-name rules
path escape rules
deployment-level disabled capabilities
other built-in non-overridable policy
```

二级：用户 Permission Profile 规则。

```text
先 canonicalize
→ 更具体的规则优先
→ 同等具体度时 deny 优先
→ 没有匹配时使用显式 default
```

Profile、Skill、Hook、AGENTS 和 Approval 都不能覆盖一级 deny。

### 4.5 Permission Profile 基线模型

Policy Kernel 设计门必须把下面的概念模型变成带版本、可迁移、可验证的正式 Schema；不得直接复制仍在变化的上游 TOML 语法。

为避免和当前保存的 CLI/profile 配置混淆，设计阶段统一使用两个概念名：

```text
RuntimeProfile
  当前启动、Tunnel、工具集合和 backend 等运行配置

PermissionProfile
  文件、网络、Shell、Git 和 Process 的访问上限
```

两者可以被同一个用户预设引用，但不能共享一套含糊字段或让 RuntimeProfile 绕过 PermissionProfile。

```ts
interface PermissionProfileV1 {
  schemaVersion: 1;
  id: string;
  workspaceRoots: string[];

  filesystem: {
    default: "deny" | "read";
    rules: Array<{
      pattern: string;
      access: "read" | "write" | "deny";
    }>;
  };

  network: {
    enabled: boolean;
    domains: Array<{
      pattern: string;
      access: "allow" | "deny";
    }>;
    allowPrivateNetwork: boolean;
    allowLoopback: boolean;
  };

  shell: {
    mode: "disabled" | "verify" | "workspace" | "full";
  };

  git: {
    read: boolean;
    write: boolean;
    remoteWrite: boolean;
  };

  process: {
    manage: boolean;
    persistent: boolean;
  };
}
```

这个接口只是设计输入，不是 Phase 2 已批准的公共 API。设计门必须补齐：规则具体度、大小写、路径分隔符、域名通配、继承、默认值、迁移、来源追踪和错误模型。

### 4.6 Identity scope 候选集合

设计门以现有需求为输入审查以下候选 scope，而不是在 Phase 1 直接冻结名称：

```text
workspace:open
workspace:read
workspace:write
shell:verify
shell:full
git:read
git:write
process:manage
audit:read
admin:profile
admin:tokens
```

Scope 表达身份的能力上限，不表达具体路径、域名或命令；资源范围仍由 PermissionProfile 和 hard policy 决定。`git:write` 不隐含 remote write，`shell:full` 也不隐含绕过 Sandbox/Approval。

### 4.7 网络权限不是域名字符串匹配

网络默认关闭。允许网络时至少必须处理：

1. 规范化域名和端口。
2. 域名规则的确定性 allow/deny。
3. 每次解析后的目标 IP 分类。
4. loopback、私网、链路本地和公网分别控制。
5. 重定向后重新授权。
6. DNS rebinding 和解析/连接之间的竞态。
7. 代理、子进程和解释器的旁路。
8. 日志只记录安全摘要，不记录凭据和敏感查询参数。

文件工具可以在 Node 服务内执行 PathPolicy；Shell 和持久进程的网络边界必须由可验证的 OS/代理执行层保证。单独维护一个域名 allowlist 不能构成网络沙箱。

### 4.8 SandboxBackend

`PermissionProfile` 描述政策，`SandboxBackend` 执行政策。两者不能形成互相冲突的双配置系统。

硬性错误契约：

```text
sandbox requested but enforceable backend unavailable
  → SHELL_SANDBOX_UNAVAILABLE
  → fail closed
```

禁止：

```text
sandbox unavailable
  → silently run with current-user permissions
```

Windows Job Object 只负责生命周期和进程树控制，不是文件系统或网络沙箱。真正的 Windows 沙箱方案必须单独验证文件、注册表、进程、凭据和网络边界。

### 4.9 RequestIdentity 的渐进实现

Phase 2A 先建立稳定接口，再由 Phase 8 接入 OAuth 身份。

RequestIdentity 至少需要区分：

```text
transportSessionId
authenticationMode
credentialId（如可安全取得）
subject（如确实存在）
scopes
assurance level
```

Phase 8 前可以绑定 loopback/STDIO、当前兼容 Token 和 transport session，但不能把它宣传为已经实现了强多用户 owner isolation。OAuth subject、token id、撤销和正式 scopes 在 Phase 8 接入同一接口，不另建第二套身份系统。

### 4.10 审计原则

审计事件 Schema 在 Policy Kernel 设计门定义，Phase 3 再实现可靠持久化和保留策略。

默认允许记录：

```text
timestamp
requestId
identity / credential safe id
transportSessionId
toolName
workspaceId
relative resource summary
policy decision and provenance
approval state
sandbox backend
durationMs
result code
exit code
bounded byte counts
```

默认禁止记录：

```text
Authorization / Cookie
完整 Token 或凭据 URL
文件全文
.env 内容
私钥
完整命令输出
浏览器数据
未脱敏的绝对敏感路径
```

---

## 5. 外部项目借鉴规则

### 5.1 来源优先级

1. OpenAI Codex 上游是 Permission Profile、Sandbox、Approval、Hooks、Skills 和 Windows sandbox 行为的第一手参考。
2. Open Interpreter 是 Codex 派生设计的适配、边界案例、Harness 和测试方法参考。
3. DevSpace 是 workspace/worktree/任务工作流的主要参考。
4. Desktop Commander 是持久进程、PTY、游标、输入和中断接口参考。
5. Serena 是可选语义 Provider 参考。

共享机制存在上游来源时，优先核对 OpenAI Codex，不把 Open Interpreter 的二次实现当成唯一规范。

### 5.2 借鉴矩阵

| 优先级 | 借鉴内容 | 进入位置 | CodexGPT 的处理 |
|---:|---|---|---|
| 1 | Permission Profile | Policy Gate、Phase 2A、Phase 8 | 采用分层思想，建立自己的版本化 Schema，不照抄 beta 配置 |
| 2 | Sandbox 与 Approval 分离 | Policy Gate、Phase 2A、Phase 4B | 成为不可绕过的架构原则，沙箱不可用时 fail closed |
| 3 | Project guidance 作用域与读取边界 | Phase 6 | 交付 root/target AGENTS 链与同目标 Skill catalog；统一 same-handle reader，指导内容不能扩权 |
| 4 | Skills 元数据优先、正文/资源延迟加载 | Phase 6 | 保留当前发现/加载机制，补标准 metadata、预算、目标可达性与诊断，不引入自定义 trust/permission manifest |
| 5 | PTY、持久进程和有界输出 | Phase 4A | 借鉴接口与测试边界，Windows 以 ConPTY/Job Object 为核心 |
| 6 | 配置分层 | Policy Gate、Phase 6 | AGENTS、Profile、Skills、MCP 各司其职；generic Hooks 仅可在未来独立门禁重新评估 |
| 7 | 不同场景的工具表面 | Policy Gate、Phase 2A | 做用户目标预设，但明确 visibility 不是 authorization |

### 5.3 明确不采用

- 不加入 OpenAI、Anthropic、Ollama 等模型 Provider。
- 不加入 Claude Code、Kimi、Qwen、DeepSeek 或 SWE-agent Harness。
- 不把 CodexGPT 扩张为通用 Agent Runtime。
- 不依赖项目方运营的云端 MCP relay。
- 不让 Skill、Hook、Semantic Provider 或 Worktree 绕过统一政策。
- 不把 Worktree、字符串命令过滤或 Job Object 描述为安全沙箱。

### 5.4 许可证与来源记录

复制任何外部实现前必须记录：

```text
repository
license
exact commit or tag
files or design elements used
required attribution
local modifications
```

默认优先做设计级重新实现。未确认许可证兼容性时，不复制源代码。

---

## 6. Phase 1 — 完成精确输出 Schema 和稳定错误

### 6.1 目标

让所有当前受支持、可能被 MCP 广告的工具都拥有真实、精确、工具专属的成功与失败契约，为后续重构建立稳定协议边界。

### 6.2 每个剩余切片的固定范围

1. 一个工具专属 Schema 模块。
2. 精确成功 `data` 字段。
3. 固定、脱敏、可测试的错误 code/message/details。
4. 真实 MCP 成功与失败契约测试。
5. 已知内部消费者迁移到 nested `data`。
6. supertool/包装行为兼容。
7. 保留人类可读 `content` 和 MCP `isError` 语义。
8. 不借输出 Schema 迁移之机重构领域服务。

### 6.3 Phase 1 明确不做

- 不实现 Permission Profile。
- 不实现 Policy Kernel。
- 不实现 workspace ownership/expiry/close。
- 不实现原子多文件事务或 undo。
- 不实现 PowerShell backend、PTY 或 OS sandbox。
- 不扩展 Git 写能力。
- 不给 Skills 加执行权限或信任授权。
- 不实现 Hooks。
- 不接 Serena/LSP。
- 不实现 OAuth 或 Subagents。

### 6.4 `codexgpt_inventory` 已执行的切片约束

第 17 个切片已按以下边界完成本地实现：

1. 保留当前 Skills/MCP/能力发现行为，不加入 Phase 6 的 trust/version/permissions/contentHash/enabled 语义。
2. 对部分发现、输出截断、返回数量和总数量给出显式有界语义。
3. 不返回 MCP URL、环境变量值、Header、Token、凭据或不必要的绝对敏感路径。
4. 对 provider/发现失败使用固定安全错误或明确的安全降级，不透传原始异常。
5. 审查 `codexgpt_self_test` 等消费者，但不提前迁移聚合包装工具。

### 6.5 Phase 1 完成条件

```text
[x] 26 个核心工具全部具有精确 advertised outputSchema
[x] 2 个按配置启用的 Codex Session 工具具有精确 outputSchema
[x] 每个工具真实成功输出通过自己的 Schema
[x] 每个工具真实失败输出通过自己的 Schema
[x] 已知内部消费者使用 nested data 或有明确兼容层
[x] supertool 不破坏子工具精确 envelope
[x] 旧 content 和 isError 兼容行为仍通过
[x] 完整 node:test、Build、相关 Smoke 和 Windows Stress 通过
[ ] Ubuntu/Windows Node 20/24 精确头 CI 通过
[x] 无真实凭据、敏感内容或非预期文件进入变更
[ ] Phase 1 归档关闭，Memory 标记完成
```

### 6.6 Phase 1 回滚

每个切片使用普通 revert 撤回自身提交，不 reset 或改写 `main`。兼容层在一个迁移周期内保留；禁止为了回滚一个 Schema 切片而恢复已经修复的安全漏洞。

---

## 7. Policy Kernel 设计门 — 只设计，不实现

### 7.1 触发条件

只有 Phase 1 完成条件全部通过并关闭 Phase 1 归档后，才能开始设计门。

### 7.2 必须交付的设计包

1. `RequestContext` / `RequestIdentity` ADR。
2. Permission Profile V1 Schema、默认值、规则优先级和迁移设计。
3. immutable hard policy 清单与扩展机制。
4. identity scopes、profile、session grant 的组合算法。
5. Approval Policy、风险类别、审批缓存和 escalation ceiling。
6. SandboxBackend 接口、能力探测和 fail-closed 错误模型。
7. 文件、Git、Shell、Process、Network 的资源描述模型。
8. policy decision provenance 和安全可解释输出。
9. audit event Schema 与脱敏边界。
10. 当前 `toolMode`/`writeMode`/`bashMode` 的兼容迁移设计。
11. Windows enforcement spike 计划和不可声称的安全保证。
12. 威胁模型、滥用案例、测试矩阵和回滚方案。

### 7.3 设计门必须回答的问题

- 同一路径规则的“更具体”如何计算？
- Windows 大小写和分隔符如何规范化？
- 新文件尚不存在时如何安全解析父目录？
- symlink/junction 竞态如何降低？
- 域名通配、端口、重定向、DNS rebinding 和私网地址如何处理？
- Approval 能缓存多久，按命令、资源还是内容绑定？
- Profile 变更时现有 session/process 如何处理？
- SandboxBackend 只能部分实施政策时如何报错？
- STDIO、loopback、query-token compatibility 和 Bearer 各自生成什么身份？
- Phase 8 的 OAuth subject/scopes 如何无迁移接入？
- 工具隐藏、策略拒绝和需要审批分别返回什么错误？
- 审计如何证明“为什么允许/拒绝”，又不泄露规则中的敏感数据？

### 7.4 设计门验收

```text
[x] 所有设计文档完整，无 TBD、TODO 或未决占位符
[x] 至少包含 Windows 文件、进程和网络威胁模型
[x] 规则组合对相同输入是确定性的
[x] deny、approval 和 sandbox failure 有精确错误语义
[x] 兼容迁移不会静默扩大现有权限
[x] 设计明确哪些安全性质尚不能保证
[x] 实施被拆成可独立回滚的 Phase 2A/2B 切片
[x] 用户已于 2026-07-13 条件批准：其余设计验收项全部通过后，连续实施 Phase 2A–Phase 5
[x] 用户于 2026-07-14 最终批准四份书面规格，Policy Kernel 设计门正式通过
```

在前七项设计验收全部通过前，生产代码保持在 Phase 1 终态。通过后直接进入 Phase 2A。这里记录的是 2026-07-13 的原始授权边界；2026-07-14 曾给出覆盖 Phase 6–8 与 Phase 8 OAuth 的历史条件授权，但该授权已被后续边界取代。2026-07-24 follow-up 仅授权剩余 Phase 7 Core closure，不授权 Phase 8、生产部署、真实凭据操作、force push、破坏性操作或产品能力中的其他 Git 远端变更。

---

## 8. Phase 2A — Policy Kernel 与请求身份基础

### 8.1 目标

把现有分散在工具可见性、路径保护、写模式和 Bash 模式中的决策，收敛为一个能给出确定结果和来源说明的本地 Policy Kernel。

### 8.2 主要实施内容

1. 版本化配置加载和迁移框架。
2. `RequestContext` 与渐进式 `RequestIdentity`。
3. immutable hard policy。
4. Permission Profile loader/validator。
5. identity scope、profile、session grant 的交集计算。
6. Approval decision 接口，不让批准突破 ceiling。
7. resource descriptor 和 policy decision provenance。
8. 在中央工具包装边界接入策略，而不是每个 handler 自由解释。
9. 为现有直接文件/Git/Shell 工具建立一致的授权前置检查。
10. 定义 audit event，但持久存储留给 Phase 3。
11. 保持旧模式可读至少一个迁移周期。

### 8.3 验收条件

- [x] 同一请求在同一配置下得到确定的 allow/deny/approval-required 结果。
- [x] 任意 hard deny 无法被 Profile、Approval、AGENTS、Skill 或 Hook 覆盖。
- [x] 返回安全、可理解的决策原因和规则来源，不泄露敏感模式或路径。
- [x] 当前用户配置迁移后不会静默扩权。
- [x] Tool Surface 变化不改变相同工具调用的实际权限判断。
- [x] Query-token compatibility、Bearer、STDIO 和 loopback 身份差异被明确建模。
- [x] 文档不声称 Phase 8 前已获得强 OAuth owner isolation。

2026-07-14 验收与发布证据：Policy focused 70 项中 69 pass、0 fail、1 个平台条件跳过；相邻安全与契约 149/149；完整回归 526 项中 525 pass、0 fail、1 个平台条件跳过；TypeScript Build、八段 Smoke、native-Windows Stress、195 文件 package dry-run、受保护 Smoke 源、静态占位符和 27 工具闭集检查全部通过。实现提交 `e6798b6` 的首次 exact-head run `29325407247` 通过两个 Windows job，但由跨平台测试夹具暴露两个 Ubuntu Regression 失败；测试专用修复 `dea25ec` 保持生产行为不变，并通过 replacement run `29326459987` 的 Ubuntu/Windows Node 20/24 四矩阵。每个 job 均完成 Build、Regression Tests、Smoke Test 和 Check Package Contents，Phase 2A 因此正式关闭。

### 8.4 非目标

- 不在 2A 实现 OAuth 2.1。
- 不在 2A 实现完整 OS sandbox。
- 不在 2A 增加 Shell backend 或持久进程。
- 不在 2A 启用 Hooks 或 Skill 脚本权限。

### 8.5 回滚

以 feature flag 保留旧决策路径一个迁移周期。回滚只能回到旧行为或更窄权限，不能因新 Policy Kernel 不可用而自动切换到无策略执行。

---

## 9. Phase 2B — 工作区生命周期与隔离

### 9.1 目标

把当前服务级内存工作区变成与请求身份和 transport session 绑定、可关闭、可过期的授权对象。

### 9.2 标识模型

```text
workspaceKey
  稳定本地标识
  由 canonical path 派生
  用于本地持久化和去重

workspaceId
  不透明会话级标识
  与身份/transport session 绑定
  可关闭、过期、撤销
  工具调用使用它
```

### 9.3 主要实施内容

1. `close_workspace`、expiry 和清理。
2. 工作区与 RequestIdentity/transport session 绑定。
3. 核心服务移除隐式默认工作区回退。
4. 兼容层在一个迁移周期内显式承接旧调用。
5. allowed roots 和 native realpath 统一执行。
6. Windows 设备路径、UNC、drive-relative、ADS、保留名、尾随点/空格、跨盘和 junction 逃逸继续 fail closed。
7. 同一路径在不同会话可有不同 workspaceId，但不能串用授权。

### 9.4 验收条件

- 两个 transport session 不能使用彼此的 workspaceId。
- 关闭、过期或撤销的 workspaceId 立即不可用。
- 所有路径始终受 allowed root、hard deny 和 Permission Profile 共同限制。
- 核心领域服务中不存在隐式默认 workspace。
- Phase 8 前的隔离保证准确表述为 transport/credential 级，不虚构 OAuth 用户身份。

### 9.5 回滚

保留旧 ID 解析兼容层，但不得恢复跨客户端共享的隐式授权。数据迁移必须可逆，不删除用户 profile 或工作区记录。

### 9.6 2026-07-14 正式关闭状态

Phase 2B 已完成设计、TDD 实现、本地验收、`neat-freak` 对账和发布。实现与对账提交 `2fb622d` 已推送到 `main`，exact-head CI run `29332007110` 在 Ubuntu/Windows Node 20/24 四个任务上全部成功：

- `workspaceKey` 仅作 manager 内部 canonical-root 去重；公开 `workspaceId` 改为随机 `ws_<32 hex>` 会话句柄。
- 每个 `createCodexGPTServer()` 拥有独立 `WorkspaceManager`；HTTP transport session 和 STDIO 进程会话不再共享 inventory 或授权句柄。
- 核心 `getWorkspace(id)` 已严格要求 ID；一个兼容周期的省略-ID 行为只由显式 `resolveWorkspace()` 边界承接。
- 已实现 sliding TTL、close、transport revoke、policy-revision revoke 和有界 tombstone。
- `close_workspace` 成为第 28 个 canonical child tool，正常 minimal/standard/full 可用，direct/supertool 共用 handler，connection-test 中隐藏。
- 受保护的 `scripts/http-smoke.mjs` 未修改；兼容 loader 已迁移为跨 HTTP 会话隔离、外来句柄拒绝和会话局部导出检查。
- Build、完整回归、八段 Smoke、native-Windows Stress 和 197 文件 package dry-run 已通过；最终精确计数记录在 `Memory.md` 与 Phase 2B 归档。

四个 CI 任务均完成 Build、Regression Tests、Smoke Test 和 Check Package Contents。Phase 2B 因此正式关闭；下一步进入 Phase 3 设计审查。任何回滚不得恢复进程全局 manager、路径派生公开 ID 或跨会话复用。

---

## 10. Phase 3 — 原子事务、持久审计与受限撤销

### 10.1 目标与已批准拆分

Phase 3 在继续扩大 Git/Shell 自动化前，先为所有受支持的工作区写入建立统一事务边界、并发冲突检测、确定性崩溃恢复、持久脱敏审计和受限 undo。

已批准采用四个独立切片：

1. **Phase 3A — AtomicTransaction 内核**：应用状态、工作区锁、预检、同卷 staging/backup、同步回滚和崩溃恢复。
2. **Phase 3B — 持久审计**：授权/执行双事件、HMAC 链、轮换、保留期、完整性失败和受限查询。
3. **Phase 3C — 写路径迁移与 undo**：迁移所有受支持的工作区 writer，增加工具契约 V2、`expected_sha256`、`changeSetId` 和 `undo_change_set`。
4. **Phase 3D — `move_paths` 与总验收**：同工作区同卷普通文件批量移动、循环和 Windows case-only rename、回滚、undo 与完整 Phase 3 门禁。

详细设计：

- [`2026-07-14-phase-3a-atomic-transaction-design.md`](superpowers/specs/2026-07-14-phase-3a-atomic-transaction-design.md)
- [`2026-07-14-phase-3b-persistent-audit-design.md`](superpowers/specs/2026-07-14-phase-3b-persistent-audit-design.md)
- [`2026-07-14-phase-3c-mutator-migration-and-undo-design.md`](superpowers/specs/2026-07-14-phase-3c-mutator-migration-and-undo-design.md)
- [`2026-07-14-phase-3d-move-paths-and-acceptance-design.md`](superpowers/specs/2026-07-14-phase-3d-move-paths-and-acceptance-design.md)

Phase 3A/3B/3C 详细 TDD 实施计划：

- [`2026-07-14-phase-3a-atomic-transaction.md`](superpowers/plans/2026-07-14-phase-3a-atomic-transaction.md)
- [`2026-07-14-phase-3b-persistent-audit.md`](superpowers/plans/2026-07-14-phase-3b-persistent-audit.md)
- [`2026-07-14-phase-3c-mutator-migration-and-undo.md`](superpowers/plans/2026-07-14-phase-3c-mutator-migration-and-undo.md)
- Phase 3A 共九个任务，实施记录为 STEP-265 至 STEP-273；已发布到本地与远端 `main` commit `75b8d54`。
- Phase 3B 共十个任务，已发布于 `00cb917`；child fixture 和跨平台 protected-source hash 修复分别发布于 `70b1060` 与 `c5b0226`。
- Phase 3C 已完成全部受支持 writer 的生产迁移。`legacy` 仍是兼容默认值；显式选择 `atomic` 后，V1 writer 通过统一 transaction/audit/change-set runtime 提交且不回退直接写入。可写 atomic 配置必须有持久终态审计，`CODEXGPT_AUDIT_MODE=off` 在工具注册前失败关闭。
- Phase 3B 本地验收：聚焦审计测试 36/36；相邻 Policy/transaction/lifecycle/HTTP/contract 回归 172 项中 171 pass/0 fail/1 既有平台 skip；完整回归 626 项中 625 pass/0 fail/1 既有平台 skip；TypeScript Build、八段 Smoke、原生 Windows Stress、237 文件 package dry-run、精确 28 工具 V1、审计架构与敏感字段检查均通过。
- Phase 3C production composition 已按 MCP server 生命周期注入独立的 registry、recovery、persistent audit、change-set 和 mutation runtime；atomic V1 与 non-legacy Policy 配置会按需启用持久审计。V1 仍不注册 `query_audit_events` 或 `undo_change_set`，两者与完整 V2 表面继续由 Phase 3D 激活门控制。
- STEP-277 以“私有临时文件完整写入并同步，再通过同卷 hard link no-clobber 发布”修复 Windows Node 20 首次状态竞态；commit `88bd4b9` 的 run `29369658101` 已在 Ubuntu/Windows Node 20/24 全部通过 Build、Regression、Smoke 与 Package。
- STEP-278 closure commit `953e080` 的 run `29370073046` 再次通过相同四矩阵与全部作业。Phase 3A/3B CI repair 门正式关闭。
- Phase 3C 规格同时要求 V2 精确包含 Phase 3D 的 `move_paths`，又把 `move_paths` 实现留给 Phase 3D。为避免发布名义 31-tool、实际不完整的契约，Phase 3C 完成 writer/runtime/query/undo/版本化基础后仍使 public V2 启动失败关闭；Phase 3D 加入 `move_paths` 后一次性启用并验收完整 31-tool V2。V1 仍是迁移默认。

### 10.2 核心事务决策

- 控制 journal、审计和 change-set 元数据位于工作区外的本机应用状态目录；不进入 Git，不保存工作区绝对路径或文件全文。
- 使用安装级随机主密钥，通过 HKDF/HMAC 派生持久工作区引用、审计完整性密钥和 change-set 加密密钥。
- 文件 stage、rollback backup 和 move 中转位于目标文件同卷的保留随机名称；所有 `.codexgpt-txn-*` 路径对公共工具硬阻断。
- V1 后端使用 Node 原生文件 API 与硬链接，不依赖 PowerShell、WSL、Git、Worktree 或项目方云服务；不支持硬链接的卷返回 `ATOMIC_BACKEND_UNAVAILABLE`，不静默回退为直接写入。
- 单文件替换具有原子可见性。多文件事务在正常失败时同步回滚；进程崩溃后在工作区重新可用前确定性恢复。不得宣传为数据库级跨文件瞬时原子提交。
- 每个事务在最后可行时刻重新验证 containment、普通文件身份、存在性和 SHA-256；漂移返回 `FILE_VERSION_CONFLICT`。
- 同一规范化工作区一次只允许一个跨进程 mutation/recovery；不能确认旧锁死亡时 fail closed。

### 10.3 持久审计决策

- `AuditEventV2` 将授权事实和执行完成事实分开，真实记录最终结果、耗时、字节计数、change set 与 recovery 状态。
- 审计采用本机 JSONL 分段、规范 JSON、HMAC-SHA-256 链和单 writer 锁；这提供完整性证据，但不声称能抵御控制同一 OS 账户和安装密钥的攻击者。
- Policy Engine `enforce` 下的 R2+ mutation 必须在执行前持久化授权事件，并在最终成功前持久化执行事件；完成事件失败会触发事务回滚。
- 默认按 UTC 日期或 10 MiB 轮换；默认保留 30 天且闭合分段总量上限 100 MiB；删除前追加 retention 事件。
- 只有可证明为最后一条未完成记录的 partial tail 可隔离并截断；中间 MAC/序列损坏使必需审计的 mutation fail closed。
- 契约 V2 增加 full-only `query_audit_events`，要求 `audit:read`，限定时间范围、条数、游标和输出，不提供原始分段下载。

### 10.4 工具契约、迁移与 undo

- `CODEXGPT_TOOL_CONTRACT_VERSION=1|2`；初始默认保持 V1。V1 的 28 个工具和精确输出契约保持不变。
- V2 为 31 个工具：V1 加 `query_audit_events`、`undo_change_set`、`move_paths`。V2 只有在原子事务和有效审计配置下才能启动。
- V2 `write`/`edit` 增加可选 `expected_sha256`，成功结果增加标准 transaction 对象和 before hash。
- 不仅迁移 `write`/`edit`，还必须迁移 `apply_patch`、handoff、Pro-context、`.ai-bridge` scaffold/log、自测 probe、`scripts/pro-apply.mjs` 及静态清单发现的全部工作区 writer。
- change-set before-state 以 AES-256-GCM 加密并受限保留；默认每个 change set 8 MiB、全局 128 MiB、每工作区 20 个、24 小时。
- `undo_change_set` 是新的反向事务，无 `force` 或覆盖选项；当前 after-state 任一漂移都返回 `UNDO_CONFLICT` 且零修改。
- undo owner binding 优先 OAuth subject，其次安全 credential reference，最后 transport session；Phase 3 不宣传强多用户身份隔离。

### 10.5 `move_paths` V1

```text
输入 1–64 个 source → destination 和必需 expected_sha256
→ 完整规范化、PathPolicy、普通文件、目标和同卷预检
→ 可选 preview
→ stage-all / install-all 硬链接事务
→ 持久执行审计
→ 返回 transaction/changeSet 摘要
```

规则：

- 同一 workspace、同一卷、普通文件；
- 无覆盖、无 copy-delete、无目录树、无跨盘；
- 目标若是同一批次的另一 source，可形成 chain/cycle；其他已存在目标拒绝；
- 支持 Windows case-only rename；
- 缺失父目录仅在显式开启时创建，并在失败时仅删除本事务创建且仍为空的目录；
- 预检失败零修改；执行失败恢复全部 source，无法证明恢复时冻结工作区；
- Git 只观察最终 rename/diff，不是事务前提。

### 10.6 总验收与回滚

Phase 3 完成门至少包括：

- V1 28-tool 和 V2 31-tool 精确契约、direct/supertool 同一执行路径；
- expected-hash 冲突、原子 no-clobber create、单文件完整可见、多文件失败回滚；
- 每个 journal/文件系统边界的 fault injection 和原生 Windows 子进程 crash/reopen recovery；
- 必需审计的授权前置、完成后置、失败回滚与脱敏；
- 受支持 change set 的 undo 成功和漂移拒绝；
- `move_paths` 的 chain、cycle、case-only rename、跨卷/目标/Hash/symlink 拒绝；
- 静态 low-level writer 绕过扫描、保留路径隔离和 secret/audit-redaction 扫描；
- 完整回归、Build、八段 Smoke、native-Windows Stress、package dry-run 和 Ubuntu/Windows Node 20/24 exact-head CI。

回滚可以隐藏 V2 工具并将默认返回 V1/legacy transaction mode，但不得删除审计或 change-set 证据、绕过 recovery-required workspace，或在配置声称 atomic 时恢复直接写入。Phase 3 不实现通用 Git push、远程操作、目录移动、跨卷 copy-delete、覆盖移动、force undo、OAuth 2.1 或 OS sandbox。

---

## 11. Phase 4A — Windows Shell backend 与持久进程

### 11.1 精确设计

权威规格为 `docs/superpowers/specs/2026-07-16-phase-4-windows-execution-and-sandbox-design.md`，权威 TDD 顺序为 `docs/superpowers/plans/2026-07-16-phase-4-windows-execution-and-sandbox.md`。Phase 4A 的公开结果是显式 V3，而不是重解释 V1/V2 `bash`。

V3 的精确 canonical universe 是 39 个工具：V2 的 31 个工具减去 `bash`，加入 8 个 typed execution/process 工具和 `open_full_access_workspace`。V1=28 与 V2=31 的名字、wire、failure envelope 和无 pending-approval 行为保持不变。

### 11.2 三类不同边界

- `confirmed_roots`：本机精确确认后，让 brokered 文件工具临时打开配置 roots 外的普通本地目录；仍保留 PathGuard、hard deny、原子事务、审计和固定绝对 TTL，不修改 `allowedRoots`。
- `full_access`：当前 Windows 用户权限的 ambient process；没有 filesystem、credential、registry 或 network isolation，只用于用户信任的代码。每次 start/input 都需要新的本机 decision record，但同用户 unrestricted code 已运行后，这只是工作流门，不是不可伪造的人类在场证明。
- `workspace`：只有 Phase 4B 的 AppContainer/LPAC + filtered snapshot 证据完整时才启用。

本项目面向用户显示为 **Full access (ask first)**。这不是 sandbox；确认授权风险，不创建 OS 边界。第一次 ambient start 在不存在既有 unrestricted same-user code 的前提下要求本机人类动作；若未来要保证每一次都是真人确认，必须另设 Windows Hello/UAC/独立 principal 架构门。

### 11.3 强制前置门

- Gate O：先修复 detached runner 的 PID 复用误杀和无界日志问题；Gate O 自己的 destructive oracle 由既有独立 CI/native control harness 直接运行，不通过待修 runner。
- Gate N：固定 PowerShell/C# host 证明 creation-time Job、exact handle list、64-byte authenticated bounded protocol、native timeout、PowerShell exit/Unicode、broker escape limitation 和 Windows 19044 ConPTY fatal-restart close path。
- Gate A0/A1：证明 production 共用的 native pipe factory、owner/DACL/SACL/integrity/token checks、remote flag、multi-server 路由、bounded queue 和 R3 atomic consume；V1/V2 不获得新 approval wire。
- Gate C：V3 只在 Policy Kernel `enforce`、required durable audit、stable session 和 Phase 3 atomic runtime 完整时注册；所有仅判断 `=== 2` 的继承/持久链必须迁移。存储 shape 不变，因此所有 generic writer 保持 schema 1/contract 3、move/undo 保持 schema 2/contract 3，不伪造 manifest schema 3。新 approval/root/process/snapshot lifecycle 使用独立 `AuditEventV3`；V2 audit wire 不变并过滤 V3 事件，V3 使用独立 projection/cursor。

### 11.4 关键安全与 UX 契约

- `run_command` 返回可继续分页的 terminal `process_id`；standard profile 同时包含 `read_process_output`。
- `start_process` 必须同时要求 execute、process manage 与 persistent scopes，不能用 `process:manage` 绕过 shell 禁用。
- 输出先经过有界 streaming recognizer 再保留；full-access 只称 known-pattern best-effort redaction，不称 DLP。
- cursor 使用 AEAD 或有界随机 server-side map；MAC-only 可读 offset 不满足保密声明。
- native host 负责 monotonic wall timeout 和 output backpressure；Job、ConPTY、sandbox 分别报告。
- confirmed-root 普通文件一律要求 hard-link count 为 1；所有 mutation provider 通过 stable handle 在副作用/commit 前复核，仅限 V3 confirmed-root。
- full-access 明示 `process_tree_control: job_object_members_only` 与 `broker_escape_resistance: none`；TTL/terminate/server close 不承诺清理 WMI/COM/scheduler/service broker escape。
- local emergency terminate 不依赖远程 approval。
- 每个工具用 closed semantic authorization facts；R3 grant 并发 retry 只能有一个执行。

---

## 12. Phase 4B — 延期的可选 OS Sandbox 研究

### 12.1 当前产品边界

本项目主要服务于用户自己的可信仓库。当前 Phase 4 不再以运行不可信代码为交付目标，而以 4A 的 brokered roots、逐次本机审批、truthful `full_access`、Job-member 生命周期、bounded output、audit 与 emergency termination 为实际产品范围。

`full_access` 只能用于用户信任的仓库、脚本和依赖，并明确具有当前 Windows 用户的 ambient filesystem、credential、registry、IPC、broker 与 network authority。它不是 sandbox。

### 12.2 4B0 证据处置

Task 4B0 已完成并保留为 fail-closed capability diagnostic。其 blocked 结果不改写为成功，也不进入生产激活路径。现有探针只需保持：

- package exclusion 与无生产入口；
- 不修改 firewall、WFP、service、scheduler、共享 runtime ACL 或 machine policy；
- 只清理经过认证的 probe-owned profile、ACL、Job、handle、临时树和 registry canary；
- 输出有界且不包含真实凭据或秘密。

### 12.3 延期任务

Task 4B1–4B6 的 snapshot、two-stage prepared execution、production AppContainer/LPAC backend、immutable sandbox environment、deny-all network、workspace integration 与完整 sandbox adversarial matrix 从当前路线移除。

只有未来确实需要运行不可信代码时，才新建独立设计门。优先考虑 Hyper-V、Windows Sandbox 或隔离 VM-backed executor 等真实 OS 边界；在完整证明前不得复用 `workspace` 名称或宣传 sandbox 能力。

当前 `workspace` 保持 unavailable，绝不退化为 `full_access`。Phase 4 可以按 reduced 4A scope 完成文档、完整本地门、发布和 exact-head CI。

---

## 13. Phase 5 — Git 写能力与任务 Worktree

### 13.1 权威设计与入口门

Phase 5 的权威边界是配对的 [exact design](superpowers/specs/2026-07-16-phase-5-git-and-task-worktrees-design.md) 与 [mandatory TDD plan](superpowers/plans/2026-07-16-phase-5-git-and-task-worktrees.md)。两者已经完成第一性原理设计和对抗性修复，Phase 4 closure head `d19e65ba75938c35afa472d23d91d1724fe7fabf` 也已通过 exact-head run `29603060944`。Phase 5A 已完成 exact capsule、V4=51、typed reads 与 local Git mutations；Phase 5B 已完成 owner-bound managed task worktrees、raw materialization、immutable merge plans、target CAS、clean removal 与 opt-in Gate X。Gate X 只允许 private-index stage、shadow-directory commit、quarantined object-only merge 和 private-destination checkout；调用方不能选择 Git command/argv、remote、credential、force 或 config mutation，其 ambient `full_access` 与无隔离事实同时进入批准卡和结果。Phase 5C 已完成针对未知 operation、缺失 private object/index state 和批准披露的 fail-closed 修复，并通过最终本地验收；剩余门是单次发布与 closure SHA exact-head CI。

### 13.2 精确架构

- Tool Contract V4 opt-in exact 51：完整继承 V3=39，并只增加十二个 typed local-Git/task-worktree 工具；V1=28、V2=31、V3=39 与 V1 默认值保持精确。
- safe Git capsule 绑定 exact executable/capability，通过 Phase 4 native host 运行 fixed argv/environment/config。它不是 OS sandbox。
- safe mutation 使用 raw blob、private index、quarantined object-only merge 与显式 object/file/index/ref/audit journal participants；merge 新对象只在完整 path/message/secret scan 后进入主 ODB。不使用 `git add`、porcelain stash、live-checkout merge/checkout，也不声称对外部 Git 进程提供同时可见的原子性。
- task worktree 是 `%LOCALAPPDATA%` 下持久、owner-bound、opaque 的 managed artifact；session handle 可重发，但绝不修改 `allowedRoots`，也不提供进程隔离。
- incomplete/truncated scan 不产生 mutation token；sparse/split index、reftable、缺少 object-only merge 能力均 fail closed。

### 13.3 Policy 与默认禁止

- typed reads 是 R0；index-only stage 是 R2；branch/commit/task create/candidate prepare/merge/destructive restore-stash/remove 与 approved integrations 均是 fresh exact one-use R3。
- typed surface 不提供 remote、credential、force、branch deletion 或 arbitrary Git。单独批准的 ambient `full_access` 仍可运行用户自己的 Git，且明确没有 filesystem/credential/registry/network/broker-escape isolation。

```text
git push
force push
remote mutation
credential mutation
remote branch deletion
force worktree deletion
```

这些能力即使未来增加，也必须是独立高权限工具和单独批准项，不得从 V4 typed builder 或 failure fallback 获得。

### 13.4 验收条件

- Gates 4P → G0 → C4 → R → I/D → W → M → optional X → P 按配对计划的 TDD 顺序通过；失败不降级到 shell、legacy `spawnSync`、live checkout、generic recursive delete 或 remote Git。
- 默认任务修改可在 managed worktree 中完成；merge 前绑定 exact candidate OID、完整状态/diff/secret scan 与验证 receipts。
- dirty/untracked/ignored/reparse/foreign/locked checkout 不能删除；没有 force，删除 checkout 不删除 branch/stash/commit。
- V1/V2/V3 回归、V4 exact 51、managed Node 20/24、Windows control canaries、Ubuntu/Windows CI、policy/package/mutation/secret/link/neat-freak 全部通过。
- Worktree、safe capsule、approval、Git lock 均不得被描述为安全沙箱或 secure human-presence proof。

---

## 14. Phase 6 — Project Guidance 与 Agent Skills 可用性

2026-07-22 的对抗审查后，Phase 6 由配对 [design](superpowers/specs/2026-07-22-phase-6-project-guidance-and-skills-design.md) 和 [plan](superpowers/plans/2026-07-22-phase-6-project-guidance-and-skills.md) 控制。它们取代本节此前的通用 Hook 和自定义 Skill trust/hash/permissions 清单。`standard` runtime、后置对抗修复、真实 ChatGPT root/nested gate、omitted default flip、发布与完整 exact-head closure 已完成；关闭 SHA 为 `31631676fe254962a9a4f14d6e025e3edba82b8d`，run 为 `30033293444`。

### 14.1 用户结果

```text
workspace open
  → 返回实际 root AGENTS 正文和有总预算的 root Skill metadata
  → 目标确定后 codex_context(target_path)
  → 返回 root-to-target AGENTS 链和同一 target 的 Skill catalog
  → load_skill 按需加载一个正文或引用文本
  → 真实写入/进程/Git 仍由现有 typed tool、Policy、Approval、Audit 决定
```

`codex_context` 进入 `standard` profile，但不新增公开工具或 Tool Contract V5；V1/V2/V3/V4 保持 exact 28/31/39/51。Root guidance 必须在 open 时真正进入模型上下文，不能只返回一个待读路径。

### 14.2 标准边界

- AGENTS 与 Skills 是 bounded context，不是 authority；不增加 signature、content-hash trust、per-Skill permission manifest 或 Markdown approval ceremony。
- 所有 AGENTS、`SKILL.md`、companion metadata 与 resource 使用同一 canonical same-handle reader，保留 blocked secret-file、redaction、workspace/source-root、lifecycle 和 output gates。
- Standard 模式默认只发现 workspace Skills；user/plugin/other Skills 需要显式 opt-in。Legacy 模式保留一轮精确回滚。
- Skill catalog 自动但默认不超过 8,000 characters；正文和资源 lazy load。
- `allowed-tools`、source、version、hash 或成功读取都不能扩大权限；声明的依赖不会自动安装/连接。
- Skill scripts 不自动执行。任何执行仍是独立的现有工具调用。

### 14.3 Hooks 决定

Generic executable Hooks 不属于 Phase 6。它们不解决首次成功的 AGENTS/Skill 路径，却会引入独立的命令身份、重入、顺序、超时、进程清理和失败语义。未来只有具体用户需求和独立设计/授权门才能恢复该议题；Phase 5 Git integrations 不受此决定影响。

### 14.4 顺序与验收

G6-0、G6-R same-handle reader、root usable slice、nested instructions、target Skills、resources、diagnostics、完整 integration 与 execution/security/UX 三路只读审查修复均已完成。真实 ChatGPT G6-M/G6-U gate 已通过，omitted mode 已翻转为 `standard`；显式 `legacy` 保留为一次重启即可生效的回滚路径。

阶段关闭至少要求：真实 ChatGPT 完成 `open → locate target → context(target) → load_skill → action → verify`；跨子树前重载 context；global omitted inputs 无泄露；path replacement/blocked secrets 失败；读取阶段零脚本/Hook/网络/写入；managed Node 20/24 ordinary、Smoke、package/policy/docs 和 exact-head CI 全绿。

---

## 15. Phase 7 — 语义 Provider

Phase 7 的精确边界和 TDD 顺序由 2026-07-23 的 [design](superpowers/specs/2026-07-23-phase-7-semantic-providers-design.md) 与 [plan](superpowers/plans/2026-07-23-phase-7-semantic-providers.md) 控制。旧的概略 Provider 清单不再足以指导实现。

### 15.1 产品目标

默认 `builtin` 必须在不安装 Serena、Python、`uv` 或语言服务器的情况下，为 JavaScript/TypeScript 提供 definition、references、diagnostics 和安全 rename preview；其他语言保留明确标注的 lexical fallback。外部 Serena/LSP 是可选增强，不能成为工作区打开、普通 search/read 或默认首次成功的前提。

### 15.2 实施边界

- Tool Contract V5 精确为 52：V4=51 加一个只读 `semantic` 工具；V1–V4 保持 exact compatibility。
- `semantic` 使用严格的 `definition | references | diagnostics | rename_preview` discriminated union。
- rename 采用 session/workspace/policy/Provider-generation/hash 绑定的 opaque preview；V5 `apply_patch` 消费一次该 preview，并复用 Phase 3 `prepareWorkspaceTextBatch` 与 AtomicTransaction。
- CodexGPT 不调用或接受 Provider protocol-level mutation/Shell/Git；外部同用户进程仍诚实报告 execution/filesystem/network isolation 均为 none。
- Serena adapter 仅使用审计过的 retrieval/diagnostics allowlist；Serena 的 mutating rename/file/shell/memory/project-switch 能力不可达。
- direct LSP adapter 只实现 bounded stdio subset，拒绝 server-initiated `workspace/applyEdit`、`workspace/executeCommand` 和 file create/rename/delete resource operations。
- 所有输入快照和 Provider 返回的 path/URI/range/edit 都重新经过同一 PathGuard/same-handle/source-normalization boundary。
- external Provider 的 setup/selection 是本机 operator 动作；remote MCP request 不能触发下载、安装、更新或 caller-selected process。
- V5 必须迁移 config、HTTP/stdio、production、Policy/Approval、process、Git、inventory/doctor 与 supertool 的所有 closed-world contract boundary；持久化 Phase 3/Git/Audit contract version 不升级为 5。
- rename approval 绑定 `semanticFactsDigest`，stable identity/path/hash precondition 必须随 transaction 进入 Phase 3 workspace lock 后的第二次 inspect/stage；hash-only precheck 不足。
- omitted mode 只有在 Core real ChatGPT navigation/rename/fallback、双 Node/双平台 local closure、publication/exact-head 和 exact legacy compatibility 全部通过后才能翻转；显式 `legacy` 保留一重启 rollback。

### 15.3 顺序与验收

Phase 6 exact-head closure 已完成。Phase 7 Core 已按 per-server kernel/workspace revoke → mandatory same-handle Core source boundary → owned-worker builtin JS/TS vertical slice → V5 inherited-runtime migration/semantic tool → rename preview/approval/atomic apply → Core health/docs → completed-Core adversarial repair 的顺序完成。真实 ChatGPT G7-U 已通过 STEP-430，最终本地 G7-X 已通过 STEP-432，closure head `a0b9f46e2297297959527f7570c9cb7942cc8fb3` 的 run `30171313296` 已通过完整矩阵。Serena 只能以 Phase 7B 单独授权；direct LSP 只有出现明确未支持语言需求时才进入 Phase 7C。

Core 关闭至少要求：symbol-only 自然语言无需 pre-search 的 JS/TS definition/reference 与单文件 diagnostic；本仓库 NodeNext/`@types`/monorepo 数据图可用；完整 server-owned identity/hash/edit manifest；approval facts 和锁内 identity/path/hash 复验；file/policy/access/worktree/provider/session drift fail closed；真实 ChatGPT 区分“先看影响”和“完成重命名”并能 verify/undo；旧 51-tool App 获得一次 Scan Tools/recreate 提示；managed Node 20/24 ordinary、Smoke、package/policy/docs/mutation gates 与 exact-head Ubuntu/Windows 全矩阵通过。Serena/LSP 缺席不能阻止 Core 关闭。

---

## 16. Phase 8 — OAuth 2.1 与公网认证强化

**当前状态：** 2026-07-26 [详细规格](superpowers/specs/2026-07-24-phase-8-oauth-and-public-auth-design.md)和[可执行 TDD 计划](superpowers/plans/2026-07-24-phase-8-oauth-and-public-auth.md)控制 Phase 8 Core 的精确行为和 G8-0 至 G8-X 顺序。G8-0、Tasks 8A1–8A9 与 STEP-470 local G8-X 已本地完成，专用 OAuth Tunnel/App 已建立；真实 current-client fresh link、Journeys U2–U7 已通过。U5 verified-backup restore 作为 security reset 保留 stable binding/hostname/owned Tunnel、轮换 incarnation并清空旧 authority。U6 通过双路由 service/protocol、重建 Legacy App 真实读取、精确无参数 OAuth 恢复和现有 OAuth App 恢复后读取；原 Legacy App 已删除，因此以明确证据替代关闭，不宣称旧 App 身份连续性。U7 通过 fail-early shared/unowned config preservation 与 live public/local Tunnel boundary。下一动作是在单独授权后 reviewed stage/commit/push 和 exact-head CI；publication/deployment 仍另行授权。相关的全项目差距与后续排序见 [`openai/codex` 对标审阅](reviews/2026-07-26-openai-codex-project-review.md)和[Phase 8 后项目改进计划](superpowers/plans/2026-07-26-post-phase-8-project-improvement-plan.md)。

### 16.1 目标

在保持个人自托管和 loopback Tunnel 架构的同时，为 ChatGPT 公网 MCP 提供标准身份、scope、撤销和凭据保护。

### 16.2 主要实施内容

- 单用户、同进程但边界分离的 OAuth 2.1 authorization server/resource server。
- 根路径静态安全帮助页、`/authorize`、cookie-bound status/continue、`/token`、`/register`、`/revoke` 与 `/jwks`；项目自有严格 DCR/元数据/错误守卫，SDK 默认的宽注册行为不得暴露。
- authorization code + exact PKCE `S256`、RFC 8707 resource、RFC 9207 issuer response、audience、expiry、signature 和 scopes 验证。
- OAuth subject/token id 接入 Phase 2A `RequestIdentity`。
- 短期 ES256 access JWT、authenticated opaque refresh envelope、所有 family mutation 的固定顺序线性化事务、即时 grant revision/revoke、audit/state durable-before-success 和固定状态后端。
- stable binding 绑定 root/issuer/hostname/tunnel；强制恢复只旋转 incarnation/key/pepper/epoch，不重建 Tunnel/DNS 或复活 token。
- public MCP/OAuth listener 与 loopback-only local admin listener 物理分离。
- 长期秘密使用 Windows DPAPI `CurrentUser`；无明文 production fallback。
- Host allowlist 与公开 hostname 一致。
- stable named Cloudflare Tunnel 的一步 setup、精确预览/确认、验证和 loopback 绑定；`--no-tunnel-changes` 保持无外部变更。
- Cloudflare Access/mTLS 不在 Core 中声明；只有后续端到端证据成立时才能作为附加控制，不得冒充 MCP OAuth。
- bounded public/crypto/polling queue、established-user 保留容量和 installation-wide MAC-chained 安全审计。
- `legacy|oauth` 互斥；server/client rollback 分离，保留两套 ChatGPT App，幂等 `auth setup --root` 返回 OAuth；V1–V5 保持精确 28/31/39/51/52，不新增工具或执行权限。

### 16.3 迁移原则

在真实 ChatGPT Web OAuth 流程完成端到端验证前，不删除当前 query-token 兼容路径，也不把 Bearer 手工配置写成 ChatGPT Web 支持能力。迁移必须有明确开关、警告、回滚和至少一个兼容周期。

### 16.4 验收条件

- ChatGPT 当前 App 的正式路径不依赖 URL Token。
- scope 对每次工具调用强制生效。
- 撤销、refresh replay 或 grant revision 使下一次请求立即失效。
- admin 和 MCP listener/authority 分离，公开端口不存在 admin route。
- profile 不保存可直接使用的明文长期 Token。
- Tunnel 仍只连接 loopback，本地不开放直接入站端口。
- 真实 ChatGPT fresh link、restart/refresh、revoke/relink、cached-App 修复和 legacy rollback 通过 G8-U。
- local G8-X 通过后，full G8-X / Phase 8 Core closure 仍需 exact-head Repository policy 与 Ubuntu/Windows Node 20/24 Build、Regression、Smoke、Package。

---

## 17. Phase 9 — Subagents

状态：继续延后。

只有以下全部稳定后才允许设计：

```text
workspace isolation
Policy Kernel
OS sandbox
process manager
atomic edits and audit
task worktrees
delegated identity and scopes
```

每个子代理必须具有独立身份、workspace/session、权限上限、进程归属、审计链和可撤销生命周期。子代理权限只能等于或小于委托者，不得通过 Skill、Hook、Worktree 或进程继承扩权。

---

## 18. Tool Surface Profile 与配置体验

### 18.1 第一性原则

用户想完成的是“审查、编辑、验证或完全操作可信项目”，而不是理解三个正交枚举的笛卡尔积。因此未来提供目标导向预设，再编译到低层配置；低层策略仍由 Policy Kernel 决定。

### 18.2 建议预设

| 预设 | 用户目标 | 建议低层映射 | 安全说明 |
|---|---|---|---|
| `review` | 阅读、搜索、审查变更 | standard + write off + bash off | 仍受文件读取策略限制 |
| `edit` | 在授权工作区修改文件 | standard + write workspace + bash off | 写入不等于 Shell 权限 |
| `verify` | 运行批准的验证流程 | standard + direct write off + sandboxed verify | 项目脚本会执行仓库代码 |
| `trusted-local` | 操作完全可信的本地仓库 | full + write workspace + explicit full shell | 明确使用当前用户高权限，不能伪装成 sandbox |

这是 Policy Kernel 设计输入，不在 Phase 1 实现。现有 `minimal|standard|full`、`writeMode` 和 `bashMode` 至少保留一个迁移周期。

### 18.3 必须保持的区别

```text
profile selects a useful surface
policy authorizes resources
approval handles per-operation consent
sandbox enforces process boundaries
```

任何预设都不能成为绕过 Permission Profile 的捷径。

---

## 19. 每个实施切片的固定流程

### 19.1 开始前

1. 完整读取 `AGENTS.md` 和 `Memory.md`。
2. 检查 Git 状态、分支、HEAD 和现有用户变更。
3. 读取相关源码、测试、配置、专项设计和当前归档尾部。
4. 确认该动作在当前阶段内，且所需审批已经存在。
5. 如涉及外部源代码，先核对许可证和精确版本。

### 19.2 设计与实施

1. 先形成完整可用的专项设计。
2. 对已有结果做逻辑、安全、边界、依赖和 UX 审查。
3. 修正设计后写独立实施计划。
4. 行为变化使用 TDD：先 RED，再最小 GREEN，再消费者迁移和重构。
5. 一个切片只解决一个问题，不混入无关格式化或架构重写。
6. 所有兼容转换必须 exact、bounded、fail closed。

### 19.3 验证

按风险从窄到宽：

```text
focused contract tests
→ adjacent regression tests
→ npm run build
→ relevant Smoke
→ node --test test/*.test.mjs
→ Windows-specific Stress/path/process gates
→ package dry-run when publication-facing
→ git diff --check
→ secret-looking-content scan
→ intended-files-only audit
```

必须区分：passed、code failure、not run、environment blocked、platform skipped。

### 19.4 记录与发布

1. 先交付可用结果，再审查，再修正。
2. 每个 meaningful STEP 追加当前 phase archive。
3. 同步 `Memory.md` 的当前状态、证据、风险和下一动作。
4. 检查归档容量；达到 direct-read limit 的 80% 后开启编号续卷。
5. staging、commit、push、PR 和部署均需用户明确批准。
6. 发布后用精确完整 SHA 匹配 Ubuntu/Windows Node 20/24 CI。
7. 本轮 Slice 17–28 使用用户已批准的条件式统一发布：全部 12 个工具本地完成并逐片 `neat-freak` 后，才执行 stage、commit、push 和精确头 CI；不得在中途发布。

---

## 20. 阶段级 Definition of Done

任何 Phase 只有同时满足以下条件才能关闭：

```text
[ ] 全部阶段验收条件有新鲜证据
[ ] 安全声明与实际 enforcement 一致
[ ] 兼容和迁移路径经过测试
[ ] 失败模式稳定、脱敏、可行动
[ ] Windows 原生路径通过
[ ] Ubuntu/Windows CI 通过
[ ] 文档、Memory 和归档与代码一致
[ ] 风险、限制和 rollback 明确
[ ] 活跃归档卷已关闭
[ ] 下一阶段只在显式批准后开始
```

“代码已写完”不等于阶段完成；“用户点了批准”也不等于安全边界已实施。

---

## 21. 当前决策登记

### 21.1 已批准

- 个人自托管，Cloudflare 只负责 DNS/TLS/Tunnel。
- Windows 原生优先，不强制 WSL。
- PowerShell 是长期核心 backend，Git Bash 保持可选兼容。
- Safe Bash 不是 OS sandbox。
- 完成 Phase 1 后才进入 Policy Kernel 设计门。
- Policy Kernel 设计门全部通过后连续实施 Phase 2A–Phase 5；用户于 2026-07-14 曾将同一条件授权模型扩展到 Phase 8。该历史授权已被后续边界取代；2026-07-24 follow-up 只授权剩余 Phase 7 Core closure，包括最终本地门禁、reviewed stage/commit、普通 push 与 bounded exact-head diagnosis/repair，不授权 Phase 7B/7C、Phase 8、release 或 deployment。
- Permission、Approval、Sandbox、Tool Surface 分层。
- Skills 复用现有延迟加载；Phase 6 按 Agent Skills 标准补 root/target 可达性、预算和兼容诊断，不要求自定义 trust/permission manifest。
- Open Interpreter 只借鉴与 CodexGPT 边界一致的设计和测试方法。
- 不引入模型 Provider/Harness，不转型为通用 Agent Runtime。
- OAuth 2.1 仍是 Phase 8 方向，但当前未获实现授权；未来获批后，真实凭据仍不得进入测试、日志或仓库，迁移必须可回滚并经过独立安全门。
- Phase 8 Core 采用单用户自托管 authorization/resource server、严格公开客户端 DCR、PKCE `S256`、精确 resource、DPAPI `CurrentUser`、public/admin 监听器分离和 `legacy|oauth` 互斥；完整行为由 2026-07-26 配对规格/TDD 控制。
- `openai/codex` 只作为共享安全/工程模式参考；不做 Rust 重写或功能追平。Phase 8 后优先级为可解释配置、后台生命周期/诊断、渐进模块化，再独立评估 Windows 原生隔离。
- Subagents 继续延后。
- 文件移动不进入 Phase 1；Phase 3 在原子事务、Policy Kernel 和 workspace isolation 基础上实现 `move_paths`。
- Slice 17–28 共 12 个剩余工具连续本地实施，每个工具后运行 `neat-freak`，目标全部完成后统一发布；中途不以单工具发布门中断实施。

### 21.2 设计门决定、当前不得假定

- Permission Profile 的最终文件格式和规则具体度算法。
- Phase 4 的 source-shipped PowerShell/C# host 已通过本地 Gate N 可行性与控制域验证；filtered-snapshot AppContainer/LPAC 只保留为 blocked 诊断与未来候选，当前 reduced scope 不注册或宣传 `workspace` sandbox。
- Phase 4 V3 已决定使用本机 V3-only pending issuer、R3 两分钟一次性 grant、confirmed-root 固定绝对租约和 atomic consume；实现证据仍待 Gates A0/A1。
- Phase 4 正向网络 egress 明确不可用；未来 WFP/privileged broker 需要新的设计和授权。
- Generic Hooks 已移出 Phase 6；只有未来具体用户需求和独立设计/授权门才能重新决定 manifest、事件 payload 与执行 backend。
- Serena/LSP 的具体接入方式。

### 21.3 禁止静默改变

- allowed roots 和秘密内容保护；V3 confirmed root 只能经本机精确 R3、session-local 固定租约临时扩展，不能修改或持久化 `allowedRoots`。
- query-token 当前兼容事实。
- 公开入口与 Host/Origin 本地校验。
- 当前阶段和审批门。
- 本次授权范围外的 Git 远端写、生产部署、真实凭据操作和不可逆操作。

---

## 22. 与 2026-07-11 旧计划相比的关键修正

1. Phase 0.5 已从待办变为正式关闭，并纳入真实 Windows/Ubuntu CI 和外部 Cloudflare 证据。
2. Phase 1 已发布 16 个切片；完成范围明确为 26 个核心工具加 2 个按配置启用工具。
3. 修正“query Token 默认关闭”的旧假设，改为当前真实 ChatGPT Web 兼容流程和 URL 秘密风险。
4. 在 Phase 1 和 Phase 2 之间加入 Policy Kernel 设计门。
5. Permission Profile、Approval、Tool Surface 和 Sandbox 被明确拆开。
6. 建立 hard deny 与用户 Profile deny 两级语义。
7. Phase 2 先建立 RequestIdentity 接口，Phase 8 再接入 OAuth subject/scopes，避免循环依赖。
8. Phase 4 拆为 Shell/Process 与 OS Sandbox/Egress 两部分。
9. 明确 Job Object 是进程生命周期控制，不是沙箱。
10. 原“Hooks 延后到 Phase 6”已被 2026-07-22 决定取代；generic Hooks 延后到未排期的独立未来门禁，且不能替代内置安全机制。
11. Skills 复用当前元数据发现和延迟加载，Phase 6 只补标准 metadata、root/target 调用链、预算、资源和可操作诊断。
12. Tool Surface 改为面向目标的预设方向，但不把预设当成权限。
13. OpenAI Codex 成为共享安全机制的上游主参考，Open Interpreter 成为适配和测试参考。
14. 聚合包装工具放在 Phase 1 最后迁移。
15. 每个阶段补齐了 prerequisites、acceptance、non-goals 和 rollback。

---

## 23. 历史停止点记录和当前下一动作

下列长代码块保留早期阶段的历史 checkpoint，不代表当前执行位置；当前事实以本节末尾总结、`Memory.md` 和配对 Phase 4/5/6 文档为准。

当前停止点：

```text
Phase 1 Slice 16 inspect_workspace
  → implementation and publication record complete
  → exact-head Ubuntu/Windows Node 20/24 CI passed

Phase 1 Slice 17 codexgpt_inventory
  → exact-contract design complete
  → six-task TDD plan complete
  → focused 13/13, adjacent 74/74, complete 276/276 passed
  → Build, all eight Smoke sections, native-Windows Stress, package dry-run passed
  → post-result review and documentation reconciliation complete
  → staging, commit, push, and exact-head CI not performed

Phase 1 Slice 18 load_skill
  → exact-contract design and seven-task TDD plan complete
  → focused 15/15, adjacent 102/102 before hardening and 64/64 after hardening, complete 291/291 passed
  → Build, all eight Smoke sections, native-Windows Stress, package dry-run passed
  → post-result hardening and per-tool neat-freak reconciliation complete
  → staging, commit, push, and exact-head CI not performed

Phase 1 Slice 19 read_handoff
  → exact-contract design and seven-task TDD plan complete
  → focused 15/15, adjacent 66/66, complete 306/306 passed
  → Build, all eight Smoke sections, native-Windows Stress, package dry-run passed
  → post-result boundary/body-plausibility hardening and per-tool neat-freak reconciliation complete
  → staging, commit, push, and exact-head CI not performed

Phase 1 Slice 20 wait_for_handoff
  → exact-contract design and seven-task TDD plan complete
  → deliberate hardening RED 0/2, then targeted 2/2, focused 17/17, adjacent 81/81, complete 323/323 passed
  → Build, all eight Smoke sections, native-Windows Stress, and 139-file package dry-run passed
  → fixed-path provider ordering and stalled-wall-clock bounds hardened; per-tool neat-freak reconciliation complete
  → staging, commit, push, and exact-head CI not performed

Phase 1 Slice 21 codex_context
  → exact-contract design and seven-task TDD plan complete
  → deliberate hardening RED 0/2, then targeted 2/2, focused 16/16, adjacent 83/83, complete 339/339 passed
  → Build, all eight Smoke sections, native-Windows Stress, and 141-file package dry-run passed
  → configured context-directory compatibility, canonical missing-parent handling, and provider framing hardened; per-tool neat-freak reconciliation complete
  → staging, commit, push, and exact-head CI not performed

Phase 1 Slice 22 export_pro_context
  → exact-contract design and seven-task TDD plan complete
  → deliberate hardening RED 0/2, then targeted 2/2, focused 18/18, adjacent 75/75, complete 357/357 passed
  → Build, all eight Smoke sections, native-Windows Stress, and 143-file package dry-run passed
  → post-result integrity hardening and per-tool neat-freak reconciliation complete
  → staging, commit, push, and exact-head CI not performed

Phase 1 Slice 23 handoff_to_agent
  → exact-contract design and seven-task TDD plan complete
  → focused 17/17, adjacent 79/79, complete 374/374 passed
  → Build, all eight Smoke commands, native-Windows Stress, and 147-file package dry-run passed
  → CRLF placeholder, context-ancestor, existing-plan read-bound, and stable-Smoke compatibility hardening complete; per-tool neat-freak reconciliation complete
  → staging, commit, push, and exact-head CI not performed
```

当前连续实施批次：

```text
Phase 1 Slice 25 codex_sessions
  → fresh inventory and exact-contract design complete
  → seven-task uninterrupted TDD plan approved
  → executable acceptance baseline established at 0/14
  → exact schema subset passes 3/3 and Build
  → deterministic bounded domain subset passes 2/2 and Build
  → Provider/handler subset passes 6/6; focused suite reaches 12/14; Build passes
  → Tool Card/compatibility subset passes 2/2; focused reaches 14/14; protected main Smoke and Build pass
  → adversarial review fixes six deliberate RED defects; focused 20/20, adjacent 49/49, and Build pass
  → complete regression 408/408, Build, all Smoke sections, Windows Stress, package, static gates, and per-tool neat-freak pass
  → Slices 17–25 are locally complete, reviewed, neat-freak reconciled, unstaged, uncommitted, unpushed, and unpublished
Phase 1 Slice 26 read_codex_session
  → fresh inventory and exact-contract design complete
  → seven-task uninterrupted TDD plan approved
  → executable acceptance baseline established at 0/16
  → exact schema subset passes 3/3 and Build
  → bounded transcript-domain subset passes 7/7; focused reaches 10/16; Build passes
  → Provider/handler subset passes 4/4; focused reaches 14/16; Build passes
  → nested consumer subset passes 2/2; focused reaches 16/16; Build and protected main Smoke pass
  → four deliberate hardening REDs fixed; focused 20/20 and adjacent Slice 25–26 40/40 pass
  → complete regression 428/428, Build, all eight Smoke sections, native-Windows Stress, 153-file package dry-run, exact 65-path scope, static gates, and per-tool neat-freak pass
  → Slices 17–26 are locally complete, reviewed, neat-freak reconciled, unstaged, uncommitted, unpushed, and unpublished
Phase 1 Slice 27 codexgpt_self_test
  → fresh inventory, exact-contract design, and seven-task uninterrupted TDD plan complete
  → executable baseline established with 12 expected failures; schema, Provider, handler, fixed-artifact probe, Tool Card, compatibility, and Stress migration completed RED-first
  → raw-read verification, recognized legacy-scaffold migration, and status/reason/truncation semantic drift hardened with deliberate REDs
  → focused 15/15, adjacent 104/104, complete 443/443, Build, all eight Smoke sections, native-Windows Stress, 157-file package dry-run, static gates, and per-tool neat-freak pass
  → Slices 17–27 are locally complete, reviewed, neat-freak reconciled, unstaged, uncommitted, unpushed, and unpublished
Phase 1 Slice 28 codexgpt
  → fresh inventory, Approach C exact-contract design, and seven-task uninterrupted TDD plan complete
  → executable RED baseline covered schema, descriptor, live registration, aliases, child-envelope preservation, stable failures, Tool Card, protected compatibility, and Stress
  → deliberate hardening fixed the intentionally supertool-free connection-test surface, explicit enabled=false action exposure, and legacy-wrapper delegation instead of direct registered target-handler dispatch
  → focused 13/13, adjacent aggregation 87/87, complete regression 456/456, Build, all eight Smoke sections, native-Windows Stress, 162-file package dry-run, and static gates pass
  → unified implementation commit 021ab90 published; first exact-head run 29314051423 passed Ubuntu but exposed two CRLF-sensitive Windows test assertions
  → test-only portability repair e20d84e retained exact fail-closed checks and passed replacement exact-head run 29314923948 on Ubuntu/Windows Node 20/24
  → every matrix job completed Build, 456-test Regression, Smoke, and Package checks; Phase 1 is formally closed
```

Phase 1–7 Core 已正式关闭；Phase 6 closure head `31631676fe254962a9a4f14d6e025e3edba82b8d` 的 exact-head run `30033293444` 与 Phase 7 Core closure head `a0b9f46e2297297959527f7570c9cb7942cc8fb3` 的 run `30171313296` 均已通过完整矩阵。CI 优化 head `b4b041da32be7bfb133495fb30aa851d67d4f216` 的 run `30177507346` 也已通过；本地 Phase 8 checkpoint 为 `949fed0301dfc22a6dd84b8d9b3c62393d7aad2d`，当前工作树尚未提交。Phase 8 G8-0、Tasks 8A1–8A9、Gate G8-U fresh link/Journeys U2–U7 与 STEP-470 local G8-X 已完成；U6 记录了原 Legacy App 删除后的证据替代，不宣称同一旧 App 身份连续性，U7 已通过 live Tunnel boundary 与 fail-early shared/unowned config preservation。下一动作是在明确授权后 reviewed stage/commit/push 与 exact-head CI。Reduced Phase 4 的 4B0、Task 4B1–4B6、sandbox authority、`workspace`、Phase 7B/7C、Phase 9、生产部署、真实凭据迁移、无关外部变更和破坏性数据/历史操作仍未授权。
