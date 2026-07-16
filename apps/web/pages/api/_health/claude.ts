/**
 * GET /api/_health/claude — admin-only live Claude connectivity probe.
 *
 * Makes a minimal (1-token) real call to Anthropic through the server
 * transport, using the same model the proxy would (ANTHROPIC_MODEL ||
 * "claude-sonnet-5"), and reports the EXACT upstream outcome so an admin
 * can tell "AI unavailable" apart at a glance:
 *   ok        → key + model + credit all good
 *   401/403   → ANTHROPIC_API_KEY invalid or lacks access
 *   404/400   → model id rejected
 *   402/429   → out of credit / rate limited
 *   500       → ANTHROPIC_API_KEY not set
 * The key never leaves the server. Gated on admin:manage_users because it
 * makes a real (billable) call.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { callAnthropicMessages } from "@aegis/ai/server";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  try {
    assertUserCanDo(user, Permission.AdminManageUsers);
  } catch (err) {
    if (err instanceof AccessDeniedError)
      return res.status(403).json({ ok: false, error: err.decision.message });
    throw err;
  }

  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  const keyPresent = !!process.env.ANTHROPIC_API_KEY;
  const started = Date.now();
  try {
    await callAnthropicMessages({
      model,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    return res.status(200).json({
      ok: true,
      model,
      keyPresent,
      ms: Date.now() - started,
      message: `Claude reachable with model "${model}".`,
    });
  } catch (err: unknown) {
    const e = err as { status?: number; body?: string; message?: string };
    const status = typeof e.status === "number" ? e.status : null;
    let reason = "Unknown AI error.";
    if (!keyPresent) reason = "ANTHROPIC_API_KEY is not set on this deployment.";
    else if (status === 401 || status === 403) reason = "ANTHROPIC_API_KEY is invalid or lacks access.";
    else if (status === 404 || status === 400) reason = `Model "${model}" was rejected — set a valid ANTHROPIC_MODEL.`;
    else if (status === 402 || status === 429) reason = "Anthropic account is out of credit or rate-limited — check billing.";
    return res.status(200).json({
      ok: false,
      model,
      keyPresent,
      status,
      reason,
      detail: (e.body || e.message || "").slice(0, 300),
    });
  }
}
