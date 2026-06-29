/**
 * Inbound email webhook authorization (hardening).
 *
 * Pure + unit-tested. The endpoint resolves the env + request, this
 * decides. Key change from P4a: the webhook is now **fail-closed in
 * production** — an unset secret no longer means "open". In dev it stays
 * open so the channel is curl-demoable.
 */
import { timingSafeEqual } from "node:crypto";

export type WebhookAuthResult =
  | { ok: true }
  | { ok: false; status: number; reason: string };

/** Constant-time string compare (length-safe). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function checkWebhookAuth(opts: {
  configuredSecret?: string | null;
  provided?: string | null;
  isProduction: boolean;
}): WebhookAuthResult {
  const configured = (opts.configuredSecret ?? "").trim();

  if (!configured) {
    // Fail-closed in production: never expose an unauthenticated ingest
    // endpoint to the internet. Open in dev for curl demos.
    if (opts.isProduction) {
      return {
        ok: false,
        status: 503,
        reason:
          "Email webhook is not configured. Set AEGIS_EMAIL_WEBHOOK_SECRET to enable it in production.",
      };
    }
    return { ok: true };
  }

  const provided = (opts.provided ?? "").trim();
  if (!provided || !safeEqual(provided, configured)) {
    return { ok: false, status: 401, reason: "Invalid or missing webhook secret." };
  }
  return { ok: true };
}
