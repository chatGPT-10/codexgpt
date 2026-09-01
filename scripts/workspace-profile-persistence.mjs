import fs from "node:fs";
import path from "node:path";

import { writeJsonAtomicFileSync } from "./atomic-file.mjs";
import {
  parseWorkspaceProfileJson,
  validateWorkspaceProfileDocument
} from "./workspace-profile-schema.mjs";

export const CURRENT_WORKSPACE_PROFILE_VERSION = 2;

export class WorkspaceProfilePersistenceError extends Error {
  constructor(code, message, profilePath) {
    super(message);
    this.name = "WorkspaceProfilePersistenceError";
    this.code = code;
    this.profilePath = profilePath;
  }
}

function persistenceError(code, message, profilePath) {
  return new WorkspaceProfilePersistenceError(code, message, profilePath);
}

function isMissing(error) {
  return error && typeof error === "object" && error.code === "ENOENT";
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function assertRegularProfileFile(filePath, stat) {
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw persistenceError(
      "WORKSPACE_PROFILE_FILE_INVALID",
      "Saved workspace profile storage must be one regular file. Delete and recreate the saved settings.",
      filePath
    );
  }
}

function assertExpectedProfileLinks(filePath, stat) {
  if (stat.nlink === 1) return;
  throw persistenceError(
    "WORKSPACE_PROFILE_FILE_INVALID",
    "Saved workspace profile storage has an unexpected link count. Delete and recreate the saved settings.",
    filePath
  );
}

function readCurrentProfile(filePath, root) {
  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  assertRegularProfileFile(filePath, stat);
  const text = fs.readFileSync(filePath, "utf8");
  const profile = parseWorkspaceProfileJson(text, { expectedRoot: root, profilePath: filePath });
  assertExpectedProfileLinks(filePath, stat);
  return { stat, text, profile };
}

function assertCurrentProfileUnchanged(filePath, previous) {
  if (!previous) {
    if (fs.existsSync(filePath)) {
      throw persistenceError(
        "WORKSPACE_PROFILE_CONFLICT",
        "Saved workspace settings were created by another writer. Retry after reviewing the current settings.",
        filePath
      );
    }
    return;
  }

  let currentStat;
  let currentText;
  try {
    currentStat = fs.lstatSync(filePath);
    currentText = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (!isMissing(error)) throw error;
    throw persistenceError(
      "WORKSPACE_PROFILE_CONFLICT",
      "Saved workspace settings changed while this update was being prepared. Retry after reviewing the current settings.",
      filePath
    );
  }
  if (
    !currentStat.isFile() ||
    currentStat.isSymbolicLink() ||
    !sameIdentity(currentStat, previous.stat) ||
    currentText !== previous.text
  ) {
    throw persistenceError(
      "WORKSPACE_PROFILE_CONFLICT",
      "Saved workspace settings changed while this update was being prepared. Retry after reviewing the current settings.",
      filePath
    );
  }
}

export function workspaceProfileMigrationBackupPath(profilePath, sourceVersion) {
  if (!Number.isInteger(sourceVersion) || sourceVersion < 1 || sourceVersion >= CURRENT_WORKSPACE_PROFILE_VERSION) {
    throw persistenceError(
      "WORKSPACE_PROFILE_BACKUP_INVALID",
      "Workspace profile migration backup version is invalid.",
      profilePath
    );
  }
  const resolved = path.resolve(profilePath);
  const extension = path.extname(resolved);
  const stem = path.basename(resolved, extension);
  return path.join(path.dirname(resolved), "backups", `${stem}.v${sourceVersion}.json`);
}

function verifyExistingBackup(backupPath, expectedText, sourceStat) {
  const stat = fs.lstatSync(backupPath);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    sameIdentity(stat, sourceStat) ||
    fs.readFileSync(backupPath, "utf8") !== expectedText
  ) {
    throw persistenceError(
      "WORKSPACE_PROFILE_BACKUP_CONFLICT",
      "The saved workspace profile migration backup conflicts with the current source profile. Preserve both files and review them manually.",
      backupPath
    );
  }
}

function preserveMigrationSource(previous, filePath, sourceVersion) {
  const backupPath = workspaceProfileMigrationBackupPath(filePath, sourceVersion);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true, mode: 0o700 });
  let created = false;
  try {
    fs.copyFileSync(filePath, backupPath, fs.constants.COPYFILE_EXCL);
    created = true;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      verifyExistingBackup(backupPath, previous.text, previous.stat);
      return backupPath;
    }
    throw persistenceError(
      "WORKSPACE_PROFILE_BACKUP_FAILED",
      "Could not preserve the current saved workspace profile before migration. The current profile was not replaced.",
      filePath
    );
  }
  try {
    verifyExistingBackup(backupPath, previous.text, previous.stat);
    const descriptor = fs.openSync(backupPath, "r+");
    try {
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
  } catch (error) {
    if (created) {
      try {
        fs.rmSync(backupPath, { force: true });
      } catch {
        // Preserve an uncertain backup artifact for manual review.
      }
    }
    throw error;
  }
  try {
    fs.chmodSync(backupPath, 0o600);
  } catch {
    // Best-effort permission repair for filesystems that support chmod.
  }
  return backupPath;
}

function normalizedProfile(root, profile, now) {
  const {
    version: _version,
    root: _root,
    updatedAt: _updatedAt,
    profilePath: _profilePath,
    ...savedFields
  } = profile;
  return {
    version: CURRENT_WORKSPACE_PROFILE_VERSION,
    updatedAt: now().toISOString(),
    ...savedFields,
    root
  };
}

export function saveWorkspaceProfileFileSync(profilePath, root, profile, options = {}) {
  const resolved = path.resolve(profilePath);
  const payload = normalizedProfile(root, profile, options.now ?? (() => new Date()));
  validateWorkspaceProfileDocument(payload, { expectedRoot: root, profilePath: resolved });
  options.validatePayload?.(payload);

  const previous = readCurrentProfile(resolved, root);
  const sourceVersion = previous?.profile.version;
  let backupPath;
  if (sourceVersion !== undefined && sourceVersion < CURRENT_WORKSPACE_PROFILE_VERSION) {
    backupPath = preserveMigrationSource(previous, resolved, sourceVersion);
    options.injectFailure?.("after_backup");
  }

  fs.mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
  writeJsonAtomicFileSync(resolved, payload, {
    rename: (temporary, target) => {
      options.injectFailure?.("before_replace");
      assertCurrentProfileUnchanged(resolved, previous);
      (options.rename ?? fs.renameSync)(temporary, target);
    }
  });
  try {
    fs.chmodSync(resolved, 0o600);
  } catch {
    // Best-effort permission repair for filesystems that support chmod.
  }
  return {
    profilePath: resolved,
    profile: payload,
    migratedFrom: sourceVersion !== undefined && sourceVersion < CURRENT_WORKSPACE_PROFILE_VERSION
      ? sourceVersion
      : undefined,
    backupPath
  };
}

export function deleteWorkspaceProfileFilesSync(profilePath) {
  const resolved = path.resolve(profilePath);
  const extension = path.extname(resolved);
  const stem = path.basename(resolved, extension);
  const backupsDirectory = path.join(path.dirname(resolved), "backups");
  let removed = false;

  if (fs.existsSync(backupsDirectory)) {
    const pattern = new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.v[1-9][0-9]*\\.json$`);
    for (const name of fs.readdirSync(backupsDirectory)) {
      if (!pattern.test(name)) continue;
      fs.rmSync(path.join(backupsDirectory, name), { force: true });
      removed = true;
    }
    if (fs.readdirSync(backupsDirectory).length === 0) fs.rmdirSync(backupsDirectory);
  }
  if (fs.existsSync(resolved)) {
    fs.rmSync(resolved, { force: true });
    removed = true;
  }
  return removed;
}
