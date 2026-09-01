import type { Request, Response } from "express";
import { applyNoStore } from "./securityHeaders.js";

export function hasExactLoopbackHost(req: Request, origin: string): boolean {
  const expected = new URL(origin);
  const values: string[] = [];
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index]?.toLocaleLowerCase("en-US") === "host") values.push(req.rawHeaders[index + 1] ?? "");
  }
  return values.length === 1 && values[0] === expected.host && req.headers.host === expected.host;
}

export function isLoopbackPeer(req: Request): boolean {
  const address = req.socket.remoteAddress;
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

export function setLoopbackUiHeaders(res: Response): void {
  applyNoStore(res);
  res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
}
