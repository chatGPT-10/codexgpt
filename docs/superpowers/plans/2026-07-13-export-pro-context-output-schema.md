# Direct `export_pro_context` Output Schema Implementation Plan

> Date: 2026-07-13  
> Phase: 1, Slice 22  
> Design: `docs/superpowers/specs/2026-07-13-export-pro-context-output-schema-design.md`  
> Publication: deferred to the unified Slice 17–28 batch

## Global constraints

- Follow the approved design and update it first if evidence changes a public decision.
- Use focused RED before production behavior.
- Migrate only direct `export_pro_context`; leave Slice 23 and later contracts unchanged.
- Preserve all twelve inputs, standard/full visibility, write purpose, fixed output, CLI/self-test compatibility, and direct supertool action.
- Validate explicit selections and output paths before any scaffold or artifact write.
- Use UTF-8 byte limits and redact before the final cap/write.
- Keep protected Smoke sources unchanged through exact fail-closed compatibility substitutions.
- Do not add dependencies, arbitrary output paths, atomic transaction claims, Policy Kernel behavior, staging, commit, push, or CI publication.
- Finish with the user-required `neat-freak` before Slice 23.

### Task 1: Establish focused RED

- [x] Add `test/export-pro-context-contract.test.mjs` with schema, MCP, temp-workspace, provider, Tool Card, CLI/domain, and protected-source helpers.
- [x] Freeze the six-field envelope, forty-two data fields, safe skip/AI records, warning order, and ten failures.
- [x] Cover modes, descriptor, defaults, preparation, candidate accounting, AI coverage, output integrity, and no-write preflight.
- [x] Cover provider drift, Tool Card bounds, supertool, CLI/self-test compatibility, exact protected substitutions, and protected sources.
- [x] Run focused RED and prove failures are absent Slice 22 behavior.

### Task 2: Add exact schema and constructors

- [x] Create `src/tools/schemas/exportProContext.ts`.
- [x] Define safe paths/globs, exact data/error/output schemas, fixed warnings, and truncation markers.
- [x] Enforce counts, attempted/candidate equations, include/coverage semantics, fixed scaffold order, byte/hash/truncation/limit/redaction, and envelope invariants.
- [x] Add strict success/failure constructors and make schema checkpoints green.
- [x] Run Build.

### Task 3: Prepare and harden the domain

- [x] Add typed request preparation with bounded one-line titles, canonical selected paths, safe missing-parent containment, and bounded normalized globs.
- [x] Preflight fixed output/scaffold paths before the first write.
- [x] Replace character truncation with fixed-marker UTF-8 capping for diff and final bundle.
- [x] Return deterministic candidate/count accounting and fixed safe skipped-file records without raw errors.
- [x] Reuse fixed handoff artifact coverage and return loaded/unavailable/created context paths.
- [x] Redact before final cap, then return exact source/final bytes, SHA-256, prior existence, and independent truncation facts.
- [x] Keep build/export compatibility wrappers for self-test and CLI.
- [x] Run focused domain tests and Build.

### Task 4: Implement exact handler and provider boundary

- [x] Add `exportProContextProvider` dependency over the prepared request.
- [x] Classify workspace/request/selection/output/build/write/provider failures without unsafe details.
- [x] Validate workspace, options, fixed output, counts/order, skips, AI coverage, scaffold subset, Markdown framing, bytes/hash, and flags.
- [x] Construct the exact forty-two-field data object, warnings, bounded human summary, and MCP error semantics.
- [x] Advertise the exact output schema.
- [x] Run focused tests and Build.

### Task 5: Migrate consumers

- [x] Add a nested-first dedicated bounded `export_pro_context` Tool Card with historical flat fallback.
- [x] Add exact-count protected main-Smoke compatibility substitutions.
- [x] Add exact-count protected HTTP-Smoke compatibility substitutions.
- [x] Migrate native Stress to nested data and preserve supertool wrapper assertions.
- [x] Keep `scripts/pro-bundle.mjs` and `codexpro_self_test` compatible with expanded domain results.
- [x] Prove protected sources are unchanged and direct supertool child-envelope preservation holds.
- [x] Run focused and adjacent tests.

### Task 6: Review and harden the usable result

- [x] Review preflight ordering, partial scaffold failure, symlink/junction containment, glob traversal, Windows case behavior, Git rename parsing, candidate omission, fixed AI coverage, Unicode markers, redaction expansion, output overwrite/type races, provider drift, and UI bounds.
- [x] Add deliberate RED for every material issue found.
- [x] Apply minimum fixes and rerun focused/adjacent tests plus Build.
- [x] Reconcile the design first if a public decision changes.

### Task 7: Complete local verification and `neat-freak`

- [x] Run focused/adjacent contracts, Build, complete regression, Smoke, native-Windows Stress, and package dry-run.
- [x] Run diff, protected-source, exact-scope, secret-pattern, document-reference, memory, and archive checks.
- [x] Reconcile `AGENTS.md`, `Memory.md`, master plan, historical roadmap, plan, design, and active archive.
- [x] Mark checkboxes only from fresh evidence.
- [x] Continue directly to Slice 23 without staging, committing, pushing, or CI publication.
