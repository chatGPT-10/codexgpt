# Phase 6 Project Guidance and Skills Usability Design

**Status:** closed at `31631676fe254962a9a4f14d6e025e3edba82b8d`; exact-head run `30033293444` passed Repository policy and Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package
**Date:** 2026-07-22
**Supersedes:** the former Phase 6 Hook/trust-manifest outline in the master plan
**Scope:** make repository guidance and Agent Skills work predictably from ChatGPT while retaining the project's existing authorization boundary
**Compatibility baseline:** closed Phases 1–5, exact Tool Contracts V1=28/V2=31/V3=39/V4=51, per-server `WorkspaceManager`, PathGuard, Policy/Approval/Audit, bounded output, and the supported `scripts/codexgpt-entry.mjs` public entry

## 1. Decision

Phase 6 is a usability and interoperability phase, not another security kernel.

The completed normal flow is:

```text
open_current_workspace
  -> returns the selected root AGENTS text and a bounded root Skill catalog
  -> ChatGPT searches/reads until the actual target is known
  -> codex_context(target_path) returns the exact root-to-target AGENTS chain
     and the Skill catalog applicable to the same target
  -> ChatGPT loads at most the relevant Skill with load_skill
  -> ChatGPT performs the requested action through an existing typed tool
  -> existing workspace, path, Policy, Approval, execution, and Audit rules decide it
  -> ChatGPT verifies the result
```

Phase 6 makes these final choices:

1. **No Tool Contract V5.** The existing `codex_context` becomes visible in the `standard` projection; no new public tool and no tool-per-Skill expansion are added. V1/V2/V3/V4 remain exact 28/31/39/51.
2. **Root guidance is actually delivered at open.** Reporting only an `AGENTS.md` path is not usable because the default ChatGPT tool profile cannot infer its body.
3. **Target guidance and target Skills share one call.** Once a file or directory is known, `codex_context(target_path)` returns both the applicable instruction chain and bounded Skill metadata. This closes the nested-workspace workflow instead of leaving an internal provider with no public caller.
4. **Progressive disclosure stays intact.** Skill metadata is automatic and budgeted; `SKILL.md` bodies and referenced resources are lazy.
5. **Agent Skills interoperability uses standard fields, not a CodexGPT trust manifest.** `name` and `description` identify a Skill. Version, content hashes, persistent trust, and permission manifests are not prerequisites for reading Markdown.
6. **No generic executable Hook runner.** Hooks do not help the first successful AGENTS/Skill path and would add an unrelated execution lifecycle. Existing Phase 5 Git integrations remain unchanged.
7. **Standard security means ordinary product boundaries.** Reads are canonical, bounded, race-resistant, blocked-secret aware, and redacted. Instructions cannot grant authority. There is no signature ceremony or per-file approval prompt.

### Why and user impact

| Decision | Why | User impact |
| --- | --- | --- |
| Return root AGENTS text during open | A path is not guidance | ChatGPT sees repository rules on the first normal call |
| Put `codex_context` in `standard` | Nested rules must be reachable before edits | Directory-specific rules work without switching to `full` |
| Return target Skills from `codex_context` | Open calls have no target path | Monorepo/module Skills become discoverable when they matter |
| Limit the initial Skill catalog to 8,000 characters | Hundreds of descriptions can crowd out code context | Startup stays fast and useful on large Skill libraries |
| Keep bodies/resources lazy | Most Skills are irrelevant to a given task | Less latency and less prompt noise |
| Use one audited YAML parser | Agent Skills frontmatter is YAML, not a custom line format | Valid cross-client Skills work instead of failing on ordinary YAML |
| Do not auto-run scripts or Hooks | Text and executable authority are different facts | Repositories cannot gain process access merely by containing a Skill |
| Keep user/plugin Skills opt-in | A remote workspace open should not upload unrelated personal workflows | Personal Skill names and contents stay private unless requested |

## 2. Required user experience

### 2.1 First successful path

With a standard profile and no Phase 6-specific setup, the user can say only what they want changed. The system must:

1. open the authorized workspace and return the complete selected root guidance, if present;
2. return a compact catalog of applicable root Skills without their bodies;
3. let ChatGPT identify the target through normal search/read tools;
4. require `codex_context(target_path)` before the first mutation and again after switching to another subtree;
5. return the root-to-target guidance chain plus target-scoped Skill catalog;
6. load a matching implicit Skill once, or an explicitly named Skill even when implicit invocation is disabled;
7. execute and verify through existing tools without Skill-derived permission.

No wizard question, profile migration, trust prompt, manual inventory call, or `full` tool profile is required. A pre-Phase-6 ChatGPT connection may cache its old tool list; the upgrade path first uses the already stable `codexgpt` supertool action for context, and otherwise gives one explicit reconnect action instead of pretending the cached schema refreshed.

### 2.2 Actionable degradation

Optional guidance must not prevent the project from opening. If an instruction or Skill is malformed, oversized, collided, or unreadable:

- the workspace open remains successful when the authorized workspace itself is valid;
- the result returns a safe status, count, first affected sanitized path, and one next action;
- the broken higher-precedence instruction is not silently replaced by a lower-precedence file;
- malformed Skills are excluded from implicit catalog matching but do not hide valid later Skills;
- the user is not sent to a write/Bash probe merely to diagnose Markdown.

## 3. Scope

### 3.1 In scope

- One selected instruction file per directory from workspace root to target.
- Configurable, bounded fallback instruction filenames after `AGENTS.override.md` and `AGENTS.md`.
- A combined instruction budget distinct from the existing per-file budget.
- One canonical same-handle bounded text reader for AGENTS, `SKILL.md`, and text resources.
- Root guidance and root Skill catalog in workspace-open results.
- `codex_context` in the standard projection with guidance-first defaults.
- Target-scoped `.agents/skills` discovery from target directory to workspace root.
- One-cycle compatibility for current workspace, user, and plugin Skill locations.
- Agent Skills frontmatter parsing with compatibility diagnostics.
- Minimal `agents/openai.yaml` invocation-policy and dependency-summary support.
- Bounded Skill catalog disclosure, duplicate selection, body loading, resource listing, and individual text-resource loading.
- Read-only guidance diagnostics in open, self-test, and doctor.
- Sanitized source/path fingerprints in structured results and local operational diagnostics for global/plugin/resource reads; persistent Audit records the tool invocation but does not claim file-level provenance in Phase 6.
- Same-binary rollback through `CODEXGPT_GUIDANCE_MODE=legacy` for one migration cycle.

### 3.2 Non-goals

- Generic pre/post tool Hooks or `.codex/hooks.json` support.
- Automatic execution of Skill scripts, package installers, setup commands, or dependencies.
- Automatic installation or connection of dependencies declared by `agents/openai.yaml`.
- A `run_skill` tool, dynamic tool registration, or one public tool per Skill.
- Persistent Skill trust approvals, signatures, hashes, enabled-state databases, marketplaces, or package management.
- Treating `allowed-tools` as permission.
- User-global AGENTS discovery through the remote bridge.
- Arbitrary filesystem scanning or caller-selected absolute Skill roots.
- Phase 7 semantic providers, Phase 8 OAuth, Phase 9 subagents, production deployment, or credential migration.

## 4. Migration and compatibility contract

### 4.1 One activation flag

```text
CODEXGPT_GUIDANCE_MODE=legacy
CODEXGPT_GUIDANCE_MODE=standard
```

Implementation sequencing is deliberate:

- before Phase 6 runtime work, omitted mode remains `legacy`;
- an explicit incomplete `standard` build reports `GUIDANCE_STANDARD_NOT_READY` and never pretends to be legacy;
- after the first vertical slice, explicit `standard` may report `preview` while remaining non-default; unfinished target paths return `GUIDANCE_STANDARD_NOT_READY` rather than borrowing known-inexact legacy semantics;
- only after Gates G6-R/G6-M/G6-I/G6-K/G6-U pass does omitted mode flip to `standard`;
- `legacy` retains the exact old successful request/result branches for one migration cycle.

No second migration flag and no persisted profile-schema requirement is introduced.

### 4.2 Public tool compatibility

- Tool Contracts remain V1=28, V2=31, V3=39, V4=51.
- Legacy projections and legacy successful structured results remain exact.
- Standard mode intentionally adds the existing read-only `codex_context` tool to the `standard` profile; it does not add a tool to any version inventory.
- New fields use strict mode-discriminated result branches. Existing legacy branches are not made nullable or widened to carry unrelated data.
- Direct tools, `codexgpt` supertool dispatch, STDIO, and HTTP use the same normalized inputs and strict outputs.

## 5. Canonical bounded text reader

All new Phase 6 reads use one shared primitive before guidance behavior changes.

### 5.1 Contract

The reader accepts an authorized discovery root, a normalized relative path, per-file bytes, content kind, and blocked-path policy. It must:

1. resolve and validate the root and parent chain with native Windows-aware canonicalization;
2. apply blocked path rules before opening;
3. open the final file once and use that same handle for `fstat`, bounded read, UTF-8/text validation, and source-byte accounting;
4. require `fstat().nlink === 1` for automatically disclosed AGENTS, Skill metadata/body, companion metadata, and resources; a hardlinked alias cannot prove that every name of the same file stays inside the authorized/blocked-path boundary;
5. capture stable filesystem identity and re-resolve the canonical target/parent after the read;
6. reject if identity, file type, boundary, link count, or canonical parent changes before return;
7. close the handle on every result;
8. return only sanitized relative provenance and a stable failure reason.

If a platform cannot prove the required identity for a raced case, it fails with `READ_IDENTITY_CHANGED`; it does not reopen by pathname and hope.

### 5.2 Security and usability boundary

- A symlinked/junction Skill is accepted only when its final target remains inside the authorized workspace or the exact configured user/plugin discovery root.
- An escaped link is rejected.
- A multi-link file is rejected with `READ_HARDLINK_UNSAFE`; deterministic Windows/Ubuntu fixtures cover an external or blocked file hardlinked to an apparently safe AGENTS/Skill/resource name.
- Held-file, sharing-violation, replacement, deletion, and parent-junction races have deterministic barrier tests rather than timing-only stress tests.
- Redaction happens after the reader has already rejected blocked secret paths. Redaction is not DLP and is never used to justify reading `.env`, private keys, `.ssh`, or other blocked targets.

## 6. Project instruction contract

### 6.1 Boundary and target

The opened workspace root is the upper project-guidance boundary. CodexGPT does not silently read user-global instructions or parents above it.

For a requested target:

- directory: include that directory;
- regular file: include its parent;
- missing future path: use the nearest existing guarded in-workspace parent;
- foreign, closed, expired, transport-stale, or policy-stale workspace: fail through the existing opaque lifecycle boundary.

### 6.2 One file per directory

For each directory from root to target, select the first non-empty candidate in this order:

```text
AGENTS.override.md
AGENTS.md
<configured fallback 1>
<configured fallback 2>
...
```

Defaults preserve current compatibility:

```text
agents.md
.agents.md
```

Fallback configuration is optional, ordered, and bounded to eight safe basenames. Reject separators, device names, surrounding/trailing dots or spaces, control characters, and case-fold duplicates.

Selection rules:

1. At most one file per directory enters the chain.
2. Empty/whitespace-only candidates continue to the next name in that directory.
3. A non-regular, binary, blocked, unreadable, collided, raced, or over-per-file-limit higher-precedence candidate produces a diagnostic and stops selection for that directory; it never silently falls through.
4. Files are returned root-to-target, so closer guidance appears later.
5. Windows case collisions fail actionably; Ubuntu case-distinct exact names remain deterministic.
6. Workspace-open and `codex_context` call the same discovery module, not parallel implementations.

### 6.3 Budgets and wire semantics

- Existing `max_agent_bytes` keeps its exact meaning: maximum bytes per selected instruction file, default 60,000.
- New `max_instruction_total_bytes` is the combined selected-instruction cap, default 32,768 and hard maximum 200,000.
- Existing `max_total_bytes` remains the complete `codex_context` output cap.
- A selected file is returned complete or not returned; no partial file is labeled complete.
- When the next file exceeds the combined cap, return the already loaded root-to-target prefix plus an `INSTRUCTION_TOTAL_BUDGET_EXCEEDED` diagnostic.
- Standard success results have a strict `instruction_diagnostics` branch rather than forcing partial success into a whole-call failure or the legacy `unavailable_sources` enum.

### 6.4 Root and target delivery

In standard mode:

- `open_current_workspace` and `open_workspace` include the selected root guidance body, provenance, exact byte/redaction state, completeness, and first safe diagnostic;
- `codex_context` is available in the standard profile;
- `codex_context` defaults `include_ai_bridge=false`, `include_git=false`, and `include_diff=false` in the standard profile, while explicit inputs remain authoritative;
- legacy/full defaults remain unchanged;
- server instructions require `codex_context(target_path)` after the target is known and before the first mutation, and require a reload after crossing into another subtree.

Instruction text affects model behavior only. It never enters the Policy Kernel's authorization facts.

## 7. Skill contract

### 7.1 Discovery locations

Standard workspace discovery for a target scans direct child Skill directories at:

```text
<target-dir>/.agents/skills/*/SKILL.md
<parent>/.agents/skills/*/SKILL.md
...
<workspace-root>/.agents/skills/*/SKILL.md
```

Compatibility locations retained for one migration cycle:

```text
<workspace-root>/.codex/skills/**/SKILL.md
<workspace-root>/skills/**/SKILL.md
<configured-codex-dir>/skills/**/SKILL.md          # explicit global only
<user-home>/.agents/skills/*/SKILL.md              # explicit global only
<configured-codex-dir>/plugins/cache/**/SKILL.md   # explicit global only
```

The configured `config.codexDir` is authoritative; implementation must not silently substitute `os.homedir()/.codex` when the user selected another Codex home.

Workspace discovery remains within the workspace. User/plugin discovery remains within the exact source root that produced the entry. `other` sources require an already configured discovery root; the remote caller cannot submit a new absolute root.

### 7.2 Scan semantics

Displayed entries and scanned candidates use separate bounds:

- existing `max_skills` remains the maximum returned entries in compatibility surfaces;
- new `max_skill_candidates` bounds filesystem candidates independently;
- standard results report `candidate_count`, `valid_count`, `invalid_count`, `scan_complete`, and `scan_truncated`;
- invalid candidates do not consume the returned-entry allowance;
- a truncated scan cannot resolve a name-only selector;
- an exact sanitized path selector is resolved directly and revalidated without depending on a full scan;
- standard selectors are reversible only inside already configured roots: `$WORKSPACE/<relative>`, `$USER_SKILLS/<relative>`, `$CODEX_DIR/<relative>`, `$PLUGIN_ROOT/<configured-root-id>/<relative>`, or `$SOURCE_ROOT/<configured-root-id>/<relative>`;
- root IDs are server-created opaque handles mapped only to registered discovery roots. Legacy `$EXTERNAL/<hash>/SKILL.md` selectors remain legacy-only and are never claimed to support direct resolution after a truncated scan.

This prevents a directory full of invalid early entries from hiding a valid later Skill while falsely reporting a complete scan.

### 7.3 YAML and validation profile

Phase 6 uses one audited direct YAML dependency, added only after explicit implementation/dependency approval. It is configured for bounded, non-executing parsing: metadata bytes are capped, aliases and custom tags are disabled, nesting and scalar sizes are bounded, and parsed values pass strict Zod schemas.

`SKILL.md` accepts one UTF-8 BOM before the opening frontmatter delimiter. Core fields are:

- required: `name`, `description`;
- optional: `license`, `compatibility`, string-to-string `metadata`, `allowed-tools`;
- `allowed-tools` is parsed only as informational text and never changes authorization.

Compatibility policy follows the Agent Skills client guidance:

- missing/empty description or fully unparseable YAML: skip and diagnose;
- missing/unsafe name: skip and diagnose;
- safe name that violates the 64-character, lowercase, or directory-match convention: warn and load;
- optional-field type/size problems: omit that field, warn, and keep a usable core Skill;
- legacy locations may use the existing bounded line extractor for `name`/`description` as a one-cycle fallback, clearly marked `legacy_parse`; standard `.agents/skills` never guesses after completely invalid YAML.

All auto-disclosed metadata is sanitized once and reused for structured and human text. `name`, `description`, `compatibility`, and diagnostic text are bounded, one-line/control-safe, and passed through secret-looking-text redaction. Arbitrary `metadata` and dependency URLs are not automatically disclosed.

### 7.4 Optional OpenAI companion metadata

When present, bounded `agents/openai.yaml` supports only:

- `policy.allow_implicit_invocation`;
- a bounded summary that tool dependencies were declared.

It does not install, connect, or authorize a dependency. Catalog records distinguish:

```text
loadable: true|false
implicit_invocation: true|false
requirements_state: none|declared_unverified
implicit_eligible: true|false
spec_compliant: true|false
```

Phase 6 does not verify or install declared dependencies, so `implicit_eligible = implicit_invocation && requirements_state == none`. A Skill with `allow_implicit_invocation: false` or declared-unverified dependencies is omitted from the model-driven catalog but remains loadable after an explicit user mention, with the requirement warning returned. Explicit inventory/diagnostics may list it; the automatic matching catalog does not create a false `ready` path.

### 7.5 Initial catalog budget

The standard auto catalog has a default `max_skill_catalog_chars=8000`, bounded to 1,000–32,000. The exact serialized structured/human catalog uses the same character accounting.

Deterministic budget order:

1. sanitize and sort entries;
2. include fixed identity/status fields;
3. shorten descriptions fairly, never below the minimum matching prefix while an entry remains;
4. omit the deterministic tail if the catalog still does not fit;
5. report `descriptions_shortened`, `catalog_omitted_count`, and `catalog_complete=false` with one action.

`SKILL.md` bodies are unaffected by the catalog budget and remain loadable by exact selector.

### 7.6 Ordering and duplicates

Sort catalog entries by:

1. source class: workspace, user, plugin, other;
2. workspace target proximity: closest first;
3. name;
4. sanitized path.

Same-name Skills are never merged. A unique name can load directly. Ambiguous names require exact source/path. Standard public identities use the reversible allowlist-bound selectors in Section 7.2; legacy keeps its historical `~/...` and `$EXTERNAL/<fingerprint>/...` forms. Canonical home paths never leave the server.

### 7.7 Target binding and activation

- Root workspace-open returns root-applicable metadata only.
- `codex_context(target_path)` returns metadata for the same target.
- `load_skill` gains optional `target_path`, defaulting to `.`; it must match the catalog scope used for name resolution.
- Exact path loads bypass incomplete inventory scans but still revalidate source, target scope, boundary, blocked policy, and file identity.
- Bare-name `load_skill` in standard mode searches workspace only.
- Explicit `include_global_skills=true`, explicit `source=user|plugin|other`, or an exact sanitized global path counts as global opt-in.
- Explicit user mention wins. Otherwise ChatGPT may load one catalogued Skill only when `implicit_eligible=true` and the task matches its description.
- `load_skill` remains stateless and idempotent and always returns the requested body. “Load once per task” is a model/server-instruction behavior checked by the live gate, not server-side conversation deduplication; MCP does not provide a reliable ChatGPT conversation identity.

### 7.8 Resources

An ordinary `load_skill` result remains the exact legacy-compatible body branch. An explicit `include_resource_index=true` may return a separate standard branch with a bounded, path-only index from `references/`, `scripts/`, and `assets/`; it never reads or executes those entries. The omitted/default request never appends fields to the body branch.

Optional `resource_path` loads one text resource beneath the resolved Skill root:

1. normalize Windows `\` to `/`, collapse repeated separators and leading `./`;
2. reject absolute, drive, UNC/device, ADS, control, empty-after-normalization, or escaping `..` selectors;
3. apply the existing blocked secret-file policy to both normalized selector and final canonical relative path;
4. use the canonical same-handle reader;
5. return a distinct strict resource branch with sanitized provenance and exact byte/redaction state.

Positive cases include ordinary Windows separator input and in-root symlinked resources. Negative cases include `.env`, `.env.*`, private key/PEM files, `.ssh`, escaped links, binary/device files, races, and oversized content.

Script text may be inspected. Nothing in discovery, loading, resource listing, shebangs, executable bits, `allowed-tools`, or companion metadata runs it. Execution requires a separate existing process tool call and all its ordinary policy/audit behavior.

## 8. Global privacy matrix

Standard-mode omitted defaults are explicit and consistent:

| Surface | Workspace Skills | User/plugin/other Skills |
| --- | --- | --- |
| `open_current_workspace` / `open_workspace` | included | excluded |
| `workspace_snapshot` | existing behavior plus workspace metadata if requested | excluded |
| `codex_context` | included for target | excluded |
| `codexgpt_inventory` | included | excluded unless `include_global_skills=true` |
| `codexgpt_self_test` guidance-only branch | included | excluded unless explicit |
| `load_skill` bare name | included | excluded |
| `load_skill` explicit global source/path/flag | included | included |

Legacy mode retains existing omitted defaults exactly. The standard branch is the privacy correction; it is not backported invisibly into legacy behavior.

## 9. Diagnostics and audit

### 9.1 Standard diagnostic shape

Open/context/inventory results expose bounded status, not raw internals:

```text
status: ok|warning|unavailable
code
sanitized_path|null
count
action
```

Required codes include:

- `INSTRUCTION_NAME_COLLISION`
- `INSTRUCTION_FILE_TOO_LARGE`
- `INSTRUCTION_TOTAL_BUDGET_EXCEEDED`
- `INSTRUCTION_READ_IDENTITY_CHANGED`
- `INSTRUCTION_HARDLINK_UNSAFE`
- `SKILL_METADATA_INVALID`
- `SKILL_METADATA_COMPATIBILITY_WARNING`
- `SKILL_SCAN_TRUNCATED`
- `SKILL_CATALOG_TRUNCATED`
- `SKILL_RESOURCE_BLOCKED`
- `SKILL_RESOURCE_BOUNDARY_VIOLATION`
- `SKILL_RESOURCE_NOT_TEXT`
- `SKILL_RESOURCE_READ_IDENTITY_CHANGED`
- `SKILL_RESOURCE_HARDLINK_UNSAFE`

Only the first safe diagnostic is placed in the concise open text; structured content retains bounded counts/details. `codexgpt_self_test` gains a guidance-only/read-only branch that sets write and Bash probes off. Doctor can show the detailed list locally.

### 9.2 Enforcement and audit truth

Phase 6 does not claim that the Policy Kernel currently models every context file as a first-class resource. The truthful boundary is:

- provider/path guards authorize and validate AGENTS/Skill/resource reads;
- registered wrappers retain normal authentication, workspace lifecycle, output, and audit handling;
- structured results and local redacted operational diagnostics may include sanitized source class/path fingerprints;
- persistent Audit records the `load_skill`/inventory/context tool invocation and result only; its current schema does not record the resolved context-file path, and Phase 6 does not overload unrelated fields or redesign the audit store;
- any later mutation/process/Git operation is evaluated independently through existing Policy/Approval/Audit.

## 10. Hooks decision

The former roadmap grouped Hooks with guidance. That is rejected for this Phase 6 goal.

A generic Hook runner adds command identity, ordering, recursion, cancellation, timeout, failure policy, environment, process-tree cleanup, and mutation-after-failure questions. None is required to make AGENTS or Skills usable. Phase 6 therefore adds no Hook configuration, runner, event API, trust hash, or auto-execution path.

If a later concrete user workflow requires Hooks, it receives a separate design and authorization gate. It must not be smuggled into Skill loading.

## 11. Gates and acceptance

| Gate | Blocks | Evidence |
| --- | --- | --- |
| G6-0 | runtime edits | authoritative scope synced; current base exact-head green; implementation and YAML dependency approved; no same-kind runner active |
| G6-C | all standard integration | exact V1–V4 counts, legacy requests/results/projections frozen, one rollback flag, strict mode branches |
| G6-R | all guidance content reads | same-handle identity/boundary reader and deterministic Windows/Linux race tests |
| G6-M | deeper Phase 6 work | first usable root AGENTS + root catalog + existing load path works in standard preview and a real ChatGPT session |
| G6-I | target mutations | one-file-per-directory target chain, distinct per-file/combined budgets, standard `codex_context` projection |
| G6-K | Skill activation | target discovery/load binding, YAML compatibility, catalog/scan budgets, global privacy, companion policy, no execution |
| G6-U | default flip | actionable diagnostics, nested real ChatGPT sequence, latency/output bounds, all prior gates green |
| G6-A | closure tests | direct/supertool/STDIO/HTTP/profile/lifecycle/adversarial parity and no authority gain |
| G6-P | publication | managed Node 20/24 local matrix, protected Smoke, package/policy/docs/secret/diff gates, exact-head CI |

Acceptance requires all of the following:

- a standard user receives root AGENTS text on open;
- before a target mutation, ChatGPT can call `codex_context(target_path)` from the standard profile;
- the target result carries both the exact instruction chain and applicable bounded Skill metadata;
- the real model-driven sequence `open -> locate target -> context(target) -> load_skill -> action -> verify` succeeds without the prompt teaching tool arguments;
- nested live evidence binds `load_skill.target_path` to the preceding `codex_context.target_path`, selects an entry from that returned catalog, and proves the loaded body is the nested Skill rather than a root duplicate;
- switching subtrees causes context reload before the next mutation;
- an existing cached ChatGPT connection either reaches context through the stable `codexgpt` supertool action or returns one precise reconnect action; upgrade behavior is tested, not assumed;
- catalog and scan truncation remain truthful and exact-path activation still works;
- global Skill bodies/resources are unreachable by omitted standard inputs;
- AGENTS/Skill/resource path replacement cannot cross the authorized root;
- multi-link AGENTS/Skill/resource files are rejected because hardlink aliases cannot be bounded by pathname;
- blocked secret resources fail before content redaction;
- scripts, Hooks, dependencies, network, Git, and mutations execute zero times during discovery/loading;
- legacy mode retains exact old branches and standard mode is one restart away from rollback;
- no OS sandbox, DLP, or complete prompt-injection-prevention claim is added.

## 12. Adversarial review repairs

The first complete draft was reviewed independently for execution, security/compatibility, and UX. This final design incorporates the findings:

- added a pre-runtime authority/baseline gate before code changes;
- moved the default flip to the end instead of Task 6A0;
- made root AGENTS content visible and promoted existing `codex_context` to `standard`;
- closed the target Skill wire path through `codex_context(target_path)` and `load_skill(target_path)`;
- added a same-handle reader before all content features;
- separated `max_agent_bytes`, combined instruction bytes, scan candidates, returned Skills, and catalog characters;
- changed strict cosmetic Skill rejection to compatible warn/load behavior;
- added companion invocation-policy truth, global privacy across every surface, blocked-resource checks, and metadata redaction;
- added real ChatGPT model-in-loop gates and a post-implementation multi-agent review;
- corrected managed Node 20/24 ordinary execution to run the matrix inside the detached owner.

## 13. Authoritative references

- [OpenAI Codex custom instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md) for one file per directory, root-to-target order, configurable fallbacks, and the 32 KiB default combined budget.
- [OpenAI Codex Skills](https://learn.chatgpt.com/docs/build-skills) for progressive disclosure, target-to-root repository discovery, the 8,000-character fallback catalog budget, symlink support, and optional invocation policy.
- [Agent Skills specification](https://agentskills.io/specification) for core fields, optional fields, resources, and validation limits.
- [Agent Skills client implementation guide](https://agentskills.io/client-implementation/adding-skills-support) for compatibility-first validation and progressive activation.
- `AGENTS.md`, `Memory.md`, and the Phase 1–5 paired designs for existing workspace, path, Policy, Approval, Audit, execution, and Git boundaries.

## 14. Implementation handoff

The executable sequence is defined in [the paired Phase 6 TDD plan](../plans/2026-07-22-phase-6-project-guidance-and-skills.md).

This design task authorizes the Phase 6 scope correction and authoritative documentation synchronization only. Runtime implementation, adding the YAML production dependency, staging, commit, push, release, deployment, credential operations, destructive state changes, Phase 7, Phase 8, and Phase 9 require their recorded gates or new explicit authorization.
