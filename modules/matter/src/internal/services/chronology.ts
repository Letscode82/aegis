/**
 * INV-3 — case chronology. Facts assemble from the coded (responsive) documents
 * of an investigation into a dated timeline — the backbone of the findings
 * report. Facts are *proposed* deterministically from responsive documents (a
 * candidate label + supporting quote + a best-effort date) and a human confirms
 * or edits before they persist: the AI never writes a fact into the record on
 * its own. Chain-sealed on create/delete.
 */
import { prisma, logAudit, type CaseFact } from "@aegis/db";
import type { MatterActor } from "../types";

export interface CaseFactDTO {
  id: string;
  matterId: string;
  reviewSetItemId: string | null;
  occurredOn: string | null;
  label: string;
  detail: string | null;
  issueKeys: string[];
  sourceQuote: string | null;
  createdAt: string;
}
export interface SuggestedFact {
  reviewSetItemId: string;
  occurredOn: string | null;
  label: string;
  sourceQuote: string | null;
  issueKeys: string[];
}

function toDTO(f: CaseFact): CaseFactDTO {
  return {
    id: f.id, matterId: f.matterId, reviewSetItemId: f.reviewSetItemId,
    occurredOn: f.occurredOn?.toISOString() ?? null, label: f.label, detail: f.detail ?? null,
    issueKeys: f.issueKeys, sourceQuote: f.sourceQuote ?? null, createdAt: f.createdAt.toISOString(),
  };
}

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";
/** Best-effort date lift from text (ISO, US, or "Month DD, YYYY"). Null if none. */
function liftDate(text: string | null | undefined): string | null {
  if (!text) return null;
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) { const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`); return isNaN(+d) ? null : d.toISOString(); }
  const mdy = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (mdy) { const d = new Date(Date.UTC(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2]))); return isNaN(+d) ? null : d.toISOString(); }
  const named = text.match(new RegExp(`\\b(${MONTHS})\\s+(\\d{1,2}),?\\s+(20\\d{2})\\b`, "i"));
  if (named) { const d = new Date(`${named[1]} ${named[2]}, ${named[3]} UTC`); return isNaN(+d) ? null : d.toISOString(); }
  return null;
}

/** Propose candidate chronology facts from the responsive documents collected
 *  for a matter's review sets. Deterministic; nothing persists. */
export async function suggestFactsService(organizationId: string, matterId: string, opts: { limit?: number } = {}): Promise<SuggestedFact[]> {
  const sets = await prisma.reviewSet.findMany({ where: { organizationId, matterId }, select: { id: true } });
  if (sets.length === 0) return [];
  const items = await prisma.reviewSetItem.findMany({
    where: { reviewSetId: { in: sets.map((s) => s.id) }, codedResponsive: true, excludedAt: null },
    select: { id: true, title: true, excerpt: true, codingJson: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }],
    take: Math.max(1, Math.min(200, opts.limit ?? 50)),
  });
  return items.map((it) => ({
    reviewSetItemId: it.id,
    occurredOn: liftDate(it.title) ?? liftDate(it.excerpt),
    label: (it.title || "Document").slice(0, 160),
    sourceQuote: it.excerpt ? it.excerpt.slice(0, 300) : null,
    issueKeys: (it.codingJson as { issues?: string[] } | null)?.issues ?? [],
  }));
}

export interface AddCaseFactInput {
  matterId: string;
  reviewSetItemId?: string | null;
  occurredOn?: string | null;
  label: string;
  detail?: string | null;
  issueKeys?: string[];
  sourceQuote?: string | null;
}

export async function addCaseFactService(input: AddCaseFactInput, actor: MatterActor): Promise<CaseFactDTO> {
  const label = (input.label || "").trim();
  if (!label) throw new Error("A fact needs a label.");
  const occurredOn = input.occurredOn ? new Date(input.occurredOn) : null;
  const fact = await prisma.caseFact.create({
    data: {
      organizationId: actor.organizationId, matterId: input.matterId,
      reviewSetItemId: input.reviewSetItemId ?? null,
      occurredOn: occurredOn && !isNaN(+occurredOn) ? occurredOn : null,
      label, detail: input.detail?.trim() || null,
      issueKeys: (input.issueKeys ?? []).filter(Boolean),
      sourceQuote: input.sourceQuote?.trim() || null, createdById: actor.id,
    },
  });
  await logAudit({
    organizationId: actor.organizationId, actorId: actor.id, actorType: "USER",
    action: "investigation.fact.added", resourceType: "CaseFact", resourceId: fact.id,
    afterJson: { matterId: input.matterId, label, occurredOn: fact.occurredOn?.toISOString() ?? null } as never,
    metadata: { source: "ui", channel: "investigations" } as never,
  });
  return toDTO(fact);
}

export async function listChronologyService(organizationId: string, matterId: string): Promise<CaseFactDTO[]> {
  const facts = await prisma.caseFact.findMany({
    where: { organizationId, matterId },
    orderBy: [{ occurredOn: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
  return facts.map(toDTO);
}

export async function deleteCaseFactService(organizationId: string, factId: string, actor: MatterActor): Promise<void> {
  const fact = await prisma.caseFact.findFirst({ where: { id: factId, organizationId }, select: { id: true, matterId: true, label: true } });
  if (!fact) throw new Error("Fact not found");
  await prisma.caseFact.delete({ where: { id: factId } });
  await logAudit({
    organizationId, actorId: actor.id, actorType: "USER",
    action: "investigation.fact.removed", resourceType: "CaseFact", resourceId: factId,
    beforeJson: { matterId: fact.matterId, label: fact.label } as never,
    metadata: { source: "ui", channel: "investigations" } as never,
  });
}
