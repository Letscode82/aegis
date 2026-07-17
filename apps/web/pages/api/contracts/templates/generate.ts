/**
 * POST /api/contracts/templates/generate — draft a template body with AI.
 * body { kind, name, instructions } → { body }. Gated contracts:approve.
 *
 * Conservative-AI: this only DRAFTS text and returns it — it writes
 * nothing. The human reviews it in the Templates editor and the SAVE
 * (POST /api/contracts/templates) is the chain-sealed mutation.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { callClaude, friendlyAIError } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";

const KIND_HINT: Record<string, string> = {
  NDA: "a mutual non-disclosure agreement",
  CONTRACT: "a commercial contract",
  NOTICE: "a formal legal notice",
  OTHER: "a legal document",
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  try {
    assertUserCanDo(user, Permission.ContractsApprove);
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    throw err;
  }

  const kind = String(req.body?.kind || "OTHER").toUpperCase();
  const name = String(req.body?.name || "").slice(0, 200);
  const instructions = String(req.body?.instructions || "").slice(0, 2000);

  const prompt = `You are a senior legal template author for an in-house legal team. Draft ${KIND_HINT[kind] || "a legal document"} template${name ? ` titled "${name}"` : ""}.

Requirements from the drafter:
${instructions || "(none — produce a clean, standard, playbook-aligned default.)"}

Rules:
- Use {{variable}} placeholders for every fill-in (e.g. {{company}}, {{counterparty}}, {{date}}, {{term}}, {{governingLaw}}). Do not invent specific party names, dates, or dollar amounts.
- Keep it professional and standard; favour balanced, playbook-aligned positions.
- Return ONLY the template body text — no preamble, no explanation, no markdown fences.`;

  try {
    ensureServerClaudeTransport();
    const body = await callClaude(prompt, { maxTokens: 1800, timeout: 45000 });
    const clean = (body || "").replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
    if (!clean) throw new Error("Empty draft");
    return res.status(200).json({ ok: true, body: clean });
  } catch (e) {
    return res.status(502).json({ ok: false, error: friendlyAIError(e as never) });
  }
}
