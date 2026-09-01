# ChatGPT Web E2E Benchmark

## 结论

这套 benchmark 用来回答一个具体问题：**CodexGPT 的改造有没有让 ChatGPT Web 更正确、更少绕路地完成本地代码任务。**

它不是 unit/integration test 的替代品。现有 contract、transaction、audit、smoke、build 继续证明实现没有破坏既有合同；本 benchmark 只测模型在真实 ChatGPT Web 中选择工具并完成任务的效果。

历史状态曾是 **blocked after baseline A1**：原 baseline 的下一次显式 `read(package.json, workspace_id=W)` 返回 `WORKSPACE_NOT_FOUND`，证据保留在 `runs/2026-08-16-baseline-a1.json`。STEP-493/494 已关闭该 real-client continuity gate。STEP-495 已完成 successor-adjusted A2 pair：baseline 与 candidate 都应用完全相同的 workspace-successor overlay，并都满足 A2 task success；两边都缺完整 UI/tool trace，因此 A2 不能证明 P1 改善或恶化了 tool-call efficiency。

## 固定比较对象

初始 A/B 比较固定为：

- baseline server: `c43ec8ecae9782598ebc9cf90d8df8cdde1035c1` (`origin/main` before the P1 pipeline slice)
- candidate server: `8a3d5dd3012c7c152fb7eea2fdb3fb91465ebc7e` (P1 tool-execution-pipeline slice 1)
- target workspace: 始终固定在 `c43ec8ecae9782598ebc9cf90d8df8cdde1035c1`

最后一条是控制变量要求。不能让 baseline server 操作 baseline checkout、candidate server 操作 candidate checkout，然后把差异归因于工具行为；那会同时改变 server implementation 和目标项目内容。

每个 case 都必须从 target ref 创建一个新的 disposable worktree。mutation/review case 的 `setup` 只作用于这个 disposable target，不作用于 server-under-test checkout。

## 任务集

`benchmark.json` 固定 18 个任务，每类两个：

- A — 项目理解
- B — 定位/navigation
- C — Bug 修复
- D — 小范围修改
- E — 多引用 rename/refactor
- F — Git review
- G — 小功能/TDD
- H — 长任务/process experience
- I — change-set rollback

任务文本、setup 和 success criteria 都属于 benchmark contract。比较期间不要临时重写 prompt 来帮助某一个 server variant。

### 标准 workspace bootstrap

OAuth profile 的 canonical root 不是 benchmark target，因此 `--allow-root <fresh-case-worktree>` 只授予访问权，**不会**把该 worktree 变成默认 workspace。为避免模型省略 `workspace_id` 时误操作 profile root，每个 case 的实际用户消息都必须用 `benchmark.json.runtime_bootstrap.instruction_template` 渲染：

```text
先调用 open_workspace 打开 {TARGET_ROOT}。后续本任务所有项目工具调用都必须显式使用返回的 workspace_id，不要使用默认 workspace。完成 workspace 绑定后，再执行下面的 benchmark task：

{CASE_PROMPT}
```

`{TARGET_ROOT}` 替换为该 case fresh disposable worktree 的绝对路径，`{CASE_PROMPT}` 原样替换为对应 case 的 `prompt`，不得加入额外工具提示。这个 bootstrap 对 baseline/candidate 完全相同，是 benchmark contract 的一部分，不是对某个 variant 的帮助。

成功的 `open_workspace({TARGET_ROOT})` 记入 `total_tool_calls`，并且固定记为一次 `context_fetch_calls`。随后所有项目调用必须显式携带它返回的 `workspace_id`。`run-template.json` 为每个 case 单独记录实际 `target_workspace_root` 和 `workspace_bootstrap_completed`。如果模型没有完成 bootstrap、或者后续改用默认 workspace，不为了“救回”该轮而重跑；按真实 trace 评分，`workspace_bootstrap_completed=false`，受影响的错误项目调用按 `wrong_tool_calls` 计，任务是否成功仍按原 success criteria 判断。

## 七个原始指标

每个 case 都记录下面七项。没有证据时保持 `null`，不能用推测补值。

`task_success`
: `true|false`。只有 case 的全部 success criteria 都满足才记为 `true`。部分完成写在 `notes`，但 KPI 仍按失败计算。

`wrong_tool_calls`
: 非负整数。一次调用在当时已有信息下明显违背任务意图、工具合同或约束，或不可能推进任务时计 1。替代工具只要合理，不因为“不是预设工具”就算错。

`redundant_tool_calls`
: 非负整数。在没有新状态、新证据或失败恢复需求时，重复获取等价信息的调用。例如 exact path 已知后反复 broad tree，或无变化时重复同一 search/read。

`total_tool_calls`
: 非负整数。按模型实际发起的 CodexGPT child action 计数。若 transport 使用 closed-world `codexgpt` wrapper，只计内部语义 action，不额外把 wrapper envelope 再算一次。

`context_fetch_calls`
: 非负整数，是 `total_tool_calls` 的子集。主要目的为获取 workspace/project/guidance/bootstrap context 的调用计入，例如本 benchmark 强制的首次 `open_workspace({TARGET_ROOT})`、workspace snapshot、tree、读取 package/AGENTS 或其他启动上下文。任务已经进入具体定位、修改、验证后的正常读取不算 bootstrap context。

`mutation_retries`
: 非负整数。同一预期修改因为错误工具、错误参数、冲突或无效结果而重新执行 mutation 的次数。第一次 mutation 不算 retry；有意分成多个独立 change 的操作也不算 retry。

`verification_completed`
: `true|false|null`。`benchmark.json` 中 `verification_required=true` 的 case 必须有明确验证证据才为 `true`；需要验证但未执行或只凭主观判断则为 `false`；纯 read-only case 记 `null`。

## 三个主 KPI

**Task Success Rate**

```text
task_success_rate = successful_cases / completed_cases
```

**Wrong Tool Call Rate**

```text
wrong_tool_call_rate = sum(wrong_tool_calls) / sum(total_tool_calls)
```

因此原始计分关系也可以直接写成 `wrong_tool_calls / total_tool_calls`。不要用“每个 case 的百分比再平均”，否则 tool-call 很少的 case 会被过度加权。

**Verification Completion Rate**

```text
verification_completion_rate =
  verification_required cases with verification_completed=true
  /
  all completed verification_required cases
```

辅助观察量为 mean `total_tool_calls`、mean `context_fetch_calls`、mean `mutation_retries`。它们不能单独作为优化目标：减少调用但让 task success 下降不是改进。

## Tool call 标注

`run-template.json` 中每个 case 的 `tool_calls` 初始为空。真实执行时每项至少记录：

```json
{
  "sequence": 1,
  "tool": "search",
  "intent": "targeted_search",
  "outcome": "success",
  "wrong": false,
  "redundant": false,
  "context_fetch": false
}
```

`wrong` 和 `redundant` 是独立维度；同一次调用可以两者都为 false，也可以在确有证据时同时为 true。评分依据是当时可见的上下文，不使用事后知道答案后的苛刻标准。

## Runtime 切换与隔离

`chatgpt-web-benchmark-runtime.mjs` 只负责 server-under-test 的可重复准备和精确启动参数，不代替真实 ChatGPT Web case。

初始 A1 使用历史 baseline/candidate refs；从 A2 开始使用 successor-adjusted A/B。STEP-495 新建两个 Devspace managed detached server worktree：

- baseline-successor: `C:\Users\Administrator\.devspace\worktrees\codexgpt-7ee3f966`，base HEAD `c43ec8ecae9782598ebc9cf90d8df8cdde1035c1`
- candidate-successor: `C:\Users\Administrator\.devspace\worktrees\codexgpt-bfd1b56c`，base HEAD `8a3d5dd3012c7c152fb7eea2fdb3fb91465ebc7e`

准备过程继续 fail closed。普通 checkout 仍要求 tracked-clean；successor-adjusted checkout 只能通过 `--overlay-manifest successor-overlay.json` 放行六个固定 `modified|untracked` path，并逐项验证 SHA-256，拒绝 staged change、额外/缺失 path、unsupported status 或 hash drift，build 后还会二次校验。两边六个 runtime 文件逐字节相同且与 STEP-493 已验证版本一致。随后才创建 `node_modules` junction 指向 `D:\Dev\codexgpt\node_modules` 并重新 build；不会运行 `npm install` 或改 package lock。

启动继续使用原有 OAuth profile root `D:\Codex\chatgpt上下文插件` 和既有 `codexgpt.drliang.uk` Tunnel；不迁移凭据、不改 DNS、不改 OAuth client/grant。每次只传入一个 exact `--allow-root <fresh-case-worktree>`，不能为了方便把 Devspace worktree 父目录整体加入授权。baseline/candidate 不能同时占用同一 profile/listener/Tunnel。

benchmark runtime 使用独立 runner state root `.ai-bridge/benchmark-runs`，避免历史普通 run evidence 的 identity 扫描影响启动和 stop。停止时只能用当前 benchmark run 的 exact run id；不得按 PID 猜测终止。

截至 2026-08-16，首次 baseline A1 runtime `2026-08-16T08-37-29-315Z-phase0-benchmark-baseline-a1-b6e71e21` 只用于发现 default-root confounder，并在真实 A1 前停止。修正 bootstrap contract 后，第二次 exact baseline run `2026-08-16T09-01-14-741Z-phase0-benchmark-baseline-a1-51562360` 再次只授权 A1 target `C:\Users\Administrator\.devspace\worktrees\codexgpt-d6e52e6e`，本地 admin health=200、公网 OAuth/MCP health=200、8789/8790 仅 loopback。真实 A1 随后暴露跨调用 workspace handle 失效，并已通过 exact run ID 停止；OAuth runtime 当前为 stopped。

## A/B 执行协议

1. 为 server-under-test 使用独立 checkout/worktree，并确认 exact SHA。
2. baseline 和 candidate 使用相同 Node major、配置、tool contract version、认证模式和 ChatGPT App 设置；A2 onward 还必须应用同一个 exact `successor-overlay.json`，差异只允许来自两个固定 server base refs。
3. 每个 case 创建 fresh disposable target worktree，固定为 `target_workspace.ref`。
4. 如果 case 有 `setup`，只在 target worktree 施加该 seed，并先确认 seed 达到描述的前置状态。
5. 每个 case 使用新的 ChatGPT 对话，避免前一任务的上下文影响下一任务。
6. 用固定 `runtime_bootstrap.instruction_template` 生成唯一用户消息：只替换 `{TARGET_ROOT}` 和 `{CASE_PROMPT}`，其中 case `prompt` 内容保持原样，不再追加其他工具选择提示。
7. 确认 trace 中首次 workspace bootstrap 打开的是 exact target root，并记录 `target_workspace_root`、`workspace_bootstrap_completed`；随后项目调用必须显式使用返回的 `workspace_id`。
8. 保存完整 assistant/tool trace，按 success criteria 和七个指标评分；bootstrap 的 `open_workspace` 同时计入 `total_tool_calls` 与 `context_fetch_calls`。
9. mutation/process case 完成后确认没有残留进程或未预期 target 状态；销毁 disposable target worktree。
10. 完成 18 个 case 后计算 KPI，并把原始 run JSON 与聚合结果一起保存。

首个 Phase 0 baseline 可以每个 case 跑一次，用于建立工程基准；它只能说明这一轮真实用户旅程的结果，不应被描述为统计显著性结论。若后续差异很小或结果不稳定，应对相关 category 做重复运行后再归因。

## 当前证据边界

截至 2026-08-17：

- benchmark contract、baseline/candidate/target SHA 与隔离 server worktree 均已固定；
- 真实 baseline A1 已执行并保存为 `runs/2026-08-16-baseline-a1.json`；正式分数为 `task_success=false`, `wrong_tool_calls=0`, `redundant_tool_calls=1`, `total_tool_calls=3`, `context_fetch_calls=1`, `mutation_retries=0`, `verification_completed=null`；
- failure domain 是 `workspace_handle_persistence_transport_session_binding`：`open_workspace` 成功后，同一 opaque handle 在下一次 ChatGPT Web tool call 中已经无法解析；没有回退默认 workspace；
- Phase 2B 设计明确要求 handle 仅在 issuing MCP server/transport lifecycle 内有效，而 OAuth runtime 每个 MCP transport 创建独立 server；真实 ChatGPT Web 行为证明连续 tool call 至少本轮可能发生 transport rotation；
- baseline 与 candidate 在 `src/guard.ts`, `src/http/oauthMcpRuntime.ts`, `src/server.ts`, `src/productionRuntime.ts` 上没有 source diff，因此该失败不能归因于 P1 execution-pipeline slice，也没有价值立刻重复 candidate A1；
- exact baseline run 已停止；STEP-493 已在当前 working tree 实现 OAuth cross-transport configured-root capability successor，并完成本地强制双 transport 回归；
- STEP-494 当前 ChatGPT connector continuity probe 保存为 `runs/2026-08-16-successor-a1-connector-regression.json`：真实 App connector `open_workspace(target) -> W -> read(package.json, W)` 成功，返回 root 为 exact target，且返回 SHA-256 与 target `package.json` 完全一致、与 profile/default root 不同，因此直接证明没有 default fallback；connector API 不暴露 underlying MCP transport/session id，所以该证据不声称观察到了 transport rotation；
- fresh ChatGPT Web A1 正式重放已保存为 `runs/2026-08-16-successor-a1.json`：同一 `ws_b7ea7abb9d1b518608670427840f00b3` 被显式复用于 `package.json`、`src/stdio.ts`、`src/http.ts` 三次必要读取，未出现 `WORKSPACE_NOT_FOUND`，A1 全部 success criteria 满足；正式分数为 `task_success=true`, `wrong_tool_calls=0`, `redundant_tool_calls=0`, `total_tool_calls=4`, `context_fetch_calls=1`, `mutation_retries=0`, `verification_completed=null`；underlying transport/session id 仍不由 connector surface 暴露，因此不推断具体 transport ID。
- successor runtime exact run `2026-08-16T15-08-53-956Z-step494-successor-a1-5e67c1fa` 已通过 exact run ID 停止；STEP-490 real-client workspace continuity regression gate 现已通过。
- STEP-495 已固定 successor-adjusted A/B：两边 exact overlay/package identity/build 均 PASS。A2 baseline-successor 与 candidate-successor 都从各自 fresh Web answer 判定 `task_success=true`, `context_fetch_calls=1`, `mutation_retries=0`, `verification_completed=null`；两边都未提供完整 UI/tool trace，因此 `wrong_tool_calls`, `redundant_tool_calls`, `total_tool_calls` 都保持 `null`。正式 evidence 分别为 `runs/2026-08-16-a2-baseline-successor.json` 与 `runs/2026-08-16-a2-candidate-successor.json`，配对结论在 `runs/2026-08-16-a2-pair-comparison.json`。baseline/candidate exact runtimes 均已按 run ID 停止。

当前 benchmark **I2 pair 与 Phase 0 aggregate 均已闭合；18 个 case 完成，Phase 0 已停止**。两侧都用单次原子 patch 同时修改 README/FAQ、审阅仅两文件 `+4/-0`，但 frozen App 不返回 usable change-set ID 且不暴露 undo seam，因此都用禁止的原子逆补丁恢复：`task_success=false`、`verification_completed=true`、context fetch=2，partial activity 下 wrong/redundant/total/retries 保持 `null`。两个 fresh target 最终 detached、clean、exact ref，README/FAQ blobs 都等于 HEAD；正式证据为 `runs/2026-08-17-i2-baseline-successor.json`、`runs/2026-08-17-i2-candidate-successor.json` 与 `runs/2026-08-17-i2-pair-comparison.json`。两 runtimes exact-stop 且 8789/8790 无 listener。后续仅等待单独决策；不进入实现阶段。

## Phase 0 aggregate（final reviewed）

A1 是 STEP-493 successor working tree 上的共同 continuity gate，不是 matched P1 A/B；公平的 variant 分母因此是 A2–I2 共 17 对。该 matched cohort 中 baseline task success 为 `11/17 = 64.71%`，candidate 为 `12/17 = 70.59%`，唯一差异是 G2 candidate pass / baseline fail。两边 12 个 verification-required cases 都完成明确验证，Verification Completion Rate 均为 `12/12 = 100%`；mean context fetch 都是 `21/17 = 1.2353`。

Wrong Tool Call Rate 与 mean total tool calls 不报告 campaign 数值：baseline 完整 trace 为 `0/17`，candidate 仅 `2/17`（B2/F1，共观察 `0/8` wrong/tool calls），不能形成 matched comparison。多数 case 的 exact mutation retries 也缺失，因此 mean mutation retries 保持 `null`。结论边界是 `insufficient_comparable_trace_evidence`：单轮 task success 出现 candidate `+1/17`，但不构成统计性或普遍因果证明，也没有证明 P1 tool-efficiency 改善。正式 aggregate 为 `runs/2026-08-17-phase0-aggregate.json`；三路 final review 与 closure gate 已通过，Phase 0 到此停止。
