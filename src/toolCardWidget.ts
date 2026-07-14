export const TOOL_CARD_URI = "ui://widget/codexpro-tool-card-v9.html";
export const TOOL_CARD_LEGACY_URIS = ["ui://widget/codexpro-tool-card-v8.html"];
export const TOOL_CARD_MIME_TYPE = "text/html;profile=mcp-app";

export const toolCardWidgetHtml = String.raw`
<meta charset="utf-8">
<div id="root" class="wrap">
  <article class="card pending">
    <div class="rail"></div>
    <header class="head">
      <span class="glyph">C</span>
      <div class="headline">
        <div class="title">CodexPro</div>
        <div class="subtitle">Waiting for tool result...</div>
      </div>
      <span class="pill info">waiting</span>
    </header>
    <div class="skeleton">
      <span></span>
      <span></span>
      <span></span>
    </div>
  </article>
</div>

<style>
  :root {
    color-scheme: dark light;
    --panel: #11151c;
    --panel-2: #161b24;
    --panel-3: #0c1016;
    --panel-4: #1d222b;
    --line: rgba(212, 219, 229, 0.13);
    --line-strong: rgba(212, 219, 229, 0.24);
    --text: #f2f4f7;
    --soft: #c9d0da;
    --muted: #97a1af;
    --quiet: #6f7988;
    --accent: #d7b56d;
    --accent-soft: rgba(215, 181, 109, 0.12);
    --blue: #9dc3ff;
    --green: #8edc99;
    --red: #f29a9a;
    --amber: #e8c978;
    --shadow: rgba(0, 0, 0, 0.26);
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    background: transparent;
    color: var(--text);
    font: 12px/1.48 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: 0;
  }

  .wrap {
    width: 100%;
  }

  .card {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 8px;
    background:
      radial-gradient(circle at 18px 0, rgba(215, 181, 109, 0.12), transparent 42px),
      linear-gradient(180deg, rgba(255, 255, 255, 0.042), rgba(255, 255, 255, 0)),
      var(--panel);
    box-shadow: 0 14px 34px var(--shadow);
  }

  .rail {
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: linear-gradient(180deg, var(--accent), rgba(142, 220, 153, 0.75) 64%, transparent);
    opacity: 0.88;
  }

  .head {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    min-height: 56px;
    padding: 11px 12px 10px 14px;
    border-bottom: 1px solid var(--line);
  }

  .glyph {
    display: inline-grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border: 1px solid rgba(215, 181, 109, 0.28);
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(215, 181, 109, 0.16), rgba(215, 181, 109, 0.04));
    color: var(--accent);
    font-size: 10px;
    font-weight: 900;
  }

  .headline {
    min-width: 0;
  }

  .title {
    overflow: hidden;
    color: var(--text);
    font-size: 12px;
    font-weight: 760;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .subtitle {
    overflow: hidden;
    margin-top: 2px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
    min-width: 0;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    max-width: 22ch;
    overflow: hidden;
    padding: 2px 7px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.035);
    color: var(--muted);
    font-size: 10px;
    font-weight: 720;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pill.good { color: var(--green); border-color: rgba(134, 239, 172, 0.28); background: rgba(134, 239, 172, 0.08); }
  .pill.bad { color: var(--red); border-color: rgba(253, 164, 175, 0.28); background: rgba(253, 164, 175, 0.08); }
  .pill.info { color: var(--blue); border-color: rgba(157, 195, 255, 0.28); background: rgba(157, 195, 255, 0.08); }
  .pill.warn { color: var(--amber); border-color: rgba(253, 230, 138, 0.28); background: rgba(253, 230, 138, 0.08); }

  .body {
    max-height: 420px;
    overflow: auto;
    padding: 10px;
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 10px;
  }

  .metric {
    min-width: 0;
    padding: 8px 9px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.025);
  }

  .metric .label {
    display: block;
    margin-bottom: 4px;
    color: var(--quiet);
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .metric .value {
    overflow: hidden;
    color: var(--soft);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .code {
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: var(--panel-3);
  }

  .codebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 30px;
    padding: 6px 9px;
    border-bottom: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--muted);
    font-size: 11px;
    font-weight: 720;
  }

  pre {
    margin: 0;
    padding: 10px;
    overflow: visible;
    color: var(--soft);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-size: 11px;
    line-height: 1.52;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .diff-line { display: block; min-height: 18px; padding: 0 4px; border-radius: 3px; }
  .diff-add { color: var(--green); background: rgba(142, 220, 153, 0.08); }
  .diff-del { color: var(--red); background: rgba(242, 154, 154, 0.08); }
  .diff-hunk { color: var(--blue); }
  .terminal pre { color: #dbe7f5; }
  .prompt { color: var(--accent); }

  .summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 10px;
  }

  .summary-item {
    min-width: 0;
    padding: 9px 10px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.025);
  }

  .summary-label {
    display: block;
    margin-bottom: 4px;
    color: var(--quiet);
    font-size: 10px;
    font-weight: 760;
  }

  .summary-value {
    color: var(--text);
    font-size: 15px;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .file-list {
    display: grid;
    gap: 4px;
    margin-bottom: 10px;
  }

  .section-label {
    margin: 10px 1px 6px;
    color: var(--quiet);
    font-size: 10px;
    font-weight: 850;
    text-transform: uppercase;
  }

  .fold {
    margin-top: 8px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.018);
  }

  .fold > summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    min-height: 34px;
    padding: 8px 10px;
    cursor: pointer;
    color: var(--soft);
    font-weight: 760;
    list-style: none;
  }

  .fold > summary::-webkit-details-marker { display: none; }

  .fold-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fold-count {
    color: var(--muted);
    font-size: 10px;
    font-weight: 800;
  }

  .fold-body {
    padding: 0 8px 8px;
  }

  .file-row {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    padding: 7px 8px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.022);
  }

  .file-code {
    color: var(--accent);
    font: 10px/1.2 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-weight: 800;
  }

  .file-name {
    overflow: hidden;
    color: var(--soft);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty {
    padding: 10px;
    border: 1px dashed var(--line-strong);
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.018);
    color: var(--muted);
  }

  .search {
    display: grid;
    gap: 4px;
  }

  .hit {
    display: grid;
    grid-template-columns: minmax(120px, 0.34fr) minmax(0, 1fr);
    gap: 8px;
    padding: 6px 8px;
    border-radius: 7px;
  }

  .hit:nth-child(odd) {
    background: rgba(255, 255, 255, 0.025);
  }

  .hit-file {
    overflow: hidden;
    color: var(--blue);
    font-weight: 850;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hit-text {
    color: var(--soft);
    overflow-wrap: anywhere;
  }

  .muted { color: var(--muted); }

  .skeleton {
    display: grid;
    gap: 7px;
    padding: 11px 13px 13px 17px;
    border-top: 1px solid rgba(255, 255, 255, 0.02);
  }

  .skeleton span {
    height: 8px;
    max-width: 78%;
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(148, 163, 184, 0.12), rgba(148, 163, 184, 0.22), rgba(148, 163, 184, 0.12));
    animation: codexpro-sheen 1.55s ease-in-out infinite;
  }

  .skeleton span:nth-child(2) { max-width: 52%; animation-delay: 0.12s; }
  .skeleton span:nth-child(3) { max-width: 66%; animation-delay: 0.24s; }

  @keyframes codexpro-sheen {
    0%, 100% { opacity: 0.46; transform: translateX(0); }
    50% { opacity: 1; transform: translateX(2px); }
  }

  @media (max-width: 640px) {
    .head { grid-template-columns: 28px minmax(0, 1fr); }
    .meta { grid-column: 1 / -1; justify-content: flex-start; }
    .summary,
    .metrics,
    .hit { grid-template-columns: 1fr; }
  }
</style>

<script>
  const root = document.getElementById("root");

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function truncate(value, max = 9000) {
    const text = String(value ?? "");
    return text.length > max ? text.slice(0, max) + "\n...[truncated in widget]" : text;
  }

  function countLines(value) {
    const text = String(value || "");
    if (!text) return 0;
    return text.replace(/\n$/, "").split("\n").length;
  }

  function previewLines(value, maxLines = 18) {
    const text = String(value || "").replace(/\n$/, "");
    if (!text) return "";
    const lines = text.split("\n");
    const shown = lines.slice(0, maxLines).join("\n");
    const remaining = lines.length - maxLines;
    return remaining > 0 ? shown + "\n...[" + remaining + " more lines]" : shown;
  }

  function basename(value) {
    const text = String(value || "");
    return text.split("/").filter(Boolean).pop() || text || ".";
  }

  function titleFor(tool) {
    const titles = {
      server_config: "Server config",
      codexpro_self_test: "Self-test",
      codexpro_inventory: "Inventory",
      codex_sessions: "Codex sessions",
      read_codex_session: "Codex transcript",
      load_skill: "Skill",
      list_workspaces: "Workspaces",
      open_current_workspace: "Workspace",
      open_workspace: "Workspace",
      workspace_snapshot: "Workspace snapshot",
      inspect_workspace: "Workspace analysis",
      tree: "File tree",
      write: "File write",
      edit: "Exact edit",
      apply_patch: "Patch",
      git_status: "Git Status",
      git_diff: "Git Diff",
      show_changes: "Change review",
      read_handoff: "Handoff context",
      wait_for_handoff: "Handoff wait",
      codex_context: "Codex context",
      export_pro_context: "Pro context",
      handoff_to_agent: "Agent handoff",
      handoff_to_codex: "Codex handoff",
      bash: "Terminal",
      search: "Search",
      read: "Read file"
    };
    return titles[tool] || "CodexPro";
  }

  function iconFor(tool) {
    if (tool === "server_config") return "S";
    if (tool === "codexpro_self_test") return "T";
    if (tool === "codexpro_inventory") return "I";
    if (tool === "codex_sessions") return "C";
    if (tool === "read_codex_session") return "R";
    if (tool === "load_skill") return "L";
    if (tool === "list_workspaces") return "W";
    if (tool === "open_current_workspace" || tool === "open_workspace") return "W";
    if (tool === "workspace_snapshot") return "W";
    if (tool === "inspect_workspace") return "I";
    if (tool === "tree") return "T";
    if (tool === "write") return "W";
    if (tool === "edit") return "E";
    if (tool === "apply_patch") return "P";
    if (tool === "git_status" || tool === "git_diff") return "G";
    if (tool === "show_changes") return "D";
    if (tool === "read_handoff") return "H";
    if (tool === "wait_for_handoff") return "H";
    if (tool === "codex_context") return "C";
    if (tool === "export_pro_context") return "P";
    if (tool === "handoff_to_agent") return "A";
    if (tool === "handoff_to_codex") return "H";
    if (tool === "bash") return "$";
    if (tool === "search") return "S";
    if (tool === "read") return "R";
    return "C";
  }

  function workspaceResultData(data) {
    const isWorkspaceResult =
      data?.codexpro_tool === "open_current_workspace" ||
      data?.codexpro_tool === "open_workspace" ||
      data?.codexpro_tool === "workspace_snapshot";
    return isWorkspaceResult && data?.data && typeof data.data === "object"
      ? data.data
      : (data ?? {});
  }

  function listWorkspacesResultData(data) {
    const nested =
      data?.codexpro_tool === "list_workspaces" &&
      data?.data &&
      typeof data.data === "object";
    return nested ? data.data : (data ?? {});
  }

  function inspectWorkspaceResultData(data) {
    const nested =
      data?.codexpro_tool === "inspect_workspace" &&
      data?.data &&
      typeof data.data === "object";
    return nested ? data.data : (data ?? {});
  }

  function selfTestResultData(data) {
    const nested =
      data?.codexpro_tool === "codexpro_self_test" &&
      data?.ok === true &&
      data?.data &&
      typeof data.data === "object";
    return nested ? data.data : {};
  }

  function inventoryResultData(data) {
    const nested =
      data?.codexpro_tool === "codexpro_inventory" &&
      data?.data &&
      typeof data.data === "object";
    return nested ? data.data : (data ?? {});
  }

  function loadSkillResultData(data) {
    const nested =
      data?.codexpro_tool === "load_skill" &&
      data?.data &&
      typeof data.data === "object";
    return nested ? data.data : (data ?? {});
  }

  function codexSessionsResultData(data) {
    const nested =
      data?.codexpro_tool === "codex_sessions" &&
      data?.data &&
      typeof data.data === "object";
    return nested ? data.data : {};
  }

  function readCodexSessionResultData(data) {
    const nested =
      data?.codexpro_tool === "read_codex_session" &&
      data?.data &&
      typeof data.data === "object";
    return nested ? data.data : {};
  }

  function readHandoffResultData(data) {
    const nested =
      data?.codexpro_tool === "read_handoff" &&
      data?.data &&
      typeof data.data === "object";
    return nested ? data.data : (data ?? {});
  }

  function waitForHandoffResultData(data) {
    const nested =
      data?.codexpro_tool === "wait_for_handoff" &&
      data?.data &&
      typeof data.data === "object";
    return nested ? data.data : (data ?? {});
  }

  function codexContextResultData(data) {
    const nested =
      data?.codexpro_tool === "codex_context" &&
      data?.data &&
      typeof data.data === "object";
    return nested ? data.data : (data ?? {});
  }

  function exportProContextResultData(data) {
    const nested =
      data?.codexpro_tool === "export_pro_context" &&
      data?.data &&
      typeof data.data === "object";
    return nested ? data.data : (data ?? {});
  }

  function handoffToAgentResultData(data) {
    const nested =
      (data?.codexpro_tool === "handoff_to_agent" ||
        data?.codexpro_tool === "handoff_to_codex") &&
      data?.data &&
      typeof data.data === "object";
    return nested ? data.data : {};
  }

  function subtitleFor(data) {
    if (data?.codexpro_tool === "open_current_workspace" || data?.codexpro_tool === "open_workspace") {
      if (data?.ok === false) return data?.error?.code || "Workspace unavailable";
      const workspace = workspaceResultData(data);
      return workspace.root || "Workspace opened";
    }
    if (data?.codexpro_tool === "show_changes") {
      const review = data?.data ?? {};
      const error = data?.error ?? {};
      if (data?.ok === false) return error.code || "Git state unavailable";
      const count = Array.isArray(review.changed_files) ? review.changed_files.length : 0;
      if (!count && !review.changed) return "Workspace is clean";
      return count === 1 ? "1 changed file" : count + " changed files";
    }
    if (data?.codexpro_tool === "codexpro_self_test") {
      if (data?.ok === false) return data?.error?.code || "Self-test unavailable";
      const selfTest = selfTestResultData(data);
      return selfTest.status ? "Status " + selfTest.status : "Local diagnostic";
    }
    if (data?.codexpro_tool === "codexpro_inventory") {
      if (data?.ok === false) return data?.error?.code || "Inventory unavailable";
      const inventory = inventoryResultData(data);
      const limited = inventory.skills_truncated || inventory.mcp_servers_truncated ? " (limited)" : "";
      return (inventory.skill_count ?? 0) + " skills, " + (inventory.mcp_server_count ?? 0) + " MCP servers" + limited;
    }
    if (data?.codexpro_tool === "codex_sessions") {
      if (data?.ok === false) return data?.error?.code || "Session index unavailable";
      const sessions = codexSessionsResultData(data);
      const limited = sessions.output_limited ? " (limited)" : "";
      return (sessions.session_count ?? 0) + " of " + (sessions.total_found ?? 0) + " matching sessions" + limited;
    }
    if (data?.codexpro_tool === "read_codex_session") {
      if (data?.ok === false) return data?.error?.code || "Transcript unavailable";
      const transcript = readCodexSessionResultData(data);
      const limited = transcript.output_limited ? " (limited)" : "";
      return (transcript.message_count ?? 0) + " transcript messages" + limited;
    }
    if (data?.codexpro_tool === "list_workspaces") {
      if (data?.ok === false) return data?.error?.code || "Workspace list unavailable";
      const listed = listWorkspacesResultData(data);
      return (listed?.count ?? 0) + " open workspaces";
    }
    if (data?.codexpro_tool === "server_config") {
      const config = data?.data ?? {};
      const session = config?.bashSessionId || config?.bash_session_id;
      return "tools " + (config?.toolMode || config?.tool_mode || "-") + ", bash " + (config?.bashMode || config?.bash_mode || "-") + ", policy " + (config?.policyEngineMode || "legacy") + (session ? ", session " + session : "");
    }
    if (data?.codexpro_tool === "tree") {
      if (data?.ok === false) return data?.error?.code || "File tree unavailable";
      const tree = data?.data ?? {};
      return tree.root || "File tree";
    }
    if (data?.codexpro_tool === "read") {
      if (data?.ok === false) return data?.error?.code || "File unavailable";
      const file = data?.data ?? {};
      return file.path || "Read file";
    }
    if (data?.codexpro_tool === "workspace_snapshot") {
      if (data?.ok === false) return data?.error?.code || "Workspace snapshot unavailable";
      const workspace = workspaceResultData(data);
      return workspace.root || "Workspace snapshot";
    }
    if (data?.codexpro_tool === "inspect_workspace") {
      if (data?.ok === false) return data?.error?.code || "Workspace analysis unavailable";
      const analysis = inspectWorkspaceResultData(data);
      const coverage = analysis?.coverage || {};
      return (coverage.analyzedFiles ?? coverage.analyzed_files ?? 0) +
        " files analyzed, " +
        (coverage.symbolCount ?? coverage.symbol_count ?? 0) +
        " symbols";
    }
    if (data?.codexpro_tool === "git_status") {
      if (data?.ok === false) return data?.error?.code || "Git status unavailable";
      const statusData = data?.data ?? {};
      const count = Array.isArray(statusData.changed_files)
        ? statusData.changed_files.length
        : 0;
      return count ? count + " changed entries" : "Working tree clean";
    }
    if (data?.codexpro_tool === "codex_context") {
      if (data?.ok === false) return data?.error?.code || "Codex context unavailable";
      const context = codexContextResultData(data);
      return (context?.agents_files?.length ?? 0) + " AGENTS, " + (context?.ai_context_files?.length ?? 0) + " bridge files";
    }
    if (data?.codexpro_tool === "export_pro_context") {
      if (data?.ok === false) return data?.error?.code || "Pro context export unavailable";
      const context = exportProContextResultData(data);
      return (context?.file_count ?? context?.files_included?.length ?? 0) +
        " files exported to " + (context?.path || "context bundle");
    }
    if (data?.codexpro_tool === "read_handoff") {
      if (data?.ok === false) return data?.error?.code || "Handoff unavailable";
      const handoff = readHandoffResultData(data);
      return (handoff?.file_count ?? handoff?.files?.length ?? 0) + " bridge files";
    }
    if (data?.codexpro_tool === "wait_for_handoff") {
      if (data?.ok === false) return data?.error?.code || "Handoff wait unavailable";
      const wait = waitForHandoffResultData(data);
      return wait.awaited_terminal
        ? "Terminal run " + (wait.state || "ready")
        : "Waiting: " + (wait.state || "unknown");
    }
    if (data?.codexpro_tool === "load_skill") {
      if (data?.ok === false) return data?.error?.code || "Skill unavailable";
      const skillData = loadSkillResultData(data);
      return skillData?.skill?.name || "Skill instructions";
    }
    if (data?.codexpro_tool === "handoff_to_agent" || data?.codexpro_tool === "handoff_to_codex") {
      if (data?.ok === false) return data?.error?.code || "Handoff unavailable";
      const handoff = handoffToAgentResultData(data);
      return handoff.agent_name || handoff.plan_path || "Handoff";
    }
    if (data?.path) return data.path;
    if (data?.plan_path) return data.plan_path;
    if (data?.root) return data.root;
    if (data?.cwd) return data.cwd;
    return "Tool output";
  }

  function pill(text, cls) {
    return '<span class="pill ' + esc(cls || "") + '">' + esc(text) + '</span>';
  }

  function header(data, pills) {
    const tool = data?.codexpro_tool;
    return [
      '<div class="rail"></div>',
      '<header class="head">',
      '<span class="glyph">' + esc(iconFor(tool)) + '</span>',
      '<div class="headline"><div class="title">' + esc(titleFor(tool)) + '</div><div class="subtitle">' + esc(subtitleFor(data)) + '</div></div>',
      '<div class="meta">' + (pills || '') + '</div>',
      '</header>'
    ].join('');
  }

  function metric(label, value) {
    return '<div class="metric"><span class="label">' + esc(label) + '</span><div class="value">' + esc(value ?? "-") + '</div></div>';
  }

  function summaryItem(label, value) {
    return '<div class="summary-item"><span class="summary-label">' + esc(label) + '</span><div class="summary-value">' + esc(value ?? "-") + '</div></div>';
  }

  function codebox(label, text, extraClass) {
    return '<div class="code ' + esc(extraClass || "") + '"><div class="codebar"><span>' + esc(label || "output") + '</span></div><pre>' + text + '</pre></div>';
  }

  function fold(title, count, body, open) {
    if (!body) return "";
    return '<details class="fold"' + (open ? " open" : "") + '><summary><span class="fold-title">' + esc(title) + '</span><span class="fold-count">' + esc(count || "") + '</span></summary><div class="fold-body">' + body + '</div></details>';
  }

  function shortSource(value) {
    if (value === "workspace") return "repo";
    if (value === "plugin") return "plug";
    if (value === "user") return "user";
    return "skill";
  }

  function renderDiff(diff) {
    return truncate(diff, 14000).split("\n").map((line) => {
      let cls = "diff-line";
      if (line.startsWith("+") && !line.startsWith("+++")) cls += " diff-add";
      else if (line.startsWith("-") && !line.startsWith("---")) cls += " diff-del";
      else if (line.startsWith("@@")) cls += " diff-hunk";
      return '<span class="' + cls + '">' + esc(line) + '</span>';
    }).join("");
  }

  function renderWrite(data) {
    const writeData = data?.data ?? {};
    const error = data?.error ?? {};
    const failed = data?.ok === false;
    const pills = failed
      ? pill(error.code || "error", "bad")
      : [
          writeData.bytes !== undefined ? pill(writeData.bytes + " bytes") : "",
          writeData.additions !== undefined ? pill("+" + writeData.additions, "good") : "",
          writeData.deletions !== undefined ? pill("-" + writeData.deletions, "bad") : ""
        ].join("");
    const body = failed
      ? '<div class="empty">' + esc(error.message || "Write failed.") + '</div>'
      : '<div class="summary">' +
        summaryItem("Path", writeData.path || "-") +
        summaryItem("Existed", writeData.existed ? "yes" : "no") +
        summaryItem("SHA-256", writeData.sha256 || "-") +
        '</div>' +
        (writeData.diff
          ? codebox(basename(writeData.path || "file"), renderDiff(writeData.diff), "")
          : '<div class="empty">No diff returned.</div>');
    return '<article class="card">' + header(data, pills) + '<div class="body">' + body + '</div></article>';
  }

  function renderEdit(data) {
    const editData = data?.data ?? {};
    const error = data?.error ?? {};
    const failed = data?.ok === false;
    const pills = failed
      ? pill(error.code || "error", "bad")
      : [
          editData.replacements !== undefined ? pill(editData.replacements + " replacements", "info") : "",
          editData.bytes !== undefined ? pill(editData.bytes + " bytes") : "",
          editData.additions !== undefined ? pill("+" + editData.additions, "good") : "",
          editData.deletions !== undefined ? pill("-" + editData.deletions, "bad") : ""
        ].join("");
    const body = failed
      ? '<div class="empty">' + esc(error.message || "Edit failed.") + '</div>'
      : '<div class="summary">' +
        summaryItem("Path", editData.path || "-") +
        summaryItem("SHA-256", editData.sha256 || "-") +
        '</div>' +
        (editData.diff
          ? codebox(basename(editData.path || "file"), renderDiff(editData.diff), "")
          : '<div class="empty">No diff returned.</div>');
    return '<article class="card">' + header(data, pills) + '<div class="body">' + body + '</div></article>';
  }

  function renderApplyPatch(data) {
    const patchData = data?.data ?? {};
    const error = data?.error ?? {};
    const failed = data?.ok === false;
    const paths = Array.isArray(patchData.paths) ? patchData.paths : [];
    const visiblePaths = paths.slice(0, 8);
    const pathPreview = visiblePaths.join(", ") +
      (paths.length > visiblePaths.length ? ", … +" + (paths.length - visiblePaths.length) : "");
    const pills = failed
      ? pill(error.code || "error", "bad")
      : [
          pill(paths.length + " files", "info"),
          patchData.additions !== undefined ? pill("+" + patchData.additions, "good") : "",
          patchData.deletions !== undefined ? pill("-" + patchData.deletions, "bad") : ""
        ].join("");
    const body = failed
      ? '<div class="empty">' + esc(error.message || "Apply patch failed.") + '</div>'
      : '<div class="summary">' +
        summaryItem("Paths", pathPreview || "-") +
        summaryItem("Changed", patchData.changed ? "yes" : "no") +
        '</div>' +
        (patchData.diff
          ? codebox("patch", renderDiff(patchData.diff), "")
          : '<div class="empty">No diff returned.</div>');
    return '<article class="card">' + header(data, pills) + '<div class="body">' + body + '</div></article>';
  }

  function renderFile(data) {
    const pills = [
      data.bytes !== undefined ? pill(data.bytes + " bytes") : "",
      data.additions !== undefined ? pill("+" + data.additions, "good") : "",
      data.deletions !== undefined ? pill("-" + data.deletions, "bad") : "",
      data.replacements !== undefined ? pill(data.replacements + " replacements", "info") : ""
    ].join("");
    const body = data.diff ? renderDiff(data.diff) : esc(truncate(data.text || ""));
    return '<article class="card">' + header(data, pills) + '<div class="body">' +
      codebox(basename(data.path || data.plan_path || "file"), body, "") +
      '</div></article>';
  }

  function renderGitDiff(data) {
    const diffData = data?.data ?? {};
    const error = data?.error ?? {};
    const failed = data?.ok === false;
    const pills = failed
      ? pill(error.code || "error", "bad")
      : [
          diffData.changed ? pill("changed", "info") : pill("clean", "good"),
          pill("+" + (diffData.additions ?? 0), "good"),
          pill("-" + (diffData.deletions ?? 0), "bad")
        ].join("");
    const body = failed
      ? '<div class="empty">' + esc(error.message || "Git diff failed.") + '</div>'
      : '<div class="summary">' +
        summaryItem("Staged", diffData.staged ? "yes" : "no") +
        summaryItem("Added", "+" + (diffData.additions ?? 0)) +
        summaryItem("Deleted", "-" + (diffData.deletions ?? 0)) +
        '</div>' +
        (diffData.diff
          ? codebox("diff", renderDiff(diffData.diff), "")
          : '<div class="empty">' + esc(diffData.changed ? "Raw diff omitted." : "No changes.") + '</div>');
    return '<article class="card">' + header(data, pills) + '<div class="body">' + body + '</div></article>';
  }

  function renderChanges(data) {
    const review = data?.data ?? {};
    const files = Array.isArray(review.changed_files) ? review.changed_files : [];
    const error = data?.error ?? {};
    const warnings = Array.isArray(data?.meta?.warnings) ? data.meta.warnings : [];
    const failed = data?.ok === false;
    const changed = Boolean(review.changed);
    const pills = [
      failed ? pill("git unavailable", "warn") : changed ? pill("changed", "info") : pill("clean", "good"),
      review.additions !== undefined ? pill("+" + review.additions, "good") : "",
      review.deletions !== undefined ? pill("-" + review.deletions, "bad") : ""
    ].join("");
    const fileRows = files.slice(0, 10).map((line) => {
      const status = String(line).slice(0, 2).trim() || "?";
      const name = String(line).slice(2).trim() || String(line);
      return '<div class="file-row"><span class="file-code">' + esc(status) + '</span><span class="file-name">' + esc(name) + '</span></div>';
    }).join("");
    const moreFiles = files.length > 10 ? '<div class="empty">+' + esc(files.length - 10) + ' more changed files</div>' : "";
    const state = failed
      ? '<div class="empty">' + esc(error.message || "Git state unavailable.") + '</div>'
      : fileRows
        ? '<div class="file-list">' + fileRows + '</div>' + moreFiles
        : '<div class="empty">No changed files.</div>';
    const warning = warnings.length ? '<div class="empty">' + esc(warnings[0]) + '</div>' : "";
    const diff = review.diff ? codebox("diff", renderDiff(review.diff), "") : "";
    return '<article class="card">' + header(data, pills) + '<div class="body">' +
      '<div class="summary">' +
      summaryItem("Files", files.length) +
      summaryItem("Added", "+" + (review.additions ?? 0)) +
      summaryItem("Deleted", "-" + (review.deletions ?? 0)) +
      '</div>' +
      state +
      warning +
      diff +
      '</div></article>';
  }

  function compactRows(values, code, max = 8) {
    const items = Array.isArray(values) ? values : [];
    const rows = items.slice(0, max).map((value) => {
      const label = typeof value === "string" ? value : (value?.path || value?.label || value?.name || "item");
      const detail = typeof value === "object" && value ? (value?.reasons || []).join(", ") : "";
      return '<div class="file-row"><span class="file-code">' + esc(code) + '</span><span class="file-name">' + esc(label + (detail ? ": " + detail : "")) + '</span></div>';
    }).join("");
    const more = items.length > max ? '<div class="empty">+' + esc(items.length - max) + ' more</div>' : "";
    return '<div class="file-list">' + (rows || '<div class="empty">None.</div>') + more + '</div>';
  }

  function renderWorkspaceAnalysis(data) {
    const failed = data?.ok === false;
    const error = data?.error ?? {};
    const analysis = inspectWorkspaceResultData(data);
    const coverage = analysis.coverage || {};
    const languages = Array.isArray(analysis.languages) ? analysis.languages : [];
    const projects = Array.isArray(analysis.project_types) ? analysis.project_types : [];
    const entrypoints = Array.isArray(analysis.entrypoints) ? analysis.entrypoints : [];
    const areas = Array.isArray(analysis.areas) ? analysis.areas : [];
    const symbols = Array.isArray(analysis.symbols) ? analysis.symbols : [];
    const relationships = Array.isArray(analysis.relationships) ? analysis.relationships : [];
    const warnings = Array.isArray(analysis.warnings) ? analysis.warnings : [];
    const partial = Boolean(coverage.truncated || analysis.output_limited);
    const pills = failed
      ? pill(error.code || "error", "bad")
      : [
          pill(projects.join(", ") || "project", "info"),
          pill(languages.length + " languages"),
          partial ? pill("limited", "warn") : pill("complete", "good")
        ].join("");
    if (failed) {
      return '<article class="card">' + header(data, pills) + '<div class="body">' +
        '<div class="empty">' + esc(error.message || "Workspace analysis unavailable.") + '</div>' +
        '</div></article>';
    }
    const relationshipRows = relationships.slice(0, 8).map((edge) =>
      '<div class="file-row"><span class="file-code">' + esc(edge?.kind || "edge") + '</span><span class="file-name">' + esc((edge?.from || "?") + " → " + (edge?.to || "?")) + '</span></div>'
    ).join("");
    return '<article class="card">' + header(data, pills) + '<div class="body">' +
      '<div class="summary">' +
      summaryItem("Files", coverage.inventoryFiles ?? coverage.inventory_files ?? 0) +
      summaryItem("Analyzed", coverage.analyzedFiles ?? coverage.analyzed_files ?? 0) +
      summaryItem("Symbols", coverage.symbolCount ?? coverage.symbol_count ?? symbols.length) +
      '</div>' +
      '<div class="section-label">Entrypoints</div>' + compactRows(entrypoints, "entry") +
      fold("Areas", areas.length + " areas", compactRows(areas, "area"), false) +
      fold("Symbols", symbols.length + " symbols", compactRows(symbols, "sym"), false) +
      fold("Relationships", relationships.length + " edges", '<div class="file-list">' + (relationshipRows || '<div class="empty">None.</div>') + '</div>', false) +
      (warnings.length ? fold("Warnings", warnings.length + " warnings", compactRows(warnings, "warn"), false) : "") +
      '</div></article>';
  }

  function renderStructuredSearch(data) {
    const search = data?.data ?? {};
    const analysis = search.analysis || {};
    const groups = analysis.groups || {};
    const order = ["definitions", "references", "tests", "configuration", "documentation", "other"];
    const count = order.reduce((sum, name) => sum + (Array.isArray(groups[name]) ? groups[name].length : 0), 0);
    const sections = order.map((name) => {
      const matches = Array.isArray(groups[name]) ? groups[name] : [];
      if (!matches.length) return "";
      const rows = matches.slice(0, 8).map((match) =>
        '<div class="hit"><div class="hit-file">' + esc((match.path || "match") + ":" + (match.line || 0)) + '</div><div class="hit-text">' + esc((match.text || "") + (match.reasons?.length ? ": " + match.reasons.join(", ") : "")) + '</div></div>'
      ).join("");
      const more = matches.length > 8 ? '<div class="empty">+' + esc(matches.length - 8) + ' more</div>' : "";
      return fold(name, matches.length + " matches", '<div class="search">' + rows + more + '</div>', name === "definitions");
    }).join("");
    const coverage = analysis.coverage || {};
    const pills = [pill(count + " grouped matches", "info"), pill(analysis.intent || "structured"), coverage.truncated ? pill("partial", "warn") : ""].join("");
    return '<article class="card">' + header(data, pills) + '<div class="body">' +
      '<div class="summary">' + summaryItem("Definitions", groups.definitions?.length ?? 0) + summaryItem("References", groups.references?.length ?? 0) + summaryItem("Tests", groups.tests?.length ?? 0) + '</div>' +
      (sections || '<div class="empty">No grouped matches.</div>') +
      '</div></article>';
  }

  function renderChangeAnalysis(data) {
    const review = data?.data ?? {};
    const analysis = review.analysis ?? {};
    const files = Array.isArray(review.changed_files) ? review.changed_files : [];
    const risks = Array.isArray(analysis.risk_signals) ? analysis.risk_signals : [];
    const tests = Array.isArray(analysis.related_tests) ? analysis.related_tests : [];
    const commands = Array.isArray(analysis.recommended_commands) ? analysis.recommended_commands : [];
    const affected = Array.isArray(analysis.affected_areas) ? analysis.affected_areas : [];
    const pills = [
      pill(review.changed ? "changed" : "clean", review.changed ? "info" : "good"),
      risks.length ? pill(risks.length + " risks", "warn") : pill("no risks", "good"),
      pill("+" + (review.additions ?? 0), "good"),
      pill("-" + (review.deletions ?? 0), "bad")
    ].join("");
    const commandRows = commands.slice(0, 8).map((item) =>
      '<div class="file-row"><span class="file-code">run</span><span class="file-name">' + esc(item?.command || "") + '</span></div>'
    ).join("");
    return '<article class="card">' + header(data, pills) + '<div class="body">' +
      '<div class="summary">' + summaryItem("Files", files.length) + summaryItem("Areas", affected.length) + summaryItem("Tests", tests.length) + '</div>' +
      '<div class="section-label">Affected areas</div>' + compactRows(affected, "area") +
      fold("Risk signals", risks.length + " signals", compactRows(risks, "risk"), risks.length > 0) +
      fold("Related tests", tests.length + " tests", compactRows(tests, "test"), false) +
      fold("Verification", commands.length + " commands", '<div class="file-list">' + (commandRows || '<div class="empty">None.</div>') + '</div>', false) +
      (review.diff ? fold("Diff", "+" + (review.additions ?? 0) + " -" + (review.deletions ?? 0), codebox("diff", renderDiff(review.diff), ""), false) : "") +
      '</div></article>';
  }

  function gitStatusRows(status, max = 8) {
    return String(status || "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("##"))
      .slice(0, max)
      .map((line) => {
        const code = line.slice(0, 2).trim() || "?";
        const name = line.slice(2).trim() || line;
        return '<div class="file-row"><span class="file-code">' + esc(code) + '</span><span class="file-name">' + esc(name) + '</span></div>';
      })
      .join("");
  }

  function renderWorkspace(data) {
    const workspace = workspaceResultData(data);
    const error = data?.error ?? {};
    if (data?.ok === false) {
      return '<article class="card">' +
        header(data, pill(error.code || "error", "bad")) +
        '<div class="body"><div class="empty">' +
        esc(error.message || "Workspace unavailable.") +
        '</div></div></article>';
    }

    const skills = Array.isArray(workspace.skill_inventory)
      ? workspace.skill_inventory
      : (Array.isArray(workspace.skills) ? workspace.skills : []);
    const skillCount = Number(workspace.skill_counts?.total ?? skills.length);
    const changedRows = gitStatusRows(workspace.git_status, 8);
    const gitLines = String(workspace.git_status || "").split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("##"));
    const agentsLabel = workspace.agents_loaded ? (workspace.agents_path || "AGENTS.md") : "no AGENTS";
    const pills = [
      pill(agentsLabel, workspace.agents_loaded ? "good" : "warn"),
      pill(skillCount + " skills", skillCount ? "info" : ""),
      workspace.tool_mode ? pill("tools " + workspace.tool_mode) : ""
    ].join("");
    const contextRows = [
      '<div class="file-row"><span class="file-code">root</span><span class="file-name">' + esc(workspace.root || ".") + '</span></div>',
      workspace.workspace_id ? '<div class="file-row"><span class="file-code">id</span><span class="file-name">' + esc(workspace.workspace_id) + '</span></div>' : "",
      workspace.agents_loaded ? '<div class="file-row"><span class="file-code">rules</span><span class="file-name">' + esc(workspace.agents_path || "AGENTS.md") + '</span></div>' : ""
    ].join("");
    const skillRows = skills.slice(0, 16).map((skill) => {
      const value = typeof skill === "string" ? skill : (skill?.name || "skill");
      const source = typeof skill === "string" ? "skill" : shortSource(skill?.source);
      return '<div class="file-row"><span class="file-code">' + esc(source) + '</span><span class="file-name">' + esc(value) + '</span></div>';
    }).join("");
    const skillText = skills.length
      ? '<div class="file-list">' + skillRows + '</div>' + (skills.length > 16 ? '<div class="empty">+' + esc(skills.length - 16) + ' more skills</div>' : "")
      : '<div class="empty">No skills discovered. Use include_global_skills=true if this is unexpected.</div>';
    const gitText = changedRows
      ? '<div class="file-list">' + changedRows + '</div>' + (gitLines.length > 8 ? '<div class="empty">+' + esc(gitLines.length - 8) + ' more changed files</div>' : "")
      : '<div class="empty">Working tree clean.</div>';
    const aiContextFiles = Array.isArray(workspace.ai_context_files)
      ? workspace.ai_context_files
      : [];
    const aiContextRows = aiContextFiles.slice(0, 12).map((file) =>
      '<div class="file-row"><span class="file-code">ctx</span><span class="file-name">' + esc(file) + '</span></div>'
    ).join("");
    const aiContextText = aiContextFiles.length
      ? '<div class="file-list">' + aiContextRows + '</div>' + (aiContextFiles.length > 12 ? '<div class="empty">+' + esc(aiContextFiles.length - 12) + ' more context files</div>' : "")
      : '<div class="empty">No readable AI handoff files.</div>';
    const aiContextSection = data?.codexpro_tool === "workspace_snapshot"
      ? fold("AI handoff", aiContextFiles.length + " files", aiContextText, false)
      : "";
    const tree = workspace.tree ? codebox("tree", esc(previewLines(workspace.tree, 18)), "") : "";
    return '<article class="card">' + header(data, pills) + '<div class="body">' +
      '<div class="summary">' +
      summaryItem("Write", workspace.write_mode || "-") +
      summaryItem("Bash", workspace.bash_mode || "-") +
      summaryItem("Tools", workspace.tool_mode || "-") +
      '</div>' +
      '<div class="section-label">Context</div><div class="file-list">' + contextRows + '</div>' +
      fold("Git", gitLines.length ? gitLines.length + " changed" : "clean", gitText, false) +
      aiContextSection +
      fold("Skills", skillCount + " discovered", skillText, false) +
      fold("Tree", workspace.tree ? "available" : "", tree, false) +
      '</div></article>';
  }

  function renderHandoff(data) {
    const handoff = handoffToAgentResultData(data);
    const error = data?.error ?? {};
    if (data?.ok === false) {
      return '<article class="card">' +
        header(data, pill(error.code || "error", "bad")) +
        '<div class="body"><div class="empty">' +
        esc(error.message || "Agent handoff unavailable.") +
        '</div></div></article>';
    }
    const pills = [
      handoff.agent_name ? pill(handoff.agent_name, "info") : "",
      handoff.model ? pill(handoff.model) : "",
      handoff.append_requested ? pill(handoff.append_applied ? "appended" : "new plan", handoff.append_applied ? "good" : "warn") : "",
      handoff.additions !== undefined ? pill("+" + handoff.additions, "good") : "",
      handoff.deletions !== undefined ? pill("-" + handoff.deletions, "bad") : ""
    ].join("");
    const rows = [
      handoff.plan_path ? '<div class="file-row"><span class="file-code">plan</span><span class="file-name">' + esc(handoff.plan_path) + '</span></div>' : "",
      handoff.status_path ? '<div class="file-row"><span class="file-code">status</span><span class="file-name">' + esc(handoff.status_path) + '</span></div>' : "",
      handoff.diff_path ? '<div class="file-row"><span class="file-code">diff</span><span class="file-name">' + esc(handoff.diff_path) + '</span></div>' : "",
      handoff.log_path ? '<div class="file-row"><span class="file-code">log</span><span class="file-name">' + esc(handoff.log_path) + '</span></div>' : "",
      handoff.execution_log_path ? '<div class="file-row"><span class="file-code">exec</span><span class="file-name">' + esc(handoff.execution_log_path) + '</span></div>' : ""
    ].join("");
    const prompt = handoff.prompt
      ? codebox("agent prompt", esc(truncate(handoff.prompt, 4000)), "terminal")
      : "";
    const diff = handoff.diff
      ? codebox("plan file diff", renderDiff(truncate(handoff.diff, 9000)), "")
      : "";
    return '<article class="card">' + header(data, pills) + '<div class="body">' +
      (handoff.plan_sha256 ? '<div class="summary">' +
        summaryItem("Plan hash", String(handoff.plan_sha256).slice(0, 12)) +
        summaryItem("Bytes", handoff.plan_bytes ?? "-") +
        summaryItem("Logged", handoff.logged_count ?? "-") +
        '</div>' : "") +
      '<div class="file-list">' + rows + '</div>' +
      prompt + diff +
      '</div></article>';
  }

  function renderBash(data) {
    const commandResult = data?.data ?? {};
    const error = data?.error ?? {};
    if (data?.ok === false) {
      return '<article class="card">' +
        header(data, pill(error.code || "error", "bad")) +
        '<div class="body"><div class="empty">' +
        esc(error.message || "Bash unavailable.") +
        '</div></div></article>';
    }

    const commandPassed = Number(commandResult.exitCode) === 0;
    const stdoutLines = countLines(commandResult.stdout);
    const stderrLines = countLines(commandResult.stderr);
    const totalLines = stdoutLines + stderrLines;
    const pills = [
      pill(commandPassed ? "passed" : "failed", commandPassed ? "good" : "bad"),
      commandResult.signal ? pill(commandResult.signal, "warn") : "",
      commandResult.truncated ? pill("truncated", "warn") : "",
      commandResult.bash_session_id ? pill("session " + commandResult.bash_session_id, "info") : "",
      pill(totalLines + " lines", "info"),
      pill((commandResult.durationMs ?? "-") + " ms")
    ].join("");
    const command = '<span class="prompt">$</span> ' + esc(truncate(commandResult.command || "", 1000));
    const stdout = previewLines(commandResult.stdout || "", 18);
    const stderr = previewLines(commandResult.stderr || "", 18);
    const outputBoxes = [
      stdout ? fold("stdout", stdoutLines + " lines", codebox("stdout preview", esc(truncate(stdout, 5000)), "terminal"), false) : "",
      stderr ? fold("stderr", stderrLines + " lines", codebox("stderr preview", esc(truncate(stderr, 5000)), "terminal"), false) : ""
    ].join("") || '<div class="empty">Command produced no output.</div>';

    return '<article class="card">' + header(data, pills) + '<div class="body">' +
      '<div class="summary">' +
      summaryItem("Exit", commandResult.exitCode ?? "-") +
      summaryItem("Signal", commandResult.signal || "-") +
      summaryItem("Lines", totalLines) +
      summaryItem("Duration", (commandResult.durationMs ?? "-") + " ms") +
      '</div>' +
      codebox("command", command, "terminal") +
      outputBoxes +
      '</div></article>';
  }

  function renderSearch(data) {
    const search = data?.data ?? {};
    const error = data?.error ?? {};
    if (data?.ok === false) {
      return '<article class="card">' +
        header(data, pill(error.code || "error", "bad")) +
        '<div class="body"><div class="empty">' +
        esc(error.message || "Search unavailable.") +
        '</div></div></article>';
    }

    const matches = Array.isArray(search.matches) ? search.matches : [];
    const hits = matches.slice(0, 90).map((match) => {
      const file = (match?.path || "match") + ":" + (match?.line || 0);
      const body = match?.text || "";
      return '<div class="hit"><div class="hit-file">' + esc(file) + '</div><div class="hit-text">' + esc(body) + '</div></div>';
    }).join("") || '<div class="muted">No matches.</div>';
    return '<article class="card">' + header(data, pill(matches.length + " matches", "info") + pill(search.used || "search")) +
      '<div class="body"><div class="search">' + hits + '</div></div></article>';
  }

  function renderSelfTest(data) {
    const error = data?.error ?? {};
    if (data?.ok === false) {
      return '<article class="card">' +
        header(data, pill(error.code || "error", "bad")) +
        '<div class="body"><div class="empty">' +
        esc(error.message || "Self-test unavailable.") +
        '</div></div></article>';
    }

    const selfTest = selfTestResultData(data);
    const checks = Array.isArray(selfTest.checks) ? selfTest.checks : [];
    const counts = selfTest.counts ?? {};
    const status = String(selfTest.status || "unknown");
    const expectedTools = Array.isArray(selfTest.expected_tools) ? selfTest.expected_tools : [];
    const missingTools = Array.isArray(selfTest.missing_tools) ? selfTest.missing_tools : [];
    const unexpectedTools = Array.isArray(selfTest.unexpected_tools) ? selfTest.unexpected_tools : [];
    const pills = [
      pill(status, status === "pass" ? "good" : status === "fail" ? "bad" : "warn"),
      pill(expectedTools.length + " tools", "info"),
      pill((data?.meta?.durationMs ?? "-") + " ms")
    ].join("");
    const rows = checks.slice(0, 17).map((check) => {
      const state = String(check?.status || "?").toUpperCase();
      const cls = check?.status === "pass" ? "good" : check?.status === "fail" ? "bad" : "warn";
      const label = (check?.name || "check") + " [" + (check?.code || "-") + "]: " + (check?.message || "");
      return '<div class="file-row"><span class="file-code ' + esc(cls) + '">' + esc(state) + '</span><span class="file-name">' + esc(label) + '</span></div>';
    }).join("");
    const mismatch = [
      missingTools.length ? fold("Missing tools", missingTools.length + " tools", codebox("missing", esc(missingTools.join("\\n")), ""), false) : "",
      unexpectedTools.length ? fold("Unexpected tools", unexpectedTools.length + " tools", codebox("unexpected", esc(unexpectedTools.join("\\n")), ""), false) : ""
    ].join("");
    const artifact = selfTest.probe_artifact
      ? '<div class="file-list"><div class="file-row"><span class="file-code">probe</span><span class="file-name">' + esc(selfTest.probe_artifact) + '</span></div></div>'
      : "";
    return '<article class="card">' + header(data, pills) + '<div class="body">' +
      '<div class="summary">' +
      summaryItem("Passed", counts.passed ?? 0) +
      summaryItem("Warned", counts.warned ?? 0) +
      summaryItem("Failed", counts.failed ?? 0) +
      summaryItem("Skipped", counts.skipped ?? 0) +
      '</div>' +
      '<div class="file-list">' + (rows || '<div class="empty">No checks returned.</div>') + '</div>' +
      mismatch + artifact +
      fold("Expected tools", expectedTools.length + " tools", codebox("tools", esc(expectedTools.join("\\n")), ""), false) +
      '</div></article>';
  }

  function renderInventory(data) {
    const error = data?.error ?? {};
    if (data?.ok === false) {
      return '<article class="card">' +
        header(data, pill(error.code || "error", "bad")) +
        '<div class="body"><div class="empty">' +
        esc(error.message || "Inventory unavailable.") +
        '</div></div></article>';
    }

    const inventory = inventoryResultData(data);
    const skills = Array.isArray(inventory.skills) ? inventory.skills : [];
    const servers = Array.isArray(inventory.mcp_servers) ? inventory.mcp_servers : [];
    const limited = inventory.skills_truncated || inventory.mcp_servers_truncated;
    const skillRows = skills.slice(0, 18).map((skill) =>
      '<div class="file-row"><span class="file-code">' + esc(shortSource(skill?.source)) + '</span><span class="file-name">' + esc((skill?.name || "skill") + (skill?.description ? " — " + skill.description : "")) + '</span></div>'
    ).join("");
    const serverRows = servers.slice(0, 18).map((server) =>
      '<div class="file-row"><span class="file-code">mcp</span><span class="file-name">' + esc((server?.name || "server") + (server?.source ? " — " + server.source : "")) + '</span></div>'
    ).join("");
    return '<article class="card">' + header(data, pill((inventory.skill_count ?? skills.length) + " skills", "info") + pill((inventory.mcp_server_count ?? servers.length) + " MCP") + (limited ? pill("limited", "warn") : "")) +
      '<div class="body">' +
      '<div class="summary">' +
      summaryItem("Write", inventory.write_mode || "-") +
      summaryItem("Bash", inventory.bash_mode || "-") +
      summaryItem("Tools", inventory.tool_mode || "-") +
      '</div>' +
      fold("Skills", (inventory.skill_count ?? skills.length) + (inventory.skills_truncated ? " returned, limited" : " found"), '<div class="file-list">' + (skillRows || '<div class="empty">No skills discovered.</div>') + '</div>', false) +
      fold("MCP servers", (inventory.mcp_server_count ?? servers.length) + (inventory.mcp_servers_truncated ? " returned, limited" : " found"), '<div class="file-list">' + (serverRows || '<div class="empty">No MCP server names discovered.</div>') + '</div>', false) +
      '</div></article>';
  }

  function renderCodexSessions(data) {
    const error = data?.error ?? {};
    if (data?.ok === false) {
      return '<article class="card">' +
        header(data, pill(error.code || "error", "bad")) +
        '<div class="body"><div class="empty">' +
        esc(error.message || "Session index unavailable.") +
        '</div></div></article>';
    }

    const index = codexSessionsResultData(data);
    const sessions = Array.isArray(index.sessions) ? index.sessions : [];
    const rows = sessions.slice(0, 12).map((session) => {
      const id = truncate(session?.session_id || "session", 48);
      const title = truncate(session?.title || "(untitled)", 140);
      const project = truncate(session?.project_dir || "cwd unknown", 180);
      const resume = truncate(session?.resume_command || "", 96);
      const detail = title + " — " + project + (resume ? " — " + resume : "");
      return '<div class="file-row"><span class="file-code">' +
        esc(session?.storage === "archived" ? "arc" : "run") +
        '</span><span class="file-name" title="' + esc(id) + '">' +
        esc(detail) + '</span></div>';
    }).join("");
    const limited = index.output_limited === true;
    const pills = [
      pill((index.session_count ?? sessions.length) + " returned", "info"),
      pill((index.total_found ?? 0) + " matched"),
      limited ? pill("limited", "warn") : pill("complete", "good")
    ].join("");

    return '<article class="card">' + header(data, pills) +
      '<div class="body">' +
      '<div class="summary">' +
      summaryItem("Scanned", index.scanned_file_count ?? 0) +
      summaryItem("Indexed", index.indexed_session_count ?? 0) +
      summaryItem("Excluded", index.excluded_file_count ?? 0) +
      '</div>' +
      '<div class="file-list">' +
      (rows || '<div class="empty">No matching Codex sessions.</div>') +
      '</div>' +
      (sessions.length > 12
        ? '<div class="empty">' + esc(sessions.length - 12) + ' more sessions remain in structured data.</div>'
        : "") +
      '</div></article>';
  }

  function renderReadCodexSession(data) {
    const error = data?.error ?? {};
    if (data?.ok === false) {
      return '<article class="card">' +
        header(data, pill(error.code || "error", "bad")) +
        '<div class="body"><div class="empty">' +
        esc(error.message || "Transcript unavailable.") +
        '</div></div></article>';
    }

    const transcript = readCodexSessionResultData(data);
    const session = transcript.session ?? {};
    const messages = Array.isArray(transcript.messages) ? transcript.messages : [];
    const previews = messages.slice(0, 8).map((message) => {
      const label = (message?.ordinal ?? "-") + ". " +
        (message?.role || "unknown") + " / " +
        (message?.kind || "message");
      const content = truncate(message?.content || "", 600);
      return codebox(label, esc(content), message?.truncated ? "warn" : "");
    }).join("");
    const limited = transcript.output_limited === true;
    const pills = [
      pill((transcript.message_count ?? messages.length) + " messages", "info"),
      pill((transcript.content_bytes ?? 0) + " bytes"),
      limited ? pill("limited", "warn") : pill("complete", "good")
    ].join("");

    return '<article class="card">' + header(data, pills) +
      '<div class="body">' +
      '<div class="summary">' +
      summaryItem("Session", truncate(session.session_id || "-", 48)) +
      summaryItem("Title", truncate(session.title || "(untitled)", 100)) +
      summaryItem("Selection", transcript.selection || "-") +
      '</div>' +
      (previews || '<div class="empty">No readable transcript messages.</div>') +
      (messages.length > 8
        ? '<div class="empty">' + esc(messages.length - 8) + ' more messages remain in structured data.</div>'
        : "") +
      '</div></article>';
  }

  function renderLoadSkill(data) {
    const error = data?.error ?? {};
    if (data?.ok === false) {
      return '<article class="card">' +
        header(data, pill(error.code || "error", "bad")) +
        '<div class="body"><div class="empty">' +
        esc(error.message || "Skill unavailable.") +
        '</div></div></article>';
    }

    const skillData = loadSkillResultData(data);
    const skill = skillData?.skill ?? {};
    const pills = [
      pill(shortSource(skill.source), "info"),
      pill((skillData.returned_bytes ?? 0) + " returned bytes"),
      skillData.truncated ? pill("partial", "warn") : pill("complete", "good"),
      skillData.redacted ? pill("redacted", "warn") : ""
    ].join("");

    return '<article class="card">' +
      header(data, pills) +
      '<div class="body">' +
      '<div class="metrics">' +
      metric("skill", skill.name || "-") +
      metric("source", skill.source || "-") +
      metric("path", skill.path || "-") +
      '</div>' +
      codebox(
        "SKILL.md",
        esc(previewLines(skillData.text, 80)),
        ""
      ) +
      '</div></article>';
  }

  function renderWorkspaces(data) {
    const error = data?.error ?? {};
    if (data?.ok === false) {
      return '<article class="card">' +
        header(data, pill(error.code || "error", "bad")) +
        '<div class="body"><div class="empty">' +
        esc(error.message || "Workspace list unavailable.") +
        '</div></div></article>';
    }

    const listed = listWorkspacesResultData(data);
    const spaces = Array.isArray(listed.workspaces) ? listed.workspaces : [];
    const rows = spaces.map((workspace) =>
      '<div class="file-row"><span class="file-code">ws</span><span class="file-name">' + esc((workspace?.id || "workspace") + " — " + (workspace?.root || "")) + '</span></div>'
    ).join("");
    return '<article class="card">' + header(data, pill((listed.count ?? spaces.length) + " open", "info")) +
      '<div class="body"><div class="file-list">' + (rows || '<div class="empty">No workspaces opened yet.</div>') + '</div></div></article>';
  }

  function renderServerConfig(data) {
    const config = data?.data ?? {};
    const blocked = Array.isArray(config.blockedGlobs) ? config.blockedGlobs : [];
    const allowed = Array.isArray(config.allowedRoots) ? config.allowedRoots : [];
    const bashSession = config.bashSessionId || config.bash_session_id || "";
    const bashSessionRequired = Boolean(config.requireBashSession || config.require_bash_session);
    const enforcement = config.enforcement ?? {};
    const missingCapabilities = Array.isArray(enforcement.missingCapabilities) ? enforcement.missingCapabilities : [];
    const policyRows = [
      '<div class="file-row"><span class="file-code">mode</span><span class="file-name">' + esc(config.policyEngineMode || "legacy") + '</span></div>',
      '<div class="file-row"><span class="file-code">rev</span><span class="file-name">' + esc(config.policyRevision || "inactive") + '</span></div>',
      '<div class="file-row"><span class="file-code">hard</span><span class="file-name">' + esc(config.hardPolicyRevision || "-") + '</span></div>',
      '<div class="file-row"><span class="file-code">backend</span><span class="file-name">' + esc((enforcement.backendId || "-") + " / " + (enforcement.evidenceRevision || "-")) + '</span></div>',
      '<div class="file-row"><span class="file-code">limits</span><span class="file-name">' + esc(missingCapabilities.length ? missingCapabilities.join(", ") : "none reported") + '</span></div>'
    ].join("");
    const rootRows = [
      '<div class="file-row"><span class="file-code">root</span><span class="file-name">' + esc(config.defaultRoot || "-") + '</span></div>',
      '<div class="file-row"><span class="file-code">url</span><span class="file-name">' + esc((config.host || "127.0.0.1") + ":" + (config.port || "-")) + '</span></div>',
      '<div class="file-row"><span class="file-code">ui</span><span class="file-name">' + esc(config.widgetDomain || "-") + '</span></div>',
      bashSession ? '<div class="file-row"><span class="file-code">bash</span><span class="file-name">' + esc("session " + bashSession + (bashSessionRequired ? " required" : "")) + '</span></div>' : ""
    ].join("");
    const allowedRows = allowed.map((root) =>
      '<div class="file-row"><span class="file-code">allow</span><span class="file-name">' + esc(root) + '</span></div>'
    ).join("");
    const blockedRows = blocked.slice(0, 24).map((pattern) =>
      '<div class="file-row"><span class="file-code">block</span><span class="file-name">' + esc(pattern) + '</span></div>'
    ).join("");
    const limits = [
      summaryItem("Read", config.maxReadBytes ?? "-"),
      summaryItem("Write", config.maxWriteBytes ?? "-"),
      summaryItem("Output", config.maxOutputBytes ?? "-")
    ].join("");
    return '<article class="card">' + header(data, [
      pill("tools " + (config.toolMode || "-"), "info"),
      pill("bash " + (config.bashMode || "-")),
      pill("policy " + (config.policyEngineMode || "legacy"), config.policyEngineMode === "enforce" ? "good" : config.policyEngineMode === "shadow" ? "warn" : "info"),
      bashSession ? pill("session " + bashSession, bashSessionRequired ? "warn" : "info") : "",
      pill(config.authEnabled ? "auth on" : "auth off", config.authEnabled ? "good" : "warn")
    ].join("")) + '<div class="body">' +
      '<div class="summary">' +
      summaryItem("Write", config.writeMode || "-") +
      summaryItem("Bash", config.bashMode || "-") +
      summaryItem("Session", bashSession ? bashSession + (bashSessionRequired ? " required" : "") : "-") +
      summaryItem("Tools", config.toolMode || "-") +
      summaryItem("Policy", config.policyEngineMode || "legacy") +
      summaryItem("Profile", config.permissionProfileId || "compat-v1") +
      '</div>' +
      '<div class="section-label">Runtime</div><div class="file-list">' + rootRows + '</div>' +
      fold("Policy", (config.policyEngineMode || "legacy") + " / " + (enforcement.active ? "active" : "inactive"), '<div class="file-list">' + policyRows + '</div>', false) +
      fold("Allowed roots", allowed.length + " roots", '<div class="file-list">' + (allowedRows || '<div class="empty">No roots configured.</div>') + '</div>', false) +
      fold("Limits", "", '<div class="summary">' + limits + '</div>', false) +
      fold("Blocked paths", blocked.length + " patterns", '<div class="file-list">' + (blockedRows || '<div class="empty">No blocked globs configured.</div>') + '</div>', false) +
      fold("Raw config", "", codebox("config", esc(truncate(JSON.stringify(config || {}, null, 2), 8000)), ""), false) +
      '</div></article>';
  }

  function renderStatus(data) {
    const statusData = data?.data ?? {};
    const error = data?.error ?? {};

    if (data?.ok === false) {
      return '<article class="card">' +
        header(data, pill(error.code || "error", "bad")) +
        '<div class="body"><div class="empty">' +
        esc(error.message || "Git status unavailable.") +
        '</div></div></article>';
    }

    const files = Array.isArray(statusData.changed_files)
      ? statusData.changed_files
      : [];
    const rows = files.slice(0, 14).map((line) => {
      const status = String(line).slice(0, 2).trim() || "?";
      const name = String(line).slice(2).trim() || String(line);
      return '<div class="file-row"><span class="file-code">' +
        esc(status) +
        '</span><span class="file-name">' +
        esc(name) +
        '</span></div>';
    }).join("");
    const state = rows || '<div class="empty">Working tree clean.</div>';
    const changed = Boolean(statusData.changed);

    return '<article class="card">' +
      header(data, pill(changed ? files.length + " changed" : "clean", changed ? "info" : "good")) +
      '<div class="body"><div class="file-list">' + state + '</div>' +
      fold(
        "Raw status",
        countLines(statusData.status) + " lines",
        codebox("git status", esc(previewLines(statusData.status, 40)), ""),
        false
      ) +
      '</div></article>';
  }

  function renderTextSummary(data, label) {
    const files = Array.isArray(data.files) ? data.files : Array.isArray(data.ai_context_files) ? data.ai_context_files : [];
    const preview = data.preview || data.text || data.status || "";
    const rows = files.slice(0, 14).map((file) =>
      '<div class="file-row"><span class="file-code">file</span><span class="file-name">' + esc(file) + '</span></div>'
    ).join("");
    return '<article class="card">' + header(data, pill(files.length + " files", "info")) +
      '<div class="body">' +
      (rows ? '<div class="file-list">' + rows + '</div>' : '<div class="empty">No files listed.</div>') +
      fold(label || "Preview", countLines(preview) + " lines", codebox(label || "preview", esc(previewLines(preview, 40)), ""), false) +
      '</div></article>';
  }

  function renderReadHandoff(data) {
    const handoff = readHandoffResultData(data);
    const error = data?.error ?? {};
    if (data?.ok === false) {
      return '<article class="card">' +
        header(data, pill(error.code || "error", "bad")) +
        '<div class="body"><div class="empty">' +
        esc(error.message || "Handoff context unavailable.") +
        '</div></div></article>';
    }

    const artifacts = Array.isArray(handoff.artifacts) ? handoff.artifacts : [];
    const unavailable = Array.isArray(handoff.unavailable) ? handoff.unavailable : [];
    const legacyFiles = !artifacts.length && Array.isArray(handoff.files) ? handoff.files : [];
    const readableCount = handoff.file_count ?? (artifacts.length || legacyFiles.length);
    const pills = [
      pill(readableCount + " readable", "info"),
      unavailable.length ? pill(unavailable.length + " unavailable", "warn") : pill("complete", "good"),
      handoff.output_limited ? pill("limited", "warn") : "",
      handoff.redacted ? pill("redacted", "warn") : ""
    ].join("");
    const unavailableRows = unavailable.map((item) =>
      '<div class="file-row"><span class="file-code">' + esc(item?.reason || "unavailable") + '</span><span class="file-name">' + esc(item?.path || "artifact") + '</span></div>'
    ).join("");
    const legacyRows = legacyFiles.map((file) =>
      '<div class="file-row"><span class="file-code">file</span><span class="file-name">' + esc(file) + '</span></div>'
    ).join("");
    const artifactSections = artifacts.map((artifact) =>
      fold(
        artifact?.path || artifact?.kind || "artifact",
        (artifact?.line_count ?? countLines(artifact?.text)) + " lines",
        codebox(
          artifact?.kind || "handoff",
          esc(truncate(previewLines(artifact.text, 20), 4000)),
          ""
        ),
        false
      )
    ).join("");
    const legacyPreview = !artifacts.length && handoff.preview
      ? fold("Handoff", countLines(handoff.preview) + " lines", codebox("handoff", esc(truncate(previewLines(handoff.preview, 20), 4000)), ""), false)
      : "";
    const empty = !artifacts.length && !legacyFiles.length
      ? '<div class="empty">' + esc(handoff.context_exists === false ? "No handoff context exists yet." : "No readable handoff artifacts.") + '</div>'
      : "";

    return '<article class="card">' + header(data, pills) + '<div class="body">' +
      '<div class="summary">' +
      summaryItem("Readable", readableCount) +
      summaryItem("Unavailable", handoff.unavailable_count ?? unavailable.length) +
      summaryItem("Bytes", (handoff.loaded_bytes ?? 0) + "/" + (handoff.max_total_bytes ?? "-")) +
      '</div>' +
      (unavailableRows ? '<div class="section-label">Unavailable</div><div class="file-list">' + unavailableRows + '</div>' : "") +
      (legacyRows ? '<div class="file-list">' + legacyRows + '</div>' : "") +
      artifactSections + legacyPreview + empty +
      '</div></article>';
  }

  function renderWaitForHandoff(data) {
    const wait = waitForHandoffResultData(data);
    const error = data?.error ?? {};
    if (data?.ok === false) {
      return '<article class="card">' +
        header(data, pill(error.code || "error", "bad")) +
        '<div class="body"><div class="empty">' +
        esc(error.message || "Handoff wait unavailable.") +
        '</div></div></article>';
    }

    const nestedArtifacts = Array.isArray(wait.artifacts) ? wait.artifacts : [];
    const legacyArtifacts = nestedArtifacts.length ? [] : [
      wait.status_excerpt ? { path: wait.status_file || "agent-status.md", kind: "status", text: wait.status_excerpt } : null,
      wait.diff_excerpt ? { path: wait.diff_file || "implementation-diff.patch", kind: "diff", text: wait.diff_excerpt } : null,
      wait.log_excerpt ? { path: wait.log_file || "execution-log.jsonl", kind: "log", text: wait.log_excerpt } : null,
      wait.tests_excerpt ? { path: wait.tests_file || "loop-tests.txt", kind: "tests", text: wait.tests_excerpt } : null
    ].filter(Boolean);
    const artifacts = nestedArtifacts.length ? nestedArtifacts : legacyArtifacts;
    const unavailable = Array.isArray(wait.unavailable) ? wait.unavailable : [];
    const state = wait.state || wait.run_state || "unknown";
    const terminal = wait.awaited_terminal === true;
    const pills = [
      pill(state, terminal ? (wait.succeeded ? "good" : "warn") : "info"),
      terminal ? pill("terminal", "good") : pill("deadline", "warn"),
      wait.output_limited ? pill("limited", "warn") : "",
      wait.redacted ? pill("redacted", "warn") : ""
    ].join("");
    const unavailableRows = unavailable.map((item) =>
      '<div class="file-row"><span class="file-code">' + esc(item?.reason || "unavailable") + '</span><span class="file-name">' + esc(item?.path || "artifact") + '</span></div>'
    ).join("");
    const artifactSections = artifacts.map((artifact) =>
      fold(
        artifact?.path || artifact?.kind || "artifact",
        (artifact?.line_count ?? countLines(artifact?.text)) + " lines",
        codebox(
          artifact?.kind || "handoff",
          esc(truncate(previewLines(artifact.text, 20), 4000)),
          ""
        ),
        false
      )
    ).join("");
    const empty = !artifacts.length
      ? '<div class="empty">' + esc(terminal ? "No readable handoff result artifacts." : "No matching terminal result yet.") + '</div>'
      : "";

    return '<article class="card">' + header(data, pills) + '<div class="body">' +
      '<div class="summary">' +
      summaryItem("State", state) +
      summaryItem("Iteration", wait.run?.iteration ?? wait.iteration ?? "-") +
      summaryItem("Bytes", (wait.returned_bytes ?? 0) + "/" + (wait.max_total_bytes ?? "-")) +
      '</div>' +
      (unavailableRows ? '<div class="section-label">Unavailable</div><div class="file-list">' + unavailableRows + '</div>' : "") +
      artifactSections + empty +
      '</div></article>';
  }

  function renderCodexContext(data) {
    const context = codexContextResultData(data);
    const error = data?.error ?? {};
    if (data?.ok === false) {
      return '<article class="card">' +
        header(data, pill(error.code || "error", "bad")) +
        '<div class="body"><div class="empty">' +
        esc(error.message || "Codex context unavailable.") +
        '</div></div></article>';
    }

    const agents = Array.isArray(context.agents_files) ? context.agents_files : [];
    const bridge = Array.isArray(context.ai_context_files) ? context.ai_context_files : [];
    const unavailable = Array.isArray(context.unavailable_sources) ? context.unavailable_sources : [];
    const preview = typeof context.preview === "string" ? context.preview : "";
    const pills = [
      pill(agents.length + " AGENTS", "info"),
      pill(bridge.length + " bridge"),
      unavailable.length ? pill(unavailable.length + " unavailable", "warn") : pill("sources ready", "good"),
      context.output_limited ? pill("limited", "warn") : "",
      context.redacted ? pill("redacted", "warn") : ""
    ].join("");
    const agentRows = agents.slice(0, 14).map((file) =>
      '<div class="file-row"><span class="file-code">agent</span><span class="file-name">' + esc(file) + '</span></div>'
    ).join("");
    const bridgeRows = bridge.slice(0, 14).map((file) =>
      '<div class="file-row"><span class="file-code">bridge</span><span class="file-name">' + esc(file) + '</span></div>'
    ).join("");
    const unavailableRows = unavailable.slice(0, 20).map((item) =>
      '<div class="file-row"><span class="file-code">' + esc(item?.reason || "unavailable") + '</span><span class="file-name">' + esc(item?.path || "source") + '</span></div>'
    ).join("");

    return '<article class="card">' + header(data, pills) + '<div class="body">' +
      '<div class="summary">' +
      summaryItem("Target", context.target_path || ".") +
      summaryItem("Kind", context.target_kind || "-") +
      summaryItem("Bytes", (context.context_bytes ?? "-") + "/" + (context.max_total_bytes ?? "-")) +
      '</div>' +
      (agentRows ? '<div class="section-label">AGENTS chain</div><div class="file-list">' + agentRows + '</div>' : "") +
      (bridgeRows ? '<div class="section-label">AI bridge</div><div class="file-list">' + bridgeRows + '</div>' : "") +
      (unavailableRows ? '<div class="section-label">Unavailable</div><div class="file-list">' + unavailableRows + '</div>' : "") +
      (!agentRows && !bridgeRows && !unavailableRows ? '<div class="empty">No context source files were listed.</div>' : "") +
      fold("Context preview", countLines(preview) + " lines", codebox("context", esc(truncate(previewLines(preview, 40), 9000)), ""), false) +
      '</div></article>';
  }

  function renderExportProContext(data) {
    const context = exportProContextResultData(data);
    const error = data?.error ?? {};
    if (data?.ok === false) {
      return '<article class="card">' +
        header(data, pill(error.code || "error", "bad")) +
        '<div class="body"><div class="empty">' +
        esc(error.message || "Pro context export unavailable.") +
        '</div></div></article>';
    }

    const included = Array.isArray(context.files_included) ? context.files_included : [];
    const skipped = Array.isArray(context.files_skipped) ? context.files_skipped : [];
    const created = Array.isArray(context.created_context_files) ? context.created_context_files : [];
    const bridge = Array.isArray(context.ai_context_files) ? context.ai_context_files : [];
    const unavailable = Array.isArray(context.ai_context_unavailable) ? context.ai_context_unavailable : [];
    const pills = [
      pill(included.length + " included", "info"),
      skipped.length ? pill(skipped.length + " skipped", "warn") : pill("no skips", "good"),
      context.existed ? pill("replaced") : pill("created", "good"),
      context.output_limited ? pill("limited", "warn") : "",
      context.redacted ? pill("redacted", "warn") : ""
    ].join("");
    const includedRows = included.slice(0, 14).map((file) =>
      '<div class="file-row"><span class="file-code">file</span><span class="file-name">' + esc(file) + '</span></div>'
    ).join("");
    const skippedRows = skipped.slice(0, 20).map((item) =>
      '<div class="file-row"><span class="file-code">' + esc(item?.reason || "skipped") + '</span><span class="file-name">' + esc(item?.path || "candidate") + '</span></div>'
    ).join("");
    const createdRows = created.slice(0, 14).map((file) =>
      '<div class="file-row"><span class="file-code">created</span><span class="file-name">' + esc(file) + '</span></div>'
    ).join("");
    const bridgeRows = bridge.slice(0, 14).map((file) =>
      '<div class="file-row"><span class="file-code">bridge</span><span class="file-name">' + esc(file) + '</span></div>'
    ).join("");
    const unavailableRows = unavailable.slice(0, 20).map((file) =>
      '<div class="file-row"><span class="file-code">unavailable</span><span class="file-name">' + esc(file) + '</span></div>'
    ).join("");

    return '<article class="card">' + header(data, pills) + '<div class="body">' +
      '<div class="summary">' +
      summaryItem("Path", context.path || "-") +
      summaryItem("Bytes", (context.bytes ?? "-") + "/" + (context.max_total_bytes ?? "-")) +
      summaryItem("SHA-256", context.sha256 ? String(context.sha256).slice(0, 12) : "-") +
      '</div>' +
      (includedRows ? '<div class="section-label">Included files</div><div class="file-list">' + includedRows + '</div>' : "") +
      (skippedRows ? '<div class="section-label">Skipped candidates</div><div class="file-list">' + skippedRows + '</div>' : "") +
      (bridgeRows ? '<div class="section-label">AI bridge</div><div class="file-list">' + bridgeRows + '</div>' : "") +
      (unavailableRows ? '<div class="section-label">Unavailable AI bridge</div><div class="file-list">' + unavailableRows + '</div>' : "") +
      (createdRows ? '<div class="section-label">Created scaffold</div><div class="file-list">' + createdRows + '</div>' : "") +
      (!includedRows && !skippedRows && !bridgeRows && !unavailableRows && !createdRows
        ? '<div class="empty">No export details were listed.</div>'
        : "") +
      '</div></article>';
  }

  function renderTree(data) {
    const tree = data?.data ?? {};
    const error = data?.error ?? {};

    if (data?.ok === false) {
      return '<article class="card">' +
        header(data, pill(error.code || "error", "bad")) +
        '<div class="body"><div class="empty">' +
        esc(error.message || "File tree unavailable.") +
        '</div></div></article>';
    }

    const entries = Number.isFinite(tree.entries) ? tree.entries : 0;
    const truncated = tree.truncated === true;
    const text = typeof tree.text === "string" ? tree.text : "";
    const pills = [
      pill(entries + " entries", "info"),
      truncated ? pill("truncated", "warn") : pill("complete", "good")
    ].join("");

    return '<article class="card">' +
      header(data, pills) +
      '<div class="body">' +
      '<div class="metrics">' + metric("root", tree.root || "-") + '</div>' +
      fold(
        "Tree",
        countLines(text) + " lines",
        codebox("tree", esc(previewLines(text, 40)), ""),
        false
      ) +
      '</div></article>';
  }

  function renderRead(data) {
    const file = data?.data ?? {};
    const error = data?.error ?? {};

    if (data?.ok === false) {
      return '<article class="card">' +
        header(data, pill(error.code || "error", "bad")) +
        '<div class="body"><div class="empty">' +
        esc(error.message || "File unavailable.") +
        '</div></div></article>';
    }

    const text = typeof file.text === "string" ? file.text : "";
    const bytes = Number.isFinite(file.bytes) ? file.bytes : 0;
    const startLine = Number.isFinite(file.startLine) ? file.startLine : "-";
    const endLine = Number.isFinite(file.endLine) ? file.endLine : "-";
    const totalLines = Number.isFinite(file.totalLines) ? file.totalLines : "-";
    const truncated = file.truncated === true;
    const pills = [
      pill(bytes + " bytes", "info"),
      pill(startLine + "-" + endLine + " of " + totalLines + " lines"),
      truncated ? pill("partial", "warn") : pill("complete", "good")
    ].join("");

    return '<article class="card">' +
      header(data, pills) +
      '<div class="body">' +
      codebox(
        basename(file.path || "file"),
        esc(previewLines(text, 80)),
        ""
      ) +
      '</div></article>';
  }

  function renderCodexPro(data) {
    const result = data?.data ?? {};
    const error = data?.error ?? {};
    if (data?.ok === false) {
      return '<article class="card">' +
        header(data, pill(error.code || "error", "bad")) +
        '<div class="body"><div class="empty">' +
        esc(error.message || "CodexPro action unavailable.") +
        '</div></div></article>';
    }

    const actions = Array.isArray(result.actions)
      ? result.actions.filter((action) => typeof action === "string").slice(0, 40)
      : [];
    const actionCount = Number.isFinite(result.action_count)
      ? result.action_count
      : actions.length;
    return '<article class="card">' +
      header(data, pill(actionCount + " actions", "info")) +
      '<div class="body">' +
      '<div class="metrics">' + metric("action_count", actionCount) + '</div>' +
      codebox("available actions", esc(actions.join("\n")), "") +
      '</div></article>';
  }

  function renderGeneric(data) {
    const keys = Object.keys(data || {}).filter((key) => !key.startsWith("codexpro_"));
    const metrics = keys.slice(0, 3).map((key) => metric(key, typeof data[key] === "object" ? JSON.stringify(data[key]) : data[key])).join("");
    return '<article class="card">' + header(data, pill("structured", "info")) +
      '<div class="body">' + (metrics ? '<div class="metrics">' + metrics + '</div>' : '') +
      codebox("structured output", esc(truncate(JSON.stringify(data || {}, null, 2))), "") +
      '</div></article>';
  }

  function isPlaceholderPayload(data) {
    if (!data || typeof data !== "object") return true;
    const keys = Object.keys(data);
    return !keys.length || (keys.length === 1 && data.codexpro_tool === "codexpro");
  }

  function renderPending() {
    root.innerHTML = [
      '<article class="card pending">',
      '<div class="rail"></div>',
      '<header class="head">',
      '<span class="glyph">C</span>',
      '<div class="headline"><div class="title">CodexPro</div><div class="subtitle">Waiting for tool result...</div></div>',
      '<span class="pill info">waiting</span>',
      '</header>',
      '<div class="skeleton"><span></span><span></span><span></span></div>',
      '</article>'
    ].join("");
  }

  function render(data) {
    if (isPlaceholderPayload(data)) {
      renderPending();
      return;
    }
    const tool = data.codexpro_tool;
    if (data?.codexpro_tool === "codexpro") {
      root.innerHTML = renderCodexPro(data);
    } else if (tool === "server_config") {
      root.innerHTML = renderServerConfig(data);
    } else if (tool === "codexpro_self_test") {
      root.innerHTML = renderSelfTest(data);
    } else if (tool === "codexpro_inventory") {
      root.innerHTML = renderInventory(data);
    } else if (tool === "codex_sessions") {
      root.innerHTML = renderCodexSessions(data);
    } else if (tool === "read_codex_session") {
      root.innerHTML = renderReadCodexSession(data);
    } else if (tool === "load_skill") {
      root.innerHTML = renderLoadSkill(data);
    } else if (tool === "list_workspaces") {
      root.innerHTML = renderWorkspaces(data);
    } else if (tool === "open_current_workspace" || tool === "open_workspace" || tool === "workspace_snapshot") {
      root.innerHTML = renderWorkspace(data);
    } else if (tool === "tree") {
      root.innerHTML = renderTree(data);
    } else if (tool === "read") {
      root.innerHTML = renderRead(data);
    } else if (tool === "inspect_workspace") {
      root.innerHTML = renderWorkspaceAnalysis(data);
    } else if (tool === "git_status") {
      root.innerHTML = renderStatus(data);
    } else if (tool === "show_changes") {
      const review = data?.data ?? {};
      root.innerHTML = review.analysis ? renderChangeAnalysis(data) : renderChanges(data);
    } else if (tool === "handoff_to_agent") {
      root.innerHTML = renderHandoff(data);
    } else if (tool === "handoff_to_codex") {
      root.innerHTML = renderHandoff(data);
    } else if (tool === "git_diff") {
      root.innerHTML = renderGitDiff(data);
    } else if (tool === "write") {
      root.innerHTML = renderWrite(data);
    } else if (tool === "edit") {
      root.innerHTML = renderEdit(data);
    } else if (tool === "apply_patch") {
      root.innerHTML = renderApplyPatch(data);
    } else if (tool === "export_pro_context") {
      root.innerHTML = renderExportProContext(data);
    } else if (tool === "bash") {
      root.innerHTML = renderBash(data);
    } else if (tool === "search") {
      const search = data?.data ?? {};
      root.innerHTML = search.analysis ? renderStructuredSearch(data) : renderSearch(data);
    } else if (tool === "read_handoff") {
      root.innerHTML = renderReadHandoff(data);
    } else if (tool === "wait_for_handoff") {
      root.innerHTML = renderWaitForHandoff(data);
    } else if (tool === "codex_context") {
      root.innerHTML = renderCodexContext(data);
    } else {
      root.innerHTML = renderGeneric(data);
    }
  }

  function extractStructuredContent(value) {
    if (!value || typeof value !== "object") return {};
    if (value.codexpro_tool || value.codexpro_title) return value;
    const candidates = [
      value.structuredContent,
      value.toolOutput?.structuredContent,
      value.toolOutput,
      value.toolResponseMetadata?.structuredContent,
      value.mcp_tool_result?.structuredContent,
      value.call_tool_result?.structuredContent,
      value.result?.structuredContent
    ];
    for (const candidate of candidates) {
      if (candidate && typeof candidate === "object") return candidate;
    }
    return {};
  }

  render(extractStructuredContent(window.openai?.toolOutput || window.openai?.toolResponseMetadata || {}));

  window.addEventListener("openai:set_globals", (event) => {
    render(extractStructuredContent(
      event.detail?.globals?.toolOutput ||
      event.detail?.globals?.toolResponseMetadata ||
      event.detail ||
      window.openai?.toolOutput ||
      window.openai?.toolResponseMetadata ||
      {}
    ));
  }, { passive: true });

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (!message || message.jsonrpc !== "2.0") return;
    if (message.method === "ui/notifications/tool-result") {
      render(extractStructuredContent(message.params || {}));
    }
  }, { passive: true });
</script>
`.trim();
