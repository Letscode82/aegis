/**
 * POST /api/one-legal/analyze — deep read of one document (B2).
 *
 * Distinct from /ask (cross-corpus cited Q&A): this analyzes a SINGLE document
 * the user just uploaded — a summary plus key risks, obligations, dates, and
 * unusual terms — or answers a specific question about that one document. The
 * document's own text is the context (no retrieval needed), so the read is
 * accurate and scoped.
 *
 * Degrades: Claude offline → a deterministic extractive digest so the console
 * still returns something useful. Server-side only; gated intake:create_ticket.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { assertAndAudit } from "../../../lib/authz";
import { callClaude } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";
import { prisma } from "@aegis/db";
import { recordSpan } from "@aegis/observability";

// Cap the context so a very long document doesn't blow the prompt budget; the
// head of a legal document carries the parties, term, and key clauses.
const MAX_CONTEXT_CHARS = 12000;

const DEFAULT_TASK =
  "Summarize this document in 2-3 sentences, then list: key obligations, notable risks or unusual terms, " +
  "important dates/deadlines, and the parties. Use tight bullet lists. If something isn't present, say so — do not invent.";

function extractiveDigest(name: string, text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const head = clean.slice(0, 800);
  return `Deep AI analysis is offline — here is the opening of ${name} so you can review it directly:\n\n${head}${clean.length > 800 ? "…" : ""}\n\n(A qualified lawyer should review.)`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    await assertAndAudit(user, Permission.IntakeCreateTicket, { route: "one-legal.analyze" });
    const t0 = Date.now();
    const body = (req.body || {}) as Record<string, unknown>;
    const documentId = String(body.documentId || "").trim();
    const question = String(body.question || "").trim();
    if (!documentId) return res.status(400).json({ ok: false, error: "documentId is required." });

    const doc = await prisma.document.findFirst({
      where: { id: documentId, organizationId: user.organizationId },
      select: { id: true, name: true, extractedText: true },
    });
    if (!doc) return res.status(404).json({ ok: false, error: "Document not found." });
    const text = (doc.extractedText || "").trim();
    if (!text) return res.status(200).json({ ok: true, documentId: doc.id, documentName: doc.name, answer: "This document has no extractable text to analyze.", degraded: false });

    const context = text.length > MAX_CONTEXT_CHARS ? `${text.slice(0, MAX_CONTEXT_CHARS)}\n\n[document truncated for length]` : text;
    const task = question || DEFAULT_TASK;

    let answer = "";
    let degraded = false;
    try {
      ensureServerClaudeTransport();
      const system =
        "You are AEGIS, an in-house legal-operations assistant for a corporate General Counsel team. " +
        "Analyze ONLY the provided document. Be concrete and cite exact language where useful. Do not invent facts, " +
        "names, or numbers not present in the text. This is not definitive legal advice; note when a qualified lawyer should review.";
      answer = ((await callClaude(`Document: ${doc.name}\n\n${context}\n\n---\nTask: ${task}`, { system, maxTokens: 900, timeout: 25000 })) || "").trim();
      if (!answer) throw new Error("empty");
    } catch {
      degraded = true;
      answer = extractiveDigest(doc.name, text);
    }

    recordSpan("one_legal.analyze", Date.now() - t0, { degraded });
    return res.status(200).json({ ok: true, documentId: doc.id, documentName: doc.name, answer, degraded });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
