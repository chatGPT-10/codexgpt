# CodexGPT Windows + ChatGPT 日常操作指南

> 适用对象：当前已连接的 `codexgpt-Windows-v2` ChatGPT App，以及本机项目 `D:\Dev\codexgpt`。  
> 最后核对：2026-09-01。本文不包含 token、授权 URL 或其他凭据。

## 先给结论

是的，**每次重启 Windows 后都要重新启动 CodexGPT**。浏览器控制方式下，Control Plane 是一个前台本地进程：电脑重启或关闭它的 PowerShell 窗口，会停止它所拥有的 MCP Runtime 和 Cloudflare Tunnel。

通常**不需要**每次重新创建 ChatGPT App、重新扫描工具或重新授权。正常启动会保留 OAuth 的 issuer、稳定 hostname、Tunnel、已批准客户端和 refresh-token family。只有授权被撤销、服务绑定发生安全重置、App 被重建，或 ChatGPT 明确再次要求连接时，才需要重新授权。

## 每次开机后的标准流程

### 1. 打开本地控制页，再由浏览器启动 Runtime

打开一个专门留给 CodexGPT 的 PowerShell 窗口，运行控制页：

```powershell
Set-Location D:\Dev\codexgpt
node .\scripts\codexgpt-entry.mjs control --root D:\Dev\codexgpt
```

该窗口会打印一次性本地打开地址。只在本机浏览器中打开它，且不要复制、分享或截图其中的完整地址；其中的短期 bootstrap 值等同于本地控制页面的登录凭据。控制页默认监听 `127.0.0.1:8791`，不经过 Cloudflare Tunnel。

页面显示 “Authenticated local owner session.” 后，可先在 **Workspace access** 中管理目录和下次启动的工具权限，再点击 **Start Runtime**。按钮会启动该工作区的 Runtime，最多等待 15 秒本机 `/healthz`；只有收到 HTTP 200 才显示 `owned_running`。超时或启动失败会保留 `owned_starting`/错误信息，不会假装服务可用。保持控制页的 PowerShell 窗口打开；关闭它会尝试停止它所拥有的 Runtime。它不是 Windows 服务，也没有配置为随开机自动启动；不要为了省一步而未经评审安装任务计划或系统服务。

点击 **Stop Runtime** 会终止本控制宿主亲自启动、且 PID 创建时间仍完全匹配的 Runtime 进程树；不匹配、过期或外部启动的进程会被拒绝，绝不会作为 Stop 目标。**Restart Runtime** 是同一个受控事务：先确认停止完成，再启动新子进程并再次等待本机健康检查。动作进行时，其他生命周期按钮会被锁定。不要用任务管理器猜测并结束未知 Node、cloudflared 或 PowerShell 进程。

### 控制页中的工作空间与权限

- **添加工作空间**：输入一个精确本地项目目录，先点 **Review path**，再把页面显示的规范路径完整输入确认框并点 **Add allowed root**。目录必须存在、是本地目录，且不能是盘符根目录、UNC/网络路径、设备路径或含有歧义尾随字符的路径。
- **移除工作空间**：仅可移除额外允许目录；OAuth 默认根 `D:\Dev\codexgpt` 不会被网页改写。变更会在下一次 Start/Restart 生效，不会中途扩大正在运行 Runtime 的可访问范围。
- **切换项目**：Runtime 重启后，ChatGPT 仍以 OAuth 默认根启动；对于额外允许的项目，在对话中让它调用 `open_workspace` 并使用返回的 `workspace_id`。这是刻意的边界：网页不能把同一个 OAuth App 的默认根悄悄换成另一个项目。
- **工具权限**：Read-only = 最小工具面、禁写入、禁 shell；Edit workspace = 标准工具面和工作区写入、禁 shell；Run safe commands = 完整工具面、工作区写入和 Safe Bash。三个预设都不会启用 `full_access`；它不是沙箱，也不能被普通网页下拉框静默开启。

### 2. 确认本地服务与授权状态

另开一个 PowerShell 窗口运行：

```powershell
node D:\Dev\codexgpt\scripts\codexgpt-entry.mjs auth status --root D:\Dev\codexgpt --json
```

预期重点：`runtime.running` 为 `true`，并显示配置的 hostname。不要复制或分享完整命令输出，因为诊断信息可能包含不应公开的运行细节。

可选地检查公网健康端点：

```powershell
Invoke-WebRequest https://codexgpt.drliang.uk/healthz -UseBasicParsing
```

返回 HTTP 200 只说明公开入口和服务可达；它不代表 ChatGPT 已获授权，也不代表工具调用一定成功。

### 3. 在 ChatGPT 中做一次只读冒烟测试

在 ChatGPT 选择 **`codexgpt-Windows-v2`**，新开一个对话并发送：

```text
必须使用 codexgpt-Windows-v2 工具：先调用 open_current_workspace，再调用 git_status；只返回工具结果，不要修改文件或运行命令。
```

成功时，应看到工具返回当前根目录 `D:\Dev\codexgpt` 的 Git 状态。这个测试只验证连接与只读工作区；它不验证写入、命令执行或长进程。

## 如何停止服务

回到启动服务的 PowerShell 窗口，按 `q` 或 `Ctrl+C`。停止后，ChatGPT 中的 App 不能访问本机项目，直到再次执行启动命令。

不要通过任务管理器结束不确定的 Node、cloudflared 或 PowerShell 进程；先确认它确实是你刚启动的 CodexGPT 窗口。误杀未知进程会中断其他本地开发工具。

## 工作空间：两种“切换”完全不同

工作空间是安全边界，不是普通的“当前目录”。`workspace_id` 是与 OAuth client、grant、运行实例和 Policy 绑定的随机能力句柄；它失效时不会静默落回其他目录。

### 情形 A：在同一已授权服务中临时打开另一个目录

这是日常最常用的切换方式。前提是目标目录在本次服务启动时的 allowed roots 内。默认根是 `D:\Dev\codexgpt`；若要临时额外允许一个精确目录，启动时显式列出它。

先在当前 CodexGPT 前台窗口按 `q` 或 `Ctrl+C` 停止现有实例，再用下面的命令重启；不要在已有实例旁启动第二个服务来争抢同一组本地端口与 Tunnel：

```powershell
node D:\Dev\codexgpt\scripts\codexgpt-entry.mjs start `
  --root D:\Dev\codexgpt `
  --allow-root D:\Dev\another-project
```

`--allow-root` 会扩大这一次运行可访问的目录范围，所以只写入你明确希望 ChatGPT 接触的**精确项目目录**，不要写 `D:\Dev`、用户主目录或磁盘根目录。

随后在 ChatGPT 中使用下面的模板，把路径替换成已允许的目标目录：

```text
请先调用 open_workspace 打开 D:\Dev\another-project。
后续本任务所有 CodexGPT 项目工具调用都必须显式使用返回的 workspace_id；
不要省略 workspace_id 回退到默认根。先只读取，不要修改文件或运行命令。
```

`open_workspace` 成功后，后续调用必须带上返回的 `workspace_id`。它只是让当前任务显式指向另一个已允许目录，**不会改变默认根**，也不会把该目录永久写入配置。

### 情形 B：把另一个项目变成 OAuth 服务的默认根

这不是普通的目录切换。当前稳定 hostname 的 OAuth 部署绑定到 `D:\Dev\codexgpt`；把它直接改到一个无关项目可能触发跨根冲突或安全重置，并会使既有 App/grant 失效。

推荐策略是：

1. 偶尔访问第二个项目：使用“情形 A”的精确 `--allow-root` + `open_workspace`。
2. 长期管理第二个独立项目：为它规划独立的保存配置、OAuth App，最好也使用独立 hostname/Tunnel；这是一次新的安全与外部配置决策，不是日常启动命令。
3. 不要用删除 profile、复制认证文件、强行复用 `codexgpt.drliang.uk` 的方式绕过冲突。需要变更时，先保存 `auth status` 的无敏感结论并单独评审。

### 重启后的 workspace_id 为什么失效？

服务重启会创建新的 runtime incarnation，旧 `workspace_id` 会按设计失效。重新启动后，让 ChatGPT 再调用一次 `open_current_workspace`；若正在使用非默认目录，再执行一次 `open_workspace` 并使用新返回的句柄。空闲 workspace 也可能在约 30 分钟后过期，成功调用会刷新空闲期限。

## 重新授权：只在确实需要时做

若 ChatGPT 打开授权页面或明确报告没有批准的授权请求，保持网页不关闭，在本机运行：

```powershell
node D:\Dev\codexgpt\scripts\codexgpt-entry.mjs auth pending --root D:\Dev\codexgpt
node D:\Dev\codexgpt\scripts\codexgpt-entry.mjs auth approve <correlation-code> --root D:\Dev\codexgpt
```

把第一条命令显示的 correlation code 原样填入第二条命令。完成后回到 ChatGPT 页面继续授权，再用 `auth status` 确认 client/grant 为有效状态。

不要把 OAuth URL、代码、浏览器截图中的敏感字段发到聊天、issue、Git 提交或公开文档中。

## 常见问题与处理顺序

| 现象 | 最可能原因 | 先做什么 | 不要做什么 |
| --- | --- | --- | --- |
| 重启电脑后 ChatGPT 无法连接 | 本地前台服务和 Tunnel 已停止 | 重新执行“每次开机后的标准流程”第 1 步 | 不要立刻重建 App |
| `runtime.running` 为 `false` 或没有 runtime | 服务未启动或启动窗口已退出 | 用 `start --root D:\Dev\codexgpt` 启动，保持窗口打开 | 不要结束未知进程来“腾端口” |
| PowerShell 找不到 `codexgpt` | 未全局安装或 PATH 未刷新 | 使用文中的 `node .\scripts\codexgpt-entry.mjs ...` 形式 | 不要下载来源不明的同名可执行文件 |
| ChatGPT 显示需要授权 | grant 被撤销、App 重连或安全重置后旧授权失效 | `auth pending`，再 `auth approve <correlation-code>` | 不要手动配置 static Bearer 或 query-token URL |
| ChatGPT 工具列表为空或明显过旧 | App 缓存了旧 descriptor | 确认服务已按精确 root 重启后，在 App 页面执行一次 **Scan Tools** | 不要反复扫描；仅 scope 改变不需要扫描 |
| App 报泛化的连接/Internal error | 服务未运行、授权状态失效，或 App 指向旧部署 | 检查 `auth status`、`doctor --json`、`/healthz`，确认选择的是 v2 | 不要删除 profile、Tunnel 或旧 App 作为试错 |
| `open_workspace` 报路径/权限错误 | 目标目录不在 allowed roots，或路径本身不安全 | 只在重启时添加精确 `--allow-root`，然后重新 open | 不要加入磁盘根、UNC、junction 逃逸路径 |
| `workspace_id` unavailable/not found | 服务重启、空闲过期、grant/revision 变化，或复制了他人句柄 | 再调用 `open_current_workspace` / `open_workspace` 取得新句柄 | 不要省略句柄并假定会回到正确项目 |
| 工具显示的是错误项目 | 服务默认根或当前句柄不对 | 先只读 `open_current_workspace`/`git_status` 核实根目录 | 不要在未核实根目录前允许写入 |
| 想让 ChatGPT 跑 watcher、dev server 或 REPL | 这属于持久进程 | 先确认你信任代码，再使用 full tool mode 的 `start_process`，并持续读取输出、结束自己启动的进程 | 不要把 `run_command` 当作常驻服务，也不要把 full_access 当沙箱 |

辅助诊断命令：

```powershell
node D:\Dev\codexgpt\scripts\codexgpt-entry.mjs doctor --json
node D:\Dev\codexgpt\scripts\codexgpt-entry.mjs config explain --root D:\Dev\codexgpt
node D:\Dev\codexgpt\scripts\codexgpt-entry.mjs connection-test --root D:\Dev\codexgpt
```

`connection-test` 是只读连接诊断；它不能替代实际 ChatGPT 工具 trace。诊断时优先记录错误代码、时间、所用根目录和是否刚重启/重连；不要粘贴凭据、完整配置或授权 URL。

## 写入和执行前的安全检查

当前 App 具有 read/write/execute scope，但 scope 不等于自动许可。每次要写文件、运行命令或启动进程前，先在同一对话中明确四件事：

1. 目标 workspace 的绝对路径和 `workspace_id`；
2. 预期修改或命令；
3. 验证命令与预期结果；
4. 是否允许影响工作树、网络或持久进程。

尤其是 `start_process`：它以当前 Windows 用户权限运行，能接触当前用户可接触的文件、凭据、注册表和网络；它不是 sandbox。结束任务后应读取最终输出并终止自己启动的进程。

## 一页命令清单

```powershell
# 启动独立本地控制页（开机后必做；在页面点 Start Runtime）
Set-Location D:\Dev\codexgpt
node .\scripts\codexgpt-entry.mjs control --root D:\Dev\codexgpt

# 查看运行与 OAuth 状态（另开终端）
node D:\Dev\codexgpt\scripts\codexgpt-entry.mjs auth status --root D:\Dev\codexgpt --json

# 备用：直接在 PowerShell 启动 Runtime
node D:\Dev\codexgpt\scripts\codexgpt-entry.mjs start --root D:\Dev\codexgpt

# 查看待本机批准的浏览器授权，并批准它
node D:\Dev\codexgpt\scripts\codexgpt-entry.mjs auth pending --root D:\Dev\codexgpt
node D:\Dev\codexgpt\scripts\codexgpt-entry.mjs auth approve <correlation-code> --root D:\Dev\codexgpt

# 只读诊断
node D:\Dev\codexgpt\scripts\codexgpt-entry.mjs doctor --json
node D:\Dev\codexgpt\scripts\codexgpt-entry.mjs connection-test --root D:\Dev\codexgpt

# 一次运行临时加入一个精确的第二项目根
node D:\Dev\codexgpt\scripts\codexgpt-entry.mjs start --root D:\Dev\codexgpt --allow-root D:\Dev\another-project
```

## 当前实例的边界与已验证事实

- 当前已验证的 App 是 **`codexgpt-Windows-v2`**；不要把旧的 `codexgpt-Windows-233` draft 当作当前连接。
- 已真实验证的是 `open_current_workspace` 后的 `git_status` 只读调用，目标为 `D:\Dev\codexgpt`。
- 这不等于已经验证 ChatGPT Web 写入、长任务或工具效率；它们应在明确任务与最小权限下分别测试。
- 自动开机启动、服务安装、修改 DNS/Tunnel、重新绑定 hostname、删除/重命名旧 App，都是单独的外部状态或安全边界变更，不能由日常排障顺手执行。
