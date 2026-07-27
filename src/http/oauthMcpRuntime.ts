import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { CodexGPTConfig } from "../config.js";
import type { LocalApprovalRuntimeV3 } from "../control/runtime.js";
import {
  connectProductionCodexGPTServer,
  createProductionCodexGPTServer,
  disposeProductionCodexGPTServer
} from "../productionRuntime.js";
import {
  runWithOAuthRequestContext,
  type OAuthRequestContext
} from "../auth/requestContext.js";
import { createOAuthPolicySessionSource } from "../auth/policyIdentity.js";
import type { OAuthDeploymentIdentity, OAuthScope } from "../auth/types.js";
import { createProductionGitBootstrapV4 } from "../git/productionBootstrap.js";
import { resolveTransactionStateRoot } from "../transactions/index.js";
import { contractIncludesV3 } from "../tools/contracts/index.js";
import type { PublicOAuthMcpRuntime } from "./publicApp.js";
import type { SemanticPreviewStore } from "../semantic/previewStore.js";
import type { SemanticWorkerHealthRegistry } from "../semantic/builtin/typescriptProvider.js";

interface TransportBinding {
  ownerRef: string;
  clientRef: string;
  resource: string;
  bindingId: string;
  incarnationId: string;
  grantId: string;
}

interface TransportRecord {
  transport: StreamableHTTPServerTransport;
  binding: Readonly<TransportBinding>;
  server: ReturnType<typeof createProductionCodexGPTServer>;
  validatedTokenFingerprints: Map<string, number>;
  createdAt: number;
  lastSeenAt: number;
}

export interface OAuthMcpRuntimeOptions {
  config: CodexGPTConfig;
  identity: OAuthDeploymentIdentity;
  enabledScopes: readonly OAuthScope[];
  localApprovalRuntimeV3?: LocalApprovalRuntimeV3;
  semanticPreviewStoreV5?: SemanticPreviewStore;
  semanticWorkerHealthV5?: SemanticWorkerHealthRegistry;
  now?: () => number;
}

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
const SESSION_FINGERPRINT_LIMIT = 16;

type RequestSessionId =
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "valid"; value: string };

function requestSessionId(req: Request): RequestSessionId {
  const values: string[] = [];
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index]?.toLocaleLowerCase("en-US") === "mcp-session-id") {
      values.push(req.rawHeaders[index + 1] ?? "");
    }
  }
  if (values.length === 0) return { kind: "missing" };
  if (values.length !== 1 || !SESSION_ID_PATTERN.test(values[0])) return { kind: "invalid" };
  return { kind: "valid", value: values[0] };
}

function bindingFor(context: Readonly<OAuthRequestContext>): Readonly<TransportBinding> {
  return Object.freeze({
    ownerRef: context.ownerRef,
    clientRef: context.clientRef,
    resource: context.resource,
    bindingId: context.bindingId,
    incarnationId: context.incarnationId,
    grantId: context.grantId
  });
}

function sameBinding(record: Readonly<TransportBinding>, context: Readonly<OAuthRequestContext>): boolean {
  return record.ownerRef === context.ownerRef &&
    record.clientRef === context.clientRef &&
    record.resource === context.resource &&
    record.bindingId === context.bindingId &&
    record.incarnationId === context.incarnationId &&
    record.grantId === context.grantId;
}

function sendSessionError(res: Response, sessionId: RequestSessionId): void {
  res.status(sessionId.kind === "valid" ? 404 : 400).json({
    jsonrpc: "2.0",
    error: sessionId.kind === "missing"
      ? { code: -32000, message: "Bad Request: Mcp-Session-Id header is required" }
      : sessionId.kind === "invalid"
        ? { code: -32000, message: "Bad Request: invalid MCP session id" }
        : { code: -32001, message: "Session not found" },
    id: null
  });
}

function oauthConfig(config: CodexGPTConfig): CodexGPTConfig {
  return {
    ...config,
    authMode: "oauth",
    authToken: undefined,
    requireHttpToken: false,
    allowQueryToken: false
  };
}

export class OAuthReadOnlyMcpRuntime implements PublicOAuthMcpRuntime {
  readonly #config: CodexGPTConfig;
  readonly #identity: OAuthDeploymentIdentity;
  readonly #enabledScopes: readonly OAuthScope[];
  readonly #localApprovalRuntimeV3?: LocalApprovalRuntimeV3;
  readonly #semanticPreviewStoreV5?: SemanticPreviewStore;
  readonly #semanticWorkerHealthV5?: SemanticWorkerHealthRegistry;
  readonly #now: () => number;
  readonly #transports = new Map<string, TransportRecord>();
  readonly #pruneTimer: NodeJS.Timeout;
  #closed = false;

  constructor(options: OAuthMcpRuntimeOptions) {
    this.#config = oauthConfig(options.config);
    this.#identity = options.identity;
    this.#enabledScopes = Object.freeze([...options.enabledScopes]);
    this.#localApprovalRuntimeV3 = options.localApprovalRuntimeV3;
    this.#semanticPreviewStoreV5 = options.semanticPreviewStoreV5;
    this.#semanticWorkerHealthV5 = options.semanticWorkerHealthV5;
    this.#now = options.now ?? Date.now;
    this.#pruneTimer = setInterval(
      () => this.#prune(),
      Math.min(this.#config.httpSessionTtlMs, 60_000)
    );
    this.#pruneTimer.unref();
  }

  isEstablishedSession(req: Request, tokenFingerprint: string): boolean {
    if (this.#closed || !TOKEN_FINGERPRINT_PATTERN.test(tokenFingerprint)) return false;
    const sessionId = requestSessionId(req);
    if (sessionId.kind !== "valid") return false;
    this.#prune();
    const record = this.#transports.get(sessionId.value);
    if (!record) return false;
    this.#pruneFingerprints(record);
    return (record.validatedTokenFingerprints.get(tokenFingerprint) ?? 0) > this.#now();
  }

  async handlePost(req: Request, res: Response, context: Readonly<OAuthRequestContext>): Promise<void> {
    if (this.#closed) {
      res.status(503).json({ error: "OAUTH_RUNTIME_UNAVAILABLE" });
      return;
    }
    let provisional: TransportRecord | undefined;
    try {
      const sessionId = requestSessionId(req);
      let record = this.#getRecord(sessionId, context);
      if (!record && sessionId.kind === "missing" && isInitializeRequest(req.body)) {
        provisional = await runWithOAuthRequestContext(context, () => this.#createTransport(context));
        record = provisional;
      } else if (!record) {
        sendSessionError(res, sessionId);
        return;
      }
      this.#rememberFingerprint(record, context);
      record.lastSeenAt = this.#now();
      await runWithOAuthRequestContext(context, async () => {
        await record!.transport.handleRequest(req, res, req.body);
      });
    } catch (error) {
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal CodexGPT MCP error. Check the local terminal for details." },
          id: null
        });
      }
    } finally {
      if (
        provisional &&
        ![...this.#transports.values()].some((record) => record.transport === provisional!.transport)
      ) {
        await this.#disposeRecord(provisional);
      }
    }
  }

  async handleSession(req: Request, res: Response, context: Readonly<OAuthRequestContext>): Promise<void> {
    if (this.#closed) {
      res.status(503).json({ error: "OAUTH_RUNTIME_UNAVAILABLE" });
      return;
    }
    try {
      const sessionId = requestSessionId(req);
      const record = this.#getRecord(sessionId, context);
      if (!record) {
        sendSessionError(res, sessionId);
        return;
      }
      this.#rememberFingerprint(record, context);
      record.lastSeenAt = this.#now();
      await runWithOAuthRequestContext(context, async () => {
        await record.transport.handleRequest(req, res);
      });
    } catch (error) {
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal CodexGPT MCP error. Check the local terminal for details." },
          id: null
        });
      }
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    clearInterval(this.#pruneTimer);
    const records = [...this.#transports.values()];
    this.#transports.clear();
    await Promise.allSettled(records.map((record) => this.#disposeRecord(record)));
  }

  sessionCount(): number {
    this.#prune();
    return this.#transports.size;
  }

  async #createTransport(context: Readonly<OAuthRequestContext>): Promise<TransportRecord> {
    let transport!: StreamableHTTPServerTransport;
    const policySessionContextSource = createOAuthPolicySessionSource({
      transportSessionId: () => String((transport as { sessionId?: string }).sessionId ?? "pending")
    });
    const gitBootstrapV4 = await createProductionGitBootstrapV4(this.#config, {
      stateRoot: resolveTransactionStateRoot()
    });
    let server: ReturnType<typeof createProductionCodexGPTServer>;
    try {
      server = createProductionCodexGPTServer(this.#config, {
        policySessionContextSource,
        oauthToolSecurity: {
          identity: this.#identity,
          enabledScopes: this.#enabledScopes
        },
        gitBootstrapV4: gitBootstrapV4 ?? undefined,
        localApprovalRuntimeV3: contractIncludesV3(this.#config.toolContractVersion)
          ? this.#localApprovalRuntimeV3
          : undefined,
        semanticPreviewStoreV5: this.#semanticPreviewStoreV5,
        semanticWorkerHealthV5: this.#semanticWorkerHealthV5
      });
    } catch (error) {
      await gitBootstrapV4?.dispose();
      throw error;
    }
    let record!: TransportRecord;
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId: string) => {
        this.#prune();
        this.#transports.set(sessionId, record);
        this.#prune();
      }
    } as any);
    record = {
      transport,
      binding: bindingFor(context),
      server,
      validatedTokenFingerprints: new Map(),
      createdAt: this.#now(),
      lastSeenAt: this.#now()
    };
    this.#rememberFingerprint(record, context);
    (transport as any).onclose = () => {
      const sessionId = (transport as { sessionId?: string }).sessionId;
      if (sessionId && this.#transports.get(sessionId) === record) this.#transports.delete(sessionId);
      void disposeProductionCodexGPTServer(server);
    };
    try {
      await connectProductionCodexGPTServer(server, transport);
    } catch (error) {
      await disposeProductionCodexGPTServer(server);
      throw error;
    }
    return record;
  }

  async #disposeRecord(record: TransportRecord): Promise<void> {
    await Promise.resolve(record.transport.close?.()).catch(() => undefined);
    await disposeProductionCodexGPTServer(record.server);
  }

  #getRecord(sessionId: RequestSessionId, context: Readonly<OAuthRequestContext>): TransportRecord | undefined {
    if (sessionId.kind !== "valid") return undefined;
    this.#prune();
    const record = this.#transports.get(sessionId.value);
    if (!record || !sameBinding(record.binding, context)) return undefined;
    return record;
  }

  #rememberFingerprint(record: TransportRecord, context: Readonly<OAuthRequestContext>): void {
    const expiresAtMs = context.expiresAt * 1000;
    if (!TOKEN_FINGERPRINT_PATTERN.test(context.tokenFingerprint) || expiresAtMs <= this.#now()) return;
    this.#pruneFingerprints(record);
    record.validatedTokenFingerprints.delete(context.tokenFingerprint);
    record.validatedTokenFingerprints.set(context.tokenFingerprint, expiresAtMs);
    while (record.validatedTokenFingerprints.size > SESSION_FINGERPRINT_LIMIT) {
      const oldest = record.validatedTokenFingerprints.keys().next().value as string | undefined;
      if (!oldest) break;
      record.validatedTokenFingerprints.delete(oldest);
    }
  }

  #pruneFingerprints(record: TransportRecord): void {
    const now = this.#now();
    for (const [fingerprint, expiresAtMs] of record.validatedTokenFingerprints) {
      if (expiresAtMs <= now) record.validatedTokenFingerprints.delete(fingerprint);
    }
  }

  #prune(): void {
    const now = this.#now();
    for (const [sessionId, record] of this.#transports) {
      if (now - record.lastSeenAt > this.#config.httpSessionTtlMs) {
        this.#transports.delete(sessionId);
        void this.#disposeRecord(record);
      }
    }
    while (this.#transports.size > this.#config.maxHttpSessions) {
      const oldest = [...this.#transports.entries()]
        .sort((left, right) => left[1].lastSeenAt - right[1].lastSeenAt)[0];
      if (!oldest) break;
      this.#transports.delete(oldest[0]);
      void this.#disposeRecord(oldest[1]);
    }
  }
}
