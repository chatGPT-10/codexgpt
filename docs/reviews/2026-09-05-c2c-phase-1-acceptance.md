# C2C Phase 1 验收

日期：2026-09-05。状态：本地 Gate 1 完成，尚未提交或发布。

## 交付

新增 `src/c2c/types.ts`、`protocol.ts`、`messages.ts`、`stateMachine.ts`。实现 v1 七种控制消息的严格 schema、解析／格式化，以及十种本地状态的纯函数 reducer。PLAN 的任务和轮次必须匹配；执行回执必须关联同一计划哈希；重复计划、重放、未来轮次、重复发送、错配执行回执和未列出的状态迁移均拒绝。

新增两个测试文件，并纳入 Windows `fast` 测试清单。精确语法、默认上限、事件含义、停止／恢复边界见 [设计](../superpowers/specs/2026-09-05-c2c-phase-1-protocol-design.md)，复现命令见 [实施记录](../superpowers/plans/2026-09-05-c2c-phase-1-protocol.md)。

## 验证

| 检查 | 结果 |
| --- | --- |
| TDD RED | 实现前两个新增测试文件因模块缺失失败，退出 1 |
| C2C focused | 150/150 PASS，零失败、零跳过 |
| Managed Node 20.20.2 / 24.15.0 focused + adjacent | 各 168/168 PASS；包括新增协议／状态机及 mutation inventory、tool-definition registry、test-execution profiles |
| Managed Node 20 / 24 TypeScript build | 两版本均退出 0 |
| Managed Node 20 / 24 existing MCP smoke | `smoke-platform-compat.mjs` 均 PASS；detached runner 最终退出 0，临时状态已清理 |
| Repository policy、diff、凭据模式、文件范围 | PASS；最终核对在文档／索引／档案更新后执行 |

100 个状态／事件组合逐一验证目标状态或拒绝；十种本地状态另行拒绝传入的 INIT、EXECUTED、HANDOFF。协议测试覆盖七种消息 roundtrip、LF/CRLF、每个必需字段的缺失与重复、未知字段、错误 task ID／协议／轮次、16 KiB UTF-8 边界、多块、引用与代码围栏、控制字符、非法 hash/path，以及固定不回显错误。

Smoke 回执：`.ai-bridge/runs/2026-09-05T17-13-22-149Z-task-91a4da0d/result.json`，2026-09-05T17:13:22Z 至 17:15:35Z，`exitCode=0`、`temporaryState.cleaned=true`；stdout 98 bytes，无截断，stderr 为空。实际启动命令用了未生效的 `--label c2c-phase1-smoke`，所以 run kind 为默认 `task`；子命令与双版本验证不受影响。复现文档改为支持的 `--kind`，没有为改名重跑。

实现首轮有 130/132 PASS，两个失败来自测试分别 `tsImport` 导入导致异常类 prototype 不同。测试改为校验稳定异常名称；产品校验未放宽。之后增加字段遍历、内联引用和剩余 wire 方向的拒绝测试，总数为 150，全部通过。

## 边界和下一步

现有 MCP 注册、直接工具数、OAuth、配置、依赖和运行中部署均未改变。原有九个其他 dirty 文件的 SHA-256 保持不变；原有 `Memory.md` 和维护档案仅追加本阶段记录。Phase 0 报告保留。未 staging、commit、push、发布或部署。

本阶段没有接入 Browser、CLI、Session/CAS、真实计划文件哈希读取或执行器。HANDOFF 只实现 wire 格式，恢复转换尚未实现。parser 不能证明文字来自哪个 DOM 消息；future adapter 必须选择正确 conversation 的 assistant 消息并组合现有 secret protections。执行和发送事件只验证调用方提交的事实，不能替代实际执行／发送证据。

完整 ordinary/control、其余 smoke 套件、真实 Web 闭环以及新的 Ubuntu/Windows exact-head CI 本次未运行；Phase 0 历史验收不冒充本阶段的新证据。新增模块没有现有生产调用方，定向双版本测试与现有 MCP smoke 是本次相称的本地验证。下一阶段为独立 Session/Checkpoint 与 PLAN 文件完整性检查，需进入对应范围后实施。

回滚只撤回四个新增模块、两个测试、测试清单中的两个条目和本阶段文档／索引记录；保留既有差异。无需改变任何用户配置、凭据或服务。
