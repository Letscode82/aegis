/**
 * POST /api/intake/clarify — the clarify-before-file pre-step (CW-1).
 *
 * Given the free-text request, classify it and return the required facts still
 * missing for that category, so the ONE Legal console can ask for them before
 * filing a complete ticket. Read-only: files nothing, mutates nothing — the
 * ticket write still happens through the normal intake chokepoint afterward.
 *
 * Degrade-safe: on any error (or a category with no required fields) it returns
 * `missing: []`, and the console files directly as before.
 *
 * Gated intake:create_ticket — same as the other intake front-door routes.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { clarifyIntake } from "@aegis/intake/clarify";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    assertUserCanDo(user, Permission.IntakeCreateTicket);
    const body = (req.body || {}) as { text?: string; dept?: string };
    const text = String(body.text || "").trim();
    if (text.length < 3) return res.status(400).json({ ok: false, error: "Describe your request in a few words." });
    const dept = String(body.dept || "").trim();

    const result = await clarifyIntake({ text, dept });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    // Degrade: never block filing on a clarify failure.
    return res.status(200).json({ ok: true, category: "General Inquiry", source: "default", extracted: {}, missing: [] });
  }
}
