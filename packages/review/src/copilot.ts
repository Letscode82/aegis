/**
 * CAP-1 — Case Copilot. A grounded, Claude-native chat over a collection: the
 * attorney asks case questions and gets an answer that CITES the specific
 * documents it used. It is read-only — it may *suggest* actions (tag these,
 * add this fact) but never executes them (that gate lands in CAP-4). The answer
 * is grounded in a compact "Case Brief" (issues, criteria, counts, key docs) so
 * the model reasons over the real record, not its imagination.
 *
 * Live Claude via `@aegis/ai` when `ANTHROPIC_API_KEY` is set; degrades to a
 * deterministic extractive answer (retrieval + synthesis) otherwise, so the
 * copilot works in every environment. Read-only, but chain-sealed for
 * traceability (`reviewset.copilot.query`).
 */
import { prisma, logAudit } from "@aegis/db";
import { tokenize } from "@aegis/ai-review";
import { CLAUDE_MODEL, callClaudeJSON } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";

export type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

export interface CaseBrief {
  reviewSetId: string;
  name: string;
  origin: string;
  criteria: string | null;
  issues: Array<{ key: string; label: string }>;
  counts: { collected: number; coded: number; responsive: number; privileged: number; attorney: number };
  keyDocuments: Array<{ id: string; title: string }>;
}

export interface CopilotCitation { itemId: string; title: string; excerpt: string | null }
export interface CopilotSuggestion { label: string; kind: string }
export interface CopilotAnswer {
  answer: string;
  citations: CopilotCitation[];
  suggestions: CopilotSuggestion[];
  degraded: boolean;
  model: string | null;
}

type Item = { id: string; title: string; excerpt: string | null; aiRoute: string | null; codedResponsive: boolean | null; codedPrivileged: boolean; reviewDecision: string; excludedAt: Date | null };

async function loadItems(reviewSetId: string): Promise<Item[]> {
  return prisma.reviewSetItem.findMany({
    where: { reviewSetId, excludedAt: null },
    select: { id: true, title: true, excerpt: true, aiRoute: true, codedResponsive: true, codedPrivileged: true, reviewDecision: true, excludedAt: true },
    orderBy: [{ createdAt: "asc" }],
    take: 2000,
  });
}

export async function buildCaseBrief(organizationId: string, reviewSetId: string): Promise<CaseBrief> {
  const rs = await prisma.reviewSet.findFirst({
    where: { id: reviewSetId, organizationId },
    select: { id: true, name: true, origin: true, criteria: true, issuesJson: true },
  });
  if (!rs) throw new Error("Review set not found");
  const items = await loadItems(reviewSetId);
  const responsive = items.filter((i) => i.codedResponsive === true || i.aiRoute === "REVIEWER" || i.aiRoute === "ATTORNEY");
  const keyDocuments = responsive.slice(0, 8).map((i) => ({ id: i.id, title: i.title }));
  return {
    reviewSetId, name: rs.name, origin: rs.origin, criteria: rs.criteria ?? null,
    issues: (rs.issuesJson as Array<{ key: string; label: string }> | null) ?? [],
    counts: {
      collected: items.length,
      coded: items.filter((i) => i.reviewDecision !== "PENDING").length,
      responsive: items.filter((i) => i.codedResponsive === true).length,
      privileged: items.filter((i) => i.codedPrivileged === true).length,
      attorney: items.filter((i) => i.aiRoute === "ATTORNEY").length,
    },
    keyDocuments,
  };
}

/** Deterministic retrieval: rank items by question-token overlap; fall back to
 *  responsive/attorney docs for broad "summarize the case" style questions. */
function retrieve(items: Item[], question: string, k: number): Item[] {
  const qTokens = new Set(tokenize(question));
  if (qTokens.size === 0) return items.filter((i) => i.codedResponsive === true || i.aiRoute === "ATTORNEY").slice(0, k);
  const scored = items.map((it) => {
    const t = new Set(tokenize(`${it.title} ${it.excerpt ?? ""}`));
    let overlap = 0;
    for (const q of qTokens) if (t.has(q)) overlap += 1;
    if (it.aiRoute === "ATTORNEY" || it.codedPrivileged) overlap += 0.5;
    return { it, overlap };
  }).filter((x) => x.overlap > 0).sort((a, b) => b.overlap - a.overlap);
  const top = scored.slice(0, k).map((x) => x.it);
  return top.length > 0 ? top : items.filter((i) => i.codedResponsive === true).slice(0, k);
}

function deterministicAnswer(question: string, brief: CaseBrief, docs: Item[]): string {
  if (docs.length === 0) return `I couldn't find documents in this collection matching "${question.slice(0, 120)}". Try coding more documents as responsive, or rephrase.`;
  const lead = `Based on ${docs.length} document(s) in ${brief.name} (${brief.counts.responsive} responsive of ${brief.counts.collected} collected):`;
  const bullets = docs.slice(0, 5).map((d, i) => `  [${i + 1}] ${d.title}${d.excerpt ? ` — ${d.excerpt.slice(0, 160)}` : ""}`);
  return `${lead}\n${bullets.join("\n")}\n\n(Deterministic summary — set ANTHROPIC_API_KEY for a synthesized narrative answer.)`;
}

function suggestionsFor(brief: CaseBrief): CopilotSuggestion[] {
  const s: CopilotSuggestion[] = [];
  if (brief.counts.attorney > 0) s.push({ label: `Review ${brief.counts.attorney} attorney-routed document(s) for privilege`, kind: "review-privilege" });
  if (brief.counts.responsive > 0) s.push({ label: "Draft chronology facts from the responsive documents", kind: "build-chronology" });
  if (brief.counts.coded < brief.counts.collected) s.push({ label: `Code the remaining ${brief.counts.collected - brief.counts.coded} pending document(s)`, kind: "code-pending" });
  return s.slice(0, 3);
}

export interface AnswerInput { question: string; history?: Array<{ role: "user" | "assistant"; content: string }> }

export async function answerCaseQuestion(organizationId: string, reviewSetId: string, input: AnswerInput, actor: Actor): Promise<CopilotAnswer> {
  const question = (input.question || "").trim();
  if (!question) throw new Error("Ask a question.");
  const brief = await buildCaseBrief(organizationId, reviewSetId);
  const items = await loadItems(reviewSetId);
  const docs = retrieve(items, question, 8);
  const citations: CopilotCitation[] = docs.map((d) => ({ itemId: d.id, title: d.title, excerpt: d.excerpt ? d.excerpt.slice(0, 240) : null }));
  const suggestions = suggestionsFor(brief);

  let answer = deterministicAnswer(question, brief, docs);
  let degraded = true;
  let model: string | null = null;

  try {
    ensureServerClaudeTransport();
    const docBlock = docs.map((d, i) => `[${i + 1}] ${d.title}\n${(d.excerpt ?? "").slice(0, 600)}`).join("\n\n");
    const issues = brief.issues.map((x) => x.label).join(", ") || "(none set)";
    const hist = (input.history ?? []).slice(-6).map((h) => `${h.role.toUpperCase()}: ${h.content}`).join("\n");
    const prompt = `You are a legal eDiscovery review copilot for a matter named "${brief.name}".
Review criteria: ${brief.criteria ?? "(none set)"}. Issues: ${issues}.
Answer the QUESTION using ONLY the numbered DOCUMENTS below. Cite documents by their number in square brackets, e.g. [2]. If the documents don't support an answer, say so — never invent facts. Keep it concise and factual.
${hist ? `\nConversation so far:\n${hist}\n` : ""}
QUESTION: ${question}

DOCUMENTS:
${docBlock}

Respond as strict JSON: {"answer": string (may contain [n] citations), "usedDocuments": number[] (the [n] you relied on)}.`;
    const r = (await callClaudeJSON(prompt, { maxTokens: 900, timeout: 45000 })) as Record<string, unknown>;
    if (r && typeof r.answer === "string" && r.answer.trim()) {
      answer = r.answer.trim();
      degraded = false;
      model = CLAUDE_MODEL;
      // Narrow citations to the documents the model actually used, when provided.
      const used = Array.isArray(r.usedDocuments) ? (r.usedDocuments as unknown[]).map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= docs.length) : [];
      if (used.length > 0) {
        const picked = used.map((n) => citations[n - 1]).filter((c): c is CopilotCitation => !!c);
        if (picked.length > 0) { citations.length = 0; citations.push(...picked); }
      }
    }
  } catch (e) {
    console.error("[case-copilot] callClaudeJSON failed, using deterministic answer:", e);
  }

  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.copilot.query", resourceType: "ReviewSet", resourceId: reviewSetId,
    afterJson: { question: question.slice(0, 300), degraded, citations: citations.length } as never,
    metadata: { source: "review", channel: "case-copilot" } as never,
  });

  return { answer, citations, suggestions, degraded, model };
}
