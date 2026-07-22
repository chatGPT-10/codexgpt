import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(repositoryRoot, "src");
const scriptsRoot = path.join(repositoryRoot, "scripts");

const FIXTURE_SCRIPTS = new Set([
  "analysis-cli-smoke.mjs",
  "analysis-smoke.mjs",
  "doctor-smoke.mjs",
  "execute-handoff-smoke-platform-compat.mjs",
  "execute-handoff-smoke.mjs",
  "http-smoke-compat.mjs",
  "http-smoke.mjs",
  "policy-windows-spike.mjs",
  "pro-smoke.mjs",
  "settings-smoke-platform-compat.mjs",
  "settings-smoke.mjs",
  "smoke-platform-compat.mjs",
  "smoke.mjs",
  "stress-contract-compat.mjs",
  "stress.mjs"
]);

const MUTATION_PRIMITIVES = new Set([
  "appendFile",
  "appendFileSync",
  "chmod",
  "chmodSync",
  "chown",
  "chownSync",
  "copyFile",
  "copyFileSync",
  "cp",
  "cpSync",
  "createWriteStream",
  "fchmod",
  "fchmodSync",
  "fchown",
  "fchownSync",
  "ftruncate",
  "ftruncateSync",
  "futimes",
  "futimesSync",
  "lchmod",
  "lchmodSync",
  "lchown",
  "lchownSync",
  "link",
  "linkSync",
  "lutimes",
  "lutimesSync",
  "mkdir",
  "mkdirSync",
  "mkdtemp",
  "mkdtempDisposable",
  "mkdtempDisposableSync",
  "mkdtempSync",
  "rename",
  "renameSync",
  "rm",
  "rmSync",
  "rmdir",
  "rmdirSync",
  "symlink",
  "symlinkSync",
  "truncate",
  "truncateSync",
  "unlink",
  "unlinkSync",
  "utimes",
  "utimesSync",
  "writeFile",
  "writeFileSync",
  "writeSync",
  "writev",
  "writevSync"
]);

const SPECIAL_MUTATION_PRIMITIVES = new Set(["open", "openSync", "write"]);
const FILESYSTEM_MODULES = new Set(["fs", "fs/promises", "node:fs", "node:fs/promises"]);

// Legacy entries retain line/column for review history, but identity comparison uses syscall + semantic call digest only.
// Keep empty until the RED inventory has exposed every current direct writer.
const REVIEWED_ALLOWLIST = Object.freeze({
  "scripts/atomic-file.mjs": Object.freeze({
    purpose: "Atomic JSON replacement for exact CodexGPT-owned runner evidence and managed toolchain manifests outside authorized workspaces.",
    occurrences: Object.freeze([
      "open:e54c87ef386f",
      "openSync:670d040735ed",
      "writeFile:07f0c29a7b9b",
      "writeFileSync:9ccf524371ed",
      "unlink:fb0ff75e2d15",
      "unlinkSync:df049ccb6d88"
    ])
  }),
  "scripts/ci-change-classifier.mjs": Object.freeze({
    purpose: "CI-only GitHub output emission for runtime-versus-documentation path classification.",
    occurrences: Object.freeze([
      "appendFile:bbcb885992d0"
    ])
  }),
  "scripts/exact-head-ci.mjs": Object.freeze({
    purpose: "Ignored .ai-bridge exact-head CI evidence outside tracked repository state.",
    occurrences: Object.freeze([
      "mkdir:4a6587afbb60",
      "writeFile:7709a9e8cec6"
    ])
  }),
  "scripts/long-task-runner.mjs": Object.freeze({
    purpose: "Ignored .ai-bridge detached-run metadata, PID, result, bounded log state, and exact terminal-evidence retention cleanup.",
    occurrences: Object.freeze([
      "mkdir:6b206662cb80",
      "writeFile:c9aa6cdf9733",
      "writeFile:45f0808a2445",
      "rm:4949e062379d",
      "rename:9e49e08d9148",
      "rename:94267e3ddce4"
    ])
  }),
  "scripts/owned-temp-root.mjs": Object.freeze({
    purpose: "Strictly marked OS-temporary roots with exact owner identity, crash-recovery sweeping, normal-exit cleanup, and fail-closed preservation of unknown or changed paths.",
    occurrences: Object.freeze([
      "mkdtempSync:d94ca1cac534",
      "writeFileSync:7b125ce07c25",
      "mkdtemp:fdee6d9fc181",
      "writeFile:4f50bbd23019",
      "renameSync:7872c20d84c8",
      "rmSync:c726834c86de",
      "rename:1d5c6c7efcac",
      "rm:a482ba2f1f57",
      "rmdirSync:ab1995b10668",
      "rmdir:d7d13df923bd",
      "mkdir:0d84315a43a8"
    ])
  }),
  "scripts/git-capability-spike.mjs": Object.freeze({
    purpose: "Private Gate G0 temporary repository, malicious-integration canaries, private indexes, object quarantine, and exact cleanup under one random OS temp root.",
    occurrences: Object.freeze([
      "writeFile:ca092bc9340f",
      "writeFile:1cf5facaddd3",
      "writeFile:4185a7c4a5cb",
      "appendFile:346c224fa126",
      "mkdir:aec3915a5312",
      "writeFile:0cba90440f49",
      "writeFile:9cf14fd86f45",
      "writeFile:34c66b35c442",
      "mkdtemp:1952d4205e87",
      "mkdir:ab9edf876b0b",
      "mkdir:c038cf0ea56c",
      "mkdir:4cc9191135ad",
      "mkdir:68900dc7fdc7",
      "writeFile:01562529b54e",
      "writeFile:d76594222fc3",
      "writeFile:4bbfd06a2eca",
      "writeFile:d013e5522911",
      "writeFile:bb67b8871bb0",
      "writeFile:664dccea5e60",
      "mkdir:68352e4e3341",
      "rm:dd5cf263e3d9",
      "rm:a4b278427e32"
    ])
  }),
  "scripts/windows-process-host-spike.mjs": Object.freeze({
    purpose: "Isolated native-host temporary bootstrap cleanup plus atomic ignored Gate N capability evidence under .ai-bridge/phase-4.",
    occurrences: Object.freeze([
      "rm:fa5bd97f7b6a",
      "mkdtemp:ac597ce76ac6",
      "mkdir:8d59c783ac4b",
      "writeFile:cfb2f2c460f2",
      "rename:2b73a699394a"
    ])
  }),
  "scripts/windows-local-control-spike.mjs": Object.freeze({
    purpose: "Gate-A0-only private temporary state-root creation and exact-session cleanup outside authorized workspaces.",
    occurrences: Object.freeze([
      "rm:d429a2552f37",
      "mkdtemp:6387dfbd2fcd",
      "mkdir:2ac12b7246b3",
      "rm:e98c88543b7d"
    ])
  }),
  "scripts/worktree-delete-control.mjs": Object.freeze({
    purpose: "Gate W0 isolated OS-temporary junction deletion oracle with an external positive canary and verified exact temporary-root cleanup.",
    occurrences: Object.freeze([
      "mkdtemp:a1fc9877d000",
      "mkdir:69fd927f80a8",
      "mkdir:9ae71d40146f",
      "mkdir:b70b77ed957e",
      "writeFile:737c437c03a1",
      "symlink:23d8dd10495a",
      "rm:ee1ee5dcfd73"
    ])
  }),
  "src/git/execution.ts": Object.freeze({
    purpose: "Per-operation private Git index/object directories inside the separately reviewed owned temporary root; no repository path is mutated by these calls.",
    occurrences: Object.freeze([
      "mkdtemp:08421c876512",
      "mkdir:2396c719b6c5",
      "rm:9b9eb33b42cf"
    ])
  }),
  "src/git/commitService.ts": Object.freeze({
    purpose: "Gate X creates an exact private shadow Git directory, private index, and object quarantine for one approved commit; no live repository path is written by these primitives.",
    occurrences: Object.freeze([
      "mkdir:3363dd16a7b7",
      "mkdir:26ca7694018a",
      "writeFile:5b18b2aac5bd",
      "writeFile:1261bce522c6",
      "writeFile:4ac2f4b2aa28"
    ])
  }),
  "src/git/indexService.ts": Object.freeze({
    purpose: "Gate I private-index construction, expected-old live-index replacement, and exact rollback within an admitted repository.",
    occurrences: Object.freeze([
      "writeFile:9679ddcda8ca",
      "mkdir:26ca7694018a"
    ])
  }),
  "src/git/integrations.ts": Object.freeze({
    purpose: "Gate X materializes one reviewed immutable integration bundle inside the exact private Git temporary root before approved full-access execution.",
    occurrences: Object.freeze([
      "mkdir:eb9e7477f47e",
      "mkdir:2f32be8e04d9",
      "mkdir:2efaa8e3a01f",
      "mkdir:e0c81e0d846f",
      "writeFile:d38166b36176",
      "writeFile:7749af193a1b",
      "writeFile:15159aacbf31",
      "writeFile:605f975b9deb"
    ])
  }),
  "src/git/locks.ts": Object.freeze({
    purpose: "Gate R authenticated repository/worktree lock ownership records, exact owned release, and application-state lock directories outside authorized workspaces; foreign or stale locks are never deleted automatically.",
    occurrences: Object.freeze([
      "open:0198186cfe98",
      "writeFile:185398d589c1",
      "rename:52c6593c907e",
      "rm:6cfb11b35faa",
      "mkdir:1d50900e7cac",
      "mkdir:0f766e0e5452",
      "rmdir:450993335dd4"
    ])
  }),
  "src/git/objectQuarantine.ts": Object.freeze({
    purpose: "Gate R bounded immutable loose-object promotion from private quarantine into admitted repository object storage using create-exclusive writes, content-address verification, and exact failed-create cleanup.",
    occurrences: Object.freeze([
      "mkdir:692c5f0d3994",
      "open:c850a2d74a0a",
      "writeFile:52c6d02cba34",
      "unlink:cd9cf88c25ef"
    ])
  }),
  "src/git/privateIndex.ts": Object.freeze({
    purpose: "Gate D private-index construction, expected-old live-index replacement, and exact rollback within an admitted repository.",
    occurrences: Object.freeze([
      "copyFile:68844944f1d6",
      "writeFile:0020f6e96946",
      "rename:b0fdf0e343d5",
      "rename:b28e252523c3",
      "rm:9448c15ee551",
      "rm:f0be0a5b75e3",
      "rename:9f5b4ffb7646"
    ])
  }),
  "src/git/restoreService.ts": Object.freeze({
    purpose: "Gate D reviewed index or bounded worktree restore with retained byte-for-byte rollback material.",
    occurrences: Object.freeze([
      "copyFile:68844944f1d6"
    ])
  }),
  "src/git/stashService.ts": Object.freeze({
    purpose: "Gate D owner-bound private-stash create/apply rollback and exact selected worktree restoration.",
    occurrences: Object.freeze([
      "writeFile:6f7480e916e4",
      "writeFile:9b7206be7921",
      "writeFile:fe6dc4d51676"
    ])
  }),
  "src/worktrees/materializer.ts": Object.freeze({
    purpose: "Gate W0 no-clobber raw-blob task-tree staging, exact final installation, and exact failed-staging cleanup inside the managed root.",
    occurrences: Object.freeze([
      "mkdir:bb68b125d743",
      "mkdir:903e851d419d",
      "mkdir:fdbd33e2aa9b",
      "writeFile:77487e0d3b1e",
      "rename:2b159fdbe944",
      "rmdir:b0b7f640c507",
      "rename:31702d793b40",
      "rm:29442a0697ae"
    ])
  }),
  "src/worktrees/candidateWorkspace.ts": Object.freeze({
    purpose: "Gate M identity-bound creation of the exact candidate-only verification workspace inside the managed task root.",
    occurrences: Object.freeze([
      "mkdir:b052600cbaf6"
    ])
  }),
  "src/worktrees/mergeExecute.ts": Object.freeze({
    purpose: "Gate M reviewed target file/index/ref transaction and byte-for-byte rollback within the admitted primary worktree.",
    occurrences: Object.freeze([
      "mkdir:b66a34afafb5",
      "writeFile:d36318b3591d",
      "writeFile:9b7206be7921"
    ])
  }),
  "src/worktrees/recovery.ts": Object.freeze({
    purpose: "Gate W restart recovery restores deterministic removal quarantines to their exact paths before retry or completes cleanup after a durable recovery-required transition.",
    occurrences: Object.freeze([
      "rename:6f773b915ce8",
      "rename:f85ac440bd54"
    ])
  }),
  "src/worktrees/remove.ts": Object.freeze({
    purpose: "Gate W atomically quarantines fully inventoried task/admin trees, records a durable recovery transition, completes exact owned cleanup, and rolls back exact paths before any deletion on review or transition failure.",
    occurrences: Object.freeze([
      "rename:a68e816cddc3",
      "rename:b423b56f3f60",
      "rename:77e30bc566cb",
      "rename:b4fc1082b132"
    ])
  }),
  "src/worktrees/remover.ts": Object.freeze({
    purpose: "Gate W0 handle-safe exact owned-tree removal after complete non-reparse, single-link, non-nested-repository inventory.",
    occurrences: Object.freeze([
      "unlink:842a64fcb00a",
      "rmdir:450993335dd4"
    ])
  }),
  "src/worktrees/root.ts": Object.freeze({
    purpose: "Gate W0 startup-only creation of the configured disjoint managed task-worktree root.",
    occurrences: Object.freeze([
      "mkdir:178ce18dfee2"
    ])
  }),
  "scripts/run-and-summarize.mjs": Object.freeze({
    purpose: "CI-local redacted logs, compact failure summaries, and GitHub step summary output.",
    occurrences: Object.freeze([
      "mkdir:df8def470718",
      "createWriteStream:30066316311e",
      "writeFile:0099597e9240",
      "appendFile:fcbdb7d64929"
    ])
  }),
  "scripts/toolchain-manager.mjs": Object.freeze({
    purpose: "Verified official Node toolchain download, atomic installation, manifest recording, and temporary cleanup outside authorized workspaces.",
    occurrences: Object.freeze([
      "createWriteStream:0aef67d719ec",
      "mkdir:2ac12b7246b3",
      "mkdir:22dca29f42dc",
      "rename:1292735ff8ce"
    ])
  }),
  "scripts/cloudflared-installer.mjs": Object.freeze({
    purpose: "Verified cloudflared installer staging, rollback, and replacement outside authorized workspaces.",
    occurrences: Object.freeze([
      "101:3:writeFileSync:c5387b4cef96",
      "109:3:mkdirSync:f52bfc6a75f1",
      "125:3:mkdirSync:448e9c9ba966",
      "128:3:rmSync:d209a92b89ab",
      "129:3:copyFileSync:774ed641145c",
      "130:37:chmodSync:d39506524132",
      "134:5:rmSync:d209a92b89ab",
      "141:3:rmSync:0e9fcffc4b03",
      "144:22:renameSync:13d3ad066d6e",
      "145:5:renameSync:a522aa5b3913",
      "146:5:rmSync:0e9fcffc4b03",
      "148:5:rmSync:d209a92b89ab",
      "150:7:renameSync:662f5f5db2f5"
    ])
  }),
  "scripts/codexgpt.mjs": Object.freeze({
    purpose: "CLI profile, managed binary, runtime marker, and ephemeral tunnel state outside authorized workspaces.",
    occurrences: Object.freeze([
      "663:3:rmSync:67965deb6791",
      "670:3:mkdirSync:34a6fc7c372e",
      "677:3:writeFileSync:bb74df9726e3",
      "679:5:chmodSync:aa6e7b8892f6",
      "686:3:mkdirSync:744d9beff523",
      "706:3:writeFileSync:bb74df9726e3",
      "708:5:chmodSync:aa6e7b8892f6",
      "717:39:rmSync:67965deb6791",
      "870:3:writeFileSync:f733857bff12",
      "891:3:mkdirSync:448e9c9ba966",
      "899:7:mkdirSync:f52bfc6a75f1",
      "911:7:copyFileSync:e37114b998cc",
      "915:7:copyFileSync:43e2f89e1c4b",
      "918:39:chmodSync:664326fc63fc",
      "1229:3:writeFileSync:8d3a7e6f2eb6"
    ])
  }),
  "src/audit/lock.ts": Object.freeze({
    purpose: "Persistent audit lock acquisition, recovery, and quarantine state outside authorized workspaces.",
    occurrences: Object.freeze([
      "45:10:openSync:743e6a357fc2",
      "46:5:writeFileSync:0bca2f9ccf85",
      "103:5:rmSync:fb9714acc0da",
      "149:7:mkdirSync:d6a78ac1533b",
      "152:9:renameSync:71916df4d5de",
      "167:9:rmSync:cf0008e967e4",
      "176:5:mkdirSync:618984dbe19f",
      "207:9:renameSync:7bfa23ef4832"
    ])
  }),
  "src/audit/store.ts": Object.freeze({
    purpose: "Persistent audit segment append, repair, quarantine, and retention maintenance outside authorized workspaces.",
    occurrences: Object.freeze([
      "182:5:mkdirSync:9dc3ef9c3484",
      "183:5:mkdirSync:670914dee074",
      "242:7:write:f755d1ec4f6b",
      "402:12:openSync:d2e2060c3ee7",
      "405:19:writeSync:a40584d153a8",
      "560:22:openSync:a17eaede88fa",
      "563:19:writeSync:93f2eb7c6129",
      "575:19:openSync:59de5fa72237",
      "576:7:ftruncateSync:2a87c094f9f8",
      "585:7:unlinkSync:5a3c43527031",
      "757:13:unlinkSync:05ecea30c390"
    ])
  }),
  "src/control/windowsLocalControl.ts": Object.freeze({
    purpose: "Production V3 local-control per-server state-root creation and exact owned-root cleanup outside authorized workspaces.",
    occurrences: Object.freeze([
      "mkdir:171e413dcf4a",
      "mkdir:91371b31b8c6",
      "rm:aa7c17562af1",
      "rm:f0ce62377a5d"
    ])
  }),
  "src/changesets/moveStore.ts": Object.freeze({
    purpose: "Authenticated zero-blob move change-set manifests outside authorized workspaces.",
    occurrences: Object.freeze([
      "76:9:mkdirSync:82dc4cd81c8a",
      "142:7:mkdirSync:82dc4cd81c8a",
      "150:7:write:a70e40f1b1d6",
      "154:9:rmSync:1ae2b3f771c9",
      "236:5:write:fb16f67735d8"
    ])
  }),
  "src/changesets/store.ts": Object.freeze({
    purpose: "Atomic application-state change-set manifests and encrypted blobs outside authorized workspaces.",
    occurrences: Object.freeze([
      "191:7:mkdirSync:008368be52af",
      "192:7:mkdirSync:adf695ffa063",
      "200:9:mkdirSync:0c40921f82f4",
      "239:7:write:fb609052e7fc",
      "364:12:openSync:743e6a357fc2",
      "365:7:writeFileSync:53437c2bd27c",
      "482:7:mkdirSync:82dc4cd81c8a",
      "484:7:mkdirSync:e46e2078e6ff",
      "488:11:rmSync:1ae2b3f771c9",
      "519:9:rmSync:1ae2b3f771c9",
      "582:9:unlinkSync:867142e079be",
      "671:7:rmdirSync:9ab32820e2eb",
      "672:7:unlinkSync:7e0feedf75c5",
      "673:7:rmdirSync:47f99c0d1368"
    ])
  }),
  "src/fsOps.ts": Object.freeze({
    purpose: "Legacy-mode-only workspace writers retained for the explicit fileTransactions=legacy compatibility path.",
    occurrences: Object.freeze([
      "667:11:mkdir:0405a74d1844",
      "671:9:writeFile:4617f635b0be",
      "719:9:writeFile:8875aefd5fc7",
      "729:13:mkdir:0405a74d1844",
      "730:13:writeFile:4617f635b0be"
    ])
  }),
  "src/handoffOps.ts": Object.freeze({
    purpose: "Legacy-mode-only handoff log appenders retained for the explicit fileTransactions=legacy compatibility path.",
    occurrences: Object.freeze([
      "527:11:appendFile:0857ba648d12",
      "528:11:appendFile:172739a6e349"
    ])
  }),
  "src/moves/engine.ts": Object.freeze({
    purpose: "Atomic same-volume move staging, installation, bounded backend retry, rollback, and cleanup inside authorized workspaces.",
    occurrences: Object.freeze([
      "661:15:mkdir:c34693a030c4",
      "708:15:link:e658cd7588fe",
      "746:17:unlink:01b2b4b052ca",
      "793:15:link:e3266b53bae4",
      "824:15:unlink:9ae293a598dc",
      "870:15:rmdir:f7455b6f1fd7",
      "937:13:link:759d678d36b8",
      "951:15:unlink:0df109c8d786",
      "974:15:link:e13c597bfcfe",
      "989:13:unlink:9ae293a598dc",
      "1019:17:rmdir:f7455b6f1fd7",
      "1146:17:unlink:9ae293a598dc"
    ])
  }),
  "src/moves/recovery.ts": Object.freeze({
    purpose: "Authenticated V2 move recovery and rollback inside authorized workspaces.",
    occurrences: Object.freeze([
      "322:11:unlink:bb4861d11bcd",
      "345:15:rmdir:450993335dd4",
      "458:13:link:71ef7148dc02",
      "473:15:unlink:cd9cf88c25ef",
      "500:15:link:61a842ba953b",
      "527:15:rmdir:450993335dd4"
    ])
  }),
  "src/policy/identity.ts": Object.freeze({
    purpose: "Atomic application-state policy identity key outside authorized workspaces.",
    occurrences: Object.freeze([
      "53:3:mkdirSync:744d9beff523",
      "59:5:writeFileSync:91cd5401b478",
      "61:7:chmodSync:aa6e7b8892f6"
    ])
  }),
  "src/profileStore.ts": Object.freeze({
    purpose: "CLI application profile state outside authorized workspaces.",
    occurrences: Object.freeze([
      "112:3:mkdirSync:34a6fc7c372e",
      "119:3:writeFileSync:bb74df9726e3",
      "121:5:chmodSync:aa6e7b8892f6"
    ])
  }),
  "src/transactions/atomicFs.ts": Object.freeze({
    purpose: "Transaction filesystem backend staging, commit, rollback, and cleanup inside authorized workspaces.",
    occurrences: Object.freeze([
      "36:34:link:3aa590a2eeae",
      "37:36:rename:8b1d44720aa2",
      "38:21:unlink:842a64fcb00a",
      "201:26:open:77327b3b7898",
      "205:30:write:4f2d83339fe0",
      "211:17:chmod:7b8828566a69",
      "219:13:unlink:bb4861d11bcd",
      "225:13:unlink:bb4861d11bcd",
      "247:13:link:7df5f3c1d5e1",
      "256:13:unlink:cd9cf88c25ef",
      "264:11:writeFile:c6f0c09a72c1",
      "266:28:open:f90e43957f02",
      "271:13:unlink:d0c904cf6748",
      "272:13:unlink:bb4861d11bcd",
      "288:13:unlink:d0c904cf6748",
      "328:13:unlink:5de63dcdbf1e",
      "329:13:unlink:71aa80042ff6",
      "417:15:rename:e7c1387784ec",
      "424:15:unlink:9cba3d963025",
      "450:15:unlink:9cba3d963025",
      "455:17:rename:66540a75cb08",
      "490:15:unlink:3f3464009bc2"
    ])
  }),
  "src/transactions/atomicStateFile.ts": Object.freeze({
    purpose: "Atomic application-state writer for transaction and manifest files outside authorized workspaces.",
    occurrences: Object.freeze([
      "47:38:mkdirSync:c4f25b2136c9",
      "48:36:openSync:95da2c4abc0a",
      "49:42:writeFileSync:186e06036758",
      "52:29:renameSync:99965dbf3c8a",
      "53:25:unlinkSync:2722a9210b32",
      "109:5:mkdirSync:404972daee24",
      "122:12:openSync:ab0b14a61161",
      "123:7:writeFileSync:95862c292341",
      "127:7:renameSync:cda03767a310",
      "138:9:unlinkSync:61be211f161f",
      "195:12:write:7a85fd5df8d1",
      "222:12:write:b3e2829bf17d"
    ])
  }),
  "src/transactions/engine.ts": Object.freeze({
    purpose: "Transaction filesystem backend directory mutation inside authorized workspaces.",
    occurrences: Object.freeze([
      "433:17:mkdir:42f1c1952f6b",
      "601:17:rmdir:2aa41c85eef7"
    ])
  }),
  "src/transactions/installation.ts": Object.freeze({
    purpose: "Atomic application-state installation identity outside authorized workspaces.",
    occurrences: Object.freeze([
      "61:3:mkdirSync:8116ecc503d6",
      "70:5:mkdirSync:7dfb577930e9",
      "103:10:openSync:5abfb7e30626",
      "104:5:writeFileSync:91794f246ec4",
      "109:7:chmodSync:c54e608183a4",
      "114:7:linkSync:d2bc7f9d14b3",
      "138:7:unlinkSync:f3f741ed857d"
    ])
  }),
  "src/transactions/manifestV2Store.ts": Object.freeze({
    purpose: "Authenticated V2 transaction manifests outside authorized workspaces.",
    occurrences: Object.freeze([
      "55:12:write:24c79722626c",
      "74:12:write:b53cbb602090"
    ])
  }),
  "src/transactions/recovery.ts": Object.freeze({
    purpose: "Transaction filesystem backend recovery and rollback inside authorized workspaces.",
    occurrences: Object.freeze([
      "205:3:unlinkSync:476f406a7921",
      "404:9:unlinkSync:de4d6c476669",
      "419:11:renameSync:580bdad99e6c",
      "421:11:linkSync:ab8289d86c70",
      "443:9:linkSync:ab8289d86c70",
      "487:9:rmdirSync:47f99c0d1368"
    ])
  }),
  "src/transactions/workspaceLock.ts": Object.freeze({
    purpose: "Atomic application-state transaction ownership and workspace lock records outside authorized workspaces.",
    occurrences: Object.freeze([
      "38:10:openSync:743e6a357fc2",
      "39:5:writeFileSync:bf70d45a49ed",
      "61:5:mkdirSync:2c43234d1fc5",
      "98:9:unlinkSync:3ffee3f73f04",
      "144:7:renameSync:41567265102d",
      "148:5:rmSync:54b9218dbb59",
      "173:5:mkdirSync:618984dbe19f",
      "179:9:mkdirSync:373f6a9c39e4",
      "195:11:rmSync:2d8844e006c0",
      "227:9:renameSync:e184fd54b538"
    ])
  })
});

function canonicalRelativePath(file) {
  return path.relative(repositoryRoot, file).split(path.sep).join("/");
}

async function enumerateSourceFiles() {
  const files = [];
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(target);
    }
  }
  await visit(sourceRoot);

  const scripts = await fs.readdir(scriptsRoot, { withFileTypes: true });
  for (const entry of scripts.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".mjs") && !entry.name.endsWith(".cjs")) continue;
    if (FIXTURE_SCRIPTS.has(entry.name)) continue;
    files.push(path.join(scriptsRoot, entry.name));
  }
  return files.sort((left, right) => canonicalRelativePath(left).localeCompare(canonicalRelativePath(right)));
}

function callDigest(call, sourceFile) {
  return createHash("sha256")
    .update(call.getText(sourceFile).replace(/\r\n/g, "\n"))
    .digest("hex")
    .slice(0, 12);
}

function reviewedIdentity(entry) {
  const parts = entry.split(":");
  return parts.length >= 4 ? parts.slice(-2).join(":") : entry;
}

function literalText(node) {
  return ts.isStringLiteralLike(node) ? node.text : undefined;
}

function filesystemBindings(sourceFile) {
  const namespaces = new Set();
  const named = new Map();
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const moduleName = literalText(statement.moduleSpecifier);
      if (!moduleName || !FILESYSTEM_MODULES.has(moduleName)) continue;
      const clause = statement.importClause;
      if (!clause) continue;
      if (clause.name) namespaces.add(clause.name.text);
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        namespaces.add(clause.namedBindings.name.text);
      }
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          named.set(element.name.text, element.propertyName?.text ?? element.name.text);
        }
      }
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const initializer = declaration.initializer;
      if (!initializer || !ts.isCallExpression(initializer)) continue;
      if (!ts.isIdentifier(initializer.expression) || initializer.expression.text !== "require") continue;
      const moduleName = initializer.arguments[0] ? literalText(initializer.arguments[0]) : undefined;
      if (!moduleName || !FILESYSTEM_MODULES.has(moduleName)) continue;
      if (ts.isIdentifier(declaration.name)) {
        namespaces.add(declaration.name.text);
      } else if (ts.isObjectBindingPattern(declaration.name)) {
        for (const element of declaration.name.elements) {
          if (!ts.isIdentifier(element.name)) continue;
          const imported = element.propertyName && ts.isIdentifier(element.propertyName)
            ? element.propertyName.text
            : element.name.text;
          named.set(element.name.text, imported);
        }
      }
    }
  }
  return { named, namespaces };
}

function receiverRoot(expression) {
  let current = expression;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    current = current.expression;
  }
  return ts.isIdentifier(current) ? current.text : undefined;
}

function isFilesystemReceiver(expression, bindings) {
  const root = receiverRoot(expression);
  if (root && bindings.namespaces.has(root)) return true;
  const text = expression.getText();
  return /(?:^|\.)(?:dependencies|atomic|indexStore)$/.test(text) ||
    /(?:^|\.)(?:handle|fileHandle)$/.test(text);
}

function isMutationOpen(call) {
  if (call.arguments.length < 2) return false;
  const flags = call.arguments[1] ? literalText(call.arguments[1]) : undefined;
  return flags !== "r";
}

function primitiveForCall(call, bindings) {
  const expression = call.expression;
  if (ts.isPropertyAccessExpression(expression)) {
    const primitive = expression.name.text;
    if (MUTATION_PRIMITIVES.has(primitive)) return primitive;
    if ((primitive === "open" || primitive === "openSync") && isMutationOpen(call)) {
      return primitive;
    }
    if (
      primitive === "write" &&
      (isFilesystemReceiver(expression.expression, bindings) || call.arguments.length >= 4)
    ) return primitive;
    return undefined;
  }
  if (!ts.isIdentifier(expression)) return undefined;
  const imported = bindings.named.get(expression.text);
  if (!imported) return undefined;
  if (MUTATION_PRIMITIVES.has(imported)) return imported;
  if ((imported === "open" || imported === "openSync") && literalText(call.arguments[1]) !== "r") return imported;
  if (imported === "write") return imported;
  return undefined;
}

function scanFile(relativePath, source) {
  const scriptKind = relativePath.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, scriptKind);
  const bindings = filesystemBindings(sourceFile);
  const occurrences = [];

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const primitive = primitiveForCall(node, bindings);
      if (primitive && (MUTATION_PRIMITIVES.has(primitive) || SPECIAL_MUTATION_PRIMITIVES.has(primitive))) {
        const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        occurrences.push({
          key: `${primitive}:${callDigest(node, sourceFile)}`,
          diagnostic: `${location.line + 1}:${location.character + 1}`,
          line: location.line + 1,
          primitive,
          source: node.getText(sourceFile).replace(/\s+/g, " ")
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return occurrences;
}

function formatOccurrence(relativePath, occurrence) {
  return `${relativePath}:${occurrence.diagnostic}:${occurrence.key} ${occurrence.source}`;
}

test("the scanner detects CommonJS filesystem aliases and ignores read-only opens", () => {
  const source = [
    'const fs = require("node:fs");',
    'const { writeFileSync: persist } = require("fs");',
    'fs.openSync("input.txt", "r");',
    'fs.openSync("output.txt", "a");',
    'fs.writeFileSync("one.txt", "one");',
    'persist("two.txt", "two");',
    'const io = require("node:fs").promises;',
    'io.open("three.txt", "w");',
    'const output = {};',
    'output.write(Buffer.from("four"), 0, 4, 0);',
    'fs.cpSync("from", "to");',
    'fs.writevSync(1, []);',
    'fs.ftruncateSync(1, 0);',
    'const indexStore = {};',
    'indexStore.write("index.json", {});'
  ].join("\n");

  assert.deepEqual(
    scanFile("scripts/example.cjs", source).map(({ primitive }) => primitive),
    [
      "openSync",
      "writeFileSync",
      "writeFileSync",
      "open",
      "write",
      "cpSync",
      "writevSync",
      "ftruncateSync",
      "write"
    ]
  );
});

test("mutation review identity ignores line and column drift", () => {
  const compact = 'import fs from "node:fs";\nfs.writeFileSync("a.txt", "A");';
  const shifted = '\n\nimport fs from "node:fs";\n\n  fs.writeFileSync("a.txt", "A");';
  const compactOccurrence = scanFile("scripts/example.mjs", compact)[0];
  const shiftedOccurrence = scanFile("scripts/example.mjs", shifted)[0];
  assert.equal(compactOccurrence.key, shiftedOccurrence.key);
  assert.notEqual(compactOccurrence.diagnostic, shiftedOccurrence.diagnostic);
});

test("legacy workspace writers are unreachable from the atomic default server path", async () => {
  const server = (await fs.readFile(path.join(sourceRoot, "server.ts"), "utf8")).replace(/\r\n/g, "\n");
  const count = (needle) => server.split(needle).length - 1;

  for (const [prepare, provider] of [
    ["prepareWriteTextFile", "writeResultProvider"],
    ["prepareEditTextFile", "editResultProvider"],
    ["prepareWorkspacePatch", "applyPatchResultProvider"]
  ]) {
    assert.equal(count(`prepared?.result ?? await ${provider}`), 1, `${provider} must have one default call site`);
    assert.match(
      server,
      new RegExp(
        `const prepared = config\\.fileTransactions === "atomic"[\\s\\S]{0,1200}` +
        `\\? await ${prepare}\\([\\s\\S]{0,1200}: null;[\\s\\S]{0,400}` +
        `prepared\\?\\.result \\?\\? await ${provider}\\(`
      ),
      `${provider} must be selected only after the atomic preparation branch has produced no result`
    );
  }

  assert.equal(count("return exportPreparedProContext("), 1);
  assert.match(
    server,
    /if \(config\.fileTransactions !== "atomic"\) \{\s+return exportPreparedProContext\(/
  );
  assert.equal(count('if (config.fileTransactions !== "atomic") return writePreparedAgentHandoff(context);'), 2);
  assert.match(
    server,
    /config\.fileTransactions !== "atomic"\s+\? defaultCodexGPTSelfTestProvider\s+: async/
  );

  assert.match(REVIEWED_ALLOWLIST["src/fsOps.ts"].purpose, /^Legacy-mode-only /);
  assert.match(REVIEWED_ALLOWLIST["src/handoffOps.ts"].purpose, /^Legacy-mode-only /);
});

test("all shipped mutation primitives have an exact reviewed classification", async () => {
  const actual = new Map();
  for (const file of await enumerateSourceFiles()) {
    const relativePath = canonicalRelativePath(file);
    const source = (await fs.readFile(file, "utf8")).replace(/\r\n/g, "\n");
    const occurrences = scanFile(relativePath, source);
    if (occurrences.length > 0) actual.set(relativePath, occurrences);
  }

  const unreviewed = [];
  const stale = [];
  for (const [relativePath, occurrences] of actual) {
    const reviewed = REVIEWED_ALLOWLIST[relativePath];
    const reviewedKeys = new Set((reviewed?.occurrences ?? []).map(reviewedIdentity));
    for (const occurrence of occurrences) {
      if (!reviewed?.purpose || !reviewedKeys.has(occurrence.key)) {
        unreviewed.push(formatOccurrence(relativePath, occurrence));
      }
    }
  }
  for (const [relativePath, reviewed] of Object.entries(REVIEWED_ALLOWLIST)) {
    assert.equal(typeof reviewed.purpose, "string", `${relativePath} must have a reviewed purpose`);
    assert.ok(reviewed.purpose.length > 0, `${relativePath} must have a reviewed purpose`);
    const actualKeys = new Set((actual.get(relativePath) ?? []).map((occurrence) => occurrence.key));
    for (const entry of reviewed.occurrences) {
      const key = reviewedIdentity(entry);
      if (!actualKeys.has(key)) stale.push(`${relativePath}:${entry} => ${key} (${reviewed.purpose})`);
    }
  }

  assert.deepEqual(unreviewed, [], `Unreviewed mutation primitives:\n${unreviewed.join("\n")}`);
  assert.deepEqual(stale, [], `Stale mutation allowlist entries (syscall/call drift):\n${stale.join("\n")}`);
});

test("native mutation review covers every shipped C#/PowerShell source without directory exemptions", async () => {
  const nativeInventory = JSON.parse(await fs.readFile(path.join(scriptsRoot, "windows-native-api-inventory-v1.json"), "utf8"));
  const actualNativeFiles = (await fs.readdir(scriptsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && (entry.name.endsWith(".cs") || entry.name.endsWith(".ps1")))
    .map((entry) => `scripts/${entry.name}`)
    .sort();
  assert.deepEqual(nativeInventory.reviewedFiles, actualNativeFiles);
  assert.equal(nativeInventory.schemaVersion, 1);
  assert.ok(nativeInventory.entryCount > 0);
  assert.match(nativeInventory.inventoryDigest, /^[a-f0-9]{64}$/);
  const nativeArchitectureTest = await fs.readFile(path.join(repositoryRoot, "test", "native-host-architecture.test.mjs"), "utf8");
  assert.match(nativeArchitectureTest, /async function nativeSourceFiles\(\)/);
  assert.match(nativeArchitectureTest, /entry\.isDirectory\(\)\) await visit\(target\)/);
  assert.doesNotMatch(nativeArchitectureTest, /\b(?:NATIVE_SOURCE_EXEMPTIONS|IGNORED_NATIVE_PATHS|NATIVE_FIXTURE_EXEMPTIONS)\b/);
});
