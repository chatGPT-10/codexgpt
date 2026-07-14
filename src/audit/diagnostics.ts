import fs from "node:fs";
import path from "node:path";
import type { AuditMode, AuditRetentionConfig } from "../config.js";
import {
  resolveTransactionStateRoot,
  transactionStateDirectories
} from "../transactions/stateRoot.js";
import { ProcessInstanceRegistry } from "../transactions/workspaceLock.js";
import { AuditError } from "./types.js";
import { PersistentAuditStore } from "./store.js";

export type AuditReadinessReasonCode =
  | "AUDIT_READY"
  | "AUDIT_DISABLED"
  | "AUDIT_UNINITIALIZED"
  | "AUDIT_RETENTION_INVALID"
  | "AUDIT_BUSY"
  | "AUDIT_INTEGRITY_FAILURE"
  | "AUDIT_UNAVAILABLE";

export interface AuditReadinessProbe {
  outcome: "pass" | "warn" | "fail" | "skipped";
  reasonCode: AuditReadinessReasonCode;
  checks: {
    stateDirectoryValid: boolean;
    installationKeyValid: boolean;
    writerLockValid: boolean;
    tailValid: boolean;
    retentionValid: boolean;
  };
}

export interface AuditReadinessConfig {
  auditMode: AuditMode;
  auditRetention: AuditRetentionConfig;
}

export interface AuditReadinessOptions {
  stateRoot?: string;
  resolveStateRoot?: () => string;
}

function emptyChecks(retentionValid: boolean): AuditReadinessProbe["checks"] {
  return {
    stateDirectoryValid: false,
    installationKeyValid: false,
    writerLockValid: false,
    tailValid: false,
    retentionValid
  };
}

function validRetention(retention: AuditRetentionConfig): boolean {
  return (
    Number.isInteger(retention.maxAgeDays) &&
    retention.maxAgeDays >= 1 &&
    retention.maxAgeDays <= 365 &&
    Number.isInteger(retention.maxClosedBytes) &&
    retention.maxClosedBytes >= 1024 * 1024 &&
    retention.maxClosedBytes <= 2 * 1024 * 1024 * 1024
  );
}

export async function probeAuditReadiness(
  config: AuditReadinessConfig,
  options: AuditReadinessOptions = {}
): Promise<AuditReadinessProbe> {
  const retentionValid = validRetention(config.auditRetention);
  if (config.auditMode === "off") {
    return {
      outcome: "skipped",
      reasonCode: "AUDIT_DISABLED",
      checks: emptyChecks(retentionValid)
    };
  }
  if (!retentionValid) {
    return {
      outcome: "fail",
      reasonCode: "AUDIT_RETENTION_INVALID",
      checks: emptyChecks(false)
    };
  }

  let stateRoot: string;
  try {
    stateRoot = path.resolve(options.stateRoot ?? (options.resolveStateRoot ?? resolveTransactionStateRoot)());
    if (!path.isAbsolute(stateRoot)) throw new Error("state root is not absolute");
  } catch {
    return {
      outcome: config.auditMode === "required" ? "fail" : "warn",
      reasonCode: config.auditMode === "required" ? "AUDIT_UNAVAILABLE" : "AUDIT_UNINITIALIZED",
      checks: emptyChecks(true)
    };
  }

  const directories = transactionStateDirectories(stateRoot);
  if (!fs.existsSync(directories.installationFile)) {
    return {
      outcome: "warn",
      reasonCode: "AUDIT_UNINITIALIZED",
      checks: {
        stateDirectoryValid: true,
        installationKeyValid: false,
        writerLockValid: false,
        tailValid: false,
        retentionValid: true
      }
    };
  }

  let registry: ProcessInstanceRegistry | undefined;
  let store: PersistentAuditStore | undefined;
  try {
    registry = new ProcessInstanceRegistry(stateRoot);
    store = PersistentAuditStore.open({
      stateRoot,
      registry,
      retention: config.auditRetention,
      lockRetryCount: 0
    });
    await store.probeIntegrity();
    return {
      outcome: "pass",
      reasonCode: "AUDIT_READY",
      checks: {
        stateDirectoryValid: true,
        installationKeyValid: true,
        writerLockValid: true,
        tailValid: true,
        retentionValid: true
      }
    };
  } catch (error) {
    if (error instanceof AuditError && error.code === "AUDIT_BUSY") {
      return {
        outcome: "warn",
        reasonCode: "AUDIT_BUSY",
        checks: {
          stateDirectoryValid: true,
          installationKeyValid: true,
          writerLockValid: false,
          tailValid: false,
          retentionValid: true
        }
      };
    }
    if (error instanceof AuditError && error.code === "AUDIT_INTEGRITY_FAILURE") {
      return {
        outcome: "fail",
        reasonCode: "AUDIT_INTEGRITY_FAILURE",
        checks: {
          stateDirectoryValid: true,
          installationKeyValid: true,
          writerLockValid: true,
          tailValid: false,
          retentionValid: true
        }
      };
    }
    return {
      outcome: "fail",
      reasonCode: "AUDIT_UNAVAILABLE",
      checks: emptyChecks(true)
    };
  } finally {
    store?.dispose();
    registry?.dispose();
  }
}
