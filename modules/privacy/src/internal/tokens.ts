/**
 * Login-less data-subject access tokens (shared helper). Same posture as the
 * contract-review + custodian tokens: only the SHA-256 hash is stored; the raw
 * token lives once, in the emailed URL. Validity (status + expiry) and scope
 * (one request) are re-derived from the row on every call, never trusted from
 * the caller.
 */
import { randomBytes } from "node:crypto";
import { sha256Hex } from "@aegis/db";

export function generateRawToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(raw: string): string {
  return sha256Hex(raw);
}

export function tokenUsable(row: { status: string; expiresAt: Date }, now: Date): boolean {
  if (row.status !== "ACTIVE") return false;
  return row.expiresAt.getTime() > now.getTime();
}

/** Build the portal URL for a raw token. Relative when no base is configured
 *  (email needs an absolute URL — set APP_BASE_URL / NEXT_PUBLIC_APP_URL). */
export function portalUrl(rawToken: string): string {
  const base = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  return `${base}/dsar-portal/${rawToken}`;
}
