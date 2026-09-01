import express, { type Request, type Response } from "express";
import {
  LOCAL_ADMIN_COOKIE_NAME,
  LocalAdminSessionManager,
  parseLocalAdminCookie
} from "../auth/localAdminSession.js";
import type { LifecycleStatusSource } from "../control/lifecycleStatus.js";
import type { WorkspaceControlSettings } from "../control/workspaceControlSettings.js";
import { applyBaseSecurityHeaders, applyNoStore } from "./securityHeaders.js";
import { hasExactLoopbackHost, isLoopbackPeer, setLoopbackUiHeaders } from "./loopbackAdminSecurity.js";

export interface LifecycleControlAppOptions {
  sessions: LocalAdminSessionManager;
  origin: string;
  statusSource: LifecycleStatusSource;
  runtimeControl?: {
    start(): Promise<{ state: string; pid: number | null }>;
    stop(): Promise<{ state: string; pid: number | null }>;
    restart(): Promise<{ state: string; pid: number | null }>;
  };
  workspaceSettings?: WorkspaceControlSettings;
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CodexGPT Control Plane</title><link rel="stylesheet" href="/control.css"></head><body><main><p class="eyebrow">INDEPENDENT LOOPBACK CONTROL PLANE</p><h1>CodexGPT Control</h1><p id="status">Open this page using the local bootstrap URL.</p><section id="content" hidden><h2>Runtime</h2><p class="muted">Every lifecycle action is limited to this host's exact owned child.</p><dl id="runtime"></dl><div class="actions"><button id="start-runtime" type="button">Start Runtime</button><button id="stop-runtime" type="button">Stop Runtime</button><button id="restart-runtime" type="button">Restart Runtime</button><p id="action-status" class="muted"></p></div></section><section id="settings" hidden><h2>Workspace access</h2><p class="muted">The OAuth default root stays fixed. Added roots take effect on the next Start or Restart, then ChatGPT can open them with open_workspace.</p><ul id="allowed-roots"></ul><label>Add an exact local directory <input id="workspace-root" autocomplete="off"></label><button id="review-root" type="button">Review path</button><p id="root-review" class="muted"></p><label id="confirm-root-wrap" hidden>Type the reviewed canonical path to confirm <input id="root-confirmation" autocomplete="off"></label><button id="add-root" type="button" hidden>Add allowed root</button><h2>Tool permissions for next launch</h2><p class="muted">Read-only disables writes and shell; Edit permits workspace writes; Run safe permits the full tool surface with safe Bash. None enables full_access execution.</p><select id="permission-mode"><option value="read_only">Read-only</option><option value="edit">Edit workspace</option><option value="run_safe">Run safe commands</option></select><button id="save-permission" type="button">Save for next launch</button><p id="settings-status" class="muted"></p></section></main><script src="/control.js" defer></script></body></html>`;
const CSS = `:root{color-scheme:light dark;font-family:"Segoe UI Variable",system-ui,sans-serif;--ink:#17212b;--surface:#f7f8fa;--line:#c9d0d7;--signal:#0c6b62;--muted:#53616d}@media(prefers-color-scheme:dark){:root{--ink:#e7edf2;--surface:#171c22;--line:#39434d;--signal:#62d1bd;--muted:#a9b4be}}*{box-sizing:border-box}body{margin:0;background:var(--surface);color:var(--ink)}main{max-width:54rem;margin:auto;padding:3rem 1.5rem}.eyebrow{font:700 .72rem/1.2 ui-monospace,monospace;letter-spacing:.08em;color:var(--signal)}h1{font-size:clamp(2rem,6vw,3.5rem);letter-spacing:-.04em}section{margin-top:2rem;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:1.25rem 0}dl{display:grid;grid-template-columns:minmax(11rem,1fr) minmax(12rem,2fr)}dt,dd{margin:0;padding:.75rem 0;border-top:1px solid var(--line)}dt{font:700 .78rem/1.35 ui-monospace,monospace;text-transform:uppercase;color:var(--muted)}dd{overflow-wrap:anywhere}.actions{margin-top:1.2rem}.actions button{padding:.6rem .9rem;border:1px solid var(--line);background:transparent;color:inherit;font:inherit}.muted{color:var(--muted)}`;
const JS = `(()=>{const q=s=>document.querySelector(s);let csrf='';async function api(url,options={}){const headers={'content-type':'application/json',...(options.headers||{})};if(csrf)headers['x-codexgpt-csrf']=csrf;const r=await fetch(url,{credentials:'same-origin',...options,headers});const data=await r.json().catch(()=>({code:'CONTROL_RESPONSE_INVALID'}));if(!r.ok)throw new Error(data.code||'CONTROL_REQUEST_FAILED');return data}function render(data){const root=q('#runtime');root.replaceChildren();const observed=data.observedRuntime||{};const owned=data.ownedRuntimeState==='owned_starting'||data.ownedRuntimeState==='owned_running';const rows=[['Control plane',data.controlPlane],['Default workspace',data.workspaceRoot],['Runtime state',data.runtimeState],['Owned runtime',data.ownedRuntimeState],['Observed tunnel',observed.tunnel||'not observed'],['Observed tool mode',observed.toolMode||'not observed'],['Observed write mode',observed.writeMode||'not observed'],['Lifecycle actions',data.lifecycleActions]];for(const [label,value] of rows){const dt=document.createElement('dt');dt.textContent=label;const dd=document.createElement('dd');dd.textContent=value;root.append(dt,dd)}q('#start-runtime').disabled=owned;q('#stop-runtime').disabled=!owned;q('#restart-runtime').disabled=!owned;const settings=data.workspaceSettings;if(settings){q('#settings').hidden=false;const list=q('#allowed-roots');list.replaceChildren();settings.allowedRoots.forEach((value,index)=>{const item=document.createElement('li');item.textContent=value;if(index){const button=document.createElement('button');button.textContent='Remove';button.addEventListener('click',()=>removeRoot(value));item.append(' ',button)}list.append(item)});q('#permission-mode').value=settings.permissionMode;q('#settings-status').textContent='Next launch: '+settings.effectiveToolMode+' tools, '+settings.effectiveWriteMode+' writes, '+settings.effectiveBashMode+' Bash; execution profile remains off.'}}async function load(){render(await api('/api/status'))}async function changeRuntime(action,verb){q('#start-runtime').disabled=true;q('#stop-runtime').disabled=true;q('#restart-runtime').disabled=true;q('#action-status').textContent=verb;try{const result=await api('/api/runtime/'+action,{method:'POST',body:'{}'});q('#action-status').textContent='Runtime state: '+result.state;await load()}catch(error){q('#action-status').textContent='Could not '+action+': '+error.message}}async function reviewRoot(){try{const result=await api('/api/workspaces/preview',{method:'POST',body:JSON.stringify({root:q('#workspace-root').value})});q('#root-review').textContent='Reviewed: '+result.root+(result.alreadyAllowed?' (already allowed)':'');q('#confirm-root-wrap').hidden=false;q('#add-root').hidden=false;q('#root-confirmation').value=''}catch(error){q('#root-review').textContent='Could not review: '+error.message}}async function addRoot(){try{await api('/api/workspaces/add',{method:'POST',body:JSON.stringify({root:q('#workspace-root').value,confirmation:q('#root-confirmation').value})});q('#root-review').textContent='Saved for next Start or Restart.';q('#confirm-root-wrap').hidden=true;q('#add-root').hidden=true;await load()}catch(error){q('#root-review').textContent='Could not add: '+error.message}}async function removeRoot(root){try{await api('/api/workspaces/remove',{method:'POST',body:JSON.stringify({root})});await load()}catch(error){q('#root-review').textContent='Could not remove: '+error.message}}async function savePermission(){try{await api('/api/permissions',{method:'POST',body:JSON.stringify({mode:q('#permission-mode').value})});await load()}catch(error){q('#settings-status').textContent='Could not save: '+error.message}}async function start(){const bootstrap=new URLSearchParams(location.hash.slice(1)).get('bootstrap');if(bootstrap){history.replaceState(null,'',location.pathname);const data=await api('/session/bootstrap',{method:'POST',body:JSON.stringify({bootstrap})});csrf=data.csrfToken;sessionStorage.setItem('codexgpt-control-csrf',csrf)}else csrf=sessionStorage.getItem('codexgpt-control-csrf')||'';if(!csrf)return;q('#start-runtime').addEventListener('click',()=>changeRuntime('start','Starting Runtime and waiting for local health...'));q('#stop-runtime').addEventListener('click',()=>changeRuntime('stop','Stopping the owned Runtime tree...'));q('#restart-runtime').addEventListener('click',()=>changeRuntime('restart','Restarting the owned Runtime and waiting for local health...'));q('#review-root').addEventListener('click',reviewRoot);q('#add-root').addEventListener('click',addRoot);q('#save-permission').addEventListener('click',savePermission);await load();q('#status').textContent='Authenticated local owner session.';q('#content').hidden=false}start().catch(error=>{q('#status').textContent='Control plane unavailable: '+error.message})})();`;

function errorCode(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "CONTROL_REQUEST_FAILED";
  return /^[A-Z][A-Z0-9_]{0,79}$/.test(code) ? code : "CONTROL_REQUEST_FAILED";
}

export function createLifecycleControlApp(options: LifecycleControlAppOptions): express.Express {
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
    res.type("html").send(PAGE);
  });
  app.get("/control.css", (_req, res) => {
    setLoopbackUiHeaders(res);
    res.type("css").send(CSS);
  });
  app.get("/control.js", (_req, res) => {
    setLoopbackUiHeaders(res);
    res.type("text/javascript").send(JS);
  });
  app.get("/healthz", (_req, res) => {
    applyNoStore(res);
    res.json({ ok: true, name: "CodexGPT lifecycle control plane", lifecycleActions: "start_stop_restart_owned_only" });
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
  app.get("/api/status", async (req: Request, res: Response) => {
    setLoopbackUiHeaders(res);
    try {
      options.sessions.validateSession(parseLocalAdminCookie(req.get("cookie")));
      res.json({
        ...await options.statusSource.snapshot(),
        workspaceSettings: options.workspaceSettings?.snapshot() ?? null
      });
    } catch (error) {
      res.status(401).json({ code: errorCode(error) });
    }
  });
  app.post("/api/runtime/start", async (req, res) => {
    setLoopbackUiHeaders(res);
    if (req.get("origin") !== expectedOrigin) {
      res.status(403).json({ code: "AUTH_ADMIN_ORIGIN_INVALID" });
      return;
    }
    try {
      const cookie = parseLocalAdminCookie(req.get("cookie"));
      options.sessions.assertCsrf(cookie, req.get("x-codexgpt-csrf") ?? "");
      if (!options.runtimeControl) {
        res.status(503).json({ code: "CONTROL_RUNTIME_START_UNAVAILABLE" });
        return;
      }
      res.json(await options.runtimeControl.start());
    } catch (error) {
      res.status(403).json({ code: errorCode(error) });
    }
  });
  app.post("/api/runtime/stop", async (req, res) => {
    setLoopbackUiHeaders(res);
    if (req.get("origin") !== expectedOrigin) {
      res.status(403).json({ code: "AUTH_ADMIN_ORIGIN_INVALID" });
      return;
    }
    try {
      const cookie = parseLocalAdminCookie(req.get("cookie"));
      options.sessions.assertCsrf(cookie, req.get("x-codexgpt-csrf") ?? "");
      if (!options.runtimeControl) {
        res.status(503).json({ code: "CONTROL_RUNTIME_STOP_UNAVAILABLE" });
        return;
      }
      res.json(await options.runtimeControl.stop());
    } catch (error) {
      res.status(403).json({ code: errorCode(error) });
    }
  });
  app.post("/api/runtime/restart", async (req, res) => {
    setLoopbackUiHeaders(res);
    if (req.get("origin") !== expectedOrigin) {
      res.status(403).json({ code: "AUTH_ADMIN_ORIGIN_INVALID" });
      return;
    }
    try {
      const cookie = parseLocalAdminCookie(req.get("cookie"));
      options.sessions.assertCsrf(cookie, req.get("x-codexgpt-csrf") ?? "");
      if (!options.runtimeControl) {
        res.status(503).json({ code: "CONTROL_RUNTIME_RESTART_UNAVAILABLE" });
        return;
      }
      res.json(await options.runtimeControl.restart());
    } catch (error) {
      res.status(403).json({ code: errorCode(error) });
    }
  });
  const settingsMutation = (action: (body: Record<string, unknown>) => unknown) => (req: Request, res: Response): void => {
    setLoopbackUiHeaders(res);
    if (req.get("origin") !== expectedOrigin) {
      res.status(403).json({ code: "AUTH_ADMIN_ORIGIN_INVALID" });
      return;
    }
    try {
      const cookie = parseLocalAdminCookie(req.get("cookie"));
      options.sessions.assertCsrf(cookie, req.get("x-codexgpt-csrf") ?? "");
      if (!options.workspaceSettings || !req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        res.status(400).json({ code: "CONTROL_SETTINGS_UNAVAILABLE" });
        return;
      }
      res.json(action(req.body as Record<string, unknown>));
    } catch (error) {
      res.status(403).json({ code: errorCode(error) });
    }
  };
  app.post("/api/workspaces/preview", settingsMutation((body) => {
    if (typeof body.root !== "string") throw Object.assign(new Error("CONTROL_WORKSPACE_PATH_INVALID"), { code: "CONTROL_WORKSPACE_PATH_INVALID" });
    return options.workspaceSettings!.previewRoot(body.root);
  }));
  app.post("/api/workspaces/add", settingsMutation((body) => {
    if (typeof body.root !== "string" || typeof body.confirmation !== "string") throw Object.assign(new Error("CONTROL_WORKSPACE_PATH_INVALID"), { code: "CONTROL_WORKSPACE_PATH_INVALID" });
    return options.workspaceSettings!.addRoot(body.root, body.confirmation);
  }));
  app.post("/api/workspaces/remove", settingsMutation((body) => {
    if (typeof body.root !== "string") throw Object.assign(new Error("CONTROL_WORKSPACE_PATH_INVALID"), { code: "CONTROL_WORKSPACE_PATH_INVALID" });
    return options.workspaceSettings!.removeRoot(body.root);
  }));
  app.post("/api/permissions", settingsMutation((body) => {
    if (body.mode !== "read_only" && body.mode !== "edit" && body.mode !== "run_safe") throw Object.assign(new Error("CONTROL_PERMISSION_MODE_INVALID"), { code: "CONTROL_PERMISSION_MODE_INVALID" });
    return options.workspaceSettings!.setPermissionMode(body.mode);
  }));
  return app;
}
