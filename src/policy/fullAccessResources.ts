export interface FullAccessProfileV3 {
  ambientFilesystem: boolean;
  ambientCredentials: boolean;
  ambientRegistry: boolean;
  unrestrictedNetwork: boolean;
  requireBlockedPathEnforcement: boolean;
  requireCredentialIsolation: boolean;
  requireRegistryIsolation: boolean;
  requireDeviceIsolation: boolean;
  requireNetworkEnforcement: boolean;
  requireSandbox: boolean;
}

export class ProcessPolicyUnenforceableError extends Error {
  readonly code = "PROCESS_POLICY_UNENFORCEABLE" as const;

  constructor() {
    super("PROCESS_POLICY_UNENFORCEABLE");
    this.name = "ProcessPolicyUnenforceableError";
  }
}

export function assertFullAccessProfileEligibleV3(profile: FullAccessProfileV3): true {
  if (
    !profile.ambientFilesystem ||
    !profile.ambientCredentials ||
    !profile.ambientRegistry ||
    !profile.unrestrictedNetwork ||
    profile.requireBlockedPathEnforcement ||
    profile.requireCredentialIsolation ||
    profile.requireRegistryIsolation ||
    profile.requireDeviceIsolation ||
    profile.requireNetworkEnforcement ||
    profile.requireSandbox
  ) {
    throw new ProcessPolicyUnenforceableError();
  }
  return true;
}
