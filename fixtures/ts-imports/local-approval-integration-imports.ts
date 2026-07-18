// Keep Node 20 + tsx on one canonical .js-specifier graph. Load policy leaves
// before the shared local-control servers to avoid duplicate .ts/.js loader work.
import { SessionGrantStore } from "../../src/policy/approval.js";
import { PendingApprovalStore } from "../../src/policy/pendingApprovals.js";
import {
  createAuthorizationFactsV3,
  semanticDigest
} from "../../src/policy/authorizationFacts.js";
import { LocalApprovalClient } from "../../src/control/localApprovalClient.js";
import { LocalApprovalServer } from "../../src/control/localApprovalServer.js";
import {
  WindowsLocalControlRuntime,
  localControlServerId
} from "../../src/control/windowsLocalControl.js";

export {
  SessionGrantStore,
  PendingApprovalStore,
  createAuthorizationFactsV3,
  semanticDigest,
  LocalApprovalClient,
  LocalApprovalServer,
  WindowsLocalControlRuntime,
  localControlServerId
};
