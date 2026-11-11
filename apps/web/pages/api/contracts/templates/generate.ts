/**
 * POST /api/contracts/templates/generate — draft a template body with AI.
 * body { kind, name, instructions, grounded?, allowedDomains? }
 *   → { body, grounded, sources, skeleton?, searchError?, degradedReason? }.
 * Gated contracts:approve. Writes nothing — the human reviews it in the
 * Templates editor and the SAVE is the chain-sealed mutation.
 *
 * NEVER-FALTER contract: this route ALWAYS returns a usable template body (200),
 * even when the model is slow or unavailable, because a timeout error mid-demo
 * is unacceptable. Order of preference:
 *   1. grounded (opt-in: `grounded:true`) — searches the current official
 *      sources via the web-search tool and cites them. Needs a higher function
 *      time limit (Vercel Pro) + web search enabled on the account.
 *   2. fast ungrounded draft — sized to fit a ~60s function budget (Vercel
 *      Hobby's cap); set ANTHROPIC_FAST_MODEL (e.g. a Haiku id) to make it
 *      finish comfortably within that budget.
 *   3. deterministic skeleton — a placeholdered, regulatory-aware starting
 *      point returned if the AI can't finish in time, so Generate never errors.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { callClaude, friendlyAIError } from "@aegis/ai";
import { ensureServerClaudeTransport, callClaudeWithWebSearch } from "@aegis/ai/server";
import { buildTemplateSkeleton } from "@aegis/contracts";

const KIND_HINT: Record<string, string> = {
  NDA: "a mutual non-disclosure agreement",
  CONTRACT: "a commercial contract",
  NOTICE: "a formal legal notice",
  OTHER: "a legal document",
};

// Honored on Vercel Pro (up to 300s); Hobby caps functions at 60s regardless,
// which is why the ungrounded default + skeleton fallback are sized to fit ~60s.
export const config = { maxDuration: 300 };

const PLACEHOLDER_RULES =
  "Use {{variable}} placeholders for every fill-in (e.g. {{company}}, {{counterparty}}, {{date}}, {{term}}, {{governingLaw}}). Do not invent specific party names, dates, or dollar amounts.";
const UNVERIFIED_BANNER =
  "> ⚠ DRAFT NOT VERIFIED AGAINST OFFICIAL SOURCES. Live legal research was unavailable, so any regulatory / mandatory requirements below come from the model's general knowledge and may be out of date or incomplete. A qualified lawyer must confirm this against the current primary sources before use.\n\n";

function cleanBody(s: string): string {
  return (s || "").replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
}

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
  const wantGrounded = req.body?.grounded === true; // OPT-IN — grounding needs more function time (Pro)
  const allowedDomains = Array.isArray(req.body?.allowedDomains)
    ? req.body.allowedDomains.map((d: unknown) => String(d)).filter(Boolean).slice(0, 64)
    : undefined;

  const hint = KIND_HINT[kind] || "a legal document";
  const skeleton = () => buildTemplateSkeleton({ kind, name, instructions });

  const ungroundedPrompt = `You are a senior legal template author for an in-house legal team. Draft ${hint}${name ? ` titled "${name}"` : ""}.

Requirements from the drafter:
${instructions || "(none — produce a clean, standard, playbook-aligned default.)"}

Rules:
- ${PLACEHOLDER_RULES}
- Keep it professional and standard; favour balanced, playbook-aligned positions.
- Be concise — a reusable template skeleton, not an over-long document.
- Return ONLY the template body text — no preamble, no explanation, no markdown fences.`;

  try {
    ensureServerClaudeTransport();

    // 1 — grounded (opt-in). Needs Pro + web search enabled.
    if (wantGrounded) {
      try {
        const system =
          "You are a senior legal template author. You have a web_search tool — USE IT to find the CURRENT official text of any statute, regulation, or regulator guidance the drafter names or implies (the regulator's own site / primary sources). Draft so the document captures every MANDATORY requirement, cite the sources you relied on, and favour the side the drafter names.";
        const groundedPrompt = `Draft ${hint}${name ? ` titled "${name}"` : ""} capturing all mandatory requirements from the current official source(s).\n\nRequirements from the drafter:\n${instructions || "(none)"}\n\nRules:\n- ${PLACEHOLDER_RULES}\n- Return ONLY the template body text — no preamble, no JSON, no markdown fences.`;
        const r = await callClaudeWithWebSearch(groundedPrompt, { system, maxTokens: 6500, timeout: 100000, maxUses: 4, allowedDomains });
        const body = cleanBody(r.text);
        if (body) {
          return res.status(200).json({ ok: true, body, grounded: r.sources.length > 0, sources: r.sources, searchError: r.searchError || null });
        }
      } catch (e) {
        console.error("[contracts/templates/generate] grounded path failed, trying fast draft:", e);
      }
    }

    // 2 — fast ungrounded draft, sized to fit a ~60s function budget.
    try {
      const raw = await callClaude(ungroundedPrompt, { model: process.env.ANTHROPIC_FAST_MODEL || undefined, maxTokens: 3200, timeout: 45000 });
      const body = cleanBody(raw || "");
      if (body && body.length > 200) {
        return res.status(200).json({
          ok: true,
          body: wantGrounded ? UNVERIFIED_BANNER + body : body,
          grounded: false,
          sources: [],
          degradedReason: wantGrounded ? "Live source grounding was unavailable; drafted from general knowledge." : null,
        });
      }
    } catch (e) {
      console.error("[contracts/templates/generate] fast draft failed, returning skeleton:", e);
    }

    // 3 — never-falter: deterministic, regulatory-aware skeleton.
    return res.status(200).json({
      ok: true,
      body: skeleton(),
      grounded: false,
      sources: [],
      skeleton: true,
      degradedReason: "AI drafting didn't complete within the time limit — returned a structured skeleton to fill in.",
    });
  } catch (e) {
    // Even transport setup failed (e.g. no API key). Still return the skeleton so the user is never blocked.
    return res.status(200).json({
      ok: true,
      body: skeleton(),
      grounded: false,
      sources: [],
      skeleton: true,
      degradedReason: friendlyAIError(e as never),
    });
  }
}
