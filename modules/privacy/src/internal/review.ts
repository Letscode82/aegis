/**
 * AI-assisted relevance review — the AEGIS analog of Relativity aiR.
 *
 * Collected records enter as DSARReviewItems. `runRelevanceReview` scores every
 * pending item against the request's relevance criteria: it asks Claude for a
 * verdict + confidence + rationale and, on any failure or when @aegis/ai isn't
 * configured, degrades to the deterministic keyword/identity scorer — the queue
 * never stalls and every item carries an explanation (the "explainability"
 * benefit). Governance: the AI NEVER finalises relevance. A human `validate`s
 * each item (CONFIRM the AI verdict or OVERRIDE it) and sets redaction before
 * anything can enter the response package.
 */
import { prisma, logAudit } from "@aegis/db";
import type { DSARReviewVerdict, DSARReviewDecision } from "@aegis/db";
import { callClaudeJSON, parseJSONLoose } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";
import type { Actor } from "./requests";
import { scoreRelevanceDeterministic, verdictFromScore } from "./relevance";

const VALID_VERDICT = new Set(["RELEVANT", "NOT_RELEVANT", "UNCLEAR"]);

export interface ReviewItemDTO {
  id: string;
  sourceSystem: string;
  title: string;
  excerpt: string | null;
  aiVerdict: DSARReviewVerdict | null;
  aiScore: number | null;
  aiRationale: string | null;
  reviewDecision: DSARReviewDecision;
  finalRelevant: boolean | null;
  redact: boolean;
  redactionNote: string | null;
  reviewedAt: string | null;
}

type Row = {
  id: string; sourceSystem: string; title: string; excerpt: string | null;
  aiVerdict: DSARReviewVerdict | null; aiScore: number | null; aiRationale: string | null;
  reviewDecision: DSARReviewDecision; finalRelevant: boolean | null; redact: boolean;
  redactionNote: string | null; reviewedAt: Date | null;
};

function toDTO(r: Row): ReviewItemDTO {
  return {
    id: r.id, sourceSystem: r.sourceSystem, title: r.title, excerpt: r.excerpt,
    aiVerdict: r.aiVerdict, aiScore: r.aiScore, aiRationale: r.aiRationale,
    reviewDecision: r.reviewDecision, finalRelevant: r.finalRelevant, redact: r.redact,
    redactionNote: r.redactionNote, reviewedAt: r.reviewedAt?.toISOString() ?? null,
  };
}

async function loadRequest(organizationId: string, requestId: string) {
  const r = await prisma.dataSubjectRequest.findFirst({
    where: { id: requestId, organizationId },
    include: { requesterPerson: { select: { name: true, email: true } } },
  });
  if (!r) throw new Error("Request not found");
  return r;
}

export async function listReviewItems(organizationId: string, requestId: string): Promise<ReviewItemDTO[]> {
  await loadRequest(organizationId, requestId);
  const rows = await prisma.dSARReviewItem.findMany({ where: { requestId }, orderBy: [{ createdAt: "asc" }] });
  return rows.map((r) => toDTO(r as Row));
}

export interface AddReviewItemInput {
  sourceSystem: string;
  title: string;
  excerpt?: string | null;
}

/** Bulk-add collected records into the review queue. */
export async function addReviewItems(organizationId: string, requestId: string, items: AddReviewItemInput[], actor: Actor): Promise<ReviewItemDTO[]> {
  await loadRequest(organizationId, requestId);
  const clean = items.filter((i) => i.title?.trim());
  if (clean.length === 0) throw new Error("At least one item with a title is required");
  const created = await prisma.$transaction(
    clean.map((i) =>
      prisma.dSARReviewItem.create({
        data: { organizationId, requestId, sourceSystem: (i.sourceSystem || "manual").trim(), title: i.title.trim(), excerpt: i.excerpt?.trim() || null },
      }),
    ),
  );
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "privacy.dsar.review_items_added", resourceType: "DataSubjectRequest", resourceId: requestId,
    afterJson: { count: created.length } as never, metadata: { source: "privacy" } as never,
  });
  return created.map((r) => toDTO(r as Row));
}

export interface RelevanceReviewResult {
  scored: number;
  relevant: number;
  degraded: boolean;
  items: ReviewItemDTO[];
}

interface AiVerdict { verdict: DSARReviewVerdict; score: number; rationale: string }

function buildPrompt(criteria: string, subject: { name: string; email: string | null }, items: { i: number; title: string; excerpt: string | null; system: string }[]): string {
  return [
    "You are a privacy analyst screening records for relevance to a Data Subject Access Request (DSAR).",
    `Data subject: ${subject.name}${subject.email ? ` <${subject.email}>` : ""}.`,
    "Relevance criteria (what is IN SCOPE):",
    criteria || "(none provided — treat records mentioning the data subject's personal data as relevant)",
    "",
    "For EACH item below, decide relevance. Respond with STRICT JSON:",
    '{"results":[{"i":<index>,"verdict":"RELEVANT|NOT_RELEVANT|UNCLEAR","score":<0..1>,"rationale":"<one sentence>"}]}',
    "",
    "Items:",
    ...items.map((it) => `#${it.i} [${it.system}] ${it.title}${it.excerpt ? ` — ${it.excerpt.slice(0, 400)}` : ""}`),
  ].join("\n");
}

/** Score every PENDING item. AI when available; deterministic otherwise. */
export async function runRelevanceReview(organizationId: string, requestId: string, actor: Actor): Promise<RelevanceReviewResult> {
  const req = await loadRequest(organizationId, requestId);
  const pending = await prisma.dSARReviewItem.findMany({ where: { requestId, reviewDecision: "PENDING" }, orderBy: [{ createdAt: "asc" }] });
  if (pending.length === 0) return { scored: 0, relevant: 0, degraded: false, items: [] };

  const subject = { name: req.requesterPerson?.name ?? "the data subject", email: req.requesterPerson?.email ?? null };
  const criteria = req.relevanceCriteria ?? "";

  const byIndex = new Map<number, AiVerdict>();
  let degraded = false;
  try {
    ensureServerClaudeTransport();
    const prompt = buildPrompt(criteria, subject, pending.map((p, i) => ({ i, title: p.title, excerpt: p.excerpt, system: p.sourceSystem })));
    const raw = (await callClaudeJSON(prompt, { maxTokens: 1600, timeout: 60000 })) as unknown;
    const parsed = (typeof raw === "string" ? parseJSONLoose(raw as string) : raw) as { results?: unknown };
    const results = Array.isArray(parsed?.results) ? parsed.results : [];
    for (const r of results as Record<string, unknown>[]) {
      const i = Number(r.i);
      if (!Number.isInteger(i)) continue;
      const verdict = (VALID_VERDICT.has(String(r.verdict)) ? String(r.verdict) : "UNCLEAR") as DSARReviewVerdict;
      const score = Math.max(0, Math.min(1, Number(r.score)));
      byIndex.set(i, { verdict, score: Number.isFinite(score) ? Math.round(score * 100) / 100 : 0.5, rationale: String(r.rationale ?? "").slice(0, 400) || "AI relevance screen." });
    }
    if (byIndex.size === 0) throw new Error("Empty AI relevance result");
  } catch (e) {
    console.error("[dsar-review] AI relevance failed, using deterministic screen:", e);
    degraded = true;
  }

  let relevant = 0;
  const updated = await prisma.$transaction(
    pending.map((p, i) => {
      const ai = byIndex.get(i);
      const verdict: AiVerdict = ai ?? scoreRelevanceDeterministic({
        criteria, subjectName: subject.name, subjectEmail: subject.email,
        item: { title: p.title, excerpt: p.excerpt, sourceSystem: p.sourceSystem },
      });
      if (verdict.verdict === "RELEVANT") relevant += 1;
      return prisma.dSARReviewItem.update({
        where: { id: p.id },
        data: { aiVerdict: verdict.verdict, aiScore: verdict.score, aiRationale: (degraded ? "" : "AI: ") + verdict.rationale },
      });
    }),
  );

  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
    action: "privacy.dsar.ai_review_run", resourceType: "DataSubjectRequest", resourceId: requestId,
    afterJson: { scored: updated.length, relevant, degraded } as never,
    metadata: { source: "privacy", degraded } as never,
  });

  return { scored: updated.length, relevant, degraded, items: updated.map((r) => toDTO(r as Row)) };
}

export interface ValidateReviewItemInput {
  decision: "CONFIRMED" | "OVERRIDDEN";
  /** Required on OVERRIDE; ignored on CONFIRM (AI verdict is used). */
  finalRelevant?: boolean;
  redact?: boolean;
  redactionNote?: string | null;
}

/** The human validation gate: confirm the AI verdict or override it, and set
 *  redaction. Only validated (non-PENDING) items enter the response package. */
export async function validateReviewItem(organizationId: string, requestId: string, itemId: string, input: ValidateReviewItemInput, actor: Actor): Promise<ReviewItemDTO> {
  const item = await prisma.dSARReviewItem.findFirst({ where: { id: itemId, requestId, organizationId } });
  if (!item) throw new Error("Review item not found");

  let finalRelevant: boolean;
  if (input.decision === "CONFIRMED") {
    // Confirm the AI's read. UNCLEAR/absent → treat as relevant (include for safety; a human can still redact).
    finalRelevant = item.aiVerdict ? item.aiVerdict === "RELEVANT" : true;
  } else {
    if (input.finalRelevant === undefined) throw new Error("finalRelevant is required when overriding");
    finalRelevant = input.finalRelevant;
  }

  const updated = await prisma.dSARReviewItem.update({
    where: { id: itemId },
    data: {
      reviewDecision: input.decision as DSARReviewDecision,
      finalRelevant,
      redact: input.redact ?? item.redact,
      redactionNote: input.redactionNote ?? item.redactionNote,
      reviewedById: actor.id,
      reviewedAt: new Date(),
    },
  });

  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "privacy.dsar.review_item_validated", resourceType: "DataSubjectRequest", resourceId: requestId,
    beforeJson: { aiVerdict: item.aiVerdict, reviewDecision: item.reviewDecision } as never,
    afterJson: { decision: input.decision, finalRelevant, redact: updated.redact } as never,
    metadata: { source: "privacy", itemId } as never,
  });
  return toDTO(updated as Row);
}

export interface ReviewProgress {
  total: number;
  pending: number;
  validated: number;
  relevant: number;
  redacted: number;
}

/** Pure count of a review queue's state (used by the workspace + delivery gate). */
export function summarizeReview(items: Pick<ReviewItemDTO, "reviewDecision" | "finalRelevant" | "redact">[]): ReviewProgress {
  let pending = 0, validated = 0, relevant = 0, redacted = 0;
  for (const it of items) {
    if (it.reviewDecision === "PENDING") pending += 1;
    else validated += 1;
    if (it.reviewDecision !== "PENDING" && it.finalRelevant) relevant += 1;
    if (it.redact) redacted += 1;
  }
  return { total: items.length, pending, validated, relevant, redacted };
}

export { verdictFromScore };
