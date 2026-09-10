/**
 * POST /api/notices/draft  { noticeType, subject, counterparty?, keyPoints? }
 *   → { ok, body, degraded }
 *
 * Drafts an outbound legal-notice body with AI. Conservative-AI: this only
 * DRAFTS text and returns it — it writes nothing. The human edits it and the
 * CREATE (POST /api/notices/outbound) is the chain-sealed mutation. Degrades
 * to a deterministic template when the model is unavailable, so the affordance
 * works without an API key.
 *
 * Gated on regulatory:flag_obligation (the same write grant that creates the
 * notice obligation).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { callClaude } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";
import { requireActor } from "../../../lib/matter-actor";

const TYPE_HINT: Record<string, string> = {
  RENEWAL_NOTICE: "a contract renewal / non-renewal notice",
  REPORTING: "a regulatory reporting notice",
  COMPLIANCE: "a compliance notice",
  PAYMENT: "a payment-due notice",
  DELIVERABLE: "a deliverable-due notice",
  OTHER: "a formal legal notice",
};

function templateBody(noticeType: string, subject: string, counterparty: string, keyPoints: string): string {
  const to = counterparty || "[Recipient]";
  const pts = keyPoints
    ? keyPoints.split(/\n|;/).map((p) => p.trim()).filter(Boolean).map((p) => `  - ${p}`).join("\n")
    : "  - [Key point 1]\n  - [Key point 2]";
  return `NOTICE — ${subject || TYPE_HINT[noticeType] || "Formal Notice"}

To: ${to}
Date: [Date]

Dear ${to},

This letter constitutes formal notice regarding the matter identified above. Please be advised of the following:

${pts}

Please govern yourself accordingly and respond by the date required. This notice is given without prejudice to any rights or remedies, all of which are expressly reserved.

Sincerely,
[Sender name / title]
[Organization]`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
  }
  const actor = await requireActor(req, res, Permission.RegulatoryFlagObligation);
  if (!actor) return;

  const noticeType = String(req.body?.noticeType || "OTHER").toUpperCase();
  const subject = String(req.body?.subject || "").slice(0, 300);
  const counterparty = String(req.body?.counterparty || "").slice(0, 200);
  const keyPoints = String(req.body?.keyPoints || "").slice(0, 2000);

  const prompt = `You are in-house legal counsel drafting ${TYPE_HINT[noticeType] || "a formal legal notice"} on behalf of the company.

Subject: ${subject || "(none provided)"}
Recipient / counterparty: ${counterparty || "(none provided)"}
Key points to convey:
${keyPoints || "(none — produce a clean, standard, professional default.)"}

Rules:
- Professional, precise, legally cautious tone. Reserve rights; no admissions.
- Use [bracketed placeholders] for any specific fact not given (dates, amounts, names).
- Return ONLY the notice body text — no preamble, no explanation, no markdown fences.`;

  try {
    ensureServerClaudeTransport();
    const out = await callClaude(prompt, { maxTokens: 1400, timeout: 45000 });
    const clean = (out || "").replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
    if (!clean) throw new Error("Empty draft");
    return res.status(200).json({ ok: true, body: clean, degraded: false });
  } catch {
    // Degrade to a deterministic template so the affordance always works.
    return res.status(200).json({ ok: true, body: templateBody(noticeType, subject, counterparty, keyPoints), degraded: true });
  }
}
