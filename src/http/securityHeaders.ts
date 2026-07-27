import type { NextFunction, Request, Response } from "express";

export function applyBaseSecurityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
}

export function applyNoStore(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
}
