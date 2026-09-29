/**
 * POST /api/vault/[id]/ask — cited Q&A scoped to one vault (V1b).
 *
 * Same posture as ONE Legal's /ask, but retrieval is restricted to the vault's
 * documents: resolve the vault's Document ids, retrieve within them
 * (@aegis/search ownerIds scope), and ground a Claude answer that cites the
 * sources it used. Degrades to a general/extractive answer. Gated
 * knowledge:read_all.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { assertAndAudit } from "../../../../lib/authz";
import { callClaude } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";
import { semanticSearch } from "@aegis/search";
import { prisma } from "@aegis/db";
import { recordSpan } from "@aegis/observability";

const MAX_SOURCES = 6;

const GROUNDED_SYSTEM =
  "You are AEGIS, an in-house legal-operations assistant. Answer the question USING ONLY the numbered context excerpts, " +
  "which come from the documents in this vault. Cite sources inline as [n] matching the excerpts you used. If the excerpts " +
  "do not contain the answer, say so plainly — do NOT invent facts, names, or numbers. 2-4 short paragraphs or a tight list. " +
  "This is not definitive legal advice; note when a qualified lawyer should review.";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    await assertAndAudit(user, Permission.KnowledgeReadAll, { route: "vault.ask" });
    const t0 = Date.now();
    const vaultId = typeof req.query.id === "string" ? req.query.id : "";
    const question = String((req.body || {}).text || "").trim();
    if (question.length < 3) return res.status(400).json({ ok: false, error: "Ask a question in a few words." });

    const vault = await prisma.vault.findFirst({ where: { id: vaultId, organizationId: user.organizationId }, select: { id: true } });
    if (!vault) return res.status(404).json({ ok: false, error: "Vault not found." });

    const docs = await prisma.document.findMany({
      where: { organizationId: user.organizationId, ownerType: "VAULT", ownerId: vaultId },
      select: { id: true, name: true, ownerType: true, ownerId: true },
    });
    if (docs.length === 0) return res.status(200).json({ ok: true, answer: "This vault has no documents yet — add some to ask questions across them.", grounded: false, sources: [] });
    const docIds = docs.map((d) => d.id);
    const docMap = new Map(docs.map((d) => [d.id, d]));

    let hits: Array<{ ownerType: string; ownerId: string; documentId: string | null; content: string; score: number; source: string }> = [];
    try {
      hits = await semanticSearch({ organizationId: user.organizationId, query: question, ownerIds: docIds, limit: MAX_SOURCES * 2 });
    } catch {
      hits = [];
    }

    const sources: Array<{ n: number; documentId: string | null; name: string; snippet: string; score: number; retrieval: string }> = [];
    const seen = new Set<string>();
    for (const h of hits) {
      // For vault docs, the embedding ownerId IS the Document id.
      const docId = h.documentId || h.ownerId;
      if (seen.has(docId)) continue;
      seen.add(docId);
      const meta = docMap.get(docId);
      sources.push({
        n: sources.length + 1,
        documentId: docId,
        name: meta?.name || (h.content.slice(0, 60).trim() || "Document"),
        snippet: h.content.slice(0, 500).trim(),
        score: Math.round((h.score || 0) * 1000) / 1000,
        retrieval: h.source,
      });
      if (sources.length >= MAX_SOURCES) break;
    }
    const grounded = sources.length > 0;

    let answer = "";
    let degraded = false;
    try {
      ensureServerClaudeTransport();
      if (grounded) {
        const context = sources.map((s) => `[${s.n}] ${s.name}\n${s.snippet}`).join("\n\n");
        answer = ((await callClaude(`Question: ${question}\n\nContext:\n${context}`, { system: GROUNDED_SYSTEM, maxTokens: 700, timeout: 20000 })) || "").trim();
      } else {
        return res.status(200).json({ ok: true, answer: "I couldn't find anything relevant in this vault's documents for that question.", grounded: false, sources: [] });
      }
      if (!answer) throw new Error("empty");
    } catch {
      degraded = true;
      answer =
        "Based on this vault's documents:\n\n" +
        sources.slice(0, 3).map((s) => `• ${s.name} [${s.n}]: ${s.snippet.slice(0, 220)}${s.snippet.length > 220 ? "…" : ""}`).join("\n\n") +
        "\n\n(AI summarization is offline; showing the most relevant excerpts. A qualified lawyer should review.)";
    }

    recordSpan("vault.ask", Date.now() - t0, { grounded, sources: sources.length, degraded });
    return res.status(200).json({ ok: true, answer, grounded, degraded, sources });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
