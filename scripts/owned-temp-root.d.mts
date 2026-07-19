export interface OwnedTempMarkerV1 {
  readonly schemaVersion: 1;
  readonly kind: "codexpro-owned-temp";
  readonly purpose: string;
  readonly rootName: string;
  readonly pid: number;
  readonly nonce: string;
  readonly processStartedAt?: string;
  readonly createdAt: string;
}

export interface OwnedTempRoot {
  readonly path: string;
  readonly marker: OwnedTempMarkerV1;
  cleanup(): Promise<void>;
  cleanupSync(): void;
}

export interface OwnedTempOptions {
  baseRoot?: string;
  sweep?: boolean;
  sweepLimit?: number;
  hostEnvironment?: NodeJS.ProcessEnv;
}

export interface OwnedTempEnvironment {
  readonly rootPath: string;
  readonly tempPath: string;
  readonly marker: OwnedTempMarkerV1;
  readonly environment: Readonly<NodeJS.ProcessEnv>;
  cleanup(): Promise<void>;
  cleanupSync(): void;
}

export interface OwnedTempSweepResult {
  readonly scanned: number;
  readonly removed: number;
  readonly active: number;
  readonly invalid: number;
  readonly limited: boolean;
}

export const OWNED_TEMP_SCHEMA_VERSION: 1;
export const OWNED_TEMP_MARKER: string;
export const OWNED_TEMP_PREFIX: string;
export function createOwnedTempRoot(purpose: string, options?: OwnedTempOptions): Promise<OwnedTempRoot>;
export function createOwnedTempRootSync(purpose: string, options?: OwnedTempOptions): OwnedTempRoot;
export function createOwnedTempEnvironment(purpose: string, options?: OwnedTempOptions): Promise<OwnedTempEnvironment>;
export function sweepStaleOwnedTempRoots(options?: Pick<OwnedTempOptions, "baseRoot"> & { limit?: number }): Promise<OwnedTempSweepResult>;
export function sweepStaleOwnedTempRootsSync(options?: Pick<OwnedTempOptions, "baseRoot"> & { limit?: number }): OwnedTempSweepResult;
