import express, { type Request, type Response } from "express";
import type { LocalApprovalRuntimeV3 } from "../control/runtime.js";
import type { LocalControlResponseV3 } from "../control/schemas.js";
import {
  LOCAL_ADMIN_COOKIE_NAME,
  LocalAdminSessionManager,
  parseLocalAdminCookie
} from "../auth/localAdminSession.js";
import { applyBaseSecurityHeaders, applyNoStore } from "./securityHeaders.js";

export interface OwnerAdminService {
  readonly kind: "local-control-cli";
  isAvailable(): boolean;
  issueBootstrap(): string | Promise<string>;
  listAuthorizations(): Promise<LocalControlResponseV3>;
  approveAuthorization(pendingId: string): Promise<LocalControlResponseV3>;
  denyAuthorization(pendingId: string): Promise<LocalControlResponseV3>;
  listClients(): Promise<LocalControlResponseV3>;
  revokeClient(clientId: string): Promise<LocalControlResponseV3>;
  listGrants(): Promise<LocalControlResponseV3>;
  revokeGrant(grantId: string): Promise<LocalControlResponseV3>;
  revokeOwnerGrants(): Promise<LocalControlResponseV3>;
}

function unavailable(): never {
  throw Object.assign(new Error("OAUTH_ADMIN_UNAVAILABLE: OAuth owner control is not running."), {
    code: "OAUTH_ADMIN_UNAVAILABLE"
  });
}

export function createLocalControlOwnerAdminService(
  runtime: LocalApprovalRuntimeV3 | null | undefined,
  sessions?: LocalAdminSessionManager,
  origin?: string
): OwnerAdminService {
  const request = async (operation: string, input: Record<string, string> = {}): Promise<LocalControlResponseV3> => {
    if (!runtime?.nativeControl()) unavailable();
    return await runtime.server.handle({
      schemaVersion: 3,
      contractVersion: 3,
      operation,
      serverId: runtime.serverId,
      ...input
    });
  };
  return Object.freeze({
    kind: "local-control-cli" as const,
    isAvailable: () => Boolean(runtime?.nativeControl()),
    issueBootstrap: () => {
      if (!runtime?.nativeControl() || !sessions || !origin) unavailable();
      return sessions.issueBootstrap({ origin }).url;
    },
    listAuthorizations: () => request("oauth.authorizations.list"),
    approveAuthorization: (pendingId: string) => request("oauth.authorizations.approve", { pendingId }),
    denyAuthorization: (pendingId: string) => request("oauth.authorizations.deny", { pendingId }),
    listClients: () => request("oauth.clients.list"),
    revokeClient: (clientId: string) => request("oauth.clients.revoke", { clientId }),
    listGrants: () => request("oauth.grants.list"),
    revokeGrant: (grantId: string) => request("oauth.grants.revoke", { grantId }),
    revokeOwnerGrants: () => request("oauth.grants.revoke_owner")
  });
}

export interface LocalAdminAppOptions {
  ownerAdminService: OwnerAdminService;
  sessions: LocalAdminSessionManager;
  origin: string;
}

const ROOT_BODY = `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CodexGPT local administration</title><link rel="stylesheet" href="/admin.css"></head><body><main><h1>CodexGPT local administration</h1><p id="status">This page is local to this PC. Open it with <code>codexgpt auth open --root &lt;workspace&gt;</code>.</p><section id="content" hidden><h2>Pending links</h2><div id="pending"></div><details><summary>Clients and grants</summary><h2>Clients</h2><div id="clients"></div><h2>Grants</h2><div id="grants"></div></details></section></main><script src="/admin.js" defer></script></body></html>`;

const ADMIN_CSS = `:root{font-family:system-ui,sans-serif;color-scheme:light dark}body{margin:0;padding:2rem}main{max-width:52rem;margin:auto}button{margin:.25rem .5rem .25rem 0;padding:.55rem .8rem}article{border:1px solid #7776;border-radius:.5rem;padding:1rem;margin:.75rem 0}code{overflow-wrap:anywhere}.muted{opacity:.75}`;

const ADMIN_JS = `(()=>{const q=s=>document.querySelector(s);let csrf='';const esc=v=>String(v??'');async function api(url,options={}){const headers={'content-type':'application/json',...(options.headers||{})};if(csrf)headers['x-codexgpt-csrf']=csrf;const r=await fetch(url,{credentials:'same-origin',...options,headers});const data=await r.json().catch(()=>({code:'AUTH_ADMIN_RESPONSE_INVALID'}));if(!r.ok)throw new Error(data.code||'AUTH_ADMIN_REQUEST_FAILED');return data}function item(title,lines,actions=[]){const a=document.createElement('article');const h=document.createElement('strong');h.textContent=title;a.append(h);for(const line of lines){const p=document.createElement('p');p.className='muted';p.textContent=line;a.append(p)}for(const action of actions){const b=document.createElement('button');b.textContent=action.label;b.addEventListener('click',action.run);a.append(b)}return a}async function load(){const data=await api('/api/status');q('#status').textContent='Authenticated local owner session.';q('#content').hidden=false;for(const [selector,entries,render] of [['#pending',data.authorizations,auth=>item(auth.correlationCode,[auth.clientLabel,auth.canonicalRoot,auth.scopes.join(', '),auth.expiresAt],[{label:'Approve',run:()=>mutate('/api/authorizations/'+auth.pendingId+'/approve')},{label:'Deny',run:()=>mutate('/api/authorizations/'+auth.pendingId+'/deny')}])],['#clients',data.clients,client=>item(client.label,[client.clientId,client.status,client.redirectHost+client.redirectPath],[{label:'Remove client',run:()=>mutate('/api/clients/'+client.clientId+'/remove')}])],['#grants',data.grants,grant=>item(grant.grantId,[grant.status,grant.scopes.join(', '),grant.absoluteExpiresAt],[{label:'Revoke grant',run:()=>mutate('/api/grants/'+grant.grantId+'/revoke')}])]]){const root=q(selector);root.replaceChildren();if(!entries.length){root.textContent='None.';continue}for(const entry of entries)root.append(render(entry))}}async function mutate(url){await api(url,{method:'POST',body:'{}'});await load()}async function start(){const fragment=new URLSearchParams(location.hash.slice(1));const bootstrap=fragment.get('bootstrap');if(bootstrap){history.replaceState(null,'',location.pathname);const data=await api('/session/bootstrap',{method:'POST',body:JSON.stringify({bootstrap})});csrf=data.csrfToken;sessionStorage.setItem('codexgpt-csrf',csrf)}else csrf=sessionStorage.getItem('codexgpt-csrf')||'';if(!csrf)return;await load()}start().catch(e=>{q('#status').textContent='Local admin unavailable: '+esc(e.message)})})();`;

function exactHost(req: Request, origin: string): boolean {
  const expected = new URL(origin);
  const values: string[] = [];
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index]?.toLocaleLowerCase("en-US") === "host") {
      values.push(req.rawHeaders[index + 1] ?? "");
    }
  }
  return values.length === 1 && values[0] === expected.host && req.headers.host === expected.host;
}

function loopbackPeer(req: Request): boolean {
  const address = req.socket.remoteAddress;
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function setUiHeaders(res: Response): void {
  applyNoStore(res);
  res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
}

function errorCode(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "AUTH_ADMIN_REQUEST_FAILED";
  return /^[A-Z][A-Z0-9_]{0,79}$/.test(code) ? code : "AUTH_ADMIN_REQUEST_FAILED";
}

export function createLocalAdminApp(options: LocalAdminAppOptions): express.Express {
  const app = express();
  const expectedOrigin = new URL(options.origin).origin;
  app.disable("x-powered-by");
  app.disable("etag");
  app.set("trust proxy", false);
  app.use(applyBaseSecurityHeaders);
  app.use((_req, res, next) => {
    applyNoStore(res);
    next();
  });
  app.use((req, res, next) => {
    if (!loopbackPeer(req) || !exactHost(req, expectedOrigin)) {
      res.status(403).send("Forbidden");
      return;
    }
    next();
  });
  app.use(express.json({ limit: "4kb", strict: true }));

  app.get("/", (_req, res) => {
    setUiHeaders(res);
    res.type("html").send(ROOT_BODY);
  });
  app.get("/admin.css", (_req, res) => {
    setUiHeaders(res);
    res.type("css").send(ADMIN_CSS);
  });
  app.get("/admin.js", (_req, res) => {
    setUiHeaders(res);
    res.setHeader("Content-Type", "text/javascript; charset=utf-8");
    res.send(ADMIN_JS);
  });
  app.get("/healthz", (_req, res) => {
    applyNoStore(res);
    res.json({
      ok: true,
      name: "CodexGPT local admin",
      ownerChannel: options.ownerAdminService.kind,
      ownerChannelAvailable: options.ownerAdminService.isAvailable()
    });
  });

  app.post("/session/bootstrap", (req, res) => {
    setUiHeaders(res);
    if (req.get("origin") !== expectedOrigin || typeof req.body?.bootstrap !== "string") {
      res.status(403).json({ code: "AUTH_ADMIN_ORIGIN_INVALID" });
      return;
    }
    try {
      const session = options.sessions.exchangeBootstrap(req.body.bootstrap, expectedOrigin);
      res.setHeader("Set-Cookie", `${LOCAL_ADMIN_COOKIE_NAME}=${session.cookieValue}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
      res.json({ csrfToken: session.csrfToken, expiresAt: session.expiresAt });
    } catch (error) {
      res.status(403).json({ code: errorCode(error) });
    }
  });

  const requireSession = (req: Request, res: Response): string | null => {
    try {
      const cookie = parseLocalAdminCookie(req.get("cookie"));
      options.sessions.validateSession(cookie);
      return cookie;
    } catch (error) {
      res.status(401).json({ code: errorCode(error) });
      return null;
    }
  };
  const requireMutation = (req: Request, res: Response): string | null => {
    if (req.get("origin") !== expectedOrigin) {
      res.status(403).json({ code: "AUTH_ADMIN_ORIGIN_INVALID" });
      return null;
    }
    const cookie = requireSession(req, res);
    if (!cookie) return null;
    try {
      options.sessions.assertCsrf(cookie, req.get("x-codexgpt-csrf") ?? "");
      return cookie;
    } catch (error) {
      res.status(403).json({ code: errorCode(error) });
      return null;
    }
  };

  app.get("/api/status", async (req, res) => {
    setUiHeaders(res);
    if (!requireSession(req, res)) return;
    try {
      const [authorizations, clients, grants] = await Promise.all([
        options.ownerAdminService.listAuthorizations(),
        options.ownerAdminService.listClients(),
        options.ownerAdminService.listGrants()
      ]);
      res.json({
        authorizations: authorizations.oauthAuthorizations ?? [],
        clients: clients.oauthClients ?? [],
        grants: grants.oauthGrants ?? []
      });
    } catch (error) {
      res.status(503).json({ code: errorCode(error) });
    }
  });

  const mutation = (action: (id: string) => Promise<LocalControlResponseV3>) => async (req: Request, res: Response) => {
    setUiHeaders(res);
    if (!requireMutation(req, res)) return;
    try {
      const rawId = req.params.id;
      if (typeof rawId !== "string") {
        res.status(400).json({ code: "AUTH_ADMIN_REQUEST_INVALID" });
        return;
      }
      const response = await action(rawId);
      res.status(response.ok ? 200 : 404).json({ code: response.code, changed: response.changed });
    } catch (error) {
      res.status(400).json({ code: errorCode(error) });
    }
  };
  app.post("/api/authorizations/:id/approve", mutation((id) => options.ownerAdminService.approveAuthorization(id)));
  app.post("/api/authorizations/:id/deny", mutation((id) => options.ownerAdminService.denyAuthorization(id)));
  app.post("/api/clients/:id/remove", mutation((id) => options.ownerAdminService.revokeClient(id)));
  app.post("/api/grants/:id/revoke", mutation((id) => options.ownerAdminService.revokeGrant(id)));
  app.post("/api/grants/revoke-all", async (req, res) => {
    setUiHeaders(res);
    if (!requireMutation(req, res)) return;
    try {
      const response = await options.ownerAdminService.revokeOwnerGrants();
      res.json({ code: response.code, changed: response.changed });
    } catch (error) {
      res.status(400).json({ code: errorCode(error) });
    }
  });
  return app;
}
