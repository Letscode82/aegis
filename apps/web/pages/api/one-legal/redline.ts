/**
 * POST /api/one-legal/redline — suggest document-level redlines against the
 * org's playbook.
 *
 * Takes a drafted document (inline text, or a saved Document by id) and returns
 * a playbook-aligned REVISION of the whole document. The console diffs base →
 * revised with `@aegis/contracts.diffWords` and renders the result as inline
 * track-changes the user accepts/rejects — nothing is applied server-side, so
 * this is assistance, not a mutation (the human edit is the gate). Degrades to
 * "no changes" with a reason when the model is unavailable, so the flow never
 * dead-ends.
 *
 * Gated intake:create_ticket — same as the other ONE Legal console routes.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { assertAndAudit } from "../../../lib/authz";
import { callClaudeJSON, parseJSONLoose, friendlyAIError } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";
import { recordSpan } from "@aegis/observability";
import { getContractPlaybookText } from "@aegis/contracts";
import { loadReviewDocument } from "../../../lib/one-legal/review-docs";
import {
  jurisdictionDirective,
  normalizeJurisdiction,
  orgPlaybookPromptBlock,
  ORG_PLAYBOOK_LABEL,
} from "../../../lib/one-legal/review-playbook";

// The revise pass carries the whole document, so give it the full function
// window like the deep review. The token cap bounds worst-case length; it
// never truncates what the user sees because the response is returned whole.
export const config = { api: { bodyParser: { sizeLimit: "2mb" } }, maxDuration: 60 };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    await assertAndAudit(user, Permission.IntakeCreateTicket, { route: "one-legal.redline" });
    const t0 = Date.now();
    const body = (req.body || {}) as {
      text?: string;
      title?: string;
      documentId?: string;
      jurisdiction?: string;
      instruction?: string;
    };

    // Resolve the base document: an explicit id loads the full saved text;
    // otherwise the inline `text` the canvas sends.
    const loaded = await loadReviewDocument(user.organizationId, body.documentId);
    const base = String((loaded?.text ?? body.text) || "").trim();
    if (base.length < 40) return res.status(400).json({ ok: false, error: "Nothing to redline yet — draft the document first." });

    const jurisdiction = normalizeJurisdiction(body.jurisdiction);
    const title = String(body.title || loaded?.name || "document").slice(0, 160);

    // The org's editable Contracts Playbook is authoritative when configured;
    // empty → the model's standard protective positions. Best-effort.
    let orgPlaybookText = "";
    try {
      orgPlaybookText = await getContractPlaybookText(user.organizationId);
    } catch (e) {
      console.error("[one-legal:redline] org playbook lookup failed:", (e as Error)?.message || e);
    }
    const usingOrgPlaybook = orgPlaybookText.trim().length > 0;
    const playbookLabel = usingOrgPlaybook ? ORG_PLAYBOOK_LABEL : "our standard playbook positions";

    const extra = String(body.instruction || "").trim();
    const system =
      "You are senior in-house counsel marking up a document ON OUR PAPER (protective of us, but balanced and reasonable). " +
      `Revise the document to ${playbookLabel}: make the MINIMAL set of changes needed to bring it onto our standard — ` +
      "tighten or add protective language where it's missing, fix off-market terms, and leave compliant language untouched. " +
      "Preserve the document's structure, numbering, and defined terms. Do NOT rewrite wholesale and do NOT add commentary " +
      "inside the document." +
      orgPlaybookPromptBlock(orgPlaybookText) +
      "\n\n" +
      jurisdictionDirective(jurisdiction);
    const prompt =
      `Document title: ${title}\n\n` +
      (extra ? `Reviewer instruction: ${extra}\n\n` : "") +
      "DOCUMENT:\n" +
      base.slice(0, 48000) +
      "\n\nReturn STRICT JSON only: {\"revised\":\"the full revised document text with \\n line breaks\",\"summary\":\"one line: the gist of your changes\"}";

    let revised = "";
    let summary = "";
    let degraded = false;
    let aiError: string | null = null;
    try {
      ensureServerClaudeTransport();
      const raw = (await callClaudeJSON(prompt, { system, maxTokens: 4000, timeout: 55000 })) as Record<string, unknown>;
      const parsed = (typeof raw === "string" ? parseJSONLoose(raw) : raw) as Record<string, unknown>;
      const r = typeof parsed.revised === "string" ? parsed.revised.trim() : "";
      if (r.length < 40) throw new Error("model returned no usable revision");
      revised = r;
      summary = typeof parsed.summary === "string" ? parsed.summary : "";
    } catch (e) {
      // Degrade-safe: return the base unchanged with a reason. The console
      // shows "no changes suggested" rather than a dead end.
      degraded = true;
      aiError = friendlyAIError(e as never);
      revised = base;
      summary = "";
      console.error("[one-legal:redline] revise pass failed:", (e as { status?: number })?.status ?? "", (e as Error)?.message || e);
    }

    recordSpan("one_legal.redline", Date.now() - t0, { degraded, playbook: usingOrgPlaybook });
    return res.status(200).json({ ok: true, base, revised, summary, degraded, aiError, playbookApplied: usingOrgPlaybook });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
