# Direct `load_skill` Output Schema Design

> Date: 2026-07-13  
> Phase: 1, Slice 18  
> Status: approved for local TDD implementation  
> Publication: part of the unified Slice 17–28 end-of-goal batch

## 1. Decision summary

Migrate only the direct `load_skill` tool to a strict, tool-specific six-field envelope while preserving its current purpose: resolve one already-discoverable Skill and return a bounded `SKILL.md` body.

The slice will:

1. keep `load_skill` read-only and available in `standard` and `full`, but not `minimal`;
2. add a strict output schema with exact success, warning, and failure variants;
3. echo the effective selector and discovery/read limits;
4. distinguish source bytes read from UTF-8 bytes actually returned after redaction;
5. make truncation, redaction, and partial discovery explicit;
6. fail closed when bounded discovery cannot prove a name-only match is unique or absent;
7. validate injected provider output before exposing it;
8. add a bounded dedicated Tool Card renderer and migrate known consumers to nested `data`;
9. preserve protected Smoke source files through exact, fail-closed compatibility loaders;
10. leave Skill trust, permissions, versions, hashes, enabled state, scripts, Hooks, and execution to Phase 6.

## 2. First-principles framing

The tool answers one question:

> Which exact discovered Skill did CodexGPT resolve, and what bounded, safely returned instructions can the caller use?

A correct answer must prove four independent facts:

1. **Identity** — the resolved Skill matches the caller's exact name/source/path selector.
2. **Resolution completeness** — a bounded discovery scan did not silently turn “unknown” into “not found” or “one visible match” into “unique”.
3. **Content bounds** — the response states how many source bytes were read, the source size, and whether the source was truncated.
4. **Safety transformation** — if secret-looking content was redacted, the caller can see that the returned text differs from the raw decoded text.

The output schema is a protocol boundary, not a place to add the future Skill trust system.

## 3. Current implementation evidence

The current domain loader in `src/capabilitiesOps.ts`:

- rediscovers workspace/user/plugin Skills on every call;
- resolves by exact `name`, optional `source`, and optional sanitized `path`;
- caps discovery at `max_skills`, default 500 and maximum 500;
- caps body reads at `max_bytes`, default 40,000 and maximum 100,000;
- returns `skill`, `text`, `bytes`, `totalBytes`, and `truncated`;
- throws dynamic raw messages for not-found, ambiguity, boundary refusal, and filesystem failures.

The current direct handler:

- advertises no `outputSchema`;
- returns flat `workspace_id`, `root`, `skill`, byte fields, and `text`;
- has no provider seam;
- relies on generic exception conversion;
- passes output through recursive secret redaction after byte counters are calculated.

Known consumers:

- `scripts/stress.mjs` reads flat `.structuredContent.text`;
- protected `scripts/smoke.mjs` and `scripts/http-smoke.mjs` read flat Skill/text fields;
- the Tool Card subtitle reads a flat Skill and generic rendering may serialize the complete body;
- the `codexgpt` supertool wraps `load_skill` by its registered direct handler.

## 4. Approaches considered

### 4.1 Wrap the existing flat result without changing semantics

Rejected.

It would preserve three incorrect ambiguities:

- a truncated discovery scan can falsely claim “not found” or “unique”;
- `bytes` appears to describe returned text even when redaction changes it;
- post-schema Tool Card compaction can mutate a long exact result after validation.

### 4.2 Build the Phase 6 Skill registry and trust system now

Rejected.

Content hashes, versions, required permissions, trust state, enabled state, script execution, and approval belong to Phase 6. Pulling them into Slice 18 would create a second architecture before the Policy Kernel design gate.

### 4.3 Tool-local exact contract plus bounded resolver hardening

Selected.

This is the smallest change that makes the public protocol truthful:

- retain current discovery roots and limits;
- add structured domain failures only where the existing bounded resolver needs exact outcomes;
- expose effective limits and transformations;
- reject unresolved partial scans;
- keep the body loader and discovery mechanism otherwise intact.

## 5. Scope

### 5.1 In scope

- one `loadSkill` schema module;
- exact six-field public envelope;
- exact selector, Skill item, byte, truncation, redaction, and partial-resolution invariants;
- fixed warnings;
- stable redacted failure variants;
- a `loadSkillProvider` dependency seam;
- a small typed domain error for expected resolver/read outcomes;
- safe partial-discovery behavior;
- nested consumer migration;
- exact protected-Smoke compatibility substitutions;
- dedicated bounded Tool Card rendering;
- focused tests plus adjacent/full local gates.

### 5.2 Out of scope

- Skill version, origin signature, trust, permissions, content hash, or enabled state;
- loading Skill scripts, references, or assets;
- executing Skill commands;
- adding Hooks;
- changing discovery roots or depth;
- scanning more than 500 Skills;
- adding a persistent Skill registry or cache;
- Permission Profile, Approval, Policy Kernel, Sandbox, or audit-event implementation;
- changing tool visibility modes;
- changing protected Smoke source files;
- publishing before Slice 17–28 are all locally complete.

## 6. Exact public success contract

### 6.1 Envelope

```json
{
  "codexgpt_tool": "load_skill",
  "codexgpt_title": "Load Skill",
  "ok": true,
  "data": {},
  "error": null,
  "meta": {
    "schemaVersion": 1,
    "durationMs": 0,
    "warnings": []
  }
}
```

Top-level fields are exactly:

```text
codexgpt_tool
codexgpt_title
ok
data
error
meta
```

### 6.2 Exact `data` fields

```json
{
  "workspace_id": "ws_...",
  "root": "D:\\Dev\\project",
  "selector": {
    "name": "example-skill",
    "source": "workspace",
    "path": "$WORKSPACE/.codex/skills/example-skill/SKILL.md"
  },
  "skill": {
    "name": "example-skill",
    "description": "Example instructions.",
    "source": "workspace",
    "path": "$WORKSPACE/.codex/skills/example-skill/SKILL.md"
  },
  "include_global_skills": false,
  "max_skills": 500,
  "max_bytes": 40000,
  "bytes": 1234,
  "returned_bytes": 1234,
  "total_bytes": 1234,
  "truncated": false,
  "resolution_truncated": false,
  "redacted": false,
  "text": "# Example Skill\n"
}
```

The fourteen fields are exact. No flat compatibility duplicates and no `widget_uri` are allowed.

### 6.3 Selector contract

`selector` is the normalized effective request:

```ts
{
  name: string;
  source: "workspace" | "user" | "plugin" | "other" | null;
  path: string | null;
}
```

Rules:

- `name` is trimmed, non-empty, one-line, and at most 240 characters;
- a path is a sanitized selector, never a raw arbitrary filesystem path;
- `$WORKSPACE/.../SKILL.md` is the only workspace form;
- `~/.../SKILL.md` is the only user/plugin form;
- `$EXTERNAL/<12 lowercase hex>/SKILL.md` is the only `other` form;
- if `source` and `path` are both present, their forms must agree;
- the selected Skill name must equal `selector.name`;
- non-null selector source/path must equal the resolved Skill source/path.

### 6.4 Skill item contract

`skill` has exactly `name`, `description`, `source`, and `path`. `description` is always `string | null`; provider `undefined` is normalized to `null`.

The item reuses the safe source-specific selector semantics established by Slice 17. No absolute external path is public.

### 6.5 Effective option rules

- explicit `include_global_skills` wins;
- otherwise it is `false` for an explicit workspace source or `$WORKSPACE/` path;
- otherwise it is `true`, including name-only resolution;
- `max_skills` defaults to 500 and is bounded to 1–500;
- `max_bytes` defaults to 40,000 and is bounded to 1,000–100,000.

If `include_global_skills` is false, a successful Skill must have source `workspace`.

## 7. Byte, truncation, and redaction semantics

The fields deliberately describe different layers:

- `bytes`: raw source bytes successfully read before decoding/redaction;
- `returned_bytes`: `Buffer.byteLength(data.text, "utf8")` after redaction;
- `total_bytes`: source file size observed for the bounded read;
- `max_bytes`: effective raw-source read cap;
- `truncated`: exactly `total_bytes > bytes`;
- `redacted`: whether secret redaction changed the decoded body;
- `text`: the already-redacted body returned to the caller.

Invariants:

```text
0 <= bytes <= max_bytes
bytes <= total_bytes
returned_bytes == UTF-8 byte length(text)
truncated == (total_bytes > bytes)
if truncated: bytes == max_bytes
if not truncated: bytes == total_bytes
```

`bytes` is not required to equal `returned_bytes`. Redaction can change length, and replacement decoding for malformed UTF-8 can also change re-encoded length.

### 7.1 Warnings

Warnings are derived by the constructor in this exact order:

1. `Skill instructions were truncated at the effective max_bytes limit.`
2. `Secret-looking content was redacted from the returned Skill instructions.`

The first appears iff `truncated` is true. The second appears iff `redacted` is true. Failures have no warnings.

## 8. Partial discovery and resolution rules

`resolution_truncated` reports whether discovery reached `max_skills` before resolution completed.

The resolver uses these rules:

1. If at least two visible candidates match, return `SKILL_AMBIGUOUS`; further discovery cannot make ambiguity disappear.
2. If an exact path selector finds one candidate, success is valid even when discovery was truncated; set `resolution_truncated: true`.
3. If discovery was truncated and no exact path selected one candidate, return `SKILL_RESOLUTION_LIMIT_REACHED` rather than guessing not-found or uniqueness.
4. If discovery was complete and no match exists, return `SKILL_NOT_FOUND`.
5. If discovery was complete and one match exists, load it.

Success with `resolution_truncated: true` therefore requires a non-null exact selector path.

## 9. Provider boundary

Add:

```ts
export interface LoadSkillProviderContext {
  config: CodexGPTConfig;
  workspace: Workspace;
  options: {
    name: string;
    source?: SkillInventoryItem["source"];
    path?: string;
    includeGlobal: boolean;
    maxSkills: number;
    maxBytes: number;
  };
}
```

and optional dependency:

```ts
loadSkillProvider?: (
  context: LoadSkillProviderContext
) => LoadedSkill | Promise<LoadedSkill>;
```

The default provider delegates to the existing domain loader.

Provider output is strict and must prove exact Skill shape, body/counter types, exact truncation relationship, boolean `discoveryTruncated`, requested selector consistency, and workspace-only output when global discovery is disabled. Before redaction, re-encoded decoded text cannot exceed the worst-case three-byte UTF-8 replacement expansion per source byte. Malformed output becomes fixed `INTERNAL_ERROR` without diagnostics.

## 10. Stable failure contract

Every failure uses the same six-field envelope, `ok: false`, `data: null`, `isError: true`, and an exact error object.

### 10.1 `WORKSPACE_NOT_FOUND`

Message: `The requested workspace is not open.` Details distinguish explicit and default lookup without exposing a root.

### 10.2 `INVALID_SKILL_SELECTOR`

Message: `The Skill selector is invalid or unsafe.`

Details:

```ts
{
  field: "name" | "path";
  reason: "unsafe_name" | "unsafe_path" | "source_path_mismatch";
}
```

Unsafe raw input is never echoed.

### 10.3 `SKILL_NOT_FOUND`

Message: `No discovered Skill matches the requested selector.` Details contain only the safe selector, effective global flag, and `max_skills`.

### 10.4 `SKILL_AMBIGUOUS`

Message: `Multiple discovered Skills match the requested selector; provide an exact path.` Details contain the safe selector, 2–8 bounded candidate Skill items that each match every non-null selector component, `candidates_truncated`, and `resolution_truncated`.

### 10.5 `SKILL_RESOLUTION_LIMIT_REACHED`

Message: `Skill discovery reached max_skills before the selector could be resolved safely.` Details contain the safe selector, effective global flag, and `max_skills`.

### 10.6 `SKILL_BOUNDARY_VIOLATION`

Message: `The resolved Skill no longer matches its discovered filesystem boundary.` Details contain only the safe resolved Skill item.

### 10.7 `SKILL_READ_FAILED`

Message: `The resolved Skill instructions could not be read.` Details contain only the safe resolved Skill item.

### 10.8 `INTERNAL_ERROR`

Message: `The Skill loader failed because of an internal error.` Details are exactly `{}`.

All Slice 18 failures are initially non-retryable. No raw exception, absolute private path, credential, or provider diagnostic is public.

## 11. Handler stages

The handler has four explicit stages:

1. validate and normalize the selector/effective options;
2. resolve the workspace;
3. call the provider and map typed expected failures;
4. validate provider output, redact the body, construct exact data, and render bounded human text.

Each stage returns its own exact failure. A broad final catch maps only unexpected construction/validation failures to `INTERNAL_ERROR`.

## 12. Structured-content preservation

`tagToolResult` currently compacts strings over 30,000 characters when a Tool Card is enabled. That post-construction mutation can invalidate `returned_bytes`, truncation metadata, and the advertised schema.

Slice 18 adds one explicit internal Tool Card metadata flag for `load_skill` so its already bounded 100,000-byte structured body is not compacted after schema construction. The dedicated Tool Card renderer itself previews only a bounded number of lines.

This change does not remove global secret redaction and does not change other tool compaction behavior.

## 13. Human-readable content

Success content includes Skill identity, sanitized selector path, raw source byte progress, returned byte count, truncation/redaction indicators, and the already-redacted body.

Failure content includes fixed code/message plus safe action guidance. For protected legacy Smoke compatibility, safe human text may retain `Multiple skills named <safe-name>` and `Skill not found: <safe-name>` while the structured message remains fixed.

## 14. Consumer migration

### 14.1 Tool Card

- use nested `data` first with historical flat fallback only in the renderer;
- render failure code/message without raw details;
- preview at most 80 body lines;
- show source, byte state, redaction, and truncation pills;
- never serialize the complete exact envelope in the generic renderer.

### 14.2 Stress

Migrate every `load_skill` read to `structuredContent.data?.text` and add exact metadata assertions.

### 14.3 Protected Smoke files

Do not edit `scripts/smoke.mjs` or `scripts/http-smoke.mjs`. Extend their compatibility loaders with exact-count replacements for known flat Skill/text reads. Source drift fails closed.

### 14.4 Supertool

Calling `codexgpt` with `action: "load_skill"` preserves the child exact envelope and adds only existing wrapper tags. It never flattens `data`.

## 15. Security rules

- Never accept an arbitrary filesystem path.
- Only exact sanitized selectors produced by discovery are valid.
- `$EXTERNAL` is an identifier, not an authorization grant.
- Rediscovery and exact private-record matching remain mandatory.
- Revalidate a workspace Skill with native realpath immediately before reading.
- Read the revalidated native target, not a stale symlink path.
- Keep recursive secret redaction enabled and make transformations visible.
- Never echo unsafe input, raw provider errors, or absolute outside paths.
- Do not claim Skill trust, permission, sandboxing, or integrity verification.

## 16. Focused test design

The focused suite covers:

1. exact success constructor and fourteen data fields;
2. truncation/redaction warning derivation;
3. every exact failure variant;
4. strict malformed/inconsistent/flat/additional-field rejection;
5. standard/full visibility, minimal absence, and advertised `outputSchema`;
6. real workspace loading, empty file, truncation, and redaction;
7. effective options and provider request observation;
8. provider mismatch/malformed/secret failure handling;
9. workspace not found, not-found, ambiguity, and resolution limit;
10. exact-path success during truncated discovery;
11. workspace boundary race classification where supported;
12. Tool Card nested-first bounded rendering and enabled long-body schema preservation;
13. supertool preservation;
14. Stress and protected compatibility-loader migration.

## 17. Verification matrix

```text
node --test test/load-skill-contract.test.mjs
node --test test/codexgpt-inventory-contract.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs test/workspace-snapshot-contract.test.mjs
npm run build
node --test test/*.test.mjs
npm run smoke
npm run stress
npm pack --dry-run
git diff --check
protected-source diff check
secret-looking-content scan
intended-files-only audit
neat-freak project reconciliation
```

No staging, commit, push, or exact-head CI runs in this slice.

## 18. Expected files

Production/test:

- `src/tools/schemas/loadSkill.ts`
- `src/capabilitiesOps.ts`
- `src/server.ts`
- `src/toolCardWidget.ts`
- `scripts/stress.mjs`
- `scripts/smoke-platform-compat.mjs`
- `scripts/http-smoke-compat.mjs`
- `test/load-skill-contract.test.mjs`

Durable records:

- `AGENTS.md`
- `Memory.md`
- `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- active Phase 1 archive volume
- this design and the matching implementation plan

Protected files expected unchanged: `scripts/smoke.mjs` and `scripts/http-smoke.mjs`.

## 19. Acceptance criteria

- exact schema parses every real success and expected failure;
- no flat compatibility fields remain in current output;
- partial discovery never produces an unsafe uniqueness/not-found claim;
- `returned_bytes` exactly describes returned redacted text;
- warnings exactly describe truncation/redaction;
- long Tool Card-enabled output remains schema-valid;
- no arbitrary or absolute external path is accepted/exposed;
- Tool Card and Stress use nested data;
- protected Smoke sources remain unchanged and compatibility substitutions fail closed;
- supertool preserves the child envelope;
- all focused, adjacent, full, Build, Smoke, Stress, package, diff, scope, secret, and neat-freak gates pass;
- no Phase 2 or Phase 6 behavior is introduced;
- no publication action occurs before Slice 28 completion.

## 20. Risks and rollback

Name-only resolution can now fail with `SKILL_RESOLUTION_LIMIT_REACHED` where the old tool guessed. This is an intentional fail-closed change. Exact path selection remains available for visible inventory entries.

The typed domain failure stays tool-local and must not become a generic policy system. The structured body remains bounded at 100,000 raw bytes; the dedicated renderer keeps visual output bounded. Exact compatibility-loader replacements deliberately fail if protected source drifts.

Before unified publication, rollback uses a reviewed normal reverse patch limited to Slice 18 files plus an append-only correction. Never use destructive reset, remove user Skills, weaken redaction, or relax workspace boundaries. After unified publication, use a normal Git revert of the batch and preserve archive history.
