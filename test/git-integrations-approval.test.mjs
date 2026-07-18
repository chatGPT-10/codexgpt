import assert from "node:assert/strict";
import test from "node:test";
import { GitIntegrationGateV4 } from "../dist/git/integrations.js";
import { GitReviewTokenServiceV4 } from "../dist/git/reviewToken.js";

test("repository integrations default off and cannot discover or spawn", async () => {
  let executed = false;
  const reviews = new GitReviewTokenServiceV4({ key: Buffer.alloc(32, 17) });
  const gate = new GitIntegrationGateV4({
    executor: {
      capabilityRevision: "1".repeat(64),
      async runApprovedIntegration() {
        executed = true;
        throw new Error("unexpected");
      }
    },
    reviews,
    enabled: false
  });
  try {
    assert.deepEqual(await gate.discover({}), []);
    await assert.rejects(() => gate.execute({
      workspaceId: "workspace_gate_x",
      repository: {},
      reviewToken: "review_invalid",
      authorization: null,
      semanticStateDigest: "2".repeat(64),
      expectedToolName: "git_stage",
      expectedCanonicalAction: "stage",
      request: {
        operation: "stage",
        paths: ["tracked.txt"],
        privateIndexPath: "private-index",
        objectDirectoryPath: "private-objects"
      }
    }), /GIT_INTEGRATION_REQUIRED/);
    assert.equal(executed, false);
  } finally {
    reviews.dispose();
  }
});
