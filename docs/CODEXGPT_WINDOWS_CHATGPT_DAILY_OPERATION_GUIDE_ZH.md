# CodexGPT Windows + ChatGPT 日常操作指南

> 适用对象：当前已连接的 `codexgpt-Windows-v2` ChatGPT App，以及本机项目 `D:\Dev\codexgpt`。  
> 最后核对：2026-09-02。本文不包含 token、授权 URL 或其他凭据。

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

### 4. 需要 ChatGPT 规划、Codex 实施并让 ChatGPT 复核时，改用 C2C

不要同时保留普通 Runtime 和 C2C Runtime 争用同一端口与 Tunnel。先从控制页停止普通 Runtime，再在专用 PowerShell 窗口中运行：

```powershell
codexgpt c2c start --root D:\Dev\codexgpt
```

若正在验证源码 checkout 而没有安装该版本，可使用等价的开发入口：

```powershell
node D:\Dev\codexgpt\scripts\codexgpt-entry.mjs c2c start --root D:\Dev\codexgpt
```

在 ChatGPT 中使用专用对话，选择 `codexgpt-Windows-v2`，并把发布包根目录中的 `C2C_CHATGPT_PROMPT.md` 作为该对话或 Project 的 C2C 指令。全局 npm 安装时，发布包根目录为 `$(npm root -g)\codexgpt`。让当前 Codex 加载其中的 `skill/SKILL.md`，给出本轮明确的实现目标和权限范围。Codex 会管理严格 JSON session 接口和浏览器消息；用户不应手工复制 INIT、PLAN、EXECUTED、diff 或执行报告来替代真实交换。

Phase 5 只支持一轮 `INIT -> PLAN -> 本地实施 -> EXECUTED -> DONE|BLOCKED|ERROR`。如果进入 `BLOCKED`、`ERROR`、`RECOVERY_REQUIRED`，或在执行/发送状态不确定时中断，先保留会话并核对证据；不得自动重发或重跑。自动恢复与额外迭代仍未实现。

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

### 情形 B：把另一个项目变成 OAuth 服务的默认根（完整迁移教程）

这一节解决的不是“让 ChatGPT 偶尔访问另一个目录”，而是下面这个需求：**以后每次在 ChatGPT 新开对话时，不调用 <code>open_workspace</code> 也要默认进入新项目。**例如，原来的默认项目是 <code>D:\Dev\codexgpt</code>，现在希望所有日常对话默认进入 <code>D:\Dev\my-other-project</code>。

先理解一个关键事实：OAuth 默认根与当前 hostname、Tunnel、ChatGPT App 授权绑定在一起。网页 Control Plane 故意**不能**把默认根改成任意目录；否则一次误点击就可能让已有 App 获得另一个项目的默认访问入口。正确操作叫做 <strong>rebind（重新绑定）</strong>，它会保留同一个 hostname 和专用 Tunnel，但为了防止旧授权跨项目继续有效，会创建新的安全实例并撤销所有旧 client、grant、access token 与 refresh token。完成后，ChatGPT 必须重新连接和重新授权。

> 只想在一个对话中临时处理第二项目？回到“情形 A”，不要做本节迁移。
>
> 确定要长期把新项目作为默认项目，并且接受 ChatGPT 需要重新授权？按以下步骤操作。

#### 开始前：准备一张“迁移卡片”

请先在纸上或本地笔记中写下三个值。它们不是 secret，可以显示路径和 hostname；但不要记录 token、授权 URL 或相关截图。

| 名称 | 示例 | 这是什么 |
| --- | --- | --- |
| 旧默认根 | <code>D:\Dev\codexgpt</code> | ChatGPT 当前默认打开的项目 |
| 新默认根 | <code>D:\Dev\my-other-project</code> | 以后要默认打开的真实项目根目录 |
| 现有 OAuth hostname | <code>codexgpt.drliang.uk</code> | 现有 ChatGPT App 已连接的稳定地址 |

这里的“项目根目录”是含有该项目文件的**精确目录**，不是 <code>D:\Dev</code>、用户主目录或磁盘根目录。新目录必须已存在；不要先对新目录运行 <code>auth setup</code>、不要复制旧项目的 OAuth 配置文件，也不要用同一个 hostname 同时启动两套 OAuth 服务。

#### 第 1 步：确认这确实是你要的操作

下面三项同时成立才继续：

1. 你要的是“以后默认进入新项目”，而不是偶尔打开它；
2. 你接受 ChatGPT App 现有授权会被撤销，并愿意在最后重新授权；
3. 新项目当前没有自己独立的 OAuth 配置、OAuth Runtime 或已运行的 Control Plane Runtime。

如果新项目已经有独立 hostname、Tunnel 或 OAuth App，停止。不要把两套部署合并到同一 hostname；为它保留独立部署通常更安全。

#### 第 2 步：停止旧、新项目的 CodexGPT Runtime

关闭两个项目中所有正在运行的 CodexGPT 控制页/Runtime。最简单的做法是回到各自启动控制页的 PowerShell 窗口，按 <kbd>q</kbd> 或 <kbd>Ctrl</kbd> + <kbd>C</kbd>，然后确认窗口已退出。若你是从 Control Plane 启动 Runtime，也可以先在网页中点击 <strong>Stop Runtime</strong>，再关闭控制页窗口。

原因很简单：rebind 是离线安全重置。旧默认根或新默认根仍有 OAuth Runtime 在运行时，命令会拒绝继续；不要用任务管理器结束不确定的 Node 或 cloudflared 进程来绕过这个检查。

#### 第 3 步：读取旧配置，只核对，不修改

打开一个新的 PowerShell 窗口，执行下面命令。把示例旧根替换为你的“旧默认根”：

~~~powershell
Set-Location D:\Dev\codexgpt
node .\scripts\codexgpt-entry.mjs auth status --root D:\Dev\codexgpt --json
~~~

确认输出中没有正在运行的 OAuth Runtime，并记下显示的 hostname。它必须和你“迁移卡片”中的 hostname 完全一致。不要把完整 JSON 输出发到聊天、issue 或截图；只核对“未运行”和 hostname 这两个结论即可。

#### 第 4 步：执行一次 rebind

这一步会实际改变本机 OAuth 状态并撤销现有 App 授权，所以先再次核对路径。下面是完整模板；只替换三处路径/hostname，保持 <code>--revoke-all</code> 不变：

~~~powershell
node D:\Dev\codexgpt\scripts\codexgpt-entry.mjs auth rebind --from-root D:\Dev\codexgpt --root D:\Dev\my-other-project --hostname codexgpt.drliang.uk --revoke-all
~~~

参数含义如下：

- <code>--from-root</code>：旧默认根；
- <code>--root</code>：新默认根；
- <code>--hostname</code>：旧配置正在使用的同一个 hostname，不能趁这一步改成新域名；
- <code>--revoke-all</code>：明确确认“撤销所有旧授权”。它不能省略，也不应绕过。

成功时会提示 hostname 已重新绑定到新目录，并提示旧 grants/tokens 已撤销；Cloudflare 路由不会被重写。若报错，按错误处理，不要反复尝试：

| 错误/现象 | 含义 | 正确处理 |
| --- | --- | --- |
| <code>OAUTH_STATE_BUSY</code> | 某个 OAuth Runtime 仍在运行 | 回到第 2 步，停止对应项目的 Runtime 后再试 |
| <code>OAUTH_STATE_CONFLICT</code> | 新目录已有 OAuth 配置，或 hostname 与旧配置不一致 | 不要删除配置；保留两套独立部署，或先单独评审迁移方案 |
| <code>AUTH_TUNNEL_OWNERSHIP_UNPROVEN</code> | 现有 Tunnel 不是可证明由 CodexGPT 独占的配置 | 不要强占 Tunnel；先单独诊断 Tunnel 所有权 |
| 目录不存在或路径不安全 | 输入的根目录不是可接受的本地项目目录 | 修正为真实、精确的项目根目录 |

#### 第 5 步：以新默认根启动控制页和 Runtime

rebind 本身不把 Runtime 伪装成已经启动。现在只使用**新默认根**启动控制页：

~~~powershell
Set-Location D:\Dev\codexgpt
node .\scripts\codexgpt-entry.mjs control --root D:\Dev\my-other-project
~~~

在浏览器打开该窗口打印的一次性本地地址，等待页面显示已认证的本地所有者会话，再点击 <strong>Start Runtime</strong>。不要复制、分享或截图完整一次性地址。页面显示 <code>owned_running</code> 后，再在另一个 PowerShell 窗口确认：

~~~powershell
node D:\Dev\codexgpt\scripts\codexgpt-entry.mjs auth status --root D:\Dev\my-other-project --json
~~~

重点是 <code>runtime.running</code> 为 <code>true</code>，且根目录是新项目。此时 hostname 与 Tunnel 仍是原来的；改变的是它们服务的默认项目根。

#### 第 6 步：在 ChatGPT 重新连接和授权

回到 ChatGPT，打开原来的 <code>codexgpt-Windows-v2</code> App。由于第 4 步撤销了旧 grant，ChatGPT 请求连接时应进入授权流程；这是预期结果，不是故障。

1. 保持 ChatGPT 授权页面打开；
2. 在本机 PowerShell 运行：

   ~~~powershell
   node D:\Dev\codexgpt\scripts\codexgpt-entry.mjs auth pending --root D:\Dev\my-other-project
   ~~~

3. 将显示的 correlation code 原样填入批准命令：

   ~~~powershell
   node D:\Dev\codexgpt\scripts\codexgpt-entry.mjs auth approve <correlation-code> --root D:\Dev\my-other-project
   ~~~

4. 回到 ChatGPT 页面完成授权；
5. 新开一个 ChatGPT 对话，发送“先调用 <code>open_current_workspace</code>，再调用 <code>git_status</code>；只读取，不修改文件”。

工具返回的根目录必须是新默认根 <code>D:\Dev\my-other-project</code>。默认根改变不会改变工具 descriptor，因此通常不需要 <strong>Scan Tools</strong>；只有工具列表本身变更或 App 明确显示陈旧时才扫描一次。

#### 第 7 步：如果迁移后发现选错了项目

不要删除 OAuth 文件、Tunnel、DNS 记录、旧 App 或审计数据。要恢复旧默认根，先停止新旧 Runtime，然后反向执行同一个 rebind：把“当前新默认根”填入 <code>--from-root</code>，把“原旧默认根”填入 <code>--root</code>，hostname 保持不变，并保留 <code>--revoke-all</code>。之后按第 5、6 步重新启动和重新授权。

这不是“恢复旧授权”：反向迁移同样会撤销当前 grants/tokens，并要求 ChatGPT 再次授权。若你无法确定旧根、新根或 hostname 的任何一个值，停在这里并先运行 <code>auth status</code> 做只读核对；不要猜测。

### 重启后的 workspace_id 为什么失效？

服务重启会创建新的 runtime incarnation，旧 `workspace_id` 会按设计失效。重新启动后，让 ChatGPT 再调用一次 `open_current_workspace`；若正在使用非默认目录，再执行一次 `open_workspace` 并使用新返回的句柄。空闲 workspace 也可能在约 30 分钟后过期，成功调用会刷新空闲期限。

## 发布 npm 包与 GitHub Release：浏览器验证的实际流程

这是一条**有外部副作用且不可撤销**的发布流程。只有在版本、变更内容、发布权限和目标 registry 都已经明确批准时才执行。一次发布包含三个彼此独立的事实：npm registry 中存在包、Git 有不可变标签、GitHub 有 Release；只完成其中之一不能称为完整发布。

下面的流程已用于发布 `codexgpt@1.0.5`。命令中的 `<version>` 和 `<release-source-sha>` 必须替换为本次已验证的真实值，不要照抄旧版本号。

### 1. 先固定要发布的源码，而不是先点发布

确认工作树干净、版本正确，并完成候选源码的本地门禁。运行时相关发布还必须在 PR 的**精确候选提交**上通过 Ubuntu/Windows × Node 20/24 的 CI；本地通过不能替代这个门禁。

```powershell
Set-Location D:\Dev\codexgpt
git status --short
npm run policy:check
npm pack --dry-run --json
git diff --check
```

`git status --short` 应无输出；`npm pack --dry-run --json` 应显示预期的 `<version>`，但它只检查打包，**不会发布**。创建 PR 后等待其精确提交的 CI 全部成功，再以 **merge commit** 合并到 `main`。不要 squash 或 rebase 该发布提交，否则 npm 包的 `gitHead` 不能作为 `main` 的祖先进行审计。

合并后记录候选源码 SHA，并验证它确实已进入远端 `main`：

```powershell
git fetch origin --tags --prune
git merge-base --is-ancestor <release-source-sha> origin/main
```

退出码为 `0` 才可继续。若 CI、源码 SHA 或工作树状态不符合预期，停止发布并修复；不要用标签或 Release “补救”未通过的候选。

### 2. 在交互式终端发布，让 npm 打开本次发布的浏览器确认

先确认账号与 2FA 模式；以下输出不应包含 token：

```powershell
npm whoami
npm profile get --json
```

对本项目，账户启用 `auth-and-writes` 时，`npm publish` 是需要二次验证的写操作。**必须在可交互的 PowerShell/终端中运行**：

```powershell
npm publish --access public
```

若 npm 显示 “Authenticate your account at:” 和 “Press ENTER to open in the browser...”，按 Enter，在已登录的 npm 浏览器页面完成本次发布授权。终端会保持等待；完成后应返回类似 `+ codexgpt@<version>`。

这与 `npm login --auth-type=web` 的网页登录不同：后者仅更新本机登录凭据；在 `auth-and-writes` 策略下，发布本身仍可能要求新的浏览器确认。若发布从非交互的日志捕获环境运行并只报 `EOTP`/一次性 URL 后退出，**不要复制、转发、截图或写入该 URL**；回到交互式终端重新运行发布，让 npm 自己打开浏览器挑战。只有账户配置为 TOTP 时，网页才会改为显示 TOTP 输入；不要默认要求或记录六位码。

### 3. 先验证 npm registry，再创建标签和 GitHub Release

发布成功后先从 registry 读取实际元数据。`gitHead` 必须等于 `<release-source-sha>`，且 `latest` 必须是 `<version>`：

```powershell
npm view codexgpt@<version> version gitHead dist-tags --json
```

只有该检查通过后，才创建带注释的不可变标签；标签必须指向 npm 已报告的同一源码 SHA：

```powershell
git ls-remote --tags origin "v<version>" "v<version>^{}"
git tag -a v<version> <release-source-sha> -m "CodexGPT <version>"
git push origin v<version>
```

首条命令应确认远端不存在该标签。若标签已存在，停止并核对其剥离对象；不要移动、删除或 force-push 已发布标签。

最后创建正式 Release。`--verify-tag` 确保 GitHub 只使用已推送的标签：

```powershell
gh release create v<version> --verify-tag --latest --title "CodexGPT <version>" --notes "<approved release notes>"
```

### 4. 交叉核验并明确未做的事

发布结束后，再次核对 registry、标签与 Release。以下任一项不一致都应报告为发布异常，而不是口头宣告成功：

```powershell
npm view codexgpt@<version> version gitHead dist-tags --json
git ls-remote --tags origin "v<version>" "v<version>^{}"
gh release view v<version> --json name,tagName,isDraft,isPrerelease,url,targetCommitish,publishedAt
gh api repos/<owner>/<repo>/releases/latest --jq "[.tag_name,.draft,.prerelease,.target_commitish,.html_url] | @tsv"
```

一次 npm/GitHub 发布**不会**自动更新本机已运行的 CodexGPT、重启 Control Plane、安装 Windows 服务、修改 Tunnel/DNS，或完成 ChatGPT Web 端到端验收。它们均是独立操作，必须按各自边界处理。

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
