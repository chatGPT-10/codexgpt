import express, { type Request, type Response } from "express";
import type { LocalApprovalRuntimeV3 } from "../control/runtime.js";
import type { LocalControlResponseV3 } from "../control/schemas.js";
import {
  LOCAL_ADMIN_COOKIE_NAME,
  LocalAdminSessionManager,
  parseLocalAdminCookie
} from "../auth/localAdminSession.js";
import type { OAuthTokenEndpointDiagnostics } from "../auth/rateLimits.js";
import { applyBaseSecurityHeaders, applyNoStore } from "./securityHeaders.js";
import type { LocalAdminSettingsService } from "./localAdminSettings.js";
import { hasExactLoopbackHost, isLoopbackPeer, setLoopbackUiHeaders } from "./loopbackAdminSecurity.js";

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
  tokenDiagnostics?: Pick<OAuthTokenEndpointDiagnostics, "snapshot">;
  controlSnapshot?: LocalAdminControlSnapshot;
  settingsService?: LocalAdminSettingsService;
}

export interface LocalAdminControlSnapshot {
  readonly defaultWorkspace: string;
  readonly allowedRoots: readonly string[];
  readonly toolMode: "minimal" | "standard" | "full";
  readonly writeMode: "off" | "handoff" | "workspace";
  readonly executionProfile: "off" | "full_access" | "workspace";
  readonly policyEngine: "legacy" | "shadow" | "enforce";
  readonly authMode: "legacy" | "oauth";
}

const ROOT_BODY = `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CodexGPT Control</title><link rel="stylesheet" href="/admin.css"></head><body><main><header><p class="eyebrow">LOCAL CONTROL PLANE · LOOPBACK ONLY</p><h1>CodexGPT Control</h1><p id="status">Open this page with <code>codexgpt auth open --root &lt;workspace&gt;</code>.</p></header><section id="content" hidden><section class="overview" aria-labelledby="overview-title"><div><p class="eyebrow">OVERVIEW</p><h2 id="overview-title">Current safe boundary</h2></div><p class="muted">Runtime lifecycle is available only through the separate lifecycle host. Root expansion and privilege escalation remain unavailable here.</p><dl id="control"></dl></section><section id="settings-section" hidden><p class="eyebrow">NEXT LAUNCH</p><h2>Tool calling mode</h2><p class="muted">This changes the saved profile for the next runtime start. It never expands the authority of the currently running process.</p><label for="tool-mode">Visible tool surface</label><div class="settings-row"><select id="tool-mode"><option value="minimal">Minimal</option><option value="standard">Standard</option><option value="full">Full</option></select><button id="save-tool-mode" type="button">Save for next launch</button></div><p id="settings-status" class="muted"></p></section><section><p class="eyebrow">OAUTH</p><h2>Pending links</h2><div id="pending"></div></section><details><summary>Clients and grants</summary><h2>Clients</h2><div id="clients"></div><h2>Grants</h2><div id="grants"></div></details></section></main><script src="/admin.js" defer></script></body></html>`;

const ADMIN_CSS = `:root{color-scheme:light dark;font-family:"Segoe UI Variable",system-ui,sans-serif;--ink:#17212b;--surface:#f7f8fa;--line:#c9d0d7;--signal:#0c6b62;--muted:#53616d}@media(prefers-color-scheme:dark){:root{--ink:#e7edf2;--surface:#171c22;--line:#39434d;--signal:#62d1bd;--muted:#a9b4be}}*{box-sizing:border-box}body{margin:0;background:var(--surface);color:var(--ink)}main{max-width:66rem;margin:auto;padding:2.5rem 1.5rem 4rem}header{border-left:4px solid var(--signal);padding-left:1rem;margin-bottom:2rem}.eyebrow{font:700 .72rem/1.2 ui-monospace,"Cascadia Code",monospace;letter-spacing:.08em;color:var(--signal);margin:0 0 .45rem}h1{font-size:clamp(2rem,6vw,3.5rem);letter-spacing:-.04em;margin:.1rem 0 .5rem}h2{margin:0 0 1rem}section{margin:1.75rem 0}.overview{border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:1.25rem 0}dl{display:grid;grid-template-columns:minmax(10rem,1fr) minmax(12rem,2fr);gap:0;margin:1rem 0 0}dt,dd{margin:0;padding:.7rem 0;border-top:1px solid var(--line)}dt{font:700 .78rem/1.35 ui-monospace,"Cascadia Code",monospace;text-transform:uppercase;color:var(--muted)}dd{overflow-wrap:anywhere}button,select{margin:.25rem .5rem .25rem 0;padding:.55rem .8rem;border:1px solid var(--line);background:transparent;color:inherit;font:inherit}button:focus-visible,select:focus-visible{outline:3px solid var(--signal);outline-offset:2px}.settings-row{display:flex;align-items:center;flex-wrap:wrap;margin-top:.35rem}article{border-left:2px solid var(--line);padding:1rem;margin:.75rem 0}code{overflow-wrap:anywhere}.muted{color:var(--muted)}summary{cursor:pointer;font-weight:700}`;

const ADMIN_JS = `(()=>{const q=s=>document.querySelector(s);let csrf='';const esc=v=>String(v??'');async function api(url,options={}){const headers={'content-type':'application/json',...(options.headers||{})};if(csrf)headers['x-codexgpt-csrf']=csrf;const r=await fetch(url,{credentials:'same-origin',...options,headers});const data=await r.json().catch(()=>({code:'AUTH_ADMIN_RESPONSE_INVALID'}));if(!r.ok)throw new Error(data.code||'AUTH_ADMIN_REQUEST_FAILED');return data}function item(title,lines,actions=[]){const a=document.createElement('article');const h=document.createElement('strong');h.textContent=title;a.append(h);for(const line of lines){const p=document.createElement('p');p.className='muted';p.textContent=line;a.append(p)}for(const action of actions){const b=document.createElement('button');b.textContent=action.label;b.addEventListener('click',action.run);a.append(b)}return a}function renderControl(control){const root=q('#control');root.replaceChildren();if(!control){root.textContent='Control configuration is unavailable for this runtime.';return}const rows=[['Default workspace',control.defaultWorkspace],['Allowed roots',control.allowedRoots.join('\\n')],['Tool mode',control.toolMode],['Write mode',control.writeMode],['Execution profile',control.executionProfile],['Policy engine',control.policyEngine],['Authentication',control.authMode]];for(const [label,value] of rows){const dt=document.createElement('dt');dt.textContent=label;const dd=document.createElement('dd');dd.textContent=value;root.append(dt,dd)}}function renderSettings(settings){const section=q('#settings-section');if(!settings){section.hidden=true;return}section.hidden=false;q('#tool-mode').value=settings.toolMode;q('#settings-status').textContent=settings.appliesAfterRestart?'Saved mode applies after the next runtime start.':'No pending tool-mode change.'}async function saveToolMode(){const button=q('#save-tool-mode');button.disabled=true;q('#settings-status').textContent='Saving next-launch tool mode...';try{const settings=await api('/api/settings/tool-mode',{method:'POST',body:JSON.stringify({toolMode:q('#tool-mode').value})});renderSettings(settings)}catch(error){q('#settings-status').textContent='Could not save: '+esc(error.message)}finally{button.disabled=false}}async function load(){const data=await api('/api/status');q('#status').textContent='Authenticated local owner session.';q('#content').hidden=false;renderControl(data.control);renderSettings(data.settings);for(const [selector,entries,render] of [['#pending',data.authorizations,auth=>item(auth.correlationCode,[auth.clientLabel,auth.canonicalRoot,auth.scopes.join(', '),auth.expiresAt],[{label:'Approve',run:()=>mutate('/api/authorizations/'+auth.pendingId+'/approve')},{label:'Deny',run:()=>mutate('/api/authorizations/'+auth.pendingId+'/deny')}])],['#clients',data.clients,client=>item(client.label,[client.clientId,client.status,client.redirectHost+client.redirectPath],[{label:'Remove client',run:()=>mutate('/api/clients/'+client.clientId+'/remove')}])],['#grants',data.grants,grant=>item(grant.grantId,[grant.status,grant.scopes.join(', '),grant.absoluteExpiresAt],[{label:'Revoke grant',run:()=>mutate('/api/grants/'+grant.grantId+'/revoke')}])]]){const root=q(selector);root.replaceChildren();if(!entries.length){root.textContent='None.';continue}for(const entry of entries)root.append(render(entry))}}async function mutate(url){await api(url,{method:'POST',body:'{}'});await load()}async function start(){const fragment=new URLSearchParams(location.hash.slice(1));const bootstrap=fragment.get('bootstrap');if(bootstrap){history.replaceState(null,'',location.pathname);const data=await api('/session/bootstrap',{method:'POST',body:JSON.stringify({bootstrap})});csrf=data.csrfToken;sessionStorage.setItem('codexgpt-csrf',csrf)}else csrf=sessionStorage.getItem('codexgpt-csrf')||'';if(!csrf)return;q('#save-tool-mode').addEventListener('click',saveToolMode);await load()}start().catch(e=>{q('#status').textContent='Local admin unavailable: '+esc(e.message)})})();`;

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
    if (!isLoopbackPeer(req) || !hasExactLoopbackHost(req, expectedOrigin)) {
      res.status(403).send("Forbidden");
      return;
    }
    next();
  });
  app.use(express.json({ limit: "4kb", strict: true }));

  app.get("/", (_req, res) => {
    setLoopbackUiHeaders(res);
    res.type("html").send(ROOT_BODY);
  });
  app.get("/admin.css", (_req, res) => {
    setLoopbackUiHeaders(res);
    res.type("css").send(ADMIN_CSS);
  });
  app.get("/admin.js", (_req, res) => {
    setLoopbackUiHeaders(res);
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
    setLoopbackUiHeaders(res);
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
    setLoopbackUiHeaders(res);
    if (!requireSession(req, res)) return;
    try {
      const [authorizations, clients, grants, settings] = await Promise.all([
        options.ownerAdminService.listAuthorizations(),
        options.ownerAdminService.listClients(),
        options.ownerAdminService.listGrants(),
        options.settingsService?.snapshot() ?? Promise.resolve(null)
      ]);
      res.json({
        authorizations: authorizations.oauthAuthorizations ?? [],
        clients: clients.oauthClients ?? [],
        grants: grants.oauthGrants ?? [],
        control: options.controlSnapshot ?? null,
        settings,
        ...(options.tokenDiagnostics
          ? { oauthTokenDiagnostics: options.tokenDiagnostics.snapshot() }
          : {})
      });
    } catch (error) {
      res.status(503).json({ code: errorCode(error) });
    }
  });

  const mutation = (action: (id: string) => Promise<LocalControlResponseV3>) => async (req: Request, res: Response) => {
    setLoopbackUiHeaders(res);
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
    setLoopbackUiHeaders(res);
    if (!requireMutation(req, res)) return;
    try {
      const response = await options.ownerAdminService.revokeOwnerGrants();
      res.json({ code: response.code, changed: response.changed });
    } catch (error) {
      res.status(400).json({ code: errorCode(error) });
    }
  });
  app.post("/api/settings/tool-mode", async (req, res) => {
    setLoopbackUiHeaders(res);
    if (!requireMutation(req, res)) return;
    const toolMode = req.body?.toolMode;
    if (toolMode !== "minimal" && toolMode !== "standard" && toolMode !== "full") {
      res.status(400).json({ code: "AUTH_ADMIN_REQUEST_INVALID" });
      return;
    }
    if (!options.settingsService) {
      res.status(503).json({ code: "AUTH_ADMIN_SETTINGS_UNAVAILABLE" });
      return;
    }
    try {
      res.json(await options.settingsService.setToolMode(toolMode));
    } catch (error) {
      res.status(400).json({ code: errorCode(error) });
    }
  });
  return app;
}
