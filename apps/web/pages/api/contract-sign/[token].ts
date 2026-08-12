/**
 * /api/contract-sign/[token] — the public signing surface. The token is the
 * gate (no auth).
 *   GET  — resolve the request → signing context (marks VIEWED). 404 if invalid.
 *   POST — { action: "sign", typedName, agreed } to sign, or
 *          { action: "decline", reason? } to decline. Captures IP + user-agent.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { resolveSignatureRequest, submitSignature, declineSignature } from "@aegis/contracts";

function clientIp(req: NextApiRequest): string | null {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string") return xf.split(",")[0]?.trim() ?? null;
  return req.socket?.remoteAddress ?? null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = String(req.query.token || "");

  if (req.method === "GET") {
    const context = await resolveSignatureRequest(token);
    if (!context) return res.status(404).json({ ok: false, error: "This signing link is invalid, expired, or already used." });
    return res.status(200).json({ ok: true, context });
  }
  if (req.method === "POST") {
    const action = String(req.body?.action || "sign");
    if (action === "decline") {
      const r = await declineSignature(token, req.body?.reason ? String(req.body.reason) : null);
      return res.status(r.ok ? 200 : 400).json(r.ok ? { ok: true } : { ok: false, error: "Could not record decline" });
    }
    const result = await submitSignature(token, {
      typedName: String(req.body?.typedName ?? ""),
      agreed: req.body?.agreed === true,
      ip: clientIp(req),
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
    });
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    return res.status(200).json({ ok: true, executed: result.executed });
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
