# CodexGPT 对标 `openai/codex` 的全项目审阅

**状态：** 已完成静态架构与工程审阅；尚未实施本文建议
**审阅日期：** 2026-07-26
**CodexGPT 运行时代码基线：** `b4b041da32be7bfb133495fb30aa851d67d4f216`
**`openai/codex` 基线：** [`20dafe201d91d4405eef05ecd1db0257f13a9ac8`](https://github.com/openai/codex/tree/20dafe201d91d4405eef05ecd1db0257f13a9ac8)
**上游提交时间：** `2026-07-25T19:28:57Z`；所有 GitHub 文件链接固定到该 SHA
**配套实施路线：** [Phase 8 后项目改进计划](../superpowers/plans/2026-07-26-post-phase-8-project-improvement-plan.md)

## 1. 结论

CodexGPT 当前最强的部分不是功能数量，而是本地权限边界、路径安全、原子变更、失败关闭和可复现实证。与 `openai/codex` 对比后，不应做 Rust 重写、功能追平或架构照搬；最有效的路线是保留已有安全内核，补齐五个直接影响用户的薄弱面：

1. 先按 Phase 8 方案完成标准 OAuth，使日常连接从“复制含密钥 URL”变成“添加一次、审批一次、后续自动刷新”。
2. 把分散的环境变量、配置文件和默认值收束为一个可解释的配置内核，让错误能回答“哪个值、来自哪里、怎么修”。
3. 先补统一诊断和 Windows 当前用户后台生命周期，解决“必须守着终端”和“出错难定位”。
4. 沿真实变更边界拆分 `server.ts` 和公共 CLI，并生成纯协议清单，降低误伤安全合同和描述漂移的概率。
5. 只在用户明确需要运行不受信任代码时，独立评估把现有原生 PowerShell/进程后端置于真实 Windows workspace isolation 下。

F-01/F-02 是对标中直接暴露的 Phase 8 架构缺口；随后对完整草案做的独立对抗审查又发现命令、协议错误、并发、恢复与洪泛边界上的可运行性阻断。它们均已进入配对规格/TDD 计划，摘要见下表，但仍全部“未实现”。配置内核及其他项目建议需要独立授权和逐项验证，不能借本次文档工作进入运行时。

## 2. 审阅方法与边界

本次审阅采用“目标相同才比较”的原则，而不是把两个项目按文件逐项对齐。

- CodexGPT 是 Windows 原生、单用户、自托管、面向 ChatGPT 的本地开发桥。
- `openai/codex` 是范围更广的通用编码代理，包含 CLI、应用服务器、多平台执行、状态存储和远程能力。
- 因此仅参考可迁移的工程模式：配置来源、协议边界、状态迁移、OAuth 并发、Windows 隔离、进程协议、网络控制、诊断和发布门禁。
- 本次对 CodexGPT 做了仓库静态检查、现有文档/测试/CI 合同核对和 Phase 8 草案审阅；没有把 `openai/codex` 的测试结果当作 CodexGPT 的运行证据，也没有执行依赖安装、凭据迁移或外部状态变更。
- 运行时代码事实绑定 `b4b041da32be7bfb133495fb30aa851d67d4f216`；Phase 8 规格、计划和本审阅处于未提交工作树，最终文件摘要与 `git status --short` 记录在 STEP-437 archive，不能假称由该 Git SHA 单独复现。

当前仓库规模用于识别维护风险，不用于评价代码质量：

| 区域 | 文件数 | 约字节数 | 观察 |
|---|---:|---:|---|
| `src/` | 247 | 3.26 MB | 核心能力完整，但公共服务器入口过度集中 |
| `test/` | 238 | 2.22 MB | 回归密度高，是拆分时必须保留的资产 |
| `scripts/` | 66 | 1.15 MB | 公共 CLI、诊断、工具链和长任务编排较多 |
| `docs/` | 123（审阅文件创建前） | 3.88 MB | 决策证据充分，但历史检索成本正在上升 |

高变更碰撞文件：

| 文件 | 物理行数 | 大小 | 风险 |
|---|---:|---:|---|
| `src/server.ts` | 11,058 | 434,986 B | 工具注册、协议适配、域装配和部分运行时逻辑聚集 |
| `scripts/codexgpt.mjs` | 4,673 | 200,964 B | 用户流程、参数、启动、Cloudflare 和兼容逻辑聚集 |
| `src/http.ts` | 1,948 | 78,061 B | Phase 8 公共入口会进一步增加认证复杂度 |
| `src/toolCardWidget.ts` | 2,000 | 89,917 B | UI/协议内容体积较大 |
| `src/config.ts` | 913 | 37,532 B | 大量来源直接在 `loadConfig()` 中合并 |

### 2.1 Phase 8 草案可运行性审计

初稿完成后再审，而不是把讨论当交付。最终草案已修正这些会让实施者照抄失败或留下安全歧义的问题：

| 等级 | 初稿问题 | 最终控制合同 |
|---|---|---|
| P0 | 托管 Node 命令未传本仓保留的 `CodexPro\toolchains` root；Node 20 不展开测试 glob；九个 inherited test 路径不存在 | 每个 status/exec/matrix（含 detached 子命令）显式 `--root $phase8ToolchainRoot`；用 `rg --files` 生成非空精确测试数组；命令路径门禁逐项 `Test-Path` |
| P0 | approve 之外的 deny/expire 没有标准回调闭环 | cookie-bound terminal delivery；approve/deny/expire 都经 one-use continue 返回 code/error + 原 state + RFC 9207 issuer，并覆盖竞争/二次消费 |
| P0 | refresh 与 revoke/scope/owner-wide mutation 锁域不统一；code exchange 崩溃点不清楚 | deployment mutation gate → sorted family locks → authoritative reread/CAS；状态与 audit durable-before-success；code 最多一次成功且无双 family/orphan |
| P0 | auth-mode “环境/profile 冲突失败”与 override/rollback 合同矛盾；退回 OAuth 没有命令 | 单一来源优先级与 origin；真实冲突只限无效值/OAuth+query-token；返回路径是幂等 source/global `auth setup --root` |
| P0 | backup restore 换 deployment ID 会让 registry/tunnel owner 指向旧身份 | 稳定 `bindingId` + 可旋转 `incarnationId`；registry/state 原子切换，tunnel owner 只绑定稳定 binding，不远程重建 Tunnel/DNS |
| P1 | PKCE challenge 长度、resource/scope/error、unknown extension、RFC 9207 与 CORS 未冻结 | exact PKCE verifier/challenge、端点×错误码矩阵、bounded unknown ignore、issuer response binding、authorize/wait/status/continue 无 open CORS |
| P1 | 公网伪 JWT/polling 可制造 crypto 与 audit 写放大 | cheap reject、全局/crypto/route 队列、有效 token keyed cache 与 established-user 保留容量、无效事件窗口聚合 |
| P1 | capability 扩缩容未写重启且可能产生无限 step-up | profile change → exact-root restart；区分 deployment-disabled、token-missing、operation-approval-missing；scope-only 不要求 Scan Tools |
| P1 | `resource_documentation` 指向可能不存在的 `/` | Core 必有完全静态安全帮助页，只给本机 `auth status/open` 行动 |

这些修正提高的是“实施方案可照抄执行”和“失败结果确定性”，不是已完成的运行时能力。Gate G8-0 仍需新授权、当前规范/SDK/依赖冻结和 RED 基线；只有可运行 OAuth 垂直切片存在后，当前 ChatGPT 的 DCR、RFC 9207 与 cookie/navigation 兼容性才进入 fail-closed G8-U 验收。

## 3. 已经做得更好的部分

以下能力应视为不可回退的项目资产，不应为了模仿上游而重写：

### 3.1 本地安全边界

- 工作区使用随机不透明句柄，生命周期和会话所有权失败关闭。
- Windows 路径、设备路径、UNC、ADS、保留名、尾随点/空格、链接逃逸和跨盘逃逸有明确合同。
- 同句柄读取、稳定对象身份、`nlink === 1`、二次锁内检查和内容哈希把“检查后替换”纳入威胁模型。
- 默认原子文件事务、回滚、审计和直接写入静态清单比普通本地工具更严格。
- Safe Bash 被如实描述为策略过滤器，不虚构成操作系统沙箱。

**为什么保留：** 这是“远程请求触达本机”场景最底层的风险控制。
**对用户的影响：** 即使增加 OAuth、语义引擎或 Git 能力，授权范围仍不会被便捷功能悄悄扩大。

### 3.2 验证与发布纪律

- Ubuntu/Windows、Node 20/24 的矩阵与托管工具链提供了真实的 Windows 重现路径。
- 长任务租约、精确 run ID、exact-head CI 和文档/运行时分类避免“本地看起来通过”被误报为发布完成。
- 工具合同 V1–V5 的精确数量和策略清单能检测协议漂移。
- Phase 7 用真实 ChatGPT App UI 证据闭环，不把后端 HTTP 测试冒充最终用户验收。

**为什么保留：** 该项目的主要失败成本来自安全合同悄然变化，而不是单个函数覆盖率。
**对用户的影响：** 升级依赖或增加工具时，旧连接和旧权限不容易被无意破坏。

### 3.3 范围克制

- 不依赖项目运营的远程 relay。
- 不把 Cloudflare 当作本地授权边界。
- 不因为上游存在 Hooks、子代理或远程服务就自动引入同类能力。

**为什么保留：** 单用户自托管产品的最短路径与通用代理平台不同。
**对用户的影响：** 安装、信任和故障面保持可理解。

## 4. 发现与改进建议

优先级含义：

- **P0：** Phase 8 实现前必须在设计和测试中关闭，否则标准认证可能不可用或不安全。
- **P1：** Phase 8 后优先投入，能明显减少用户步骤、故障时间或高风险改动成本。
- **P2：** 有明确价值，但应以测量结果或前置能力为触发条件。

### F-01 — P0：OAuth SDK 的默认路由和元数据不能直接暴露

**现状**

当前生产依赖 `@modelcontextprotocol/sdk@1.29.0` 的 `mcpAuthRouter` 固定使用根路径 `/authorize`、`/token`、`/register`、`/revoke`。其默认元数据和注册处理器比本项目需要的单用户公开客户端模型更宽：可发布 `client_secret_post`，内置 DCR 使用通用 JSON 解析和开放 CORS，并可为非公开客户端签发 secret。

早期 Phase 8 草案把这些端点设计为 `/oauth/*`。该前缀本身并非被 OAuth 标准禁止，但它与当前 SDK 的 root-mount 路由/元数据不一致，会迫使项目维护第二套路由事实；直接照用 SDK 又会扩大注册面。Core 应只保留一个明确组合。

**改进**

- 项目自有的严格元数据、`/jwks` 和 metadata 所引用的静态安全 `/` 帮助页先挂载。
- 项目自有 `POST /register`，只接受 ChatGPT 精确回调、公开客户端、`token_endpoint_auth_method=none`，拒绝 secret/JWKS 输入、重复语义字段和过大 JSON。
- 给 SDK 的 client store 只提供查询，不提供 `registerClient`，阻止 SDK 挂载第二个注册端点。
- `mcpAuthRouter` 按 SDK 合同挂在根路径，只复用 `/authorize`、`/token`、`/revoke`，并在其前面放项目自有 raw query/form、Host、方法、content-type、参数、速率、cache 和安全错误守卫；项目 limiter 生效后关闭 SDK 的 loopback/IP limiter。CORS 从不构成授权。
- 路由表合同测试必须证明 `/oauth/*`、第二个 `/register` 和客户端 secret 流均不存在。
- G8 内直接加入固定 seed 的 query/form/JSON/URI 属性与对抗测试，不把首次安全覆盖推迟到后续供应链工作包。

**为什么：** 路径兼容决定 ChatGPT 能否完成发现和授权；注册面决定谁能创建有效客户端。
**对用户的影响：** “添加 App”能按标准路径工作，同时不会因为 SDK 升级悄悄开放不需要的认证方式。
**状态：** 已写入 Phase 8 规格和 TDD 计划，尚未实现。

### F-02 — P0：刷新令牌需要跨请求串行化和固定存储绑定

**现状**

旋转刷新令牌在两个并发请求中若先读后写，可能同时把同一令牌当作有效，造成双重签发。若凭据存储在请求中途从安全后端回退到旧后端，还可能读到过期状态。

`openai/codex` 的 [`refresh_lock.rs`](https://github.com/openai/codex/blob/20dafe201d91d4405eef05ecd1db0257f13a9ac8/codex-rs/rmcp-client/src/oauth/refresh_lock.rs) 在每个凭据范围获取锁后重新读取权威状态，并持锁完成刷新与持久化；[`resolved_store.rs`](https://github.com/openai/codex/blob/20dafe201d91d4405eef05ecd1db0257f13a9ac8/codex-rs/rmcp-client/src/oauth/resolved_store.rs) 将已解析的具体存储后端固定到生命周期。

**改进**

- refresh、replay、expiry、public/local/client/owner revoke 和 scope revision 共享一个固定顺序的线性化 coordinator；不是只有 refresh 自己加锁。
- 进入 deployment mutation gate 和排序后的 family lock 后重新读取权威记录/CAS，再校验、消费旧令牌、写入后继令牌和修订号；状态与 installation-wide audit 都持久化成功后才响应。
- 启动时确定一个具体 DPAPI/状态后端并固定使用；运行中失败应报错，不回退到可能陈旧的存储。
- refresh token 使用带完整性保护的 opaque family/generation envelope，因此任一旧 generation 都能定位并吊销当前 family，而无需短 tombstone 上限强迫周期性 relink；冲突、丢失响应、崩溃和重启有确定测试。
- authorization code consume + grant/family + audit 同样是一个 crash-safe 事务，双 exchange 最多一次成功。

**为什么：** 旋转令牌的安全性取决于原子状态转移，不取决于随机字符串长度。
**对用户的影响：** ChatGPT 并发刷新或网络重试不会随机把连接弄坏，也不会生成两个有效后继。
**状态：** 已写入 Phase 8 规格和 TDD 计划，尚未实现。

### F-03 — P1：缺少统一、可解释、严格验证的配置内核

**现状**

`src/config.ts` 的 `loadConfig()` 直接混合 CLI、`CODEXGPT_*`、兼容环境变量、操作系统路径和默认值。`src/profileStore.ts` 与 `scripts/doctor.mjs` 又各自读取/解析 profile JSON。当前实现能工作，但存在三个用户问题：

1. 同一个值冲突时，用户很难知道最终值来自参数、环境变量、profile 还是默认值。
2. profile 中的拼写错误可能没有统一的未知字段诊断。
3. doctor 和运行时可能使用不同解析路径，形成“诊断说可以、启动却失败”。

`openai/codex` 的[配置加载器](https://github.com/openai/codex/blob/20dafe201d91d4405eef05ecd1db0257f13a9ac8/codex-rs/config/src/loader/README.md)把每层来源、合并优先级、稳定指纹和禁用原因建模为一等数据；[`strict_config.rs`](https://github.com/openai/codex/blob/20dafe201d91d4405eef05ecd1db0257f13a9ac8/codex-rs/config/src/strict_config.rs)和[`schema.rs`](https://github.com/openai/codex/blob/20dafe201d91d4405eef05ecd1db0257f13a9ac8/codex-rs/config/src/schema.rs)提供严格未知字段检查和生成 schema。

**改进**

- 建立唯一纯函数配置解析器，输出 `effectiveConfig` 与逐键 `origin`，secret 只显示存在性和来源，不显示值。
- 固定优先级并写成合同：有该 selector 的显式 CLI > 当前进程环境 > persisted-user 环境 > canonical-root profile > 安全默认；兼容键只作为有期限的迁移层。
- profile 使用严格 schema，错误包含文件、JSON 路径、未知字段、建议字段和修复命令。
- 新二进制对旧 schema 做 copy-on-write 迁移；旧二进制遇到未来 schema 拒绝写入，不能丢未知字段。
- `doctor`、`start`、测试和 Phase 8 setup 共用同一解析器。
- 配置层生成稳定但不含 secret 的指纹，用于重启需求、策略陈旧和诊断比较。

**为什么：** 配置不是字符串集合，而是决定权限和网络边界的输入。
**对用户的影响：** 出错时能直接看到“为什么取这个值”和“一条可执行修复命令”，减少反复改环境变量。
**边界：** Phase 8 只实现认证所需的窄 resolver；全量迁移在其后分步完成。

### F-04 — P1：公共服务器和 CLI 入口已经成为高碰撞单体

**现状**

`src/server.ts` 超过一万行，聚集工具注册、兼容包装、工作区域、多个能力域和运行时装配；`scripts/codexgpt.mjs` 超过四千行，聚集用户引导、启动、Cloudflare 和兼容流程。Phase 8 若继续把 OAuth、admin 和 setup 直接塞入这两个文件，会增加：

- 合并冲突与审查负担；
- 工具描述、策略和 handler 不一致；
- 小改动触发大范围回归；
- 安全边界难以按模块验证。

**改进**

- 先建立特征测试和当前工具/路由清单，不做一次性重写。
- 按域提取“描述 + schema + policy + handler factory”的模块，由一个组合根注册。
- HTTP 分为 public resource server、OAuth authorization server、local admin 三个明确 composition root。
- CLI 按 `start`、`auth`、`cloudflare`、`doctor`、`profile` 命令域提取，公共 entry 只负责解析与调度。
- 每次只迁移一个域，V1–V5 数量、descriptor digest、策略和用户输出必须逐字节或结构化等价。

**为什么：** 文件大小本身不是缺陷，但混合不同信任边界会让审查成本随功能非线性增长。
**对用户的影响：** 后续功能更快交付，且不容易因为修改认证而破坏文件工具或旧连接。

### F-05 — P2（条件式）：`workspace` 执行隔离仍未形成可用产品

**现状**

Phase 4 的 AppContainer/LPAC 可行性检查诚实地保持阻塞，`full_access` 也被正确标记为无隔离。项目已在显式 V3 + `full_access` 下提供原生 PowerShell/进程后端；真正缺少的是把它安全限制在当前 workspace，使其可用于不完全信任的代码。`AGENTS.md` 与 `src/bashOps.ts` 仍有“PowerShell planned”类陈旧表述，应在独立一致性修复中区分 legacy `bash` 工具与已存在的 V3 native process path。

`openai/codex` 已有专门的 [`windows-sandbox-rs`](https://github.com/openai/codex/tree/20dafe201d91d4405eef05ecd1db0257f13a9ac8/codex-rs/windows-sandbox-rs) 和 [`exec-server`](https://github.com/openai/codex/blob/20dafe201d91d4405eef05ecd1db0257f13a9ac8/codex-rs/exec-server/README.md)，包含 Windows 权限、DPAPI、WFP、ConPTY/进程生命周期以及有序输出游标等可参考边界。

**改进**

- 只有用户明确提出“不受信任代码也要运行”时，才把 W0 只读 feasibility 升级为实现优先级；受信任仓库继续使用当前如实标注的 ambient path。
- 分开评估上游 sandbox、process host 和 IPC；`exec-server` 本身不是沙箱，不得直接当作隔离后端。
- 硬性拒绝 `--remote`、OpenAI registry/relay/auth、未认证 TCP/WebSocket listener 和 Cloudflare 公共接入。候选只允许项目拥有的 stdio/named pipe 或严格认证的 exact-loopback IPC。
- 核对固定版本发布物、协议稳定、精确构建复现、传递许可证/NOTICE，以及提权、账户、ACL、WFP 状态的创建/清理恢复。
- 建立威胁矩阵：文件、凭据、注册表、命名管道、进程、网络、子进程、重解析点和提权边界。
- 用协议适配器连接现有 approval、audit、workspace handle 和 transaction，不允许远端选择任意 runner 参数。
- 用攻击夹具证明失败关闭；任何证据不完整时 `workspace` 仍不可用，不回退到 `full_access`。

**为什么：** 这是一项安全产品能力，不是换一个 shell 命令。
**对用户的影响：** 若 spike 成功，现有原生 PowerShell/进程能力可在真实 workspace isolation 下用于较低信任代码；若失败，项目仍保持诚实而安全。
**特别说明：** 上游 Windows DPAPI 的 machine-scope 选择服务于其提权通信场景，不应复制到 Phase 8 的单用户长期 OAuth 凭据。

### F-06 — P1：缺少“安装后持续可用”的 Windows 后台生命周期

**现状**

当前公共使用路径要求用户保持终端运行。OAuth 解决身份，但不会解决重启后服务未启动、日志在哪里、如何安全重启的问题。

**改进**

- 增加可选的当前用户 Task Scheduler 管理命令：`service <install|start|stop|status|logs|restart|uninstall> --root <canonical-path>`。
- 默认不需要管理员权限、不保存 Windows 密码、不启用“无论用户是否登录都运行”。
- 任务固定公共 entry、Node/toolchain 身份、profile、工作目录和状态目录；安装前显示完整预览并要求一次确认。
- 同一部署不能并行运行“候选任务”；更新走可恢复短暂停机：验证/导出旧 XML → 停精确拥有的旧进程树 → 注册/启动/健康检查新定义 → 失败恢复旧 XML。
- 启动前做配置指纹/版本检查；自动恢复只允许恢复任务定义/启动 action，且前后必须绑定同一安全关键配置指纹。auth、grant、hostname、profile 和 credential 配置不得自动回滚。
- 任务使用固定 launcher、精确 `process.execPath`/Node/entry digest、最小环境白名单和有界日志；清除未拥有的 `NODE_OPTIONS`，不继承 GitHub/npm/Cloudflare 等 ambient token。
- `uninstall` 只移除任务定义，保留用户状态并给出可选的后续清理命令。

**为什么：** 自托管连接的真实可用性由“机器重启后是否自动恢复”决定。
**对用户的影响：** 平时不需要保留 PowerShell 窗口；出错时有统一的状态与日志入口。
**授权边界：** 创建/修改计划任务会改变系统状态，必须单独授权，不能包含在本次设计工作中。

### F-07 — P1：诊断证据丰富，但缺少统一的用户入口

**现状**

项目已有 doctor、审计、长任务证据、CI 摘要和多种日志，但它们针对开发门禁分别演进。用户面对“ChatGPT 连不上”时，需要自行判断是 DNS、Tunnel、Host、Origin、OAuth、DPAPI、grant、server、workspace 还是 tool snapshot。

`openai/codex` 的 [`otel`](https://github.com/openai/codex/blob/20dafe201d91d4405eef05ecd1db0257f13a9ac8/codex-rs/otel/README.md)把 tracing、metrics、内存测试 exporter 和显式关闭作为统一边界。这里应借用结构，不默认引入远程遥测。

**改进**

- `codexgpt doctor --root <canonical-path> --json` 输出稳定 schema、严重级别、检查 ID、证据时间和下一条命令。
- doctor/inspect 在主服务失败时仍可离线只读运行，不取得 writer/admin 权限也不自动修复。
- `codexgpt diagnostics bundle` 生成本地、定界、脱敏、可预览的支持包；默认不上传。它写入已审查安全状态根/owner DACL，拒绝 reparse point，并在打开句柄后复查身份。
- public request、OAuth pending/approval/token、MCP session、workspace 和 audit 使用贯穿的 correlation ID。
- 指标仅保留安全聚合：延迟、错误类别、刷新冲突、队列深度、重启原因；不得记录 token、authorization code、完整 URL query、文件内容或私有路径。
- 诊断、日志、错误和支持包共用一个 redaction taxonomy/contract，但 redaction 不替代 secret-write blocking 或授权。
- inspect 只能证明“已知模式无命中”并列出不可判定类别，不能声称所有私有内容均不存在。
- 终端错误给一个主行动，详细证据放在 `--verbose` 或 bundle。

**为什么：** 可观测性的目标是缩短恢复时间，不是收集更多日志。
**对用户的影响：** 连接失败时得到“正在检查 → 问题位置 → 下一步命令”，而不是在多个文件中搜索。

### F-08 — P1：协议与工具清单仍有人工重复

**现状**

项目用精确 V1–V5 数量和合同测试防漂移，这非常有效；但 tool descriptor、Zod schema、policy、security scheme、文档表格和兼容清单仍可能在多个位置维护。`server.ts` 中的兼容注册层也说明协议装配具有集中风险。

`openai/codex` 的 [`app-server-protocol`](https://github.com/openai/codex/tree/20dafe201d91d4405eef05ecd1db0257f13a9ac8/codex-rs/app-server-protocol)生成协议 schema，是可借鉴的单一事实源模式。

**改进**

- 建立无运行时副作用的纯数据 `ToolManifestEntry`：名称、合同版本、tool mode、connection-test 可见性、auth/guidance mode、read/write/execute 分类、输入/输出 schema、annotations、approval 级别和 auth security scheme。
- handler 放在独立 `ToolHandlerRegistry`，CI 证明 manifest 与 handler 一一对应，生成/文档代码不得导入 handler factory。
- 从 manifest 生成 MCP descriptor、V1–V5 清单、文档表格和稳定 digest。
- 运行时 policy 仍做独立失败关闭检查，不能把生成数据当成授权。
- CI 对“生成物未更新”“未分类新工具”“安全 scheme 缺失”“旧合同数量漂移”分别报错。

**为什么：** 单一事实源减少描述与执行不一致，但授权仍必须由服务端独立验证。
**对用户的影响：** ChatGPT 看到的工具说明、登录要求和实际行为更一致，升级后少出现缓存/描述错位。

### F-09 — P2：状态文件需要迁移协议，但暂不应立即换成 SQLite

**现状**

Phase 8 会增加 clients、grants、refresh families、key metadata、audit linkage 和 schema migration。继续使用原子 JSON/DPAPI 可以完成 Core，但状态增长后需要明确的版本、备份和恢复策略。

`openai/codex` 的 [`migrations.rs`](https://github.com/openai/codex/blob/20dafe201d91d4405eef05ecd1db0257f13a9ac8/codex-rs/state/src/migrations.rs)、[`recovery.rs`](https://github.com/openai/codex/blob/20dafe201d91d4405eef05ecd1db0257f13a9ac8/codex-rs/state/src/runtime/recovery.rs)和[`thread-store`](https://github.com/openai/codex/blob/20dafe201d91d4405eef05ecd1db0257f13a9ac8/codex-rs/thread-store/README.md)展示了可版本化迁移、精确备份和“规范历史 + 可查询索引”分层。

**改进**

- Phase 8 先定义 `AuthStateStore` 接口、schema 版本、原子迁移、备份和故障注入测试。
- 把稳定 root/issuer/tunnel `bindingId` 与可恢复旋转的 `incarnationId` 分开；恢复通过 copy-on-write incarnation + registry pointer 单一提交点。
- 记录真实规模与写入频率：记录数、写延迟、恢复时间、锁冲突和文件大小。
- 只有达到预设阈值或查询需求明确时，才做 Node 20/24 双版本的 SQLite 依赖/打包/恢复 spike。
- 迁移必须允许旧二进制安全拒绝或只读打开新 schema，绝不静默降级写入。

**为什么：** 数据库不是可靠性的同义词；明确的状态合同先于存储引擎。
**对用户的影响：** 小规模个人部署保持零额外依赖，数据增长后仍有可预测的升级和恢复路径。

### F-10 — P2：功能开关缺少统一生命周期

**现状**

项目依靠多个环境变量、模式和合同版本实现安全迁移，但开关定义、默认值、弃用日期、冲突和诊断分散。随着 Phase 8 和后续 Windows 后端增加，组合爆炸风险会增长。

`openai/codex` 的 [`features`](https://github.com/openai/codex/blob/20dafe201d91d4405eef05ecd1db0257f13a9ac8/codex-rs/features/src/lib.rs)可作为集中注册思路的参考。

**改进**

- 建立 feature registry：ID、状态、默认值、引入版本、移除门槛、互斥/依赖、用户可见说明和测试矩阵。
- 未知 feature 失败并给建议；过期兼容键发结构化警告。
- 只让 registry 决定能力是否存在，权限仍由 policy/approval 决定。

**为什么：** 开关是迁移工具，不应成为永久架构。
**对用户的影响：** 升级时能清楚知道哪个旧设置需要移除，避免“改了但没生效”。

### F-11 — P2：供应链证据可从“测试通过”扩展到“发布内容可验证”

**现状**

现有 CI、精确工具链、依赖锁和 policy gate 已经强于普通个人项目。剩余缺口主要在发布物和依赖变化的持续证据，而不是再堆一套重复测试。

`openai/codex` 使用独立 blocking CI 聚合和仓库检查；可参考其 [`blocking-ci.yml`](https://github.com/openai/codex/blob/20dafe201d91d4405eef05ecd1db0257f13a9ac8/.github/workflows/blocking-ci.yml)，但需按本项目 npm/Windows 发布路径裁剪。

**改进**

- 依赖更新 PR 自动生成 API/route/descriptor/schema 差异，尤其锁定 MCP SDK 与 OAuth 行为。
- 正式发布生成 SBOM、包内容清单、源码 SHA、Node 20/24 smoke 结果和 provenance。
- Phase 8 内先关闭 OAuth URL/query/form/JSON 的 fixed-seed 属性边界；后续再对路径、配置、协议联合和 archive 做长时间模糊测试，不追求全仓库 fuzz。
- 保持一个 blocking 汇总 gate，避免新增检查却未成为发布条件。

**为什么：** 用户运行的是发布包，不是 Git 工作树。
**对用户的影响：** 可以确认安装内容对应哪次验证，并在依赖行为变化时更早失败。

### F-12 — P2：追加式记忆正确，但需要生成式索引

**现状**

根 `Memory.md` 保持精简，archive 追加历史，避免重写证据；但文档总体已接近 3.9 MB，后续每阶段检索成本会继续上升。

**改进**

- 保留 archive 不变，生成 `docs/memory/index.json` 和可读索引：STEP、阶段、日期、SHA、run ID、主题、文件、状态。
- policy gate 校验索引可重建、链接存在、当前基线之后不再新增重复/倒退 STEP、根 Memory 限额；既有 Phase 6/7 重叠号作为显式历史冲突报告，不重写追加式 archive。
- 提供 `npm run memory:find -- <term>`，只做本地检索，不把 archive 全量注入模型上下文。

**为什么：** 历史应不可变，但访问路径可以生成。
**对用户的影响：** 恢复旧决策从“打开大文件搜索”变成一条命令，同时不牺牲审计历史。

### F-13 — P2：网络出口控制只能作为沙箱的组成部分

**现状**

当前 `full_access` 如实没有网络隔离。`openai/codex` 的 [`network-proxy`](https://github.com/openai/codex/blob/20dafe201d91d4405eef05ecd1db0257f13a9ac8/codex-rs/network-proxy/README.md)提供 loopback proxy、allow/deny、私网阻断和安全审计等参考模式。

**改进**

- 仅在可证明子进程无法绕过代理的 OS 级后端之后评估 egress policy。
- 默认 deny，deny 优先；阻止 loopback/private/link-local/metadata 服务和 DNS 重绑定。
- 审计只记规则 ID、目标类别和结果，不记完整 query、凭据或内容。
- 代理不可用时受限 profile 失败关闭，绝不退回直连。

**为什么：** 仅设置代理环境变量不能构成网络隔离。
**对用户的影响：** 后续可允许受限依赖下载或 API 访问，而不虚构安全边界。

## 5. 优先级总表

| 顺序 | 工作包 | 价值 | 依赖 | 建议门禁 |
|---:|---|---|---|---|
| 1 | Phase 8 OAuth Core | 去掉 URL 凭据，减少首次与日常连接步骤 | 独立运行时授权 | G8-0 至 G8-X |
| 2 | 配置内核 + 诊断基础 | 错误可解释，消除 doctor/运行时分歧 | Phase 8 窄 resolver 可先落地 | GC-0 / GD-0 |
| 3 | 后台生命周期 | 重启后自动恢复，不守终端 | 稳定 start/auth/profile、诊断 schema | GS-0 至 GS-X |
| 4 | 服务器/CLI 模块化 + 工具目录生成 | 降低安全改动碰撞与协议漂移 | 特征测试与现有 digest | GM-0 至 GM-X |
| 5 | 完整统一诊断 | 缩短复杂故障恢复时间 | correlation ID、配置来源和 service | GD-X |
| 6 | 条件式 Windows 隔离 feasibility | 把现有 PowerShell/进程限制到真实 workspace | 仅在不受信任执行需求出现后独立授权；W0 可只读并行 | GW-0 |
| 7 | 状态迁移与记忆索引 | 可预测升级、恢复与历史检索 | 先测量规模/写入 | GDS-0 |
| 8 | 供应链/发布证据 | 发布包可验证 | 明确 npm/二进制发布方式 | GR-0 |
| 9 | 网络出口策略 | 受限执行可控联网 | 先有不可绕过的 OS 隔离 | GN-0 |

详细任务、测试、验收和回滚见配套的 [Phase 8 后项目改进计划](../superpowers/plans/2026-07-26-post-phase-8-project-improvement-plan.md)。

## 6. 明确不建议做的事

1. **不做 Rust 全量迁移。** 语言迁移不会自动提高安全性，只会暂时丢失现有 238 个测试文件和 Windows/Node 运行证据。
2. **不追平 `openai/codex` 的全部功能。** Hooks、通用子代理、远程任务和多用户服务不直接解决当前单用户 ChatGPT 桥目标。
3. **不引入项目运营的 relay。** 这会改变自托管信任模型。
4. **不因“标准做法”强制外部 IdP。** 对单用户自托管 Core，内置窄 OAuth 能给出更短路径；若将来变成多用户/团队产品，应重新评估成熟 IdP。
5. **不把代理、Safe Bash 或计划任务称为沙箱。** 只有有完整 OS 证据的执行边界才能获得 `workspace` 名称。
6. **不立即迁移 SQLite、OTel exporter 或机器级 DPAPI。** 先建立接口与测量；远程遥测默认关闭；Phase 8 owner secret 保持 `CurrentUser`。
7. **不复制上游源码而忽略许可证。** `openai/codex` 使用 [Apache-2.0](https://github.com/openai/codex/blob/20dafe201d91d4405eef05ecd1db0257f13a9ac8/LICENSE)；优先复用设计，若复制代码必须单独做许可证、NOTICE、版本和安全审查。

## 7. 完成标准

本审阅本身的完成标准是：

- 上游事实绑定两个精确代码 SHA，未提交设计输入绑定最终文件 SHA-256 和 STEP-437 审阅时间；
- 每个发现都有“为什么、用户影响、建议和授权边界”；
- Phase 8 的 P0 缺口进入配对规格/TDD 计划；
- Phase 8 后建议进入独立、可排序、可回滚的执行计划；
- 对抗性审查后修正事实、优先级和不可复制边界；
- 文档、链接、策略和 secret 扫描通过后，才可称为“审阅完成”。

本文不授权任何运行时代码、依赖、凭据、Cloudflare、计划任务、Git staging/commit/push 或部署变更。
