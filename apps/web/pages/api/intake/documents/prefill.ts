/**
 * POST /api/intake/documents/prefill (Task 10 — document-first intake)
 *
 * Given text already extracted from an attached document, return STRUCTURED
 * intake fields (request type, counterparty, value, governing law, a short
 * summary) so the New Request form can OFFER to pre-fill them. Until now the
 * document-first path only folded the raw text into the description — the
 * reviewer still had to read it and set the fields by hand.
 *
 * Non-authoritative + degrade-safe: the form applies these only when the user
 * clicks "Apply", and this route returns { fields: null } (not an error) on any
 * model failure, so the New Request flow never breaks if extraction is
 * unavailable. Gated intake:create_ticket — the same grant as filing a ticket.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { callClaude, parseJSONLoose } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";
import { requireActor } from "../../../../lib/matter-actor";

export const config = { api: { bodyParser: { sizeLimit: "2mb" } }, maxDuration: 30 };

// The built-in request types the New Request form offers (kept in sync with
// modules/intake/src/internal/intake/index.jsx). The model must pick one of
// these or "Other" so the suggestion maps cleanly onto a form option.
const REQUEST_TYPES = [
  "Contract Review", "NDA Request", "IP Question", "Privacy Question",
  "Trademark Check", "Vendor Due Diligence", "Contract Question",
  "Legal Question — General", "Other",
];

export interface PrefillFields {
  type: string | null;
  counterparty: string | null;
  value: number | null;
  currency: string | null;
  governingLaw: string | null;
  summary: string | null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.IntakeCreateTicket);
  if (!actor) return;

  const text = String((req.body ?? {}).text ?? "").trim();
  if (text.length < 40) return res.status(200).json({ ok: true, fields: null, degraded: false, note: "Too little text to extract fields." });

  const pick = (v: unknown): string | null => {
    const s = typeof v === "string" ? v.trim() : "";
    return s && s.toLowerCase() !== "null" && s.toLowerCase() !== "n/a" ? s : null;
  };

  try {
    ensureServerClaudeTransport();
    const prompt = [
      "Extract intake fields from the legal document below. Return ONLY a JSON object (no prose, no code fence):",
      '{"type":"<one allowed type>","counterparty":"<other party name or null>","value":<number or null>,"currency":"<ISO code or null>","governingLaw":"<jurisdiction or null>","summary":"<=240 char plain summary of what is being requested>"}',
      `Allowed types: ${REQUEST_TYPES.join(", ")}. Pick the single best fit, else "Other".`,
      "value is the monetary deal/contract value as a number only (no symbols or commas), or null.",
      "Do NOT guess — use null for any field not clearly present in the document.",
      "",
      "DOCUMENT:",
      text.slice(0, 12000),
    ].join("\n");
    const raw = await callClaude(prompt, { maxTokens: 600, timeout: 25000 });
    const obj = parseJSONLoose(String(raw || "")) as Record<string, unknown>;

    let type = pick(obj.type);
    if (type && !REQUEST_TYPES.includes(type)) type = "Other";
    const valueNum =
      typeof obj.value === "number" && Number.isFinite(obj.value) ? obj.value
      : typeof obj.value === "string" && /^[\d,.]+$/.test(obj.value.trim()) ? Number(obj.value.replace(/,/g, "")) || null
      : null;

    const fields: PrefillFields = {
      type,
      counterparty: pick(obj.counterparty),
      value: valueNum,
      currency: pick(obj.currency),
      governingLaw: pick(obj.governingLaw),
      summary: pick(obj.summary),
    };
    const any = fields.type || fields.counterparty || fields.value != null || fields.governingLaw || fields.summary;
    return res.status(200).json({ ok: true, fields: any ? fields : null, degraded: false });
  } catch (e) {
    // Degrade-safe: never block the New Request flow on extraction failure.
    return res.status(200).json({ ok: true, fields: null, degraded: true, note: String((e as Error).message || e) });
  }
}
