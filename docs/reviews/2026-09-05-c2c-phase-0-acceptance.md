# C2C Phase 0 基线与浏览器可行性验收

日期：2026-09-05。状态：C2C Phase 0 本地 Gate 0 完成。指定的基线验证与 Browser spike 全部通过；平台跳过、补充检查和发布边界见下文。

## 范围与依据

本阶段来自任务 `01a06b6c-0a61-7a32-8a40-54fb54546b64` 引用的架构方案（原对话 `6a9a74a0-c920-83eb-bf4b-b65891aecfd1`）。已重新读取两条任务记录。目标是冻结当前基线、执行现有验证、验证内置浏览器持续控制能力；不实现 C2C 协议、session、profile 或自动执行闭环。

## 基线

| 项目 | 实测值 |
| --- | --- |
| Source HEAD | `877aebedbd2cb71dea657ba33f9cd52aed1c2889` |
| 工作分支 | `codex/tool-execution-pipeline-slice1` |
| 包版本 | `codexgpt@1.0.5` |
| 默认 Node / npm | `v24.15.0` / `11.18.0` |
| 系统 | Windows 10 Enterprise LTSC `10.0.19044` |
| 保留的验证工具链 | `%LOCALAPPDATA%\CodexPro\toolchains`，Node `20.20.2` / `24.15.0` 均 verified/ready |
| 保存配置解析 | OAuth；connector `agent`；tools `full`；write `workspace`；Bash `full`；execution `off` |
| 配置解析的 direct contract | V1；不是运行中 App manifest 的实测结果 |
| OAuth issuer / resource | `https://codexgpt.drliang.uk` / `https://codexgpt.drliang.uk/mcp` |
| Tunnel / 本地端口 | `cloudflare-named` / `8789` |
| 根目录 | `D:\Dev\codexgpt` |

配置证据来自公开入口 `node scripts/codexgpt-entry.mjs config explain --root D:\Dev\codexgpt --json` 的白名单投影；它描述当前启动配置解析，不证明运行中服务已采用这些值。未启动、停止或重配部署。

恢复时已有 11 个修改文件：10 个规则/发布/迁移文档文件，以及 `scripts/codexgpt.mjs` 中既有的 `fs.realpathSync` → `fs.realpathSync.native` 单行变更。本次保留这些差异；验收对象是该工作区内容，而不是假称干净的发布源码。初始逐文件 SHA-256 存于 `.ai-bridge/c2c-phase0-2026-09-05/initial-files.json`。

## Gate 0

| 要求 | 状态 | 证据与限制 |
| --- | --- | --- |
| `npm ci` | PASS | 113 packages；退出 0 |
| `npm run build` | PASS | TypeScript 编译退出 0 |
| ordinary tests | PASS | 每个 Node 版本覆盖 269 文件、1,629 项：1,626 PASS、3 SKIP、0 FAIL；完整 runner 退出 0、日志未截断、owned temp 清理成功 |
| control tests | PASS | 独立隐藏 PowerShell；Node 20 / 24 各 113/113，均零失败、零跳过；总退出 0 |
| handoff smoke | PASS | Node 20 / 24 均通过 execute/watch/loop handoff；runner 退出 0，owned temp 清理成功、日志未截断 |
| IAB available | PASS | 用户启用 Browser 后，实际取得 `Codex In-app Browser`，browser ID `1` |
| ChatGPT tab 可复用 | PASS | 两个独立调用均取得 tab `1`；provider tab `945ef34a-09f1-4a3a-ba54-e5dd510dd76c` 不变 |
| DOM 稳定读写 | PASS | 在 `https://chatgpt.com/` 空输入框写入无敏感探针；下一调用重新取同 tab 后读回完全相同文字；清空并读取 DOM 确认恢复 |
| 无 cookies/session storage 访问 | PASS | 仅使用受支持的标签页、AX、DOM 和输入框接口 |
| policy / diff / 凭据检查 | PASS | `npm run policy:check` / `git diff --check`；新增行及验收文档的凭据模式扫描通过 |

ordinary 的三个跳过项逐一核实：`policy-profile-store.test.mjs` 的 symlink 用例和 `task-worktree-candidate-verification.test.mjs` 的 executable-mode 用例由源码明确在 Windows 跳过；`search-contract.test.mjs` 的 oversized ripgrep JSON 用例因独立终端 PATH 缺少 rg 而跳过。使用当前 Codex 提供的 `rg.exe`，随后在 Node 20 / 24 各补跑完整搜索契约，均 17/17 PASS、0 SKIP。没有改动测试或产品实现来消除跳过。

Browser 测试没有提交消息、消耗生成额度或修改账户。页面可见 workspace limit 提示，不妨碍本阶段 DOM spike；它不证明后续 PLAN/EXECUTED 生成闭环可用。探针已经清空。官方 [Browser 文档](https://learn.chatgpt.com/docs/browser) 仅作产品范围参考；通过结论来自本次工具调用中的同标签页证据。

续轮恢复也检查了生命周期限制：恢复后原绑定不存在、标签页列表为空，不能把 tab ID `1` 当成永久身份。重新建立受支持 IAB 连接后创建的 tab `1` 对应 provider `browser-use:43fc8c1e-83ea-47f1-a286-196579f47fb3`，再次跨调用成功读回探针并清空。已调用 `markHandoff()` 为后续轮次保留；这不是已证明跨应用重启永久保留。后续 Browser adapter 必须处理标签页清理、重新取得句柄、检查 provider/URL，按每轮要求续标保留，不能依赖失效的变量或复用的短 ID。页面初始加载时第一次输入未留在最终 DOM；在已稳定的输入框上再次 fill、跨调用读回验证才计通过。

## 可复现验证

ordinary 必须使用 `scripts/long-task-runner.mjs start`，其子命令为：

```powershell
node scripts/toolchain-manager.mjs matrix --major all --root "$env:LOCALAPPDATA\CodexPro\toolchains" -- node scripts/test-domains.mjs run --domain ordinary
```

handoff 使用同一个 detached runner，子命令为：

```powershell
node scripts/toolchain-manager.mjs matrix --major all --root "$env:LOCALAPPDATA\CodexPro\toolchains" -- node scripts/run-with-cleanup.mjs --purpose c2c-phase0-handoff -- node scripts/execute-handoff-smoke.mjs
```

control 只在经过 `IsProcessInJob(..., NULL, ...) == false` 预检的独立原生 PowerShell 中，为该进程临时设置 `CODEXGPT_ALLOW_CONTROL_DOMAIN_TESTS=1`，执行：

```powershell
node scripts/toolchain-manager.mjs matrix --major all --root "$env:LOCALAPPDATA\CodexPro\toolchains" -- node scripts/test-domains.mjs run --domain control
```

本次独立进程由 Windows 本地 `Win32_Process.Create` 启动；没有安装 service、计划任务或改变系统配置。普通 `Start-Process` 与 ShellExecute 预检仍在 Job 中，因此没有从这些进程执行 control。执行脚本与回执位于忽略目录 `.ai-bridge/c2c-phase0-2026-09-05/`。

已完成回执：handoff runner `2026-09-05T10-48-53-389Z-c2c-phase0-handoff-r3-43cfc634`；control `control-result.json`（2026-09-05T10:47:52Z 至 10:54:55Z）和完整 `control.stdout.log`，stderr 为空。独立 control 进程的创建时间和 `inAnyJob=false` 另存于 `control-live-isolation.json`，不以启动请求代替实测证据。

ordinary runner `2026-09-05T10-56-24-248Z-c2c-phase0-ordinary-r3-afa77d0c` 于 11:11:07Z 完成，退出 0。两个 Node 版本均使用完整 `fast=193 / safe=56 / isolated=20` 文件分片；完整 stdout 为 489,270 bytes，无截断，stderr 为空。原始回执、分版本统计和搜索补充日志分别位于上述证据目录的 `ordinary-result.json`、`ordinary-summary.json`、`search-focused.log`、`search-focused.exit`。补充命令为：

```powershell
node scripts/toolchain-manager.mjs matrix --major all --root "$env:LOCALAPPDATA\CodexPro\toolchains" -- node scripts/run-with-cleanup.mjs --purpose focused-test -- node --test test/search-contract.test.mjs
```

收尾前再次解析配置并比较：公开配置 fingerprint、HEAD、11 个初始修改文件的 SHA-256 均不变。随后仅对本报告、`Memory.md` 和维护档案写入 Phase 0 记录。对应比较回执为 `pre-closure-integrity.json`，最终检查为 `final-checks.json`。

## 失败尝试和边界

- 旧 session `25139` 已不可收集；现存 `execute-handoff-smoke.log/.exit` 日期是 2026-07-15，不能用作本次通过证据。
- 原 ordinary run `2026-09-05T06-08-27-394Z-c2c-phase0-ordinary-5019539e` 使用 `npm.cmd` 直接 spawn，终态 `127 / spawn EINVAL`；改用明确的 Node 入口。
- handoff 首轮 `2026-09-05T06-15-17-016Z-c2c-phase0-handoff-d3c481bc` 丢失 wrapper 要求的 `--`，退出 2；改为直接调用 `run-with-cleanup.mjs -- ...`。
- r2 handoff/ordinary 进程消失且无 result；后续 exact runner status 返回 stale，不计通过、不删除或伪造结果。独立启动 r3 重新验证。
- Browser 启用时插件缓存从 `26.831.11858` 更新到 `26.901.41600`；旧模块路径失败后按新文件路径恢复，未改用其他浏览器。
- `npm audit --omit=dev --json` 当前退出 1，报告 `fast-uri` high、其上游 `ajv` high 与 `qs` moderate，共 3 个 dependency entries；安装摘要与详细审计的统计口径不同。没有执行 `npm audit fix`。这更新了旧的零漏洞基线，但不单凭公告推断可利用性；依赖修复是独立变更。
- 没有修改生产源码、工具数、OAuth、Tunnel、DNS、权限 profile；没有 staging、commit、push、发布、部署或 Phase 1 实施。历史 release CI 不能代替此次工作区回归；本报告不宣称新的 exact-head CI 闭环。

## 交付与下一步

Phase 0 证明当前 Windows 环境具备受支持的 IAB 同标签页 DOM 控制能力，且现有工作区通过指定本地基线门。后续 C2C 协议与自动闭环仍未实现；进入 Phase 1、依赖修复或发布/部署需要对应范围的后续授权。回滚本次交付只需撤回本报告和 STEP-555 的项目索引/档案记录；保留原有 11 文件差异、历史验证记录和实际部署配置。
