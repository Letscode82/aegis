/**
 * POST /api/contracts/templates/generate — draft a template body with AI,
 * GROUNDED in current official sources via Anthropic's web-search tool.
 * body { kind, name, instructions, grounded?, allowedDomains? }
 *   → { body, grounded, sources, searchError?, degradedReason? }.
 * Gated contracts:approve.
 *
 * Conservative-AI: this only DRAFTS text and returns it — it writes nothing.
 * The human reviews it in the Templates editor and the SAVE (POST
 * /api/contracts/templates) is the chain-sealed mutation.
 *
 * Why grounded: a regulated agreement (e.g. an RBI Digital-Lending LSP
 * agreement) must capture the MANDATORY requirements as the law stands today —
 * not the model's training-cut memory, which drifts and hallucinates specific
 * clauses. The default path searches the web for the current official text and
 * cites the sources it used. If web search is unavailable (not enabled on the
 * account, blocked egress, or `grounded:false`), it falls back to an ungrounded
 * draft prefixed with an explicit "NOT verified against official sources"
 * warning — it never silently implies the regulatory content is complete.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { callClaude, friendlyAIError } from "@aegis/ai";
import { ensureServerClaudeTransport, callClaudeWithWebSearch } from "@aegis/ai/server";

const KIND_HINT: Record<string, string> = {
  NDA: "a mutual non-disclosure agreement",
  CONTRACT: "a commercial contract",
  NOTICE: "a formal legal notice",
  OTHER: "a legal document",
};

// Web search + a long regulatory draft can run well past the default ~10s.
// Give the function real headroom (effective cap is whatever the Vercel plan
// allows; this is harmless if lower).
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
  const wantGrounded = req.body?.grounded !== false; // default true
  const allowedDomains = Array.isArray(req.body?.allowedDomains)
    ? req.body.allowedDomains.map((d: unknown) => String(d)).filter(Boolean).slice(0, 64)
    : undefined;

  const hint = KIND_HINT[kind] || "a legal document";

  try {
    ensureServerClaudeTransport();

    // ── Grounded path: draft against current official sources ──────────
    if (wantGrounded) {
      const system =
        "You are a senior legal template author for an in-house legal team. You have a web_search tool — USE IT to find the CURRENT official text of any statute, regulation, or regulator guidance the drafter names or implies (search the regulator's own site and primary sources, not blogs). Draft the document so it captures every MANDATORY requirement from those sources, and cite the sources you relied on. Favour the side the drafter names; otherwise stay balanced and playbook-standard.";
      const prompt = [
        `Draft ${hint}${name ? ` titled "${name}"` : ""}.`,
        "",
        "Requirements from the drafter:",
        instructions || "(none — produce a clean, standard, playbook-aligned default.)",
        "",
        "Rules:",
        `- First search for and rely on the current official source(s); capture all mandatory requirements they impose.`,
        `- ${PLACEHOLDER_RULES}`,
        "- Keep it professional and standard.",
        "- Return ONLY the template body text — no preamble, no explanation, no markdown fences.",
      ].join("\n");

      try {
        const r = await callClaudeWithWebSearch(prompt, { system, maxTokens: 7000, timeout: 240000, maxUses: 6, allowedDomains });
        const body = cleanBody(r.text);
        if (body) {
          return res.status(200).json({
            ok: true,
            body,
            grounded: r.sources.length > 0,
            sources: r.sources,
            searchError: r.searchError || null,
          });
        }
        // Empty grounded result → fall through to the ungrounded draft.
      } catch (e) {
        // Web search unavailable (not enabled / blocked / network). Fall back,
        // but mark the draft as unverified rather than pretending it's grounded.
        console.error("[contracts/templates/generate] web-search grounding failed, falling back to ungrounded:", e);
      }
    }

    // ── Ungrounded fallback: honest, explicitly flagged ────────────────
    const prompt = `You are a senior legal template author for an in-house legal team. Draft ${hint}${name ? ` titled "${name}"` : ""}.

Requirements from the drafter:
${instructions || "(none — produce a clean, standard, playbook-aligned default.)"}

Rules:
- ${PLACEHOLDER_RULES}
- Keep it professional and standard; favour balanced, playbook-aligned positions.
- Return ONLY the template body text — no preamble, no explanation, no markdown fences.`;
    const raw = await callClaude(prompt, { maxTokens: 6000, timeout: 55000 });
    const body = cleanBody(raw || "");
    if (!body) throw new Error("Empty draft");
    const degradedReason = wantGrounded ? "Live source grounding was unavailable; drafted from general knowledge." : null;
    return res.status(200).json({
      ok: true,
      body: wantGrounded ? UNVERIFIED_BANNER + body : body,
      grounded: false,
      sources: [],
      degradedReason,
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: friendlyAIError(e as never) });
  }
}
