/**
 * Cron endpoint authentication.
 *
 * Scheduled sweeps run with no Auth0 session, so the session-gated admin job
 * routes can't serve them. Instead the caller (Vercel Cron, GitHub Actions,
 * any pinger) presents a shared secret. Vercel Cron automatically sends
 * `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set on the project,
 * so checking that bearer is the canonical path; we also accept the same
 * secret in an `x-cron-secret` header for other schedulers.
 *
 * Fail-loud in production (mirrors the AUTH0_SECRET guard): if CRON_SECRET is
 * unset in production the endpoint refuses every request rather than running
 * unauthenticated. In non-production it allows the call so `pnpm dev` and local
 * pings work zero-config.
 */
import type { NextApiRequest } from "next";

export type CronAuthResult = { ok: true } | { ok: false; status: number; error: string };

/** Pure predicate — testable without a request object. */
export function evaluateCronAuth(
  presented: { bearer?: string | null; headerSecret?: string | null },
  secret: string | undefined,
  isProduction: boolean,
): CronAuthResult {
  if (!secret) {
    if (isProduction) {
      return { ok: false, status: 503, error: "CRON_SECRET is not configured" };
    }
    return { ok: true }; // dev-mode: zero-config
  }
  if (presented.bearer === secret || presented.headerSecret === secret) {
    return { ok: true };
  }
  return { ok: false, status: 401, error: "Unauthorized" };
}

/** Extract credentials from the request and evaluate them. */
export function checkCronAuth(req: NextApiRequest): CronAuthResult {
  const auth = req.headers.authorization || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  const headerSecret = (req.headers["x-cron-secret"] as string | undefined) ?? null;
  return evaluateCronAuth(
    { bearer, headerSecret },
    process.env.CRON_SECRET,
    process.env.NODE_ENV === "production",
  );
}
