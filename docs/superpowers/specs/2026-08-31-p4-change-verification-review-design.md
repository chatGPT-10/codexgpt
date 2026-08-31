# P4 Change Verification and Review Workflow Design

Date: 2026-08-31
Status: completed locally through STEP-539 under the owner's instruction to execute P4 through completion
Scope: coordinate existing atomic mutations, confirmed project checks, and diff review without adding execution authority or changing V1-V5 direct-tool counts
Primary platform: native Windows

## 1. Problem

CodexGPT already has atomic file mutations, authenticated change sets, bounded process execution, project-command detection, and review-oriented `show_changes`. They are separate capabilities. A successful mutation tells the model that bytes changed, but it does not give one server-owned next state that answers:

- which files belong to the change;
- which existing project checks are confirmed and relevant;
- whether verification is available in the selected execution profile;
- whether the resulting diff still requires review;
- whether verification and review are linked to the same owner-bound change set.

P4 coordinates these capabilities as one explicit workflow:

```text
Inspect -> Prepare -> Preview -> Approve -> Apply -> Verify -> Review
```

It does not replace `write`, `edit`, `apply_patch`, `move_paths`, semantic rename, `run_command`, or `show_changes`.

## 2. Compatibility and authority decision

Do not add a 53rd direct V5 tool. Add `verify_change` as a V5 `codexgpt` composite action owned by the wrapper. The composite action may invoke the already registered `run_command` handler only after its own explicit call. Every child invocation therefore traverses the existing authorization -> workspace -> Policy -> approval -> execute -> audit -> render pipeline.

This preserves:

- exact direct-tool counts V1/V2/V3/V4/V5 `28/31/39/51/52`;
- every existing tool name, OAuth scope, write gate, process gate, Policy decision, approval, audit, transaction, and rollback contract;
- V1-V4 input/output schemas and descriptors;
- the rule that standard/minimal modes do not gain shell authority;
- the rule that mutation success never starts a command automatically.

`verify_change` is available only when V5 and the existing full-access `run_command` capability are both available. Otherwise mutation next-state still reports confirmed recommendations but labels execution unavailable.

## 3. ChangeWorkflowService

One server-scoped `ChangeWorkflowService` records bounded workflow facts keyed by exact workspace and change-set identity. A record contains:

- owner binding;
- changed paths extracted from the committed mutation result;
- confirmed P2 project commands only;
- applied, verification, and review state;
- bounded timestamps and check summaries.

The service never stores command output beyond bounded redacted summaries. It does not store secrets, mutation contents, diffs, approval tokens, or raw process environment.

Immediate workflow records are server-local. A durable authenticated file change set may be used to reconstruct bounded facts when supported, but ephemeral verification/review state is not claimed to survive restart.

## 4. Mutation next-state

Successful committed V5 results from `write`, `edit`, `apply_patch`, `move_paths`, and non-preview `undo_change_set` gain one `workflow` field under `data`:

```json
{
  "schema_version": 1,
  "change_set_id": "cs_...",
  "changed_files": ["src/foo.ts", "test/foo.test.ts"],
  "stage": "applied",
  "verification": {
    "status": "pending",
    "available": true,
    "auto_run": false,
    "recommended": [
      {
        "check": "test",
        "command": "npm test",
        "source": "package.json:scripts.test",
        "confidence": "confirmed"
      }
    ],
    "action": "verify_change"
  },
  "review": {
    "status": "pending",
    "required": true,
    "action": "show_changes",
    "git_diff_available": true
  }
}
```

The field is added only after a committed mutation. Preview and failure results never claim an applied workflow. Older contract versions remain exact.

## 5. verify_change composite action

Input:

```json
{
  "workspace_id": "ws_...",
  "change_set_id": "cs_...",
  "checks": ["build", "test"],
  "timeout_ms": 120000
}
```

Rules:

1. Resolve the exact workspace and workflow record.
2. Require the current owner binding to match the committed change set.
3. Resolve every requested check to a current `confidence=confirmed` command from the same P2 detector used by workspace context.
4. Reject unknown, inferred-only, duplicate, or unavailable checks rather than running caller-selected shell text.
5. Compile the server-selected command into a fixed PowerShell invocation and an exact absolute workspace cwd.
6. Invoke the registered `run_command` child once per requested check. Do not bypass its full-access profile, Policy, local approval, output bounds, redaction, timeout, or audit behavior.
7. Report every executed check as passed or failed from its real exit status. A completed verification action may be successful even when a project check fails; the workflow status then becomes `failed`.
8. Leave review pending and return exact `show_changes` next-action arguments.

The action never accepts raw command text, executable paths, environment overrides, shell mode, or process authority from the caller.

## 6. Review linkage

V5 `show_changes` accepts an optional `change_set_id`. When supplied, a successful whole-workspace diff review can mark the matching workflow reviewed only when:

- the owner binding matches;
- diff inclusion is enabled;
- the review checkpoint is marked;
- the call is not a narrowed review that omits workflow paths.

The result reports whether the review was linked and whether the P4 workflow is complete. `show_changes` without a change-set id retains its existing behavior.

Every workflow review state carries the exact required inspection checklist: unexpected files, formatting, generated artifacts, dependency changes, and accidental deletion. These are review obligations over the returned full diff, not synthetic pass/fail claims; the server does not pretend that path heuristics can prove semantic correctness.

Workflow completion means:

```text
mutation committed
AND verification executed to a terminal result
AND diff review linked and inspected
```

Passing checks are not required for the workflow to be terminal, but `verification.status=failed` remains explicit and overall change readiness is false.

## 7. Security and failure behavior

- No automatic shell execution follows mutation success.
- No standard/minimal execution expansion occurs.
- The caller cannot choose a command; it chooses only a bounded check category.
- Only confirmed current project commands can run.
- Change-set and workflow lookups are exact, workspace-bound, and owner-bound.
- Policy or approval denials from `run_command` are returned unchanged so the wrapper cannot hide or weaken them.
- Failed or unavailable verification never marks review complete.
- Review never changes files, Git index, refs, history, configuration, or remotes.
- Diff and process outputs retain existing redaction and byte ceilings.

## 8. Acceptance

Automated fixtures must prove:

- mutation success receives next-state and mutation failure/preview does not;
- only confirmed commands are recommended and executable;
- `verify_change` rejects caller-selected commands, inferred-only checks, foreign owners, missing records, and unavailable `run_command`;
- real registered child handlers are used and Policy failures pass through;
- project check pass and fail statuses are terminal and honest;
- review remains required after verification and becomes linked only through a qualifying `show_changes` call;
- V1-V4 descriptors and payloads remain exact;
- V5 direct-tool count remains 52 and no mutation/process authority is added;
- package, mutation inventory, Policy, audit, ordinary, smoke, and dual-Node gates remain green.

P4 local closure does not itself authorize an App refresh, runtime deployment, publication, staging, commit, push, credential/network changes, or a fresh ChatGPT Web benchmark. Without a complete UI/tool trace, Web efficiency metrics remain unscored.
