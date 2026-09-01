import {
  profilePathForRoot,
  readWorkspaceProfile,
  saveWorkspaceProfile,
  type WorkspaceProfile
} from "../profileStore.js";

export type LocalAdminToolMode = "minimal" | "standard" | "full";

export interface LocalAdminSettingsSnapshot {
  readonly toolMode: LocalAdminToolMode;
  readonly profilePath: string;
  readonly appliesAfterRestart: boolean;
}

export interface LocalAdminSettingsService {
  snapshot(): Promise<LocalAdminSettingsSnapshot>;
  setToolMode(toolMode: LocalAdminToolMode): Promise<LocalAdminSettingsSnapshot>;
}

function validToolMode(value: unknown, fallback: LocalAdminToolMode): LocalAdminToolMode {
  return value === "minimal" || value === "standard" || value === "full" ? value : fallback;
}

export function profileWithToolMode(
  profile: WorkspaceProfile,
  toolMode: LocalAdminToolMode
): WorkspaceProfile {
  const { profilePath: _profilePath, ...persistedProfile } = profile;
  return { ...persistedProfile, toolMode };
}

export function createLocalAdminSettingsService(
  root: string,
  currentToolMode: LocalAdminToolMode
): LocalAdminSettingsService {
  const snapshot = (): LocalAdminSettingsSnapshot => {
    const profile = readWorkspaceProfile(root);
    const toolMode = validToolMode(profile.toolMode, currentToolMode);
    return {
      toolMode,
      profilePath: profile.profilePath ?? profilePathForRoot(root),
      appliesAfterRestart: toolMode !== currentToolMode
    };
  };
  return Object.freeze({
    snapshot: async () => snapshot(),
    setToolMode: async (toolMode: LocalAdminToolMode) => {
      const profilePath = saveWorkspaceProfile(root, profileWithToolMode(readWorkspaceProfile(root), toolMode));
      return {
        toolMode,
        profilePath,
        appliesAfterRestart: toolMode !== currentToolMode
      };
    }
  });
}
