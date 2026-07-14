# CodexPro 总体实施计划

> 版本：2.1  
> 生效日期：2026-07-13  
> 状态：当前权威实施路线  
> 工作区：`D:\Dev\codexpro`  
> 基线版本：`codexpro@0.28.6`  
> 当前阶段：Phase 3C Task 2 已通过四矩阵 CI；Task 3 server-owned mutation commit runtime 已在本地完成
>
> 下一门禁：发布 Task 3 并通过精确头 CI，然后以 RED 开始 transaction-backed `write` / `edit`
>
> 已批准主路线：Phase 1 → Policy Kernel → Phase 2A–Phase 5；2026-07-14 扩展为按推荐选项连续实施并分段发布至 Phase 8

本文件取代下载目录中的 `codexpro_audit_and_implementation_spec_2026-07-11.md`，成为后续架构顺序、阶段边界和验收门禁的默认依据。旧文件保留为 2026-07-11 的历史审计快照，不继续原地修改。

---

## 0. 文档契约

### 0.1 每类文档负责什么

| 文档 | 唯一职责 |
|---|---|
| `AGENTS.md` | 不可绕过的工作方式、安全约束和审批规则 |
| 本文件 | 产品方向、架构边界、阶段顺序、设计门和阶段验收 |
| `docs/superpowers/specs/` | 一个具体切片或子系统的已审查设计 |
| `docs/superpowers/plans/` | 对应设计的可执行 TDD 实施步骤 |
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

当前任务已获连续执行至 Phase 8 的条件授权，但连续执行不等于跳过质量门。每个工具切片和每个安全子系统仍必须单独经历：

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

CodexPro 要解决的不是“增加更多 MCP 工具”，而是：

> 让 ChatGPT 能够通过用户自己的安全入口，可靠地操作用户明确授权的本地项目，同时让每一次能力扩大都可解释、可限制、可验证、可审计、可回滚。

目标链路保持：

```text
ChatGPT Web
  → HTTPS
mcp.<user-domain>
  → Cloudflare DNS / TLS / Tunnel
127.0.0.1:8787
  → customized CodexPro
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
| Phase 3 | 进行中 | 3A/3B 与 CI repairs 已发布；`88bd4b9` 通过 run `29369658101` 四矩阵，3C/3D 待 closure 头验证后继续 |
| Phase 4–8 | 已批准、尚未开始 | 采用各设计门的推荐选项连续实施；每个可回滚子部分独立验证、整理、提交、推送并通过精确头 CI |
| Phase 9 | 未批准 | Subagents 继续保留独立批准门 |

Phase 0.5 已验证的外部入口事实：公开 `https://codexpro.drliang.uk/healthz` 已通过 Cloudflare 到达本地 CodexPro，Host 校验通过后在认证层返回预期的 `401 Unauthorized`。

### 2.2 当前认证和入口事实

1. `scripts/codexpro-entry.mjs` 是受支持的公开 CLI 入口。
2. 直接运行 `node scripts/codexpro.mjs` 会绕过入口层保护，不是受支持的公开启动方式。
3. 当 `CODEXPRO_ALLOW_QUERY_TOKEN` 未设置时，受支持 CLI 使用面向 ChatGPT Web 的个人 query-token 兼容流程。
4. CLI 可以为此流程打印和复制含凭据的 Server URL，并必须提示 ChatGPT 配置为 `Authentication: None / No Authentication`。
5. 完整 Server URL 是秘密，可能通过历史记录、剪贴板、截图、日志或转发链接泄露。
6. `CODEXPRO_ALLOW_QUERY_TOKEN=0` 只适用于能主动发送 `Authorization: Bearer` 的兼容客户端。
7. 服务端 Bearer 支持仍保留，但文档不能声称 ChatGPT Web 支持手工静态 Bearer 配置。
8. OAuth 2.1 是后续标准化方向；2026-07-14 的 Phase 8 显式授权已满足“计划存在不能代替实施批准”的门槛，但启用前仍须通过 Phase 8 的身份、迁移、回滚与安全验收。
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

`codexpro_inventory`、`load_skill`、`read_handoff`、`wait_for_handoff`、`codex_context`、`export_pro_context`、`handoff_to_agent` 和 `handoff_to_codex` 已完成设计、TDD 实现、消费者迁移、结果后审查、全部本地门禁和逐工具 `neat-freak` 对账。Slice 17–28 在本地连续实施；全部 12 个工具完成前保持未 staged、未 commit、未 push，目标完成后统一发布并以 Ubuntu/Windows Node 20/24 精确头 CI 验收。

### 2.6 Phase 1 尚余 4 个支持面

当前 `FULL_TOOL_NAMES` 包含 26 个核心工具，配置还可能额外广告 2 个 Codex Session 工具。Phase 1 的完成标准覆盖整个受支持广告面，而不只覆盖默认模式。

默认迁移顺序：

| 顺序 | 工具 | 排序理由 |
|---:|---|---|
| 25 | `codex_sessions` | 固定按配置启用的本地会话索引契约 |
| 26 | `read_codex_session` | 依赖会话索引、路径限制和有界读取 |
| 27 | `codexpro_self_test` | 聚合自检应在被检查能力稳定后迁移 |
| 28 | `codexpro` | 最后迁移 supertool，避免包装尚未稳定的子工具 |

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
Phase 4B：OS Sandbox 与网络出口控制
  ↓
Phase 5：Git 写能力与任务 Worktree
  ↓
Phase 6：Instructions、Hooks、Skills 信任
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

| 优先级 | 借鉴内容 | 进入位置 | CodexPro 的处理 |
|---:|---|---|---|
| 1 | Permission Profile | Policy Gate、Phase 2A、Phase 8 | 采用分层思想，建立自己的版本化 Schema，不照抄 beta 配置 |
| 2 | Sandbox 与 Approval 分离 | Policy Gate、Phase 2A、Phase 4B | 成为不可绕过的架构原则，沙箱不可用时 fail closed |
| 3 | Hooks 生命周期与内容信任 | Phase 6 | 采用确定性事件和精确内容 Hash；Hook 不能扩权 |
| 4 | Skills 元数据优先、延迟加载 | Phase 6 | 保留当前发现/加载机制，只补信任、权限、版本和 Hash |
| 5 | PTY、持久进程和有界输出 | Phase 4A | 借鉴接口与测试边界，Windows 以 ConPTY/Job Object 为核心 |
| 6 | 配置分层 | Policy Gate、Phase 6 | AGENTS、Profile、Skills、Hooks、MCP 各司其职 |
| 7 | 不同场景的工具表面 | Policy Gate、Phase 2A | 做用户目标预设，但明确 visibility 不是 authorization |

### 5.3 明确不采用

- 不加入 OpenAI、Anthropic、Ollama 等模型 Provider。
- 不加入 Claude Code、Kimi、Qwen、DeepSeek 或 SWE-agent Harness。
- 不把 CodexPro 扩张为通用 Agent Runtime。
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

### 6.4 `codexpro_inventory` 已执行的切片约束

第 17 个切片已按以下边界完成本地实现：

1. 保留当前 Skills/MCP/能力发现行为，不加入 Phase 6 的 trust/version/permissions/contentHash/enabled 语义。
2. 对部分发现、输出截断、返回数量和总数量给出显式有界语义。
3. 不返回 MCP URL、环境变量值、Header、Token、凭据或不必要的绝对敏感路径。
4. 对 provider/发现失败使用固定安全错误或明确的安全降级，不透传原始异常。
5. 审查 `codexpro_self_test` 等消费者，但不提前迁移聚合包装工具。

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

在前七项设计验收全部通过前，生产代码保持在 Phase 1 终态。通过后直接进入 Phase 2A。这里记录的是 2026-07-13 的原始授权边界；2026-07-14 的扩展授权已覆盖 Phase 6–8 与 Phase 8 OAuth 实现，但不覆盖 Phase 9、生产部署、真实凭据操作、破坏性操作或产品能力中的 Git 远端变更。

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
- 每个 `createCodexProServer()` 拥有独立 `WorkspaceManager`；HTTP transport session 和 STDIO 进程会话不再共享 inventory 或授权句柄。
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
- Phase 3C 完成全部 writer 迁移前，`atomic` 仅允许 `CODEXPRO_WRITE_MODE=off`；可写 atomic 配置必须在工具注册前失败关闭，现有公共 writer 仍保持经过审查的 legacy 行为。
- Phase 3B 本地验收：聚焦审计测试 36/36；相邻 Policy/transaction/lifecycle/HTTP/contract 回归 172 项中 171 pass/0 fail/1 既有平台 skip；完整回归 626 项中 625 pass/0 fail/1 既有平台 skip；TypeScript Build、八段 Smoke、原生 Windows Stress、237 文件 package dry-run、精确 28 工具 V1、审计架构与敏感字段检查均通过。
- Phase 3B 后端、查询、诊断、Policy wrapper 接口和事务参与者已完成；当前 V1 production server 尚不注入 persistent runtime，也不注册 `query_audit_events`。这两个启用动作必须在 Phase 3C 与 coherent contract V2、全 writer 迁移一起完成。
- STEP-277 以“私有临时文件完整写入并同步，再通过同卷 hard link no-clobber 发布”修复 Windows Node 20 首次状态竞态；commit `88bd4b9` 的 run `29369658101` 已在 Ubuntu/Windows Node 20/24 全部通过 Build、Regression、Smoke 与 Package。
- STEP-278 closure commit `953e080` 的 run `29370073046` 再次通过相同四矩阵与全部作业。Phase 3A/3B CI repair 门正式关闭。
- Phase 3C 规格同时要求 V2 精确包含 Phase 3D 的 `move_paths`，又把 `move_paths` 实现留给 Phase 3D。为避免发布名义 31-tool、实际不完整的契约，Phase 3C 完成 writer/runtime/query/undo/版本化基础后仍使 public V2 启动失败关闭；Phase 3D 加入 `move_paths` 后一次性启用并验收完整 31-tool V2。V1 仍是迁移默认。

### 10.2 核心事务决策

- 控制 journal、审计和 change-set 元数据位于工作区外的本机应用状态目录；不进入 Git，不保存工作区绝对路径或文件全文。
- 使用安装级随机主密钥，通过 HKDF/HMAC 派生持久工作区引用、审计完整性密钥和 change-set 加密密钥。
- 文件 stage、rollback backup 和 move 中转位于目标文件同卷的保留随机名称；所有 `.codexpro-txn-*` 路径对公共工具硬阻断。
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

- `CODEXPRO_TOOL_CONTRACT_VERSION=1|2`；初始默认保持 V1。V1 的 28 个工具和精确输出契约保持不变。
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

### 11.1 目标

在 Windows 原生环境中提供明确 backend、可控生命周期和有界输出的 Shell/Process 服务。

### 11.2 Backend 顺序

1. PowerShell 7。
2. Windows PowerShell 兼容 backend。
3. Git Bash 可选 backend。
4. CMD 仅在明确场景启用。
5. WSL 始终可选，不成为项目要求。

### 11.3 持久进程契约

```ts
interface ProcessSession {
  processId: string;
  workspaceId: string;
  commandSummary: string;
  backend: string;
  startedAt: string;
  status: "running" | "exited" | "failed" | "terminated";
  exitCode: number | null;
}

interface ProcessOutputPage {
  processId: string;
  status: ProcessSession["status"];
  exitCode: number | null;
  earliestCursor: string;
  nextCursor: string;
  chunks: Array<{
    cursor: string;
    stream: "stdout" | "stderr";
    text: string;
  }>;
  droppedBytes: number;
  retainedBytes: number;
  truncated: boolean;
  eof: boolean;
}
```

正式设计必须决定 opaque cursor、chunk 上限、UTF-8 边界、stdout/stderr 顺序、重复读取、断线恢复和过期语义。

### 11.4 主要实施内容

- `start_process`
- `read_process_output`
- `write_process_input`
- `interrupt_process`
- `terminate_process`
- `list_processes`
- ConPTY/PTY
- 有界 ring buffer
- stdin、Ctrl+C、timeout、orphan cleanup
- Windows Job Object 终止整棵进程树
- process 与 workspace、identity、policy snapshot 绑定
- 输出截断和安全脱敏

### 11.5 验收条件

- backend 不存在时在执行前返回稳定错误。
- 输出永远有界，cursor 可增量读取并明确数据丢弃。
- timeout/terminate 能结束完整 Windows 进程树。
- 另一个会话不能读取、输入或终止不属于它的进程。
- workspace 关闭、授权撤销或 session 过期后的进程处理有确定规则。
- 文档明确 Job Object 不是沙箱。

---

## 12. Phase 4B — OS Sandbox 与网络出口控制

### 12.1 目标

让 `workspace` Shell 模式从“策略声明”变为经测试的操作系统边界。

### 12.2 主要实施内容

- Windows SandboxBackend 能力探测。
- 文件、进程、环境、凭据和网络隔离。
- 与 Permission Profile 编译结果一致的 sandbox policy。
- 私网、loopback、公网和域名/端口出口控制。
- 重定向和 DNS 解析后的再验证。
- sandbox unavailable 的 fail-closed 契约。
- 受限 backend 的 Windows 集成和攻击性测试。

### 12.3 验收条件

- 测试进程无法读取明确禁止的工作区外文件。
- 无网络授权时无法通过常见解释器、子进程或代理访问网络。
- 私网和 loopback 规则独立生效。
- sandbox 无法执行完整策略时拒绝启动，不退化到当前用户权限。
- 所有公开安全声明都由可重复测试支撑。

### 12.4 非目标

Phase 4B 完成前，`safe` 仍只称为策略过滤；不得提前启用或宣传真正的 `workspace` sandbox 模式。

---

## 13. Phase 5 — Git 写能力与任务 Worktree

### 13.1 目标

把真实项目变更放入可审查、可追踪的 Git 和任务 Worktree 生命周期中。

### 13.2 主要实施内容

- typed Git results。
- branch、stage、commit、restore、stash。
- task worktree create/list/get/merge/remove。
- clean baseline 检查。
- Windows file lock、长路径和占用诊断。
- merge 前状态、测试和 diff 审查。
- Git hooks 运行风险进入 Policy/Sandbox/Approval。

### 13.3 默认禁止

```text
git push
force push
remote mutation
credential mutation
remote branch deletion
force worktree deletion
```

这些能力即使未来增加，也必须是独立高权限工具和单独批准项。

### 13.4 验收条件

- 默认任务修改可在独立 worktree 中完成。
- 未提交修改时拒绝非显式强制删除。
- merge 前展示状态、验证结果和 diff。
- Worktree 不被描述为安全沙箱。
- Git 子进程继续受同一 Policy/Sandbox/Audit 约束。

---

## 14. Phase 6 — Instructions、Hooks 与 Skills 信任

### 14.1 Instruction precedence

```text
non-overridable built-in security
  → user-global instructions
  → allowed-root instructions
  → workspace-root instructions
  → directory-local instructions
```

越接近目标文件的风格/流程规则可以优先，但任何指令都不能关闭认证、扩大 allowed roots、读取密钥、跳过审计、授权网络或批准高风险命令。

### 14.2 Hooks 设计

优先采用少量通用事件和匹配器，而不是为每个工具种类复制事件：

```text
SessionOpen
BeforeTool
PermissionRequest
AfterTool
BeforeCompact
AfterCompact
SessionClose
```

Subagent 事件只在 Phase 9 启用。`BeforeTool` 通过 `toolName`、operation category、workspace、resource 和 risk matcher 覆盖 file/shell/git/process 场景。

Hook 规则：

1. 安全检查是内置机制，不是 Hook。
2. Hook 可以进一步拒绝或收窄，不能扩大权限。
3. 信任绑定到完整有效定义：事件、matcher、命令、脚本内容、工作目录、权限和受引用内容。
4. 任一有效内容变化都使旧信任失效。
5. content hash 用于检测漂移，不代表代码安全。
6. 安全相关 pre-hook 超时/失败默认 fail closed；非安全 post-hook 可返回固定 warning，具体分类在设计中确定。
7. 必须处理重入、递归、顺序、并发、超时、输出上限和脱敏。
8. Hook 执行仍经过 Policy、Approval、Sandbox 和 Audit。

### 14.3 Skills 设计

当前代码已经具备元数据发现和按需加载，不重建另一套 Skill loader。Phase 6 只扩展：

```text
name
version
description
source
trust
requiredPermissions
workspaceScope
contentHash
enabled
```

加载流程：

```text
启动/刷新时扫描小元数据
→ 任务匹配时加载完整 SKILL.md
→ 真正执行脚本时重新检查 workspace、policy、approval、sandbox
```

Workspace Skill 默认是不受信任的说明内容。Skill 脚本不能因为“Skill 已信任”就继承全机权限。

### 14.4 验收条件

- AGENTS、Hook 和 Skill 都无法越过 hard policy。
- Hook/Skill 内容变化可被精确检测并使信任失效。
- 未触发的 Skill 不把完整正文塞入上下文。
- 同名 Skill、来源优先级和禁用状态有确定规则。
- 所有脚本执行经过统一 Policy/Sandbox/Audit。

---

## 15. Phase 7 — 语义 Provider

### 15.1 目标

保留当前轻量分析作为可靠 fallback，同时用可选 Provider 提供 definitions、references、diagnostics 和 rename preview。

### 15.2 主要实施内容

```text
semanticProvider:
  builtin
  serena
  lsp
  none
```

- Serena adapter。
- 可选 LSP adapter。
- provider 健康检查和降级。
- 所有返回路径经过 PathPolicy。
- rename/WorkspaceEdit 只返回 preview。
- 最终修改进入 Phase 3 AtomicTransaction。
- Provider 不直接公开重复文件/Shell 工具。

### 15.3 验收条件

- Provider 不可用时按明确规则降级到 built-in。
- 工作区外路径被拒绝并审计。
- rename preview 包含全部相对路径和 expectedHash。
- Provider 不能直接写文件或执行 Shell。
- Provider 权限不大于调用请求的有效权限。

---

## 16. Phase 8 — OAuth 2.1 与公网认证强化

### 16.1 目标

在保持个人自托管和 loopback Tunnel 架构的同时，为 ChatGPT 公网 MCP 提供标准身份、scope、撤销和凭据保护。

### 16.2 主要实施内容

- OAuth 2.1 resource-server 支持。
- issuer、audience、expiry、signature 和 scopes 验证。
- OAuth subject/token id 接入 Phase 2A `RequestIdentity`。
- revoke、rotation 和 owner-only personal deployment。
- MCP 与 admin scopes 分离。
- 长期秘密使用 Windows Credential Manager 或 DPAPI 等合适方案。
- Host allowlist 与公开 hostname 一致。
- Cloudflare Tunnel 配置生成、验证和 loopback 绑定。
- 可选 Cloudflare Access/mTLS 作为附加控制，不冒充 MCP OAuth。
- rate limit 和安全审计。

### 16.3 迁移原则

在真实 ChatGPT Web OAuth 流程完成端到端验证前，不删除当前 query-token 兼容路径，也不把 Bearer 手工配置写成 ChatGPT Web 支持能力。迁移必须有明确开关、警告、回滚和至少一个兼容周期。

### 16.4 验收条件

- ChatGPT Web 的正式路径不依赖 URL Token。
- scope 对每次工具调用强制生效。
- 撤销凭据立即失效。
- admin 和 MCP 权限分离。
- profile 不保存可直接使用的明文长期 Token。
- Tunnel 仍只连接 loopback，本地不开放直接入站端口。
- Cloudflare Access/mTLS 只作为附加防线。

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
- Policy Kernel 设计门全部通过后连续实施 Phase 2A–Phase 5；用户于 2026-07-14 将同一授权模型扩展到 Phase 8，并授权每个已验证子部分自行 stage、使用英文 commit、push。每一部分仍须先通过自身设计、TDD、验证、`neat-freak` 和精确头 CI。
- Permission、Approval、Sandbox、Tool Surface 分层。
- Skills 延迟加载不重建，只在 Phase 6 补信任和权限。
- Open Interpreter 只借鉴与 CodexPro 边界一致的设计和测试方法。
- 不引入模型 Provider/Harness，不转型为通用 Agent Runtime。
- OAuth 2.1 作为 Phase 8 已获实现授权；真实凭据不得进入测试、日志或仓库，迁移必须可回滚并经过独立安全门。
- Subagents 继续延后。
- 文件移动不进入 Phase 1；Phase 3 在原子事务、Policy Kernel 和 workspace isolation 基础上实现 `move_paths`。
- Slice 17–28 共 12 个剩余工具连续本地实施，每个工具后运行 `neat-freak`，目标全部完成后统一发布；中途不以单工具发布门中断实施。

### 21.2 设计门决定、当前不得假定

- Permission Profile 的最终文件格式和规则具体度算法。
- Windows SandboxBackend 的具体技术组合。
- Approval mode 枚举、缓存粒度和有效期。
- 网络 egress enforcement 的具体实现。
- OAuth 身份提供器和凭据生命周期。
- Hooks 的最终 manifest、事件 payload 和执行 backend。
- Serena/LSP 的具体接入方式。

### 21.3 禁止静默改变

- allowed roots 和秘密内容保护。
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
10. Hooks 延后到 Phase 6，且不能替代内置安全机制。
11. Skills 复用当前元数据发现和延迟加载，不重复造 loader。
12. Tool Surface 改为面向目标的预设方向，但不把预设当成权限。
13. OpenAI Codex 成为共享安全机制的上游主参考，Open Interpreter 成为适配和测试参考。
14. 聚合包装工具放在 Phase 1 最后迁移。
15. 每个阶段补齐了 prerequisites、acceptance、non-goals 和 rollback。

---

## 23. 当前停止点和下一动作

当前停止点：

```text
Phase 1 Slice 16 inspect_workspace
  → implementation and publication record complete
  → exact-head Ubuntu/Windows Node 20/24 CI passed

Phase 1 Slice 17 codexpro_inventory
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
Phase 1 Slice 27 codexpro_self_test
  → fresh inventory, exact-contract design, and seven-task uninterrupted TDD plan complete
  → executable baseline established with 12 expected failures; schema, Provider, handler, fixed-artifact probe, Tool Card, compatibility, and Stress migration completed RED-first
  → raw-read verification, recognized legacy-scaffold migration, and status/reason/truncation semantic drift hardened with deliberate REDs
  → focused 15/15, adjacent 104/104, complete 443/443, Build, all eight Smoke sections, native-Windows Stress, 157-file package dry-run, static gates, and per-tool neat-freak pass
  → Slices 17–27 are locally complete, reviewed, neat-freak reconciled, unstaged, uncommitted, unpushed, and unpublished
Phase 1 Slice 28 codexpro
  → fresh inventory, Approach C exact-contract design, and seven-task uninterrupted TDD plan complete
  → executable RED baseline covered schema, descriptor, live registration, aliases, child-envelope preservation, stable failures, Tool Card, protected compatibility, and Stress
  → deliberate hardening fixed the intentionally supertool-free connection-test surface, explicit enabled=false action exposure, and legacy-wrapper delegation instead of direct registered target-handler dispatch
  → focused 13/13, adjacent aggregation 87/87, complete regression 456/456, Build, all eight Smoke sections, native-Windows Stress, 162-file package dry-run, and static gates pass
  → unified implementation commit 021ab90 published; first exact-head run 29314051423 passed Ubuntu but exposed two CRLF-sensitive Windows test assertions
  → test-only portability repair e20d84e retained exact fail-closed checks and passed replacement exact-head run 29314923948 on Ubuntu/Windows Node 20/24
  → every matrix job completed Build, 456-test Regression, Smoke, and Package checks; Phase 1 is formally closed
```

Phase 1、Policy Kernel、Phase 2A、Phase 2B 已正式关闭；Phase 3A/3B 与三项 CI repair 已发布。Phase 3C Task 1 commit `a9acc14` 通过 run `29372615528`，Task 2 commit `c01a698` 通过 run `29374274230`，均覆盖 Ubuntu/Windows Node 20/24 四矩阵。Task 3 已在本地实现 server-owned private handle、required-audit/change-set participant 握手和完整回滚，但尚未发布；公共 writer 仍未迁移，V1 仍保持 28 tools，V2 仍失败关闭。按 2026-07-14 扩展授权，采用推荐选项连续推进 Phase 3C–Phase 8。每个独立子部分先交付、再审查、再整理、再发布，失败门禁必须修复而不能绕过。Phase 9、生产部署、真实凭据操作、破坏性数据/历史操作和规格外扩权仍未授权。
