export type AuthErrorCode =
  | "AUTH_MODE_INVALID"
  | "AUTH_MODE_CONFLICT"
  | "OAUTH_ROOT_REQUIRED"
  | "OAUTH_HOSTNAME_INVALID"
  | "OAUTH_DEPLOYMENT_INVALID"
  | "OAUTH_DEPLOYMENT_CONFLICT"
  | "OAUTH_PROFILE_FIELD_FORBIDDEN"
  | "OAUTH_RUNTIME_UNAVAILABLE"
  | "OAUTH_CREDENTIAL_PROVIDER_UNAVAILABLE"
  | "OAUTH_CREDENTIAL_PROVIDER_FAILURE"
  | "OAUTH_STATE_INVALID"
  | "OAUTH_STATE_BUSY"
  | "OAUTH_STATE_CONFLICT"
  | "OAUTH_STATE_RECOVERY_REQUIRED"
  | "OAUTH_STATE_MIGRATION_REQUIRED"
  | "OAUTH_BACKUP_INVALID"
  | "OAUTH_BACKUP_CONFLICT"
  | "OAUTH_AUDIT_FAILURE";

export class AuthConfigurationError extends Error {
  readonly code: AuthErrorCode;
  readonly repairCommand?: string;

  constructor(code: AuthErrorCode, message: string, options: { repairCommand?: string; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AuthConfigurationError";
    this.code = code;
    this.repairCommand = options.repairCommand;
  }
}

export function authConfigurationError(
  code: AuthErrorCode,
  message: string,
  repairCommand?: string
): AuthConfigurationError {
  return new AuthConfigurationError(code, message, repairCommand ? { repairCommand } : {});
}

export type OAuthProtocolErrorCode =
  | "invalid_client_metadata"
  | "invalid_redirect_uri"
  | "invalid_request"
  | "invalid_client"
  | "invalid_grant"
  | "invalid_scope"
  | "invalid_target"
  | "temporarily_unavailable"
  | "access_denied";

export class OAuthProtocolError extends Error {
  constructor(
    readonly oauthCode: OAuthProtocolErrorCode,
    message: string,
    readonly statusCode = 400,
    readonly localAction?: string
  ) {
    super(message);
    this.name = "OAuthProtocolError";
  }
}
