# Direct `codexpro_inventory` Output Schema Design

> Date: 2026-07-13  
> Phase: 1  
> Slice: 17 of 28  
> Status: Approved through the user's delegated first-principles decision authority  
> Implementation state: Not started when this design was written

## 1. Decision summary

Migrate only the direct full-mode `codexpro_inventory` tool to the established Phase 1 schema-v1 envelope.

The slice will:

- preserve its read-only purpose;
- preserve current Skill and MCP-server-name discovery;
- add exact bounded-result and truncation semantics;
- validate all provider output before it becomes public;
- expose no MCP URL, command, arguments, environment values, headers, tokens, or raw config paths;
- migrate the Tool Card and proven Stress consumers to nested `data`;
- preserve historical flat Tool Card rendering;
- preserve direct supertool wrapping;
- avoid every Phase 6 Skill trust feature.

The slice will not introduce `trust`, `version`, `permissions`, `contentHash`, `enabled`, Hook behavior, execution approval, or a new capability registry.

## 2. First-principles framing

The user goal is not “return an arbitrary object called inventory.” The goal is:

> Give ChatGPT a deterministic, bounded, non-secret description of the local capabilities it can plan around.

That requires four properties:

1. **Identity** — which workspace and runtime modes the inventory describes.
2. **Contents** — which Skill descriptors and MCP server names were safely found.
3. **Completeness** — whether a configured limit omitted additional entries.
4. **Failure boundary** — whether discovery failed or returned malformed internal data, without exposing why in unsafe detail.

It does not require loading Skill bodies, trusting scripts, testing MCP connectivity, revealing MCP configuration, or redesigning all capabilities.

## 3. Current implementation evidence

Current production flow:

```text
direct codexpro_inventory handler
  → WorkspaceManager.getWorkspace
  → codexproInventory
      → discoverSkillInventory
      → discoverMcpServers
  → flat structuredContent
```

Current behavior:

- tool is full-mode only;
- `workspace_id` is optional and falls back to the default workspace;
- global/user/plugin Skills are included by default;
- MCP server names are included by default;
- `max_skills` is bounded to `1..500` with default `120`;
- MCP server results are silently capped at `120`;
- Skill paths are displayed as `$WORKSPACE/...` or `~/...` in ordinary cases;
- MCP parsers expose only server name and a fixed source label;
- text and structured results expose current Bash/write/tool modes;
- output is flat and has no exact `outputSchema`;
- `widget_uri` is redundantly included as domain data;
- no explicit flag says whether either inventory was truncated;
- uncaught workspace/provider failures use the generic error surface.

Current proven consumers:

- Tool Card subtitle and inventory renderer;
- `codexpro_self_test`, through the internal provider result;
- protected main Smoke and HTTP Smoke identity checks;
- native Stress Skill count/selection checks;
- native Stress MCP cap and secret-leak checks;
- `codexpro` supertool `inventory` action.

## 4. Approaches considered

### 4.1 Minimal envelope around the current flat object

Wrap the current fields under `data` and add fixed failures without changing provider output.

Advantages:

- smallest diff;
- fastest local implementation.

Rejected because:

- a return count remains indistinguishable from a complete total;
- the fixed MCP cap remains invisible;
- malformed provider data is not independently testable;
- redundant `widget_uri` remains mixed into domain data;
- it fails the authoritative plan's explicit bounded-partial-result requirement.

### 4.2 Tool-local exact contract with bounded provider metadata

Add one schema module, one test-only provider boundary, explicit truncation flags, exact counts, safe fixed warnings, nested consumers, and no registry redesign.

Advantages:

- solves the actual ambiguity;
- follows all sixteen established Phase 1 slices;
- remains independently reversible;
- prepares `load_skill` without implementing its later trust model;
- keeps discovery logic local to `capabilitiesOps.ts`.

Disadvantages:

- requires a small internal discovery-result change to detect one additional item;
- requires consumer migration.

Decision: adopt this approach.

### 4.3 Build the final Capability/Skill registry now

Create manifests, trust, versions, hashes, permissions, enabled state, workspace scope, connectivity checks, and a shared provider registry.

Rejected because it begins Phase 6 inside Phase 1, expands the public contract before the Policy Kernel exists, and makes one output-schema slice depend on multiple unapproved security systems.

## 5. Scope

### 5.1 In scope

- `src/tools/schemas/codexproInventory.ts`.
- exact direct-tool `outputSchema`.
- exact sixteen-field success `data`.
- exact nested Skill and MCP item schemas.
- exact source counts and consistency validation.
- explicit effective discovery options and limits.
- explicit Skill and MCP truncation flags.
- fixed safe meta warnings derived from truncation.
- safe display path validation.
- one injected `codexproInventoryProvider` boundary.
- three fixed non-retryable failures.
- nested-first Tool Card rendering with historical flat fallback.
- direct supertool compatibility.
- Stress consumer migration.
- focused, adjacent, complete, Build, Smoke, Stress, package, diff, and secret verification.

### 5.2 Out of scope

- loading `SKILL.md` bodies;
- changing `load_skill` output;
- Skill trust or approval;
- Skill scripts;
- versions or manifests;
- content hashes;
- enabling/disabling Skills;
- MCP URL, command, arguments, environment, headers, credentials, status, health, or connectivity;
- workspace ownership, close, expiry, or identity isolation;
- Permission Profiles, Hooks, Sandbox, OAuth, or scopes;
- changes to tool modes;
- changes to `codexpro_self_test` public output;
- changes to protected `scripts/smoke.mjs` or `scripts/http-smoke.mjs` source files;
- package dependencies;
- a general `server.ts` decomposition.

## 6. Exact public success contract

### 6.1 Envelope

Success has exactly six top-level fields:

```json
{
  "codexpro_tool": "codexpro_inventory",
  "codexpro_title": "CodexPro Inventory",
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

No success field is duplicated at the top level.

### 6.2 Exact `data` fields

Success data contains exactly sixteen fields:

```json
{
  "workspace_id": "ws_0123456789abcdef01234567",
  "root": "D:\\Dev\\project",
  "bash_mode": "off",
  "write_mode": "workspace",
  "tool_mode": "full",
  "include_global_skills": false,
  "include_mcp_servers": true,
  "max_skills": 120,
  "mcp_server_limit": 120,
  "skills": [
    {
      "name": "workspace-skill",
      "description": "A bounded workspace Skill.",
      "source": "workspace",
      "path": "$WORKSPACE/.codex/skills/workspace-skill/SKILL.md"
    }
  ],
  "skill_count": 1,
  "skill_counts": {
    "total": 1,
    "workspace": 1,
    "user": 0,
    "plugin": 0,
    "other": 0
  },
  "skills_truncated": false,
  "mcp_servers": [
    {
      "name": "local-tools",
      "source": "workspace config"
    }
  ],
  "mcp_server_count": 1,
  "mcp_servers_truncated": false
}
```

`widget_uri` is not domain data and is removed. Tool UI resource selection already belongs to descriptor `_meta`.

### 6.3 Runtime modes

The handler supplies modes from the active validated server configuration, never from the provider:

```text
bash_mode:  off | safe | full
write_mode: off | handoff | workspace
tool_mode:  minimal | standard | full
```

The direct tool remains full-mode only, so successful direct calls normally return `tool_mode: full`. The schema retains all current enum values because injected/provider-independent construction must remain compatible with the configuration type and supertool testing.

### 6.4 Effective discovery options

- `include_global_skills` is the effective boolean after applying the default `true`.
- `include_mcp_servers` is the effective boolean after applying the default `true`.
- `max_skills` is the effective integer after clamping to `1..500`; default `120`.
- `mcp_server_limit` is exactly `120` in schema version 1.

The result describes what this call requested, not only what happened to be returned.

## 7. Skill item contract

Each Skill item contains exactly:

```text
name
description
source
path
```

Rules:

- `name` is a non-empty bounded one-line string.
- `description` is a bounded one-line string or explicit `null`.
- `source` is `workspace | user | plugin | other`.
- `path` is a non-empty sanitized display identifier, not an arbitrary filesystem path.
- workspace paths start with `$WORKSPACE/`.
- user and plugin paths start with `~/`.
- other paths use `$EXTERNAL/<12-hex-fingerprint>/SKILL.md`.
- absolute paths are rejected for Skill items.
- duplicate `(source, name, path)` tuples are rejected.
- output order is source rank `workspace`, `user`, `plugin`, `other`, then name, then path.

The `$EXTERNAL` form preserves a stable exact selector for a later `load_skill` call without exposing the absolute external path.

When `include_global_skills` is false, every returned Skill must have `source: workspace`.

## 8. Skill counts and truncation

`skill_count` is the returned count, never a claim about the undiscovered total.

Consistency rules:

```text
skill_count == skills.length
skill_counts.total == skill_count
sum(workspace, user, plugin, other) == skill_count
skill_count <= max_skills
skills_truncated == true → skill_count == max_skills
```

Truncation detection reads at most one additional unique Skill beyond `max_skills`:

```text
requested max N
→ discover at most N + 1 unique records
→ return first N in deterministic order
→ skills_truncated = unique records > N
```

The provider does not scan the full machine to compute an exact total. That would defeat bounded inventory.

When `skills_truncated` is true, `meta.warnings` contains exactly:

```text
Skill inventory reached the requested max_skills limit.
```

## 9. MCP server item contract

Each MCP item contains exactly:

```text
name
source
```

Allowed source labels are exactly:

```text
user codex config
workspace config
workspace cursor config
user cursor config
```

Rules:

- name is a non-empty bounded one-line string;
- no URL, transport, command, arguments, environment, headers, token, credential, or config path is returned;
- duplicate `(source, name)` tuples are rejected;
- order is name, then source;
- `mcp_server_count == mcp_servers.length`;
- `mcp_server_count <= mcp_server_limit`;
- `mcp_servers_truncated == true` requires count `120`;
- `include_mcp_servers == false` requires an empty list, zero count, and false truncation.

The provider deduplicates and sorts all safely parsed names, retains at most `121`, returns the first `120`, and sets truncation when the extra unique item exists.

When `mcp_servers_truncated` is true, `meta.warnings` contains exactly:

```text
MCP server inventory reached the fixed 120-server limit.
```

If both inventories are truncated, warnings appear once each in Skill-then-MCP order. No other success warning is accepted in schema v1.

## 10. Provider boundary

Add a test-only dependency interface:

```ts
export interface CodexProInventoryProviderContext {
  config: CodexProConfig;
  workspace: Workspace;
  options: {
    includeGlobalSkills: boolean;
    includeMcpServers: boolean;
    maxSkills: number;
  };
}
```

`CodexProServerDependencies` gains:

```ts
codexproInventoryProvider?: (
  context: CodexProInventoryProviderContext
) => CodexProInventoryResult | Promise<CodexProInventoryResult>;
```

Production defaults to the existing `codexproInventory` domain function.

The domain result becomes:

```ts
export interface CodexProInventoryResult {
  skills: SkillInventoryItem[];
  skillsTruncated: boolean;
  mcpServers: McpServerInventoryItem[];
  mcpServersTruncated: boolean;
}
```

The provider does not supply public workspace identity, modes, options, limits, counts, warning strings, or human-readable text. The handler derives those from validated request/config state and validated provider arrays.

Provider output is parsed as `unknown` through a strict provider schema before public construction. Extra fields, invalid sources, unsafe paths, duplicates, unsorted items, malformed descriptions, or inconsistent truncation fail as `INTERNAL_ERROR`.

## 11. Human-readable text

Build text only after exact public data has been constructed.

It contains:

- workspace root and current modes;
- effective discovery options and limits;
- returned Skill source counts;
- one bounded line per Skill;
- one bounded line per MCP server name;
- explicit truncated notices when applicable.

It never uses unvalidated provider text. `textResult` continues applying final redaction.

## 12. Stable failure contract

All failures use the six-field envelope, `data: null`, empty meta warnings, `retryable: false`, and fixed messages.

### 12.1 `WORKSPACE_NOT_FOUND`

Message:

```text
The requested workspace is not open.
```

Details:

```json
{
  "source": "workspace_id",
  "workspace_id": "safe-bounded-id"
}
```

or, for the implicit default path:

```json
{
  "source": "default_workspace",
  "workspace_id": null
}
```

The error never includes the workspace root or allowed-root list.

### 12.2 `INVENTORY_DISCOVERY_FAILED`

Message:

```text
The CodexPro capability inventory could not be collected.
```

Details are exactly `{}`.

This covers provider throw/rejection after a workspace was resolved.

### 12.3 `INTERNAL_ERROR`

Message:

```text
The CodexPro capability inventory failed because of an internal error.
```

Details are exactly `{}`.

This covers malformed provider output, invalid ordering/identity-independent invariants, and failure during exact public construction.

## 13. Handler stages

The direct handler has four explicit stages:

```text
1. resolve workspace
2. compute effective options
3. execute provider
4. validate provider, construct exact data/text, return
```

Classification:

- stage 1 failure → `WORKSPACE_NOT_FOUND` when the current bounded manager prefix matches; otherwise `INTERNAL_ERROR`;
- stage 3 throw/rejection → `INVENTORY_DISCOVERY_FAILED`;
- stage 4 failure → `INTERNAL_ERROR`.

No raw exception reaches `content`, `structuredContent`, Tool Card, logs added by this slice, or failure details.

## 14. Consumer migration

### 14.1 Tool Card

Add `inventoryResultData(data)`:

- unwrap `data.data` for exact nested `codexpro_inventory` success;
- retain the historical flat object for saved/cached old results;
- render fixed error code/message when `ok === false`;
- use nested counts, modes, Skills, MCP names, and truncation flags;
- never show Skill paths or hidden MCP configuration values in the compact card;
- show a bounded “limited” indicator when either truncation flag is true.

Update `subtitleFor` to use the same nested-first result normalizer.

### 14.2 Stress

Migrate only proven flat consumer reads:

```text
inventory.structuredContent.skill_count
inventory.structuredContent.skills
inventory.structuredContent.mcp_server_count
superInventory.structuredContent.mcp_server_count
```

to their nested `data` equivalents.

Increase the existing workspace fixture from `140` to `141` Skills while requesting `max_skills: 140`, then assert `skills_truncated: true` without losing the existing `stress-skill-139` selection. Keep the existing `160` configured MCP names and assert `mcp_servers_truncated: true` without exposing fixture command/argument values.

### 14.3 Protected Smoke files

The current protected main and HTTP Smoke checks only assert direct tool identity and do not read migrated data fields. They require no source edit.

If implementation evidence finds a flat read not visible in the current audit, migrate it through the existing exact-count, fail-closed in-memory compatibility loader. Do not edit protected source merely for formatting or convenience.

### 14.4 Self-test

`codexpro_self_test` calls the internal domain function and consumes `skills.length` and `mcpServers.length`. Preserve those arrays. It may ignore the two new truncation booleans until its own Slice 27 contract is designed.

### 14.5 Supertool

The `codexpro` action `inventory` continues invoking the registered direct handler. It may add established wrapper identity fields, but must preserve `ok`, `data`, `error`, and `meta` without reintroducing flat inventory data.

The generic `codexpro` public schema remains Slice 28.

## 15. Security rules

1. Inventory remains read-only and `openWorldHint: false`.
2. Discovery stays bounded to the current workspace Skill roots, approved user/plugin roots, and four fixed MCP config candidates.
3. Workspace Skill realpaths must remain under the workspace.
4. Public Skill selectors never expose an absolute path outside the workspace/home display forms.
5. MCP output contains names and fixed source categories only.
6. No raw config text is retained in the result.
7. No provider diagnostics are public.
8. `redactStructured` remains a final defense, not the primary data boundary.
9. `include_global_skills=false` is enforced against provider output, not trusted as provider behavior.
10. This slice does not grant permission to execute a Skill or contact an MCP server.

## 16. Focused test design

Create `test/codexpro-inventory-contract.test.mjs`.

### 16.1 Pure schema tests

Verify:

- exact constructors and constants exist;
- exact six-field envelope;
- exact sixteen-field data object;
- exact four-field Skill item and two-field MCP item;
- null description normalization;
- exact empty and populated results;
- exact warnings for neither, one, or both truncation flags;
- all three exact failures;
- rejection of flat fields and all extra fields;
- rejection of invalid modes, limits, counts, paths, sources, ordering, duplicates, inconsistent flags, unknown warnings, unsafe error details, and invalid success/failure combinations.

### 16.2 Descriptor and mode tests

Verify:

- tool absent from minimal and standard;
- tool present in full;
- input schema remains compatible;
- full descriptor advertises the exact output schema.

### 16.3 Real discovery tests

Use a temporary workspace with more Skills than a low `max_skills` value:

- only workspace Skills when globals are disabled;
- deterministic first N items;
- `skills_truncated: true`;
- exact returned/source counts;
- fixed warning;
- safe `$WORKSPACE` paths;
- no Skill body in structured output.

### 16.4 Provider tests

Inject:

- deterministic populated success;
- empty success;
- both truncation flags;
- throw and rejected promise;
- invalid workspace-independent data;
- duplicate/unsorted items;
- absolute Skill path;
- forbidden MCP source;
- extra diagnostic fields containing private paths/secrets.

Verify fixed classification and absence of diagnostics.

### 16.5 Request consistency tests

Verify:

- effective defaults are returned;
- explicit false include flags are returned and enforced;
- `max_skills` is returned after validation/clamping semantics;
- no MCP provider items survive when inclusion is false;
- no global source survives when global inclusion is false.

### 16.6 Consumer tests

Verify:

- Tool Card nested success;
- Tool Card nested failure;
- Tool Card flat fallback;
- subtitle nested counts;
- direct supertool preserves nested fields;
- Stress source uses nested reads;
- protected main/HTTP Smoke source files remain unchanged unless an exact compatibility need is proven.

## 17. Verification matrix

Narrow to broad:

```powershell
node --test test/codexpro-inventory-contract.test.mjs
node --test test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs test/workspace-snapshot-contract.test.mjs test/inspect-workspace-contract.test.mjs
npm run build
node scripts/analysis-smoke.mjs
node scripts/analysis-cli-smoke.mjs
node scripts/http-smoke-compat.mjs
node scripts/smoke-platform-compat.mjs
node scripts/stress.mjs
node --test test/*.test.mjs
npm pack --dry-run
git diff --check
```

Also run a targeted secret-pattern scan and intended-files-only audit.

Tests that execute repository code run with the current Windows user permissions; this slice does not change that fact.

## 18. Files expected to change

Create:

- `src/tools/schemas/codexproInventory.ts`
- `test/codexpro-inventory-contract.test.mjs`
- `docs/superpowers/plans/2026-07-13-codexpro-inventory-output-schema.md`

Modify:

- `src/capabilitiesOps.ts`
- `src/server.ts`
- `src/toolCardWidget.ts`
- `scripts/stress.mjs`
- `AGENTS.md`
- `Memory.md`
- active Phase 1 archive volume(s)
- `docs/CODEXPRO_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md` only for current status after completion

Protected `scripts/smoke.mjs` and `scripts/http-smoke.mjs` should remain byte-for-byte unchanged unless a proven current consumer forces an exact compatibility-layer update.

## 19. Acceptance criteria

```text
[ ] direct codexpro_inventory remains full-mode read-only
[ ] descriptor advertises its exact output schema
[ ] success has exactly six top-level and sixteen data fields
[ ] Skill and MCP items are exact, bounded, ordered, unique, and sanitized
[ ] returned counts and per-source counts are mathematically consistent
[ ] both caps have explicit truncation semantics and fixed warnings
[ ] include flags are echoed and enforced
[ ] no MCP configuration value beyond name/source category is exposed
[ ] no external absolute Skill path is exposed
[ ] all three stable failures are exact and redacted
[ ] Tool Card is nested-first with historical flat fallback
[ ] Stress and supertool consumers use/preserve nested data
[ ] protected Smoke sources remain unchanged unless exact migration is proven
[ ] focused, adjacent, complete, Build, Smoke, Stress, package, diff, and secret gates pass
[ ] no Phase 2/6 behavior or dependency is introduced
[ ] Memory and Phase 1 archive record exact evidence, limits, rollback, and next action
```

## 20. Risks and rollback

### 20.1 Discovery-limit behavior

Detecting truncation requires probing one additional unique item. The probe remains bounded and must not become a complete-machine count.

### 20.2 External Skill selectors

Replacing an absolute `other` path with `$EXTERNAL/<fingerprint>/SKILL.md` changes only the public selector. `loadSkill` must continue matching the sanitized selector to its private `absPath` after re-discovery. Focused tests must prove this before publication.

### 20.3 Tool Card compatibility

Historical flat results must still render. New code must not flatten current results merely to preserve old cards.

### 20.4 Protected consumer drift

If current protected sources differ from the audited exact strings, stop and update only a fail-closed compatibility loader in the same change.

### 20.5 Rollback

Use a normal revert of the Slice 17 implementation. Restore the direct flat handler and old consumers together; do not reset history, weaken secret/path protections, delete user Skills/configs, or alter credentials/profiles. Preserve this design and append archival corrections rather than rewriting published history.
