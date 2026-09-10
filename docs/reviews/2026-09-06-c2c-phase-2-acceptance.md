# C2C Phase 2 验收

日期：2026-09-06。状态：本地 Gate 2 完成；实现、双版本验证与收尾检查通过，尚未提交或发布。

## 交付与原始要求

范围来自已重新读取的详细 C2C 方案 `6a9a74a0-c920-83eb-bf4b-b65891aecfd1` 的 Phase 2：Local Session / Checkpoint。设计见 [Session 契约](../superpowers/specs/2026-09-06-c2c-phase-2-session-design.md)，命令见 [实施记录](../superpowers/plans/2026-09-06-c2c-phase-2-session.md)。

| 要求 | 实现与直接证据 |
| --- | --- |
| 独立状态目录，复用 home/profile key | `CodexGPTHome()/c2c/sessions/<profileIdForRoot(nativeCanonicalRoot)>.json`；测试检查精确文件名、Windows 大小写别名、profile 原样保留 |
| Session schema 与持久 checkpoint | strict v1，revision、workspace root/identity、opaque workspace ID、conversation、Phase 1 task snapshot、original goal/progress/issues/next step、savedAt/endedAt；未知字段和旧／未知版本拒绝 |
| load → validate → transition → temp → fsync → rename | 复用 `AtomicJsonFileStore`，新增互斥及提交前锁／目录／临时文件身份和完整旧值复检；故障注入证明重命名前失败保留旧 JSON |
| revision CAS | 同一 revision 的两个实际子进程只有一个提交；旧 revision、外部改写和锁替换不能覆盖当前结果 |
| 每工作区一个活动 task | begin 对活动与停止待处理状态拒绝；resume 只读；新任务需旧任务 DONE 或 exact task ID 确认 end，并提供当前 revision |
| ChatGPT URL 约束 | strict HTTPS host/path；拒绝 credentials、port、query、fragment、dot segment 和错误 Project 绑定 |
| PLAN integrity | 同句柄读取原始字节，SHA256 与 bytes 都匹配；BOM/CRLF 不归一化后再 hash；失败不写 EXECUTING |
| restart after each checkpoint | 新 Node 子进程重新加载 IDLE、INIT_SENT、PLAN_RECEIVED、EXECUTING、EXECUTED_LOCAL、EXECUTED_SENT、DONE、BLOCKED、ERROR、RECOVERY_REQUIRED，内容一致 |
| HANDOFF | `handoff.ts` 仅从有界 checkpoint 投影 Phase 1 消息并验证，不读取完整 transcript 或控制浏览器 |
| 禁止保存凭据与完整日志 | schema 无相应字段；逐字符串复用已有码值检测和私钥标记拒绝；测试验证 secret/任意 transcript/log/task 字段失败 |

`src/c2c/sessionStore.ts`、`planSnapshot.ts`、`handoff.ts` 为主要模块；`sessionSchema.ts`、`storagePaths.ts` 分离校验与文件边界。Phase 1 仅导出已有 task validator 供复用，原状态迁移不变。新增两份测试与对应 Windows fast/safe 分类；五个新增 mutation call sites 逐一记录路径、调用 digest 和用途，未放宽扫描器。

## 当前验证

| 检查 | 结果 |
| --- | --- |
| TDD RED | 两个测试文件在实现不存在时因缺少模块失败，退出 1 |
| Phase 2 tests | 20 项通过，包含多个字段／阶段遍历及真实进程用例 |
| Node 20.20.2 / 24.15.0 定向与相邻回归 | 各 203/203 PASS；零失败、零跳过 |
| Managed dual-Node build | 两个 TypeScript build 均退出 0 |
| Compiled C2C smoke | 两个版本均明确输出 PASS：两轮 PLAN 校验、Session 更新／恢复、HANDOFF、DONE；最终 revision 11 |
| Existing MCP smoke | 两版本 PASS，runner 退出 0，临时状态已清理 |
| Policy / diff / 凭据／链接／文件范围检查 | PASS；最终检查在文档／项目索引更新后执行 |

定向测试 runner：`2026-09-06T06-45-17-327Z-c2c-phase2-tests-b21b8191`，2026-09-06T06:45:17Z 至 06:46:38Z，`exitCode=0`，`temporaryState.cleaned=true`。stdout 42,913 bytes 完整保留、无截断；stderr 为空。十份测试覆盖 C2C Phase 1/2、mutation inventory、Windows test inventory、tool registry、safe-text-reader（包括 Windows）与 strict JSON/native protocol。

编译产物 smoke 从忽略目录 `.ai-bridge/c2c-phase2-compiled-smoke.mjs` 导入实际 `dist/c2c/*.js`，通过如下命令运行；只创建 owned temp 中的虚拟 workspace/home，不修改真实 profile：

```powershell
node scripts/toolchain-manager.mjs matrix --major all --root "$env:LOCALAPPDATA\CodexPro\toolchains" -- node scripts/run-with-cleanup.mjs --purpose c2c-phase2-compiled -- node .ai-bridge/c2c-phase2-compiled-smoke.mjs
```

MCP smoke runner：`2026-09-06T06-48-15-348Z-c2c-phase2-smoke-e5c22594`，2026-09-06T06:48:15Z 至 06:50:31Z，`exitCode=0`、`temporaryState.cleaned=true`；完整 stdout 98 bytes，无截断，stderr 为空。所有 runner 原始回执在 `.ai-bridge/runs/<run-id>/`。

## 失败尝试与修正

- 第一版 schema 在 Zod refinement 后调用 `.min()`，模块加载失败；改为相应 refinement，未削弱长度／非空约束。
- TypeScript 检查发现 constructor 的 `return never` 路径影响字段赋值分析；改为直接抛错调用，构建通过。
- mutation inventory 首次按预期拒绝五个新写入点；审查 exact C2C 状态目录、锁归属与 atomic writer 后加入具体条目，扫描器不变。
- 多行 `node -e` smoke 包装调用只输出 Node 版本且无 smoke 回执，因此不计通过；改为明确的本地脚本文件后，两版本都取得了断言及成功输出。

## 边界、回滚与下一阶段

本地 checkpoint 恢复不等于自动执行恢复。进程在写入中途退出时，旧 JSON 可读，孤立 lock/temp 被保留，后续写入拒绝；没有按超时或 PID 猜测夺锁。目录 fsync 明确失败时报告 `COMMIT_UNCERTAIN`，不能把可能已经提交的新 revision 当成失败回滚。后续自动恢复属于 Phase 6。

`startExecution` 只返回已验证的 text snapshot 并记录状态；实际 executor 必须消费该 snapshot。它不启动 Codex、不执行命令，也不证明实际代码已经执行。MCP opaque handle 不因写入 Session 而获得跨 Runtime 重启权限。路径检查与锁不是 OS sandbox；同权限的恶意进程仍超出完整隔离保证。

未运行完整 ordinary/control、其余 smoke 套件、真实 ChatGPT Browser 闭环或新的 exact-head CI。没有改变现有 MCP contract、OAuth、依赖、Tunnel、DNS、服务或部署；没有 stage、commit、push 或发布。下一阶段是 C2C Safe Runtime Profile，不包含在本次 Phase 2 范围内。

回滚只撤回本阶段的模块、validator export、测试／清单条目与文档；保留 Phase 0/1 和原有 dirty 文件。已有用户 Session 必须保留，回滚代码不授权删除用户状态。
