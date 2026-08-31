import path from 'node:path';

const TOP_LEVEL_FIELDS = new Set([
  'version',
  'root',
  'updatedAt',
  'port',
  'mode',
  'tunnel',
  'hostname',
  'tunnelName',
  'tunnelOwner',
  'localAdminPort',
  'authMode',
  'authRoutes',
  'oauthIssuer',
  'oauthResource',
  'oauthCredentialProvider',
  'oauthStateRef',
  'ngrokConfig',
  'cloudflareConfig',
  'cloudflareTokenFile',
  'cloudflareToken',
  'token',
  'bash',
  'bashTranscript',
  'codexSessions',
  'codexDir',
  'bashSession',
  'requireBashSession',
  'write',
  'toolMode',
  'toolCards',
  'policyEngine',
  'permissionProfile',
  'semanticProvider',
  'widgetDomain',
  'noInstallCloudflared'
]);

const AUTH_ROUTE_FIELDS = new Set([
  'port',
  'tunnel',
  'hostname',
  'tunnelName',
  'tunnelOwner',
  'localAdminPort',
  'ngrokConfig',
  'cloudflareConfig',
  'cloudflareTokenFile',
  'noInstallCloudflared'
]);

const TUNNEL_MODES = ['none', 'cloudflare', 'cloudflare-named', 'ngrok', 'tailscale'];

function remediationFor(jsonPath, profilePath) {
  const location = profilePath ? ` at ${JSON.stringify(profilePath)}` : '';
  return `Edit the saved profile${location} and correct ${jsonPath}, or run codexgpt settings delete --root <workspace> --yes and then codexgpt setup.`;
}

export class WorkspaceProfileValidationError extends Error {
  constructor(jsonPath, reason, options = {}) {
    const remediation = remediationFor(jsonPath, options.profilePath);
    super(`Saved workspace profile is invalid at ${jsonPath}: ${reason} ${remediation}`);
    this.name = 'WorkspaceProfileValidationError';
    this.code = options.code ?? 'WORKSPACE_PROFILE_INVALID';
    this.jsonPath = jsonPath;
    this.profilePath = options.profilePath;
    this.remediation = remediation;
  }
}

function fail(jsonPath, reason, options, code) {
  throw new WorkspaceProfileValidationError(jsonPath, reason, { ...options, code });
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function unknownFieldReason(field, candidates, basePath) {
  const nearest = [...candidates]
    .map((candidate) => ({ candidate, distance: editDistance(field, candidate) }))
    .sort((left, right) => left.distance - right.distance || left.candidate.localeCompare(right.candidate))[0];
  const threshold = Math.max(2, Math.floor(field.length * 0.34));
  return nearest && nearest.distance <= threshold
    ? `is not a supported saved-profile field. Did you mean ${basePath}.${nearest.candidate}?`
    : 'is not a supported saved-profile field.';
}

function assertString(record, field, jsonPath, options, constraints = {}) {
  const value = record[field];
  if (value === undefined) return;
  if (typeof value !== 'string') fail(jsonPath, 'must be a string.', options);
  if (constraints.nonEmpty && value.length === 0) fail(jsonPath, 'must not be empty.', options);
  if (value.length > (constraints.max ?? 4096)) fail(jsonPath, `must be at most ${constraints.max ?? 4096} characters.`, options);
  if (/\0/.test(value)) fail(jsonPath, 'must not contain a NUL character.', options);
}

function assertBoolean(record, field, jsonPath, options) {
  if (record[field] !== undefined && typeof record[field] !== 'boolean') {
    fail(jsonPath, 'must be true or false.', options);
  }
}

function assertChoice(record, field, choices, jsonPath, options, code) {
  const value = record[field];
  if (value === undefined) return;
  if (typeof value !== 'string' || !choices.includes(value)) {
    fail(jsonPath, `must be exactly one of ${choices.join(', ')}.`, options, code);
  }
}

function assertPort(record, field, jsonPath, options, code) {
  const value = record[field];
  if (value === undefined) return;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    fail(jsonPath, 'must be a decimal string from 1 to 65535.', options, code);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    fail(jsonPath, 'must be a decimal string from 1 to 65535.', options, code);
  }
}

function isPortableAbsolutePath(value) {
  return path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value);
}

function assertAbsolutePath(record, field, jsonPath, options) {
  if (record[field] === undefined) return;
  assertString(record, field, jsonPath, options, { nonEmpty: true, max: 32_767 });
  if (!isPortableAbsolutePath(record[field])) {
    fail(jsonPath, 'must be an absolute path so its meaning does not depend on the launch directory.', options);
  }
}

function assertHostname(record, field, jsonPath, options) {
  const value = record[field];
  if (value === undefined) return;
  assertString(record, field, jsonPath, options, { nonEmpty: true, max: 253 });
  if (/[*\\%\s\u0000-\u001f\u007f]/.test(value) || value.endsWith('.')) {
    fail(jsonPath, 'must be one unambiguous hostname, optionally with an HTTPS port.', options);
  }
  try {
    const parsed = new URL(`https://${value}`);
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.host !== value) {
      throw new Error('unsupported component');
    }
  } catch {
    fail(jsonPath, 'must be one unambiguous hostname, optionally with an HTTPS port.', options);
  }
}

function assertWidgetOrigin(record, options) {
  const value = record.widgetDomain;
  if (value === undefined) return;
  assertString(record, 'widgetDomain', '$.widgetDomain', options, { nonEmpty: true, max: 2048 });
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:' ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash ||
      (value !== parsed.origin && value !== `${parsed.origin}/`)
    ) {
      throw new Error('not an HTTPS origin');
    }
  } catch {
    fail('$.widgetDomain', 'must be one HTTPS origin without a path, query, or fragment.', options);
  }
}

function assertTunnelCombination(route, basePath, options, oauthRoute = false) {
  if (route.tunnel === 'cloudflare-named') {
    if (!route.hostname) fail(`${basePath}.hostname`, 'is required for cloudflare-named.', options, oauthRoute ? 'OAUTH_DEPLOYMENT_INVALID' : undefined);
    if (!route.tunnelName) fail(`${basePath}.tunnelName`, 'is required for cloudflare-named.', options, oauthRoute ? 'OAUTH_DEPLOYMENT_INVALID' : undefined);
  }
  if ((route.tunnel === 'ngrok' || route.tunnel === 'tailscale') && !route.hostname) {
    fail(`${basePath}.hostname`, `is required for ${route.tunnel}.`, options);
  }
}

function validateAuthRoute(route, basePath, options, mode) {
  if (!isRecord(route)) fail(basePath, 'must be an object.', options, 'OAUTH_DEPLOYMENT_INVALID');
  for (const field of Object.keys(route)) {
    if (!AUTH_ROUTE_FIELDS.has(field)) {
      fail(
        `${basePath}.${field}`,
        unknownFieldReason(field, AUTH_ROUTE_FIELDS, basePath),
        options,
        'OAUTH_PROFILE_FIELD_FORBIDDEN'
      );
    }
  }
  assertPort(route, 'port', `${basePath}.port`, options, 'OAUTH_DEPLOYMENT_INVALID');
  assertPort(route, 'localAdminPort', `${basePath}.localAdminPort`, options, 'OAUTH_DEPLOYMENT_INVALID');
  assertChoice(route, 'tunnel', TUNNEL_MODES, `${basePath}.tunnel`, options, 'OAUTH_DEPLOYMENT_INVALID');
  assertHostname(route, 'hostname', `${basePath}.hostname`, options);
  assertString(route, 'tunnelName', `${basePath}.tunnelName`, options, { nonEmpty: true, max: 128 });
  if (route.tunnelName !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(route.tunnelName)) {
    fail(`${basePath}.tunnelName`, 'must use 1-128 letters, numbers, dot, underscore, or dash.', options, 'OAUTH_DEPLOYMENT_INVALID');
  }
  assertChoice(route, 'tunnelOwner', ['codexgpt'], `${basePath}.tunnelOwner`, options, 'OAUTH_DEPLOYMENT_INVALID');
  for (const field of ['ngrokConfig', 'cloudflareConfig', 'cloudflareTokenFile']) {
    assertAbsolutePath(route, field, `${basePath}.${field}`, options);
  }
  assertBoolean(route, 'noInstallCloudflared', `${basePath}.noInstallCloudflared`, options);
  assertTunnelCombination(route, basePath, options, mode === 'oauth');
  if (mode === 'oauth') {
    for (const field of ['port', 'localAdminPort', 'hostname', 'tunnelName', 'tunnelOwner']) {
      if (!route[field]) fail(`${basePath}.${field}`, 'is required for the saved OAuth route.', options, 'OAUTH_DEPLOYMENT_INVALID');
    }
    if (route.tunnel !== 'cloudflare-named') {
      fail(`${basePath}.tunnel`, 'must be cloudflare-named for the saved OAuth route.', options, 'OAUTH_DEPLOYMENT_INVALID');
    }
    if (route.port === route.localAdminPort) {
      fail(`${basePath}.localAdminPort`, 'must differ from the public port.', options, 'OAUTH_DEPLOYMENT_INVALID');
    }
  }
}

function validateOAuthSelectors(profile, options) {
  const hasOAuthUrl = profile.oauthIssuer !== undefined || profile.oauthResource !== undefined;
  if (hasOAuthUrl) {
    const hostname = profile.authRoutes?.oauth?.hostname ?? profile.hostname;
    if (!profile.oauthIssuer || !profile.oauthResource || !hostname) {
      fail('$.oauthIssuer', 'OAuth issuer, resource, and hostname must be saved together.', options, 'OAUTH_DEPLOYMENT_INVALID');
    }
    const expectedIssuer = `https://${hostname}`;
    const expectedResource = `${expectedIssuer}/mcp`;
    if (profile.oauthIssuer !== expectedIssuer) {
      fail('$.oauthIssuer', 'must derive exactly from the saved OAuth hostname.', options, 'OAUTH_DEPLOYMENT_INVALID');
    }
    if (profile.oauthResource !== expectedResource) {
      fail('$.oauthResource', 'must derive exactly from the saved OAuth hostname.', options, 'OAUTH_DEPLOYMENT_INVALID');
    }
  }
  if (profile.authMode !== 'oauth') return;
  const required = [
    ['tunnel', 'cloudflare-named'],
    ['hostname'],
    ['tunnelName'],
    ['tunnelOwner', 'codexgpt'],
    ['port'],
    ['localAdminPort'],
    ['oauthIssuer'],
    ['oauthResource'],
    ['oauthCredentialProvider', 'windows-dpapi-current-user'],
    ['oauthStateRef']
  ];
  for (const [field, exact] of required) {
    if (!profile[field] || (exact !== undefined && profile[field] !== exact)) {
      fail(`$.${field}`, exact ? `must be ${exact} for OAuth mode.` : 'is required for OAuth mode.', options, 'OAUTH_DEPLOYMENT_INVALID');
    }
  }
  if (profile.port === profile.localAdminPort) {
    fail('$.localAdminPort', 'must differ from the public port.', options, 'OAUTH_DEPLOYMENT_INVALID');
  }
}

export function validateWorkspaceProfileDocument(value, options = {}) {
  if (!isRecord(value)) fail('$', 'must be one JSON object.', options);
  for (const field of Object.keys(value)) {
    if (!TOP_LEVEL_FIELDS.has(field)) {
      const code = field.startsWith('oauth') ? 'OAUTH_PROFILE_FIELD_FORBIDDEN' : undefined;
      fail(`$.${field}`, unknownFieldReason(field, TOP_LEVEL_FIELDS, '$'), options, code);
    }
  }

  if (!Number.isInteger(value.version) || (value.version !== 1 && value.version !== 2)) {
    fail('$.version', 'must be schema version 1 or 2.', options);
  }
  assertString(value, 'root', '$.root', options, { nonEmpty: true, max: 32_767 });
  if (!isPortableAbsolutePath(value.root)) fail('$.root', 'must be an absolute workspace path.', options);
  if (options.expectedRoot !== undefined && value.root !== options.expectedRoot) {
    fail('$.root', 'must exactly match the workspace that selected this profile.', options);
  }
  if (value.updatedAt !== undefined) {
    assertString(value, 'updatedAt', '$.updatedAt', options, { nonEmpty: true, max: 64 });
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value.updatedAt) || !Number.isFinite(Date.parse(value.updatedAt))) {
      fail('$.updatedAt', 'must be an ISO-8601 UTC timestamp.', options);
    }
  }

  assertPort(value, 'port', '$.port', options);
  assertPort(value, 'localAdminPort', '$.localAdminPort', options, 'OAUTH_DEPLOYMENT_INVALID');
  assertChoice(value, 'mode', ['agent', 'handoff', 'pro'], '$.mode', options);
  assertChoice(value, 'tunnel', TUNNEL_MODES, '$.tunnel', options);
  assertHostname(value, 'hostname', '$.hostname', options);
  assertString(value, 'tunnelName', '$.tunnelName', options, { nonEmpty: true, max: 128 });
  if (value.tunnelName !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.tunnelName)) {
    fail('$.tunnelName', 'must use 1-128 letters, numbers, dot, underscore, or dash.', options);
  }
  assertChoice(value, 'tunnelOwner', ['codexgpt'], '$.tunnelOwner', options, 'OAUTH_DEPLOYMENT_INVALID');
  assertChoice(value, 'authMode', ['legacy', 'oauth'], '$.authMode', options, 'AUTH_MODE_INVALID');
  assertChoice(value, 'oauthCredentialProvider', ['windows-dpapi-current-user'], '$.oauthCredentialProvider', options, 'OAUTH_DEPLOYMENT_INVALID');
  assertString(value, 'oauthIssuer', '$.oauthIssuer', options, { nonEmpty: true, max: 2048 });
  assertString(value, 'oauthResource', '$.oauthResource', options, { nonEmpty: true, max: 2048 });
  assertString(value, 'oauthStateRef', '$.oauthStateRef', options, { nonEmpty: true, max: 160 });
  if (value.oauthStateRef !== undefined && !/^[A-Za-z][A-Za-z0-9_-]{15,159}$/.test(value.oauthStateRef)) {
    fail('$.oauthStateRef', 'must be one bounded opaque local reference.', options, 'OAUTH_DEPLOYMENT_INVALID');
  }

  for (const field of ['ngrokConfig', 'cloudflareConfig', 'cloudflareTokenFile', 'codexDir']) {
    assertAbsolutePath(value, field, `$.${field}`, options);
  }
  for (const field of ['token', 'cloudflareToken']) {
    assertString(value, field, `$.${field}`, options, { max: 16_384 });
  }
  assertChoice(value, 'bash', ['off', 'safe', 'full'], '$.bash', options);
  assertChoice(value, 'bashTranscript', ['compact', 'full'], '$.bashTranscript', options);
  assertChoice(value, 'codexSessions', ['off', 'metadata', 'read'], '$.codexSessions', options);
  assertChoice(value, 'write', ['off', 'handoff', 'workspace'], '$.write', options);
  assertChoice(value, 'toolMode', ['minimal', 'standard', 'full'], '$.toolMode', options);
  assertChoice(value, 'policyEngine', ['legacy', 'shadow', 'enforce'], '$.policyEngine', options);
  assertChoice(value, 'semanticProvider', ['builtin', 'none'], '$.semanticProvider', options);
  assertBoolean(value, 'requireBashSession', '$.requireBashSession', options);
  assertBoolean(value, 'toolCards', '$.toolCards', options);
  assertBoolean(value, 'noInstallCloudflared', '$.noInstallCloudflared', options);
  assertString(value, 'bashSession', '$.bashSession', options, { nonEmpty: true, max: 64 });
  if (value.bashSession !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value.bashSession)) {
    fail('$.bashSession', 'must use 1-64 letters, numbers, dot, underscore, or dash.', options);
  }
  if (value.requireBashSession && !value.bashSession) {
    fail('$.requireBashSession', 'requires a saved bashSession.', options);
  }
  assertString(value, 'permissionProfile', '$.permissionProfile', options, { nonEmpty: true, max: 64 });
  if (value.permissionProfile !== undefined && !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(value.permissionProfile)) {
    fail('$.permissionProfile', 'must use 1-64 lowercase letters, numbers, dot, underscore, or dash.', options);
  }
  assertWidgetOrigin(value, options);
  assertTunnelCombination(value, '$', options);

  if (value.authRoutes !== undefined) {
    if (!isRecord(value.authRoutes)) fail('$.authRoutes', 'must be an object.', options, 'OAUTH_DEPLOYMENT_INVALID');
    for (const mode of Object.keys(value.authRoutes)) {
      if (mode !== 'legacy' && mode !== 'oauth') {
        fail(
          `$.authRoutes.${mode}`,
          unknownFieldReason(mode, new Set(['legacy', 'oauth']), '$.authRoutes'),
          options,
          'OAUTH_PROFILE_FIELD_FORBIDDEN'
        );
      }
      validateAuthRoute(value.authRoutes[mode], `$.authRoutes.${mode}`, options, mode);
    }
  }
  validateOAuthSelectors(value, options);
  return value;
}

export function parseWorkspaceProfileJson(text, options = {}) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail('$', 'must contain valid JSON.', options);
  }
  return validateWorkspaceProfileDocument(parsed, options);
}
