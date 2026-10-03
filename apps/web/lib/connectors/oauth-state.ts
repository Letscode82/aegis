/**
 * OAuth `state` CSRF cookie for the connector authorization flow.
 *
 * `/connect` mints a random nonce, binds it to the connector id, and stores it
 * in an httpOnly, SameSite=Lax cookie (Lax so it survives Microsoft's top-level
 * redirect back). `/callback` verifies the `state` query param against the
 * cookie before exchanging the code, then clears it. A thin, dependency-free
 * CSRF guard; a signed/stateful store is a follow-up hardening.
 */
import { randomBytes } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";

const COOKIE = "aegis_connector_oauth";

export function makeNonce(): string {
  return randomBytes(24).toString("hex");
}

/** The `state` value sent to the provider: `${connectorId}.${nonce}`. */
export function encodeState(connectorId: string, nonce: string): string {
  return `${connectorId}.${nonce}`;
}

export function setStateCookie(res: NextApiResponse, state: string): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${encodeURIComponent(state)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${secure}`,
  );
}

export function clearStateCookie(res: NextApiResponse): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}

export function readStateCookie(req: NextApiRequest): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** Constant-time-ish equality for the state check. */
export function statesMatch(a: string | null, b: string | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
