/**
 * Cross-module integration services.
 *
 * These are the seams that future modules wire through:
 *
 *   - Intake (Step 5+) calls linkTicketToMatter when a ticket
 *     escalates into a matter.
 *   - Spend (Step 6) replaces the mocked getMatterCostBasis with a
 *     real call into @aegis/spend.getMatterSpendSummary.
 *   - Legal Hold (Step 4b) replaces the empty getLegalHoldsForMatter
 *     with the real hold-status query.
 *   - Similar-matter detection (Step 4d) replaces the keyword fallback
 *     here with a real Claude embedding lookup.
 *
 * Each mock is documented so the swap-out in the relevant later step
 * is purely an implementation change — the API surface does not move.
 */
import {
  prisma,
  type LegalHold,
  type Matter,
  type MatterStatus,
  type MatterType,
} from "@aegis/db";
import type { MatterActor, MatterCostBasis, MatterMatch } from "../types";
import { recordMatterEvent } from "./timeline";

// ── linkTicketToMatter — real implementation ──────────────────────

export async function linkTicketToMatterService(
  matterId: string,
  ticketId: string,
  actor: MatterActor,
): Promise<void> {
  const matter = await prisma.matter.findFirst({
    where: { id: matterId, organizationId: actor.organizationId },
  });
  if (!matter) {
    throw new Error(
      `Matter ${matterId} not found in organization ${actor.organizationId}`,
    );
  }
  const ticket = await prisma.intakeTicket.findFirst({
    where: { id: ticketId, organizationId: actor.organizationId },
  });
  if (!ticket) {
    throw new Error(
      `Intake ticket ${ticketId} not found in organization ${actor.organizationId}`,
    );
  }
  if (ticket.matterId === matterId) return;

  await prisma.intakeTicket.update({
    where: { id: ticketId },
    data: { matterId },
  });

  await recordMatterEvent({
    matterId,
    actor,
    eventType: "matter.intake.linked",
    auditAction: "matter.intake.linked",
    summary: `Linked intake ticket ${ticketId} to matter`,
    beforeJson: { ticketId, previousMatterId: ticket.matterId },
    afterJson: { ticketId, matterId },
    metadata: { ticketId, matterId },
  });
}

// ── getMattersByCounterparty — real implementation ────────────────

export async function getMattersByCounterpartyService(
  counterpartyId: string,
): Promise<Matter[]> {
  return prisma.matter.findMany({
    where: { counterpartyId },
    orderBy: [{ openedAt: "desc" }],
  });
}

// ── getMatterCostBasis — Spend stub ────────────────────────────────
//
// Real implementation lands in Step 6 (Spend module), where it will
// call @aegis/spend.getMatterSpendSummary(matterId). For 4a we read
// the locally-stored Budget row and SUM(invoices.amount) so the
// Matter dashboard shows realistic numbers.

export async function getMatterCostBasisService(
  matterId: string,
): Promise<MatterCostBasis> {
  const matter = await prisma.matter.findUnique({
    where: { id: matterId },
    select: { id: true, organizationId: true },
  });
  if (!matter) {
    throw new Error(`Matter ${matterId} not found`);
  }

  const [budget, spent] = await Promise.all([
    prisma.budget.findFirst({
      where: {
        organizationId: matter.organizationId,
        scope: "MATTER",
        scopeId: matterId,
      },
      orderBy: [{ period: "desc" }],
    }),
    prisma.invoice.aggregate({
      where: {
        matterId,
        status: { in: ["APPROVED", "PAID"] },
      },
      _sum: { amount: true },
    }),
  ]);

  return {
    matterId,
    budgetAllocated: budget?.allocatedAmount ?? 0,
    spentToDate: spent._sum.amount ?? 0,
    source: "stub",
    currency: "USD",
  };
}

// ── getLegalHoldsForMatter — placeholder for 4b ────────────────────
//
// Step 4b implements the full Legal Hold workflow (issue, attest,
// release). Until then this returns the existing seeded LegalHold
// rows so the Matter detail panel can render the placeholder card
// with real-shaped data.

export async function getLegalHoldsForMatterService(
  matterId: string,
): Promise<LegalHold[]> {
  return prisma.legalHold.findMany({
    where: { matterId },
    orderBy: [{ createdAt: "desc" }],
  });
}

// ── findSimilarMatters — keyword mock for 4a; AI in 4d ────────────
//
// Step 4d replaces this with a Claude embedding lookup over the
// matter index. Until then we do a case-insensitive keyword match
// over title + description and score by overlap. Same return shape
// as the AI-backed implementation will have.

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "by",
  "at",
  "from",
  "as",
  "this",
  "that",
  "these",
  "those",
]);

function tokens(input: string): Set<string> {
  return new Set(
    input
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

export async function findSimilarMattersService(
  query: string,
  limit: number | undefined,
): Promise<MatterMatch[]> {
  const max = Math.max(1, Math.min(limit ?? 5, 25));
  const queryTokens = tokens(query);
  if (queryTokens.size === 0) return [];

  // Pull a candidate set wide enough to score in JS but bounded so we
  // don't load the whole table for big orgs. The keyword-mock approach
  // returns reasonable results up to ~few thousand matters; the AI
  // backend in 4d sidesteps the JS scan entirely.
  const candidates: Array<
    Pick<
      Matter,
      | "id"
      | "matterNumber"
      | "title"
      | "description"
      | "type"
      | "status"
    >
  > = await prisma.matter.findMany({
    select: {
      id: true,
      matterNumber: true,
      title: true,
      description: true,
      type: true,
      status: true,
    },
    take: 1000,
  });

  const scored = candidates
    .map((m) => {
      const docTokens = tokens(`${m.title} ${m.description ?? ""}`);
      let overlap = 0;
      for (const t of queryTokens) if (docTokens.has(t)) overlap += 1;
      const score =
        queryTokens.size === 0 ? 0 : overlap / queryTokens.size;
      return {
        matter: m,
        score,
        overlap,
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);

  return scored.map(({ matter, score, overlap }) => ({
    matterId: matter.id,
    matterNumber: matter.matterNumber,
    title: matter.title,
    type: matter.type as MatterType,
    status: matter.status as MatterStatus,
    similarityScore: score,
    reason:
      overlap === 1
        ? `1 keyword match`
        : `${overlap} keyword matches`,
  }));
}
