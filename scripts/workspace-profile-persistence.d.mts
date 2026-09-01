export interface WorkspaceProfilePersistenceOptions {
  readonly now?: () => Date;
  readonly validatePayload?: (payload: Record<string, unknown>) => void;
  readonly injectFailure?: (stage: "after_backup" | "before_replace") => void;
  readonly rename?: (source: string, target: string) => void;
}

export interface WorkspaceProfilePersistenceResult {
  readonly profilePath: string;
  readonly profile: Record<string, unknown>;
  readonly migratedFrom?: number;
  readonly backupPath?: string;
}

export const CURRENT_WORKSPACE_PROFILE_VERSION: 2;

export class WorkspaceProfilePersistenceError extends Error {
  readonly code: string;
  readonly profilePath: string;
}

export function workspaceProfileMigrationBackupPath(profilePath: string, sourceVersion: number): string;

export function saveWorkspaceProfileFileSync(
  profilePath: string,
  root: string,
  profile: Record<string, unknown>,
  options?: WorkspaceProfilePersistenceOptions
): WorkspaceProfilePersistenceResult;

export function deleteWorkspaceProfileFilesSync(profilePath: string): boolean;
