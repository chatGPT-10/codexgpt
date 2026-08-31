export interface WorkspaceProfileValidationOptions {
  readonly expectedRoot?: string;
  readonly profilePath?: string;
}

export class WorkspaceProfileValidationError extends Error {
  readonly code: string;
  readonly jsonPath: string;
  readonly profilePath?: string;
  readonly remediation: string;
}

export function validateWorkspaceProfileDocument(
  value: unknown,
  options?: WorkspaceProfileValidationOptions
): Record<string, unknown>;

export function parseWorkspaceProfileJson(
  text: string,
  options?: WorkspaceProfileValidationOptions
): Record<string, unknown>;
