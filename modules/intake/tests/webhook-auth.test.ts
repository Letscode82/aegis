/**
 * Inbound webhook authorization (hardening). The big change: fail-closed
 * in production when no secret is configured (no open ingest endpoint).
 */
import { describe, expect, it } from "vitest";
import { checkWebhookAuth } from "../src/email/webhook-auth";

describe("checkWebhookAuth()", () => {
  it("is OPEN in dev when no secret is configured", () => {
    expect(checkWebhookAuth({ configuredSecret: "", provided: null, isProduction: false }))
      .toEqual({ ok: true });
  });

  it("is FAIL-CLOSED (503) in production when no secret is configured", () => {
    const r = checkWebhookAuth({ configuredSecret: "", provided: "anything", isProduction: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
  });

  it("accepts a matching secret", () => {
    expect(checkWebhookAuth({ configuredSecret: "s3cr3t", provided: "s3cr3t", isProduction: true }))
      .toEqual({ ok: true });
  });

  it("rejects a wrong or missing secret with 401", () => {
    const wrong = checkWebhookAuth({ configuredSecret: "s3cr3t", provided: "nope", isProduction: true });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.status).toBe(401);

    const missing = checkWebhookAuth({ configuredSecret: "s3cr3t", provided: null, isProduction: false });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.status).toBe(401);
  });

  it("rejects a length-mismatched secret (constant-time path) without throwing", () => {
    const r = checkWebhookAuth({ configuredSecret: "short", provided: "a-much-longer-value", isProduction: true });
    expect(r.ok).toBe(false);
  });
});
