/**
 * POST /api/one-legal/research — cited research over external legal authorities (C-4).
 *
 * ONE Legal's answer over the *law itself*, not the org's documents: caselaw
 * (CourtListener), US statutes / CFR (GovInfo), SEC filings (EDGAR), and EU law
 * (EUR-Lex) via the `@aegis/connectors` research layer, grounded through Claude
 * with the C-13 citation guard so every `[n]` resolves to a real, linkable
 * authority. Degrades to the retrieved authorities when the model is offline,
 * and answers honestly when nothing matches.
 *
 * Server-side only (the Anthropic key + any provider keys stay server-side).
 * Gated intake:create_ticket — the same grant as the other ONE Legal console
 * routes (/ask, /agent).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { assertAndAudit } from "../../../lib/authz";
import { recordSpan } from "@aegis/observability";
import { runLegalResearch } from "../../../lib/one-legal/legal-research";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    await assertAndAudit(user, Permission.IntakeCreateTicket, { route: "one-legal.research" });
    const body = (req.body || {}) as { text?: unknown; jurisdiction?: unknown };
    const question = String(body.text || "").trim();
    if (question.length < 3) return res.status(400).json({ ok: false, error: "Ask a legal-research question in a few words." });
    const jurisdiction = typeof body.jurisdiction === "string" && body.jurisdiction.trim() ? body.jurisdiction.trim() : undefined;

    const t0 = Date.now();
    const result = await runLegalResearch({ organizationId: user.organizationId, question, jurisdiction });
    recordSpan("one_legal.research", Date.now() - t0, {
      grounded: result.grounded,
      sources: result.sources.length,
      degraded: result.degraded,
      providersOk: result.providers.filter((p) => p.ok).length,
      citationsDropped: result.citations?.dropped ?? 0,
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
