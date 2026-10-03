/**
 * POST /api/one-legal/ask — cited Q&A over the org's own documents (K1.3).
 *
 * The visible payoff of the K1 semantic layer: ONE Legal answers a question by
 * retrieving from @aegis/search (semantic when pgvector + a provider are
 * configured, keyword otherwise), grounding a Claude answer in those excerpts,
 * and returning the sources it drew on so every claim is traceable.
 *
 * Degrades at every layer so the console never stalls:
 *   - no retrieval hits    → answer generally (same posture as before K1.3),
 *                            sources: [], grounded: false
 *   - Claude unavailable   → deterministic extractive answer from the top
 *                            excerpts (grounded) or a friendly error (ungrounded)
 *
 * Server-side only (reads privileged text; the Anthropic key stays server-side).
 * Gated intake:create_ticket — same as the other ONE Legal console routes.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { assertAndAudit } from "../../../lib/authz";
import { callClaude, enforceCitations } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";
import { semanticSearch } from "@aegis/search";
import { prisma } from "@aegis/db";
import { recordSpan } from "@aegis/observability";
import { getOrgSnapshot, looksOperational, operationalNav } from "../../../lib/one-legal/org-snapshot";
import { getEntityCrossLink, looksLikeEntityLookup } from "../../../lib/one-legal/entity-lookup";

const ENTITY_SYSTEM =
  "You are AEGIS, an in-house legal-operations assistant. Answer USING ONLY the ENTITY RECORD below — the counterparty and its " +
  "linked matters and contracts across the platform. Be specific and organize by module. If the record doesn't cover something " +
  "the question asks, say so rather than guessing. Never invent records. Keep it tight.";

const OPERATIONAL_SYSTEM =
  "You are AEGIS, an in-house legal-operations assistant. Answer the question USING ONLY the ORG SNAPSHOT below — live counts " +
  "and lists across the platform's modules (intake, matters, legal holds, contracts, spend, privacy). Be specific with the " +
  "numbers and cross-link across modules where the question asks. If a figure isn't in the snapshot, say it isn't available " +
  "rather than guessing. Never invent numbers. Keep it tight — a direct answer plus a short breakdown.";

const MAX_SOURCES = 6;

const GENERAL_SYSTEM =
  "You are AEGIS, an in-house legal-operations assistant for a corporate General Counsel team. " +
  "Answer the user's question concisely and practically — 2-4 short paragraphs or a tight bulleted list. " +
  "You help file and route legal requests (NDAs, contracts, legal holds, DSARs, vendor/sanctions checks, matters) " +
  "and can explain the platform and general legal-ops process. Do not give definitive legal advice; note when a " +
  "qualified lawyer should review. Never invent specific case facts, names, or numbers.";

const GROUNDED_SYSTEM =
  "You are AEGIS, an in-house legal-operations assistant for a corporate General Counsel team. " +
  "Answer the question USING ONLY the numbered context excerpts, which come from the organization's own documents. " +
  "Cite sources inline as [n] matching the excerpts you actually used. If the excerpts do not contain the answer, " +
  "say so plainly and suggest what to look for — do NOT invent facts, names, or numbers. " +
  "2-4 short paragraphs or a tight bulleted list. This is not definitive legal advice; note when a qualified lawyer should review.";

/** Map a Document's ownerType to the console's module view for "open source". */
function navigateForOwner(ownerType: string | null): string | null {
  switch ((ownerType || "").toUpperCase()) {
    case "INTAKE":
      return "intake";
    case "MATTER":
      return "matters";
    case "CONTRACT":
      return "contracts";
    default:
      return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    await assertAndAudit(user, Permission.IntakeCreateTicket, { route: "one-legal.ask" });
    const t0 = Date.now();
    const question = String((req.body || {}).text || "").trim();
    if (question.length < 3) return res.status(400).json({ ok: false, error: "Ask a question in a few words." });

    // K3 — entity cross-linking: "everything about <counterparty>", "contracts
    // with <company>". Answer from the resolved counterparty's linked records
    // across modules. Only fires when a named entity actually resolves.
    if (looksLikeEntityLookup(question)) {
      const entity = await getEntityCrossLink(user, question);
      if (entity) {
        let answer = "";
        let degraded = false;
        try {
          ensureServerClaudeTransport();
          answer = ((await callClaude(`Question: ${question}\n\nENTITY RECORD:\n${entity.text}`, { system: ENTITY_SYSTEM, maxTokens: 600, timeout: 20000 })) || "").trim();
          if (!answer) throw new Error("empty");
        } catch {
          degraded = true;
          answer = `Here's what's linked to ${entity.matched}:\n\n${entity.text}`;
        }
        recordSpan("one_legal.ask", Date.now() - t0, { mode: "entity", degraded });
        return res.status(200).json({ ok: true, answer, grounded: true, degraded, sources: [], mode: "entity", nav: entity.nav });
      }
      // No entity resolved → fall through to operational / document paths.
    }

    // K2 — operational / cross-module questions ("how many intake tickets?",
    // "which matters have legal holds?", "what contracts are open?") answer from
    // live module figures, not documents. Build a permission-scoped snapshot and
    // ground Claude in it; degrade to returning the snapshot digest itself.
    if (looksOperational(question)) {
      const snap = await getOrgSnapshot(user);
      if (snap.text) {
        let answer = "";
        let degraded = false;
        try {
          ensureServerClaudeTransport();
          answer = ((await callClaude(`Question: ${question}\n\nORG SNAPSHOT:\n${snap.text}`, { system: OPERATIONAL_SYSTEM, maxTokens: 600, timeout: 20000 })) || "").trim();
          if (!answer) throw new Error("empty");
        } catch {
          degraded = true;
          answer = `Here are the current figures across your modules:\n\n${snap.text}`;
        }
        recordSpan("one_legal.ask", Date.now() - t0, { mode: "operational", sections: snap.sections.length, degraded });
        return res.status(200).json({ ok: true, answer, grounded: true, degraded, sources: [], mode: "operational", nav: operationalNav(question) });
      }
      // No readable sections for this user → fall through to the document path.
    }

    // 1) Retrieve (semantic when available, else keyword — never throws to the caller).
    let hits: Array<{ ownerType: string; ownerId: string; documentId: string | null; content: string; score: number; source: string }> = [];
    try {
      hits = await semanticSearch({ organizationId: user.organizationId, query: question, ownerTypes: ["DOCUMENT"], limit: MAX_SOURCES * 2 });
    } catch {
      hits = [];
    }

    // 2) Resolve document metadata for citations.
    const docIds = Array.from(new Set(hits.map((h) => h.documentId).filter((v): v is string => !!v)));
    const docs = docIds.length
      ? await prisma.document.findMany({
          where: { id: { in: docIds }, organizationId: user.organizationId },
          select: { id: true, name: true, ownerType: true, ownerId: true },
        })
      : [];
    const docMap = new Map(docs.map((d) => [d.id, d]));

    // Dedupe to one source per document, best-scoring hit first.
    const sources: Array<{ n: number; documentId: string | null; name: string; ownerType: string; ownerId: string; snippet: string; score: number; retrieval: string; navigate: string | null }> = [];
    const seen = new Set<string>();
    for (const h of hits) {
      const key = h.documentId || `${h.ownerType}:${h.ownerId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const meta = h.documentId ? docMap.get(h.documentId) : undefined;
      const ownerType = meta?.ownerType != null ? String(meta.ownerType) : h.ownerType;
      sources.push({
        n: sources.length + 1,
        documentId: h.documentId,
        name: meta?.name || (h.content.slice(0, 60).trim() || "Document"),
        ownerType,
        ownerId: meta?.ownerId || h.ownerId,
        snippet: h.content.slice(0, 500).trim(),
        score: Math.round((h.score || 0) * 1000) / 1000,
        retrieval: h.source,
        navigate: navigateForOwner(ownerType),
      });
      if (sources.length >= MAX_SOURCES) break;
    }
    const grounded = sources.length > 0;

    // 3) Compose the answer.
    let answer = "";
    let degraded = false;
    try {
      ensureServerClaudeTransport();
      if (grounded) {
        const context = sources.map((s) => `[${s.n}] ${s.name}\n${s.snippet}`).join("\n\n");
        answer = ((await callClaude(`Question: ${question}\n\nContext:\n${context}`, { system: GROUNDED_SYSTEM, maxTokens: 700, timeout: 20000 })) || "").trim();
      } else {
        answer = ((await callClaude(question, { system: GENERAL_SYSTEM, maxTokens: 700, timeout: 20000 })) || "").trim();
      }
    } catch (e) {
      if (grounded) {
        // Deterministic extractive fallback so a grounded answer still lands.
        degraded = true;
        answer =
          "Based on your documents:\n\n" +
          sources
            .slice(0, 3)
            .map((s) => `• ${s.name} [${s.n}]: ${s.snippet.slice(0, 220)}${s.snippet.length > 220 ? "…" : ""}`)
            .join("\n\n") +
          "\n\n(AI summarization is offline; showing the most relevant excerpts. A qualified lawyer should review.)";
      } else {
        return res.status(200).json({ ok: true, answer: "", grounded: false, sources: [], error: String((e as Error).message || e) });
      }
    }

    // C-13 — enforce the inline [n] citations against the sources we actually
    // retrieved: strip any the model invented, and flag an answer that cites
    // nothing. Only meaningful on the grounded, model-composed path (the
    // degraded extractive fallback already cites real excerpts by construction).
    let citations: { cited: number[]; dropped: number; warnings: string[] } | undefined;
    if (grounded && !degraded) {
      const checked = enforceCitations(answer, sources);
      answer = checked.text;
      citations = { cited: checked.citedIndices, dropped: checked.droppedCitations, warnings: checked.warnings };
    }

    recordSpan("one_legal.ask", Date.now() - t0, {
      grounded,
      sources: sources.length,
      degraded,
      citationsDropped: citations?.dropped ?? 0,
      citationWarnings: citations?.warnings.join(",") || "",
    });
    return res.status(200).json({ ok: true, answer, grounded, degraded, sources, citations });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
