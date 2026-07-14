# `codexpro` Supertool Output Schema Design

> Date: 2026-07-14  
> Phase: 1, Slice 28  
> Status: Implemented locally and verified; unpublished  
> Scope: `codexpro` supertool only

## 1. Purpose

Migrate the final Phase 1 advertised tool, `codexpro`, to an exact schema-v1 contract without giving the wrapper any authority that the registered direct tools do not already possess.

The wrapper exists for connector-cache and custom-client compatibility. It is not a permission layer, a policy engine, or a second implementation of any child tool.

## 2. First-principles model

A request has three independent facts:

1. the requested public action, which may be a canonical tool name or a fixed alias;
2. the canonical registered direct tool selected by that action;
3. the exact child result produced by the registered handler.

The wrapper must preserve those facts instead of flattening or reinterpreting them.

The effective registered direct-tool map is the only authority for availability. `list_actions`, canonical dispatch, alias dispatch, `tools/list`, `server_config`, and self-test must not rely on divergent permission lists.

## 3. Inventory findings

### 3.1 Input

The public input remains:

```text
{
  action: string,
  args?: object
}
```

No new public argument is added.

### 3.2 Existing result forms

The legacy wrapper currently has two result forms:

- `list_actions` returns a flat `{ actions }` object;
- child dispatch returns the child structured result with `codexpro_super_action` and `wrapped_tool` added at the same level.

The current child wrapping is intentionally transparent to human `content` and MCP `isError`, but it has no exact advertised wrapper schema.

### 3.3 Fixed aliases

The existing alias set is preserved and no alias is added in this slice:

```text
open           -> open_current_workspace
snapshot       -> workspace_snapshot
changes        -> show_changes
inventory      -> codexpro_inventory
handoff_poll   -> wait_for_handoff
pro_export     -> export_pro_context
agent_handoff  -> handoff_to_agent
codex_handoff  -> handoff_to_codex
```

Canonical registered tool names remain callable directly through `action`.

### 3.4 Consumers

Maintained consumers are:

- `scripts/smoke.mjs`, through exact fail-closed in-memory compatibility substitution;
- `scripts/stress.mjs`;
- direct child contract tests that assert supertool preservation;
- the shared Tool Card renderer;
- documentation describing `list_actions` and mode gates.

Protected `scripts/smoke.mjs` and `scripts/http-smoke.mjs` remain byte-for-byte unchanged.

## 4. Approaches considered

### Approach A — Outer wrapper envelope with `data.result`

This is structurally pure but breaks every existing supertool consumer and creates two competing `ok`/`error` layers. It requires a versioned protocol migration rather than a final Phase 1 slice.

### Approach B — Wide generic wrapper schema

This is small but cannot prove that the wrapped payload is the selected child's exact schema. It does not satisfy Phase 1's exact-contract goal.

### Approach C — Closed discriminated union with transparent child preservation

`list_actions` and wrapper-owned failures use the ordinary six-field `codexpro` envelope. Child dispatch uses a closed union of exact child shapes plus the two wrapper identity fields. The child result, `content`, and `isError` remain semantically unchanged.

**Decision: Approach C.**

## 5. Scope boundaries

### 5.1 Included

- one tool-owned schema module;
- an exact `list_actions` success envelope;
- fixed wrapper-owned routing failures;
- one closed canonical-tool and alias map;
- exact child-envelope validation before returning a wrapped result;
- preservation of child `content`, `isError`, `ok`, `data`, `error`, and `meta`;
- exact mode/config gating through the real registered handler map;
- dedicated Tool Card handling for wrapper-owned results;
- protected-Smoke compatibility migration;
- native-Windows Stress migration;
- Phase 1 documentation and memory reconciliation.

### 5.2 Excluded

- new tools or aliases;
- child-domain refactors;
- Permission Profiles, approvals, or the Policy Kernel;
- workspace ownership or expiry;
- PowerShell backend, PTY, process persistence, or OS sandboxing;
- authentication, Cloudflare, or OAuth changes;
- staging, committing, pushing, publication, or exact-head CI before the complete local batch gate.

## 6. Public contract

### 6.1 Wrapper-owned envelope

`list_actions` success and wrapper-owned failures use exactly:

```text
codexpro_tool
codexpro_title
ok
data
error
meta
```

Constants:

```text
codexpro_tool  = "codexpro"
codexpro_title = "CodexPro"
meta.schemaVersion = 1
```

### 6.2 `list_actions` data

The exact success data is:

```text
{
  actions: string[],
  action_count: integer >= 0
}
```

Invariants:

- actions are unique;
- actions are sorted by code-point order;
- actions do not contain `codexpro` or `list_actions`;
- actions contain canonical registered direct-tool names only;
- aliases are not listed as separate capabilities;
- `action_count === actions.length`.

### 6.3 Wrapped child result

A wrapped child result has the child's exact six fields plus:

```text
codexpro_super_action
wrapped_tool
```

Invariants:

- `wrapped_tool` is a canonical direct-tool name;
- `codexpro_tool === wrapped_tool`;
- resolving `codexpro_super_action` yields `wrapped_tool`;
- removing the two wrapper fields produces a value accepted by the exact child output schema;
- the wrapper does not modify child `ok`, `data`, `error`, or `meta`;
- the wrapper does not modify human `content` or MCP `isError`.

The closed union covers all 26 core tools plus the two configuration-gated Codex Session tools. The supertool itself is never a child target.

## 7. Error contract

Wrapper-owned failures are fixed, redacted, and non-retryable:

```text
ACTION_NOT_AVAILABLE
ACTION_ARGUMENTS_INVALID
CHILD_RESULT_INVALID
INTERNAL_ERROR
```

### `ACTION_NOT_AVAILABLE`

Used for unknown actions, aliases whose canonical target is not registered, canonical targets disabled by the effective mode, and recursive `codexpro` dispatch.

Unknown and disabled actions intentionally share one public failure family so the wrapper does not expose a second capability-probing channel.

Details:

```text
{ action }
```

The action is normalized to a bounded control-safe one-line string before exposure.

### `ACTION_ARGUMENTS_INVALID`

Used when the selected direct tool's public input schema rejects `args`.

Details:

```text
{ action, wrapped_tool }
```

No Zod issue list, raw input, path, command, content, token, or stack is returned.

### `CHILD_RESULT_INVALID`

Used when a registered child handler returns structured content that does not satisfy its advertised exact output schema or contradicts wrapper identity.

Details:

```text
{ action, wrapped_tool }
```

The malformed child payload and validation diagnostics remain private.

### `INTERNAL_ERROR`

Used only when the wrapper cannot produce a trustworthy routing result outside the preceding stable families.

Details:

```text
{}
```

## 8. Routing architecture

The new `src/tools/schemas/codexpro.ts` owns:

- canonical direct-tool identifiers;
- fixed aliases;
- alias resolution;
- child output-schema lookup;
- `list_actions` and failure constructors;
- wrapped-child validation and construction;
- the advertised wrapper output shape/schema.

The new `src/codexproSupertool.ts` owns the post-registration wrapper upgrade. It reads the server's effective registered-tool map, derives available canonical actions, validates the selected input, invokes the registered target handler directly, and validates the returned child envelope before adding wrapper identity fields.

`src/server.ts` remains the owner of direct-tool registration and invokes the upgrade only after the effective tool surface has been assembled. The wrapper must not import or call child domain functions directly, and it must not delegate through the legacy supertool dispatcher because that would preserve a second routing implementation.

Routing order:

```text
normalize action
  -> list_actions special case
  -> resolve canonical target
  -> confirm target exists in registered handler map
  -> validate args through the registered direct-tool input schema/handler boundary
  -> invoke the registered child handler
  -> validate exact child structured result
  -> preserve content and isError
  -> add wrapper identity fields
```

## 9. Tool Card behavior

Child results retain the child's `codexpro_tool`, so existing dedicated child renderers remain authoritative.

The `codexpro` renderer handles only:

- `list_actions` success;
- wrapper-owned failures;
- the pre-result placeholder.

The card must show a bounded action preview and count without rendering raw arguments or validation diagnostics.

## 10. Compatibility

- Existing canonical actions remain callable.
- Existing aliases remain callable.
- Child `content` remains unchanged.
- Child `isError` remains unchanged.
- Existing child supertool tests continue to pass after updating only assertions that intentionally consume the new `list_actions` envelope.
- Protected Smoke sources remain unchanged; compatibility loaders must use exact count-locked substitutions and fail closed on source drift.
- `scripts/stress.mjs` remains a protected baseline consumer. `npm run stress` builds first and then executes `scripts/stress-contract-compat.mjs`, which performs exact count-locked in-memory migrations before importing the transformed source. No transformed Stress source is written to disk.

## 11. Test matrix

The focused contract suite covers:

1. pure constructors and strict schemas;
2. malformed, duplicate, unsorted, count-mismatched, recursive, and additional-field rejection;
3. exact advertised input/output descriptors in all tool modes;
4. `list_actions` equality with actual registered canonical tools;
5. minimal, standard, and full tool modes;
6. Bash off, write off, write handoff, analysis off, and Codex Session gates;
7. every fixed alias;
8. canonical child success and child operational failure;
9. malformed child arguments without raw diagnostics;
10. unknown, disabled, and recursive actions;
11. malformed child result fail-closed behavior through an injected wrapper seam;
12. preservation of `content`, `isError`, child envelope, and wrapper identity;
13. Tool Card rendering;
14. exact protected-Smoke compatibility and source immutability;
15. native-Windows Stress;
16. secret-shape and static scope checks.

## 12. Rollback

Rollback is a normal revert of the Slice 28 changes after publication. Before publication, remove the new schema, post-registration adapter, focused test, spec, plan, and Stress compatibility loader; restore the prior server upgrade hook, Tool Card, Smoke compatibility, `package.json` Stress entry, and documentation state. Do not reset or rewrite `main`, and do not revert security fixes from earlier slices.

## 13. Acceptance criteria

```text
[x] `codexpro` advertises an exact outputSchema
[x] `list_actions` uses the six-field schema-v1 envelope
[x] list_actions equals the actual registered canonical direct-tool set
[x] aliases cannot bypass effective registration gates
[x] all 27 canonical child tools validate through their exact schemas
[x] wrapper-owned failures are stable and redacted
[x] child content/isError/envelope semantics are preserved
[x] Tool Card and compatibility consumers are migrated
[x] focused, adjacent, complete, Build, all Smoke sections, Windows Stress, package, and static gates pass
[x] per-tool neat-freak reconciliation passes
[x] no stage, commit, push, or exact-head CI occurs before the unified Slice 17–28 publication gate
```
