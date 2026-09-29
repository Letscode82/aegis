/**
 * POST /api/vault/[id]/review — bulk cross-document review grid (V1c).
 *
 * The tabular-review surface (Harvey/Legora parity): given a set of questions
 * (columns) and the vault's documents (rows), return a grid of answers. One
 * Claude call per document answers all questions at once (run in parallel to
 * bound wall-clock), degrading per document to a deterministic extractive
 * answer when Claude is unavailable. Gated knowledge:read_all.
 *
 * Body (JSON): { questions: string[] }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { assertAndAudit } from "../../../../lib/authz";
import { callClaudeJSON } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";
import { prisma } from "@aegis/db";
import { recordSpan } from "@aegis/observability";

const MAX_DOCS = 12;
const MAX_QUESTIONS = 6;
const DOC_CHARS = 8000;

/** Deterministic fallback: first sentence mentioning a question term, else "—". */
function extractiveCell(text: string, question: string): string {
  const terms = Array.from(new Set(question.toLowerCase().split(/[^a-z0-9]+/i).filter((t) => t.length >= 4)));
  if (terms.length === 0) return "—";
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    const low = s.toLowerCase();
    if (terms.some((t) => low.includes(t))) return s.slice(0, 240).trim();
  }
  return "—";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    await assertAndAudit(user, Permission.KnowledgeReadAll, { route: "vault.review" });
    const t0 = Date.now();
    const vaultId = typeof req.query.id === "string" ? req.query.id : "";
    const body = (req.body || {}) as Record<string, unknown>;
    const questions = (Array.isArray(body.questions) ? body.questions : [])
      .map((q) => String(q || "").trim())
      .filter((q) => q.length >= 3)
      .slice(0, MAX_QUESTIONS);
    if (questions.length === 0) return res.status(400).json({ ok: false, error: "Add at least one question (column)." });

    const vault = await prisma.vault.findFirst({ where: { id: vaultId, organizationId: user.organizationId }, select: { id: true } });
    if (!vault) return res.status(404).json({ ok: false, error: "Vault not found." });

    const docs = await prisma.document.findMany({
      where: { organizationId: user.organizationId, ownerType: "VAULT", ownerId: vaultId },
      orderBy: { uploadedAt: "desc" },
      take: MAX_DOCS,
      select: { id: true, name: true, extractedText: true },
    });
    if (docs.length === 0) return res.status(200).json({ ok: true, columns: questions, rows: [], truncated: false });

    let claudeOk = true;
    try {
      ensureServerClaudeTransport();
    } catch {
      claudeOk = false;
    }

    const system =
      "You review one legal document and answer each numbered question about it in one tight sentence. Use ONLY the document; " +
      "if it doesn't address a question, answer exactly \"Not addressed\". Never invent facts, names, or numbers. Return STRICT " +
      'JSON: {"answers":["<answer to Q1>","<answer to Q2>",...]} with one entry per question, in order.';

    const rows = await Promise.all(
      docs.map(async (doc) => {
        const text = (doc.extractedText || "").trim();
        if (!text) return { documentId: doc.id, name: doc.name, cells: questions.map(() => "—") };
        if (!claudeOk) return { documentId: doc.id, name: doc.name, cells: questions.map((q) => extractiveCell(text, q)) };
        try {
          const qList = questions.map((q, i) => `Q${i + 1}: ${q}`).join("\n");
          const out = (await callClaudeJSON(`Document: ${doc.name}\n\n${text.slice(0, DOC_CHARS)}\n\n---\nQuestions:\n${qList}`, { system, maxTokens: 500, timeout: 25000 })) as { answers?: unknown };
          const answers = Array.isArray(out?.answers) ? out.answers.map((a) => String(a || "").trim()) : [];
          const cells = questions.map((q, i) => answers[i] || extractiveCell(text, q));
          return { documentId: doc.id, name: doc.name, cells };
        } catch {
          return { documentId: doc.id, name: doc.name, cells: questions.map((q) => extractiveCell(text, q)) };
        }
      }),
    );

    const total = await prisma.document.count({ where: { organizationId: user.organizationId, ownerType: "VAULT", ownerId: vaultId } });
    recordSpan("vault.review", Date.now() - t0, { docs: docs.length, questions: questions.length, degraded: !claudeOk });
    return res.status(200).json({ ok: true, columns: questions, rows, truncated: total > docs.length, shownDocs: docs.length, totalDocs: total });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
