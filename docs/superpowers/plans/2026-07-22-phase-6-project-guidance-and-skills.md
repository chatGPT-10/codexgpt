# Phase 6 Project Guidance and Skills TDD Plan

**Status:** closed at `31631676fe254962a9a4f14d6e025e3edba82b8d`; exact-head run `30033293444` passed Repository policy and Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package
**Date:** 2026-07-23
**Design:** [Phase 6 Project Guidance and Skills Usability Design](../specs/2026-07-22-phase-6-project-guidance-and-skills-design.md)
**Primary goal:** make the default ChatGPT workflow load real project guidance and relevant Skills before acting, with standard path/privacy boundaries and no new execution authority

**Implementation status (2026-07-23):** The `standard` runtime, compatibility branches, diagnostics, transport integration, and post-runtime adversarial repairs are implemented and verified. Real ChatGPT root, nested, target-Skill, subtree-switch, write, and verification journeys passed through the supported public entry. The previously created legacy App had already been deleted, so the supported upgrade path is one **Scan Tools** refresh or App recreation instead of a transparent cached-snapshot claim. Omitted standard/full modes now use ready `standard`; omitted minimal preserves exact legacy compatibility, and explicit `legacy` remains the one-restart rollback. Managed Node 20/24 ordinary, build, protected Smoke, package, policy, documentation, dependency, and integrity gates passed locally; published head `31631676fe254962a9a4f14d6e025e3edba82b8d` then passed exact-head run `30033293444` across Repository policy and Ubuntu/Windows Node 20/24 Build, Regression, Smoke, and Package.

## 1. Deliverable

Phase 6 is complete only when this ordinary user journey works:

```text
User describes a repository task
  -> open_current_workspace returns root AGENTS text + compact root Skill catalog
  -> ChatGPT locates the target with existing read/search tools
  -> codex_context(target_path) returns target AGENTS chain + target Skill catalog
  -> load_skill(target_path, selector) loads one matching workflow
  -> an existing typed tool performs the action under existing policy
  -> ChatGPT runs the relevant verification and reports the result
```

The user does not need to know `include_skills`, run an inventory tool, switch to `full`, approve a Markdown trust hash, or configure a Hook.

The phase ships in this order:

1. freeze authority, compatibility, and activation timing;
2. close path-replacement races for every content read;
3. deliver a usable root-level vertical slice;
4. make nested AGENTS exact;
5. close target-scoped Skill discovery and activation;
6. add lazy resources;
7. make the experience actionable and flip the default;
8. integrate all surfaces;
9. adversarially review the completed runtime and repair it;
10. run closure, documentation, publication, and exact-head gates.

## 2. Rules for every implementation task

1. Read `AGENTS.md`, `Memory.md`, current Git state, the paired design, the task's source/tests, and `docs/memory/archive/phase-6.md` before editing.
2. Do not begin runtime work until Gate G6-0 proves current base exact-head CI success, no active same-kind runner, explicit runtime authorization, and explicit approval for the single YAML production dependency.
3. Start with a narrow failing test and preserve the exact RED reason in the Phase 6 archive.
4. Complete one independently useful slice at a time. Do not mix unrelated cleanup, formatting, refactors, or Phase 7 work.
5. Keep V1=28/V2=31/V3=39/V4=51 exact. No Tool Contract V5 and no public tool addition.
6. Keep omitted `CODEXGPT_GUIDANCE_MODE` at `legacy` until Task 6A6. An incomplete explicit `standard` mode must report its readiness truthfully.
7. Preserve exact legacy request/result/projection branches. Put standard changes behind strict mode-discriminated schemas.
8. Use the canonical same-handle reader for every Phase 6 AGENTS, `SKILL.md`, companion metadata, and resource read. No validate-then-reopen path is allowed.
9. Treat AGENTS and Skills as context only. Do not add them to authorization facts, auto-run scripts, install dependencies, create Hooks, or weaken secret/path rules.
10. Keep standard global Skill discovery opt-in across open, snapshot, context, inventory, self-test, and load surfaces. Legacy omitted defaults stay exact.
11. Preserve protected `scripts/smoke.mjs` and `scripts/http-smoke.mjs`. Adapt only through exact fail-closed compatibility loaders after dedicated tests pass.
12. After each complete task, run the narrow tests, managed Node 20/24 affected tests, build, policy, diff/secret/scope checks, then update `Memory.md` and append the Phase 6 archive.
13. Do not stage, commit, push, publish, deploy, migrate credentials, or perform destructive Git/data actions without the applicable explicit approval.
14. Ordinary regression runs only through the detached runner. Control/all runs only in CI or a proven independent native terminal. Stop only an exact owned run ID.
15. Classify every gate as `passed`, `code-failed`, `not-run`, `environment-blocked`, or `platform-skipped`; never collapse these states into “done.”

## 3. Exact verification command shapes

Use the current runtime for the first RED/GREEN loop:

```powershell
npm run test:focused -- <test-files...>
npm run build
npm run policy:check
git diff --check
```

Use both verified majors for platform/runtime-sensitive checkpoints:

```powershell
node scripts/toolchain-manager.mjs matrix --major all -- npm run test:focused -- <test-files...>
node scripts/toolchain-manager.mjs matrix --major all -- npm run build
node scripts/toolchain-manager.mjs matrix --major all -- npm run smoke
```

Use this exact detached ordinary shape at closure:

```powershell
node scripts/long-task-runner.mjs list
node scripts/long-task-runner.mjs start --kind phase6-ordinary -- node scripts/toolchain-manager.mjs matrix --major all -- node scripts/test-domains.mjs run --domain ordinary
node scripts/long-task-runner.mjs status --run <exact-run-id>
```

The retained stdout must identify both verified runtimes (`v20.20.2` and `v24.15.0`) and complete ordinary results. A run started by the connector's current Node alone is not Node 20/24 matrix evidence.

## 4. Gates

| Gate | Blocks | Required evidence |
| --- | --- | --- |
| G6-0 | all runtime edits | scope documents authoritative; current base exact-head green; implementation + YAML dependency authorized; archive exists; no active same-kind run |
| G6-C | all standard integration | exact V1–V4 counts, exact legacy branches/projections/defaults, one migration flag, no persisted-schema requirement |
| G6-R | AGENTS/Skill/resource behavior | canonical same-handle read, deterministic replacement-race tests, blocked-secret checks |
| G6-M | deeper implementation | usable root AGENTS + root catalog + existing body load in standard preview, standard `codex_context` visible, real ChatGPT root fixture succeeds |
| G6-I | first target mutation | exact one-file-per-directory chain, target kinds, per-file/combined/output budgets, open/context consistency |
| G6-K | implicit Skill use | target discovery/load binding, YAML/companion policy, scan/catalog budgets, global privacy, duplicate resolution, no execution |
| G6-U | omitted mode flip | concise diagnostics, guidance-only self-test, live nested ChatGPT sequence, output/latency bounds, all earlier gates green |
| G6-A | closure | all surfaces/profiles/lifecycles/canaries agree; no authority gain; multi-agent findings repaired |
| G6-P | publication | complete local gate, neat-freak reconciliation, approved commit/push, exact-head Ubuntu/Windows Node 20/24 success |

Gate failure blocks dependents. It never falls back to a weaker reader, hidden global scan, legacy behavior mislabeled as standard, shell execution, or automatic script/Hook execution.

## 5. Phase 6A — implementation

### Task 6A0 — Gates G6-0 and G6-C: establish authority, baseline, and compatibility

**Goal:** make the implementation boundary executable before touching runtime behavior.

**Preconditions:**

1. The master plan, `AGENTS.md`, historical roadmap, `Memory.md`, paired design/plan, and Phase 6 archive all agree that generic Hooks and custom trust manifests are out of Phase 6.
2. The current runtime base SHA has terminal exact-head success for repository policy and Ubuntu/Windows Node 20/24.
3. `long-task-runner list` proves no active `phase6-*` or conflicting ordinary run.
4. Noah explicitly authorizes runtime implementation and the direct `yaml` production dependency.
5. Git status is understood and all pre-existing user changes are preserved.

**Current evidence (2026-07-23):** runtime base `d2a5af0b7dee30d3a507ebaaac9876911f4ebf2c` passed exact-head CI run `29925944942` across Repository policy and Ubuntu/Windows Node 20/24 Regression, Smoke, and Package. Before implementation, no conflicting ordinary run was active and Noah authorized the runtime plus the audited exact `yaml@2.9.0` dependency. The implemented runtime passed post-implementation review, real ChatGPT root/nested, target-Skill, subtree-switch, write, and verification journeys, and omitted mode now defaults to ready `standard`. The deleted legacy App is covered by the one-time **Scan Tools** or recreation upgrade path. Closure head `31631676fe254962a9a4f14d6e025e3edba82b8d` passed exact-head run `30033293444`; Phase 6 implementation and publication authority is exhausted.

**Add:**

- `src/guidance/mode.ts`
- `test/phase-6-compatibility-boundary.test.mjs`

**Modify only if RED requires it:**

- `src/config.ts`
- `src/server.ts` readiness/config reporting and projection selection
- `src/tools/schemas/serverConfig.ts`
- `test/server-config-contract.test.mjs`
- `test/phase-5-contract-v4.test.mjs`
- `test/phase-5-v4-inherited-contract.test.mjs`
- exact protected-Smoke compatibility loaders, not protected Smoke sources

**RED cases:**

- omitted guidance mode resolves to `legacy` before Task 6A6;
- explicit `legacy` preserves exact current open/context/inventory/self-test/load defaults and structured keys;
- explicit `standard` before the usable slice returns `GUIDANCE_STANDARD_NOT_READY`, never a silent legacy result;
- invalid mode fails startup with one allowed-values action;
- V1/V2/V3/V4 remain exact 28/31/39/51;
- legacy connection-test/minimal/standard/full projections remain exact;
- ordinary legacy `load_skill`, inventory, self-test, workspace-open, and `codex_context` fixtures remain byte-for-byte/schema-equivalent;
- no profile rewrite or persisted migration occurs merely by starting the server.

**Implementation:**

- Parse one normalized `legacy|standard` value at configuration load.
- Expose readiness as `not_ready|preview|ready` in server configuration/diagnostics, not as an authorization fact.
- Route behavior through named legacy/standard provider branches; do not scatter environment checks throughout handlers.
- Keep the default resolver in one tested constant so Task 6A6 can flip it in one reviewed change.

**Verification:**

```powershell
npm run test:focused -- test/phase-6-compatibility-boundary.test.mjs test/server-config-contract.test.mjs test/phase-5-contract-v4.test.mjs test/phase-5-v4-inherited-contract.test.mjs test/load-skill-contract.test.mjs test/codexgpt-inventory-contract.test.mjs test/codexgpt-self-test-contract.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs test/codex-context-contract.test.mjs
node scripts/toolchain-manager.mjs matrix --major all -- npm run build
npm run policy:check
git diff --check
```

**Exit:** legacy remains the working default, standard incompleteness is explicit, and every old compatibility branch is frozen by tests.

### Task 6A1 — Gate G6-R: implement the canonical same-handle text reader

**Goal:** remove validate-then-reopen races before making repository text automatic.

**Add:**

- `src/guidance/safeTextReader.ts`
- `test/guidance-safe-text-reader.test.mjs`
- `test/guidance-safe-text-reader-windows.test.mjs`

**Modify:**

- the smallest existing native path/file-identity helper needed to expose stable read identity
- `src/workspaceOps.ts` and `src/capabilitiesOps.ts` only to add injectable reader seams; do not activate standard behavior yet
- `scripts/test-domains.mjs` if explicit test registration is required

**RED cases — positive:**

- regular UTF-8 text at exact byte boundaries returns from one open handle with exact source/returned bytes;
- a single UTF-8 BOM is accepted for frontmatter consumers;
- a symlink/junction whose final target remains within the same authorized root reads successfully on supported platforms;
- Windows held-file behavior returns a classified result and closes every handle;
- native Windows and Ubuntu identity facts are captured without using timestamps or assumed monotonic inode/file-index values.

**RED cases — adversarial:**

- deterministic test barriers replace the file after validation but before/during read;
- replace a parent directory with a junction/symlink to an external location;
- hardlink an external or blocked file to an apparently safe AGENTS/Skill/resource name; every automatic content read requires `nlink === 1` and returns `READ_HARDLINK_UNSAFE` otherwise;
- switch a regular file to directory/device/non-regular content;
- cross workspace, drive, UNC/device, ADS, reserved-name, trailing-dot/space, and blocked secret paths;
- invalid UTF-8, NUL/binary content, oversized files, sharing failures, deletion, and identity mismatch;
- every failure returns a stable safe reason and no canonical private path or content.

**Implementation:**

- Resolve authorized root and normalized parent chain.
- Apply blocked policy before open.
- Open once; use that handle for `fstat`, bounded read, text validation, and byte accounting.
- Capture identity and re-resolve target/parent before return. Reject any unproven or changed identity.
- Make the test barrier available only through an injected test seam, never environment timing or production delay.
- Do not refactor unrelated transaction/direct-write code.

**Verification:**

```powershell
npm run test:focused -- test/guidance-safe-text-reader.test.mjs test/guidance-safe-text-reader-windows.test.mjs test/path-policy.test.mjs test/mutation-architecture.test.mjs
node scripts/toolchain-manager.mjs matrix --major all -- npm run test:focused -- test/guidance-safe-text-reader.test.mjs test/guidance-safe-text-reader-windows.test.mjs test/path-policy.test.mjs
node scripts/toolchain-manager.mjs matrix --major all -- npm run build
npm run policy:check
git diff --check
```

**Exit:** all later Phase 6 content reads can depend on one proven primitive; no standard-mode behavior is activated yet.

### Task 6A2 — Gate G6-M: ship the first usable root-level vertical slice

**Goal:** prove value early: standard ChatGPT receives root rules and root Skill metadata, can load one Skill, and can act through existing tools.

**Add:**

- `src/guidance/instructions.ts`
- `src/guidance/skillCatalog.ts`
- `test/phase-6-root-bootstrap.test.mjs`
- `test/phase-6-standard-projection.test.mjs`
- `test/fixtures/phase-6-root-workspace/` with one root `AGENTS.md`, one root Skill, and one verifiable task

**Modify:**

- `src/workspaceOps.ts`
- `src/capabilitiesOps.ts`
- `src/server.ts` open results, standard projection, server instructions, and mode readiness
- `src/tools/schemas/openCurrentWorkspace.ts`
- `src/tools/schemas/openWorkspace.ts`
- `src/tools/schemas/codexContext.ts`
- `src/tools/schemas/loadSkill.ts` only for standard workspace-only default
- relevant open/context/load Tool Card compatibility code
- existing open/context/load/profile contract tests

**RED cases:**

- standard preview workspace-open returns the selected root guidance body, sanitized path, complete bytes, redaction state, and no body when absent;
- it returns root `.agents/skills/*/SKILL.md` metadata but no Skill bodies/resources;
- root guidance and root catalog appear in both structured content and the model-visible text without divergent sanitization;
- the existing `codex_context` tool is present in the standard projection with read-only annotations; V1–V4 total counts do not change;
- standard `codex_context(target_path='.')` defaults AI bridge/Git/diff off; explicit inputs work; legacy/full defaults stay exact;
- before Task 6A3, a non-root target in standard preview returns `GUIDANCE_STANDARD_NOT_READY` instead of using the known-inexact legacy nested selector;
- the standard result branch truthfully accepts `tool_mode=standard`; the exact legacy/full branch retains its prior literal and shape;
- bare-name standard `load_skill` searches workspace only; explicit legacy behavior remains exact;
- optional empty guidance/Skill state is a clean success;
- root open runs no script, Hook, package manager, network call, mutation, Git call, or child process;
- output stays inside the 8,000-character root catalog and configured total output cap.

**Implementation:**

- Use one shared root instruction selector for open and context.
- Add strict standard branches rather than changing legacy shapes.
- Reuse the current bounded Skill discovery/load behavior for this first root slice; do not implement target or resources here.
- Set explicit standard readiness to `preview`; omitted mode remains legacy.
- Server instructions state that root rules are already present and nested context will be required once target support becomes green.

**Model-in-loop Gate G6-M:**

Connect ChatGPT Web through the supported public entry to the local fixture. Give only the task intent. Retain sanitized `.ai-bridge` evidence that the model saw root guidance, selected the matching root Skill, used `load_skill`, performed one allowed change through an existing tool, and verified it. Do not teach tool arguments in the prompt. If live ChatGPT is unavailable, mark G6-M `environment-blocked`; unit tests do not substitute for the usability claim.

**Verification:**

```powershell
npm run test:focused -- test/phase-6-root-bootstrap.test.mjs test/phase-6-standard-projection.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs test/codex-context-contract.test.mjs test/load-skill-contract.test.mjs test/phase-5-contract-v4.test.mjs
node scripts/toolchain-manager.mjs matrix --major all -- npm run test:focused -- test/phase-6-root-bootstrap.test.mjs test/phase-6-standard-projection.test.mjs test/codex-context-contract.test.mjs test/load-skill-contract.test.mjs
node scripts/toolchain-manager.mjs matrix --major all -- npm run build
npm run policy:check
git diff --check
```

**Exit:** explicit standard preview delivers a useful root workflow and has real ChatGPT evidence; it is not yet the default.

### Task 6A3 — Gate G6-I: make project instruction discovery exact and target-aware

**Goal:** return the correct root-to-target instruction chain from the same implementation used by workspace-open.

**Add:**

- `test/instruction-discovery.test.mjs`
- `test/instruction-discovery-windows.test.mjs`

**Modify:**

- `src/guidance/instructions.ts`
- `src/config.ts` for optional bounded fallback basenames
- `src/workspaceOps.ts`
- `src/server.ts` context input/result framing only
- `src/tools/schemas/codexContext.ts`
- `config.example.env` only if the fallback setting is public in this slice
- `test/codex-context-contract.test.mjs`
- `test/open-current-workspace-contract.test.mjs`
- `test/open-workspace-contract.test.mjs`
- `test/server-config-contract.test.mjs`

**RED cases — selection:**

- root/intermediate/target chain is root-to-target and includes at most one file per directory;
- `AGENTS.override.md` wins over `AGENTS.md`, then configured fallbacks;
- empty files fall through; a broken/blocked/binary/raced/oversized higher candidate does not;
- fallback list defaults to `agents.md,.agents.md`, preserves order, and rejects unsafe/case-duplicate names;
- directory, regular-file, and missing-future targets use the correct final directory;
- open root guidance and `codex_context('.')` select identical provenance/content;
- Windows ambiguous case collisions fail actionably; Ubuntu exact case-distinct files remain deterministic.

**RED cases — budgets/schema:**

- `max_agent_bytes` remains per-file with default 60,000 and legacy semantics;
- new `max_instruction_total_bytes` defaults 32,768 and caps the combined chain independently;
- existing `max_total_bytes` remains the complete output cap;
- total-budget exhaustion returns the complete loaded prefix plus strict `instruction_diagnostics`, never a partial file or whole-call false failure;
- per-file, combined, and output-limit reasons are distinguishable in strict structured results and model-visible warnings;
- redaction byte accounting remains exact.

**RED cases — lifecycle/path:**

- foreign/closed/expired/policy-stale handles remain opaque;
- link/reparse replacement uses Gate G6-R failure reasons;
- multiple server instances/workspaces do not share canonical paths or cached contents;
- no AGENTS text changes authentication, roots, policy, approval, network, audit, or tool projection.

**Implementation:**

- Resolve the guarded target once.
- Enumerate root-to-target directories and call one selector per directory.
- Return a strict standard guidance branch with diagnostics; call the named legacy provider unchanged in legacy mode.
- Prefer no cache. Any later cache is per-server metadata only and must revalidate identity/content before return.

**Verification:**

```powershell
npm run test:focused -- test/instruction-discovery.test.mjs test/instruction-discovery-windows.test.mjs test/codex-context-contract.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs test/server-config-contract.test.mjs test/path-policy.test.mjs test/workspace-lifecycle.test.mjs
node scripts/toolchain-manager.mjs matrix --major all -- npm run test:focused -- test/instruction-discovery.test.mjs test/instruction-discovery-windows.test.mjs test/codex-context-contract.test.mjs
node scripts/toolchain-manager.mjs matrix --major all -- npm run build
npm run policy:check
git diff --check
```

**Exit:** standard context can prove the exact guidance applied to any authorized target without changing authority.

### Task 6A4 — Gate G6-K: implement interoperable target-scoped Skill discovery and activation

**Goal:** make nested project Skills reachable from the default target flow while remaining compatible, bounded, and private.

**Add:**

- direct audited `yaml` dependency in `package.json` and lockfile after Gate G6-0 approval
- `src/guidance/skillMetadata.ts`
- `src/guidance/skillDiscovery.ts`
- `src/guidance/openaiSkillMetadata.ts`
- `test/skill-frontmatter.test.mjs`
- `test/skill-discovery-target.test.mjs`
- `test/skill-catalog-budget.test.mjs`
- `test/skill-global-privacy.test.mjs`
- `test/skill-invocation-policy.test.mjs`

**Modify:**

- `src/guidance/skillCatalog.ts`
- `src/capabilitiesOps.ts` as compatibility facade
- `src/config.ts` to use configured `codexDir` consistently
- `src/server.ts` target/catalog/load normalization only
- `src/tools/schemas/codexContext.ts`
- `src/tools/schemas/codexgptInventory.ts`
- `src/tools/schemas/codexgptSelfTest.ts`
- `src/tools/schemas/loadSkill.ts`
- `src/tools/schemas/workspaceSnapshot.ts`
- relevant open/context/inventory/self-test/load/supertool contract tests
- `test/workspace-snapshot-contract.test.mjs`

**RED cases — YAML/metadata:**

- valid quoted, folded, literal, multiline, optional-map, and Unicode YAML parses without executing tags/aliases;
- one UTF-8 BOM is accepted;
- metadata input, depth, aliases, custom tags, keys, scalar sizes, and duplicate core fields are bounded;
- `name` and `description` are required; missing description or unparseable YAML skips with a diagnostic;
- safe cosmetic name violations warn/load; unsafe/control names skip;
- optional bad fields are omitted with warnings while valid core metadata remains usable;
- legacy location line parsing remains one-cycle fallback and is labeled `legacy_parse`;
- `compatibility` is disclosed boundedly; arbitrary `metadata`, dependency URLs, and raw `allowed-tools` are not auto-disclosed;
- metadata sanitization/redaction is identical in structured and human text and reports `metadata_redacted`.

**RED cases — target path:**

- `codex_context(target_path)` discovers `.agents/skills` from target directory through root and returns that exact catalog;
- `load_skill(target_path, name/source/path)` resolves within the same target scope;
- root open returns root-applicable Skills only;
- closest workspace entries sort first; duplicates remain separate and ambiguous names require exact source/path;
- exact sanitized path resolution works even when the catalog scan was truncated and revalidates target/source/boundary directly;
- standard exact selectors are reversible only within configured roots (`$WORKSPACE`, `$USER_SKILLS`, `$CODEX_DIR`, `$PLUGIN_ROOT/<root-id>`, `$SOURCE_ROOT/<root-id>`); server-created root IDs never accept a caller-provided filesystem root;
- legacy `~/...` and `$EXTERNAL/<hash>/...` selectors remain legacy-only and are not claimed to resolve unseen candidates after a truncated scan;
- in-root symlinked Skill directories work; escaped links fail;
- `config.codexDir` controls user/plugin locations; no hardcoded default home silently replaces it.

**RED cases — scan/catalog truth:**

- returned `max_skills` and scanned `max_skill_candidates` are independent;
- many invalid candidates before a later valid Skill do not produce false `scan_complete` or false not-found;
- name-only resolution fails closed on partial scan; exact path may load after direct validation;
- the auto catalog is at most 8,000 characters by default across structured and human representations;
- descriptions shorten before deterministic tail omission;
- `catalog_complete`, `catalog_omitted_count`, `descriptions_shortened`, and scan counts are exact;
- large library output and discovery time remain within recorded local thresholds chosen from baseline measurements, with no unbounded recursion.

**RED cases — invocation/global privacy:**

- `agents/openai.yaml` `allow_implicit_invocation=false` removes a Skill from implicit matching but explicit user selection still loads it;
- declared tool dependencies produce `requirements_state=declared_unverified`, not false readiness or auto-installation;
- because Phase 6 does not verify/install dependencies, `implicit_eligible` is true only when implicit invocation is allowed and `requirements_state=none`; explicit user selection may still load the Skill with its warning;
- omitted standard open/context/inventory/self-test/load requests expose no user/plugin/other Skill;
- explicit global flag/source/sanitized path loads the intended global Skill and nothing else;
- legacy omitted defaults remain exact;
- no Skill field changes enabled tools, permission profile, policy risk, approval, network, environment, or audit outcome;
- scanning executes zero script/package/Hook/network/mutation canaries.

**Implementation:**

- Parse valid YAML with bounded safe options and validate with Zod.
- Before adding the dependency, record its exact version, license, transitive graph, lifecycle-script state, and package dry-run impact; reject unexpected install scripts or unrelated transitive expansion.
- Discover direct Skill children at each target ancestor plus one-cycle compatibility roots.
- Keep absolute/canonical locations server-side; return only sanitized selectors.
- Put the target catalog into `codex_context`, not an unreachable internal-only provider.
- Standard bare-name load is workspace-only. Explicit global source/path/flag is the sole standard opt-in.
- Emit sanitized source/path fingerprints in strict results and local redacted operational diagnostics. Persistent Audit records the tool invocation/result only; do not overload its current schema or claim resolved-file provenance.

**Verification:**

```powershell
npm run test:focused -- test/skill-frontmatter.test.mjs test/skill-discovery-target.test.mjs test/skill-catalog-budget.test.mjs test/skill-global-privacy.test.mjs test/skill-invocation-policy.test.mjs test/codexgpt-inventory-contract.test.mjs test/codexgpt-self-test-contract.test.mjs test/load-skill-contract.test.mjs test/codex-context-contract.test.mjs test/workspace-snapshot-contract.test.mjs test/codexgpt-contract.test.mjs
node scripts/toolchain-manager.mjs matrix --major all -- npm run test:focused -- test/skill-frontmatter.test.mjs test/skill-discovery-target.test.mjs test/skill-catalog-budget.test.mjs test/skill-global-privacy.test.mjs test/skill-invocation-policy.test.mjs
node scripts/toolchain-manager.mjs matrix --major all -- npm run build
npm run policy:check
git diff --check
```

**Exit:** target Skills are visible and loadable through a complete public call chain, catalogs are budgeted, and personal Skills require explicit standard opt-in.

### Task 6A5 — Gate G6-KR: add bounded resource discovery and one-file text loading

**Goal:** let a selected Skill reveal and load its supporting text without becoming an arbitrary file reader.

**Add:**

- `src/guidance/skillResources.ts`
- `test/load-skill-resource.test.mjs`
- `test/load-skill-resource-windows.test.mjs`
- `test/load-skill-no-execution.test.mjs`

**Modify:**

- `src/capabilitiesOps.ts`
- `src/server.ts` resource request/provider/failure mapping only
- `src/tools/schemas/loadSkill.ts`
- `test/load-skill-contract.test.mjs`
- `test/codexgpt-contract.test.mjs`
- Tool Card compatibility code only if the distinct resource branch needs compact rendering

**RED cases — compatibility/usefulness:**

- omitted `resource_path` keeps the exact legacy body branch;
- omitted `include_resource_index` is false and preserves the exact body keys; explicit `include_resource_index=true` selects a distinct standard body-with-index branch listing bounded sanitized paths under `references/`, `scripts/`, and `assets/` without reading content;
- `resource_path='SKILL.md'` normalizes to the body branch;
- `references/REFERENCE.md` and ordinary script text load through a distinct strict resource branch;
- Windows separators, leading `./`, and repeated separators normalize to the same safe selector;
- direct/supertool/STDIO/HTTP results agree.

**RED cases — boundary/secrets/race:**

- absolute, drive, UNC/device, ADS, control, empty, and escaping `..` selectors fail before open;
- `.env`, `.env.*`, PEM/key files, `.ssh`, and existing blocked patterns fail before content redaction for workspace/user/plugin sources;
- apply the blocked policy to both normalized selector and final canonical relative path;
- in-root resource links work; escaped or replaced links fail through the same-handle identity gate;
- non-regular, binary, invalid UTF-8, missing, unreadable, and oversized resources return stable safe errors;
- a script body, shebang, executable bit, package manifest, or `allowed-tools` value executes zero process/network/write/Git canaries.

**Implementation:**

- Resolve the selected Skill first, then normalize one relative resource selector.
- Enumerate only bounded known resource directories for the optional path index; exclude blocked entries.
- Use the Gate G6-R reader and current output redaction.
- Return sanitized source/path fingerprints in strict results/local redacted diagnostics; persistent Audit remains truthful tool-invocation evidence and never claims resolved-file provenance.
- Do not add directory browsing, binary streaming, dependency installation, or script execution.

**Verification:**

```powershell
npm run test:focused -- test/load-skill-resource.test.mjs test/load-skill-resource-windows.test.mjs test/load-skill-no-execution.test.mjs test/load-skill-contract.test.mjs test/codexgpt-contract.test.mjs test/path-policy.test.mjs test/policy-enforcement-audit.test.mjs
node scripts/toolchain-manager.mjs matrix --major all -- npm run test:focused -- test/load-skill-resource.test.mjs test/load-skill-resource-windows.test.mjs test/load-skill-no-execution.test.mjs test/path-policy.test.mjs
node scripts/toolchain-manager.mjs matrix --major all -- npm run build
npm run policy:check
git diff --check
```

**Exit:** referenced text is usable on demand, blocked/escaped content remains unreadable, and ordinary body loads stay exact.

### Task 6A6 — Gate G6-U: finish diagnostics, real ChatGPT flow, and flip the default

**Goal:** make the completed behavior obvious and recoverable, then change omitted mode to standard in one isolated GREEN step.

**Add:**

- `src/guidance/diagnostics.ts`
- `test/phase-6-default-ux.test.mjs`
- `test/phase-6-diagnostics.test.mjs`
- `test/phase-6-model-sequence.test.mjs` for deterministic server-instruction/fixture sequence contracts
- `test/fixtures/phase-6-nested-workspace/` with root/nested AGENTS, root/nested Skills, explicit-only Skill, blocked resource, and verifiable cross-subtree task

**Modify:**

- `src/guidance/mode.ts` default constant only after all pre-flip tests pass
- `src/server.ts` server instructions, concise open text, defaults, and readiness
- `src/workspaceOps.ts`
- `src/selfTestOps.ts`
- `src/tools/schemas/codexgptSelfTest.ts`
- `scripts/doctor.mjs`
- `scripts/smoke-platform-compat.mjs`
- `scripts/http-smoke-compat.mjs`
- relevant open/context/inventory/self-test/server-config contracts

**RED cases — normal behavior:**

- omitted mode remains legacy in the pre-flip assertion;
- explicit standard open shows root guidance, catalog counts, and no warning for a normal repository with no Skills;
- server instructions require `codex_context(target)` after target discovery, before first mutation, and after subtree changes;
- server instructions load only a relevant implicit-allowed Skill and honor explicit-only Skills;
- Skills with declared-unverified dependencies are not implicitly eligible; explicit selection returns the requirement warning;
- empty optional guidance remains success;
- no setup wizard or saved-profile edit is introduced.

**RED cases — diagnostics:**

- open returns `ok|warning|unavailable`, counts, the first safe diagnostic, and one action without raw bodies/canonical private paths;
- a guidance-only/read-only self-test branch forces write and Bash probes off;
- doctor reports the detailed local list for collisions, invalid metadata, compatibility warnings, scan/catalog truncation, blocked resources, and legacy locations;
- metadata/body/resource/path/error redaction and byte/character accounting remain exact;
- protected Smoke compatibility substitution is exact and fails closed on protected-source drift.

**Model-in-loop Gate G6-U:**

Run the supported public entry against the nested fixture in a real ChatGPT Web session. The user prompt describes the change but names no tool or optional argument. Sanitized evidence must show:

```text
open workspace
-> locate target
-> codex_context(first target)
-> load matching Skill once
-> perform allowed action
-> switch subtree (fixture requires it)
-> codex_context(second target)
-> perform action
-> run verification
```

The nested fixture must make only the target-directory Skill match. Evidence must prove `load_skill.target_path` equals the preceding `codex_context.target_path`, its selector came from that returned catalog, and the returned body identity is the nested Skill rather than a root duplicate.

Also test one existing pre-Phase-6 ChatGPT connection without recreating the App. If its cached tool list omits dedicated `codex_context`, the already stable `codexgpt` supertool action must reach the same handler. If neither path is usable, the product must return one precise reconnect action and documentation must state that one-time upgrade requirement; it may not claim transparent refresh.

The model must not load an implicit-disabled/dependency-unverified Skill, global Skill, script, or resource unless the user/task explicitly requires it. If the external session is unavailable, G6-U is `environment-blocked`; do not flip the default.

**Default flip:**

After G6-R/G6-M/G6-I/G6-K and the pre-flip G6-U tests/live session pass:

1. change only the omitted-mode default from `legacy` to `standard`;
2. set readiness to `ready`;
3. rerun the exact pre-flip default test expecting standard;
4. prove explicit `legacy` rollback still returns exact old branches;
5. run protected Smoke compatibility gates.

**Verification:**

```powershell
npm run test:focused -- test/phase-6-default-ux.test.mjs test/phase-6-diagnostics.test.mjs test/phase-6-model-sequence.test.mjs test/open-current-workspace-contract.test.mjs test/open-workspace-contract.test.mjs test/codex-context-contract.test.mjs test/codexgpt-inventory-contract.test.mjs test/codexgpt-self-test-contract.test.mjs test/server-config-contract.test.mjs
node scripts/toolchain-manager.mjs matrix --major all -- npm run test:focused -- test/phase-6-default-ux.test.mjs test/phase-6-diagnostics.test.mjs test/phase-6-model-sequence.test.mjs test/server-config-contract.test.mjs
node scripts/toolchain-manager.mjs matrix --major all -- npm run build
node scripts/toolchain-manager.mjs matrix --major all -- npm run smoke
npm run policy:check
git diff --check
```

**Exit:** standard is the honest omitted default, legacy is one restart away, and a real user-level nested flow has passed.

### Task 6A7 — Gate G6-A1: integrate all public surfaces without new authority

**Goal:** prove Phase 6 behaves identically across dispatch/transports/profiles/lifecycles and cannot grant execution.

**Add:**

- `test/phase-6-integration.test.mjs`
- `test/phase-6-adversarial.test.mjs`

**Modify:**

- only integration/schema/compatibility files proven necessary by RED tests
- no protected Smoke source
- no process, Git, transaction, approval, workspace-manager, or audit-store redesign unless a concrete compatibility defect is separately reviewed

**RED cases:**

- direct and supertool calls produce equivalent mode/target/catalog/load/resource outcomes with exact child envelopes;
- STDIO and HTTP agree on standard defaults, errors, redaction, global opt-in, and rollback;
- connection-test remains read-only; minimal/standard/full projections are intentional and exact; no Skill registers a tool;
- workspace-open/context/inventory/self-test/load omitted and explicit global combinations match the privacy matrix;
- malicious AGENTS/Skill/resource text asking to expand roots, reveal secrets, disable auth, enable network, bypass approval, run a canary, or suppress audit changes no server-side fact;
- later write/process/Git calls receive exactly their normal policy decision with no Skill-derived permission;
- foreign/closed/expired/policy-stale handles remain opaque;
- concurrent servers/workspaces do not share target catalogs, configured-root selector maps, paths, or optional cache state; `load_skill` remains stateless/idempotent and repeated calls return the body rather than relying on unavailable conversation identity;
- output/local-diagnostic paths remain sanitized and bounded; persistent Audit truthfully records invocation/result without a resolved context-file path;
- rollback changes behavior only after restart and never deletes user content/state.

**Implementation:**

- Integrate only at existing provider and registered-tool boundaries.
- Keep instruction/Skill/resource reads R0/context-only; expose provider provenance only where current strict results/local diagnostics support it and leave persistent Audit semantics unchanged.
- Prefer no cache. If measured evidence requires one, it is per-server, bounded, advisory, and identity-revalidated.

**Verification:**

```powershell
npm run test:focused -- test/phase-6-integration.test.mjs test/phase-6-adversarial.test.mjs test/codexgpt-contract.test.mjs test/codex-context-contract.test.mjs test/load-skill-contract.test.mjs test/policy-enforcement-audit.test.mjs test/workspace-lifecycle.test.mjs test/phase-5-contract-v4.test.mjs test/phase-5-v4-inherited-contract.test.mjs
node scripts/toolchain-manager.mjs matrix --major all -- npm run test:focused -- test/phase-6-integration.test.mjs test/phase-6-adversarial.test.mjs test/policy-enforcement-audit.test.mjs test/workspace-lifecycle.test.mjs
node scripts/toolchain-manager.mjs matrix --major all -- npm run build
node scripts/toolchain-manager.mjs matrix --major all -- npm run smoke
npm run policy:check
git diff --check
```

**Exit:** the complete local implementation is usable and integrated. It is not yet adversarially accepted or phase-closed.

### Task 6A8 — Gate G6-A2: multi-agent adversarial review and repair

**Goal:** review the completed runtime result, not an abstract proposal, then fix every supported finding before closure.

The coordination cost is lower than the expected cost of missing cross-cutting defects because execution, security/compatibility, and UX inspect different failure classes independently against one frozen implementation.

**Parallel read-only reviews:**

1. **Execution reviewer:** task order, exact commands, Windows/Node 20/24 feasibility, schemas, migration, archive/publication gates.
2. **Security/compatibility reviewer:** path races, blocked secrets, global privacy, policy/audit truth, legacy branches, protocol/profile/lifecycle isolation.
3. **UX reviewer:** root bootstrap, target call timing, large catalog behavior, diagnostics/actions, real ChatGPT model sequence, rollback clarity.

Each reviewer receives the implemented diff, paired design/plan, relevant tests, and fresh focused evidence. Reviewers do not edit files.

**Required processing:**

- rank findings by severity and user impact;
- reproduce each supported finding with a deterministic failing test;
- fix the root cause, not the assertion;
- add the permanent regression to the authoritative test domain;
- rerun every affected gate on managed Node 20/24;
- record rejected findings with concrete evidence;
- do not enter closure while any supported high/critical finding remains.

**Exit:** review findings and repairs are recorded in the Phase 6 archive; the reviewed implementation snapshot is ready for the full acceptance matrix.

## 6. Phase 6 closure

### Task 6B0 — full adversarial acceptance matrix

Run the completed/repaired implementation with independent positive controls across:

- root/directory/file/missing targets; override/canonical/configured fallback/empty/broken/collided/over-budget instructions;
- per-file, combined-instruction, catalog-character, scan-candidate, returned-entry, resource, and total-output boundaries;
- Windows reserved/ADS/UNC/device/drive-relative/trailing-dot-space/long/link/reparse/held/raced paths;
- external/blocked files hardlinked to safe-looking AGENTS/Skill/resource names;
- Ubuntu case-distinct paths and supported in-root symlinked Skills/resources;
- valid YAML, BOM, quoted/folded/literal scalars, invalid YAML, cosmetic names, missing description, companion invocation policy, dependencies, legacy parse;
- target-local/parent/root/legacy workspace and explicit user/plugin/other sources;
- duplicate names, exact selectors, many invalid-before-valid candidates, scan truncation, catalog omission, description shortening;
- bare/explicit global combinations for open/snapshot/context/inventory/self-test/load;
- body/resource text, blocked secret files, binary/non-regular/oversized/raced resources, bounded path-only resource listings;
- default exact body results versus explicit `include_resource_index=true` body-with-index results;
- prompt injection requesting root/auth/network/policy/approval/audit changes;
- script/Hook/package-manager/network/environment/filesystem/Git/process canaries;
- direct/supertool/STDIO/HTTP and connection-test/minimal/standard/full;
- legacy/standard/not-ready/preview/ready states and restart rollback;
- active/concurrent/foreign/closed/expired/policy-stale workspaces and per-server isolation;
- secret-looking metadata/bodies/resources/errors/paths and exact redaction accounting;
- protected Smoke drift/substitution, package contents, and no unexpected production dependency.

Expected failure proves zero unintended read, execution, and mutation. A negative canary without an independent working positive control is invalid. Platform skips require an exact capability reason.

### Task 6B1 — reconcile runtime documentation and project knowledge

The design step already synchronized the authoritative Phase 6 boundary. After runtime/adversarial gates pass, update actual behavior in:

- `README.md`
- `README_ZH.md`
- `FAQ.md`
- `FAQ_ZH.md`
- `SECURITY.md`
- `design.md`
- `CHANGELOG.md`
- `config.example.env`
- `AGENTS.example.md`
- `AGENTS.md`
- `docs/PROJECT_ARCHITECTURE_AND_ROADMAP.md`
- `docs/CODEXGPT_MASTER_IMPLEMENTATION_PLAN_2026-07-13.md`
- `Memory.md`
- active Phase 6 archive

Documentation must say plainly:

- root AGENTS text is returned at open and target guidance is loaded before mutation;
- workspace Skill metadata is automatic/budgeted while bodies/resources are lazy;
- user/plugin Skills are explicit standard opt-in;
- one instruction file per directory is selected by exact precedence;
- Skills/AGENTS are context, not authority;
- companion dependencies are not installed and scripts/Hooks do not auto-run;
- `allowed-tools`, version, source, hash, or successful load cannot grant permission;
- actual commands use existing execution mode, Policy, Approval, and Audit;
- `legacy` is temporary rollback compatibility;
- no OS sandbox, DLP, or complete prompt-injection-prevention claim is added.

Run the `neat-freak` workflow only after the usable implementation and tests are complete, then rerun every gate affected by its edits.

### Task 6B2 — full local gate

Run fresh evidence in this order:

1. Phase 6 safe-reader, instruction, Skill metadata, catalog, resource, UX, model-sequence, integration, adversarial, and compatibility tests.
2. Existing open/context/inventory/load/self-test/server-config/supertool/Policy/Audit/path/workspace lifecycle regressions.
3. Exact V1/V2/V3/V4 inherited contract and projection tests.
4. Managed Node 20/24 build.
5. One exact detached managed Node 20/24 ordinary run using Section 3's command.
6. Protected Smoke on both managed majors.
7. Package dry-run and package-contents regression.
8. `npm run policy:check`.
9. `git diff --check` plus an equivalent explicit whitespace check for any untracked files.
10. Added-line secret-looking-content scan that emits only safe file/line locations.
11. Intended-file scope, no staged changes, mutation inventory, protected-Smoke hash/substitution, and exact one-new-dependency audit.
12. Repository-wide Markdown relative-link audit.
13. `Memory.md` line/byte gate and Phase 6 archive 80% rollover gate.
14. Authoritative design/plan/master/AGENTS/Memory consistency check.
15. Neat-freak reconciliation and every affected rerun.

Before retrying ordinary, prove no same-kind run is active. Retain bounded complete stdout/stderr. Stop only an exact owned run ID; never all `node.exe` processes.

### Task 6B3 — publish once and require exact-head CI

This task requires explicit publication approval even if runtime implementation was authorized.

1. Confirm the exact Phase 6 scope and clean staging boundary.
2. Confirm only the approved YAML dependency was added and no Hook runner, Skill runner, Tool Contract V5, credential operation, deployment, or unrelated refactor entered.
3. Stage only intended Phase 6 files.
4. Create one concise English Phase 6 commit.
5. Push once without force.
6. Invoke exact-head diagnostics with the exact 40-character HEAD.
7. Require terminal success for repository policy and Ubuntu/Windows Node 20/24 Build, complete Regression, protected Smoke, and Package jobs.
8. Keep bounded evidence only under ignored `.ai-bridge/`; do not create an evidence-only follow-up commit.
9. Close the active Phase 6 archive only after exact-head success.
10. Do not start Phase 7 without a new explicit instruction.

## 7. Cross-cutting matrix

| Dimension | Required values |
| --- | --- |
| contract | V1=28, V2=31, V3=39, V4=51 |
| guidance mode | legacy, standard not-ready, standard preview, standard ready |
| surface | direct, supertool, STDIO, HTTP |
| profile | connection-test, minimal, standard, full |
| target | root directory, nested directory, regular file, missing future path |
| instruction | override, canonical, configured fallback, empty, broken, collided, per-file limit, combined limit |
| Skill source | target/parent/root workspace, legacy workspace, explicit user, plugin, other |
| metadata | valid, BOM, cosmetic warning, missing, malformed, legacy parse, implicit-disabled, dependencies declared, redacted |
| inventory | complete, invalid-before-valid, scan truncated, catalog shortened, catalog omitted, duplicate |
| load | name, source, exact path, target binding, body, reference text, script text, missing, binary, oversized, raced, escaped, blocked secret |
| authority | context read, filesystem mutation, Git, process; no guidance-derived permission |
| path | ASCII, Unicode, Windows separator, case collision, reserved, ADS, UNC/device, drive-relative, trailing dot/space, long, link/reparse |
| lifecycle | active, concurrent, foreign, closed, expired, policy-stale, server-isolated |
| platform | native Windows and Ubuntu; managed Node 20/24 |

## 8. Rollback

- Set `CODEXGPT_GUIDANCE_MODE=legacy` and restart through `scripts/codexgpt-entry.mjs`.
- Legacy mode restores exact prior open/context/inventory/self-test/load defaults and projections.
- Rollback does not delete, rename, rewrite, move, or chmod any user AGENTS, Skill, resource, profile, audit, branch, worktree, or credential.
- Keep the canonical reader and diagnostics in the same binary; rollback changes behavior, not user data.
- Rollback never enables user-global AGENTS, automatic scripts/Hooks, weaker blocked paths, or weaker Policy/Approval/Audit.

## 9. Completion checklist

Before calling Phase 6 implemented:

```text
[x] Gate G6-0 base/authority/dependency prerequisites are recorded
[x] Tasks 6A0–6A8 have retained RED reasons and fresh GREEN evidence
[x] Root AGENTS content reaches the standard transport projection on workspace open
[x] codex_context is reachable in standard and reloads guidance before target mutations
[x] Target-scoped Skills are discoverable and loadable through one public target binding
[x] Catalog/scan/instruction/resource/output budgets have distinct truthful fields
[x] Standard omitted inputs expose no user/plugin/other Skill
[x] Same-handle race and blocked-secret regressions pass on Windows as applicable
[x] Existing load_skill body requests and all legacy branches remain exact
[x] V1/V2/V3/V4 remain exact 28/31/39/51
[x] Real root and nested ChatGPT usability gates pass
[x] Three independent post-implementation reviews are repaired and recorded
[x] Every execution/mutation/network/Hook/package canary remains untouched during reads
[x] Complete managed Node 20/24 ordinary, Smoke, build, package, and policy gates pass
[x] Documentation, Memory, and Phase 6 archive match the activated runtime
[x] Explicit publication approval is recorded
[x] Exact-head Ubuntu/Windows Node 20/24 CI succeeds
[x] Phase 7 runtime and dependencies remain unstarted
```
