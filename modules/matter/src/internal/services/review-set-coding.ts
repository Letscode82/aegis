/**
 * Review-set coding + production — the reviewer console's engine.
 *
 * Each ReviewSetItem is coded for responsiveness + privilege behind the human
 * gate (the AI verdict is only a suggestion). Freezing snapshots the set;
 * producing assembles a Bates-numbered production of the responsive,
 * non-privileged items and drafts a privilege log for the withheld ones —
 * "families intact, tags carried, privilege log drafted along the way." All
 * chain-sealed (`reviewset.*`).
 */
import { prisma, logAudit } from "@aegis/db";
import { getReviewSetSummary, type ReviewSetSummary } from "./review-set";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

export interface ReviewSetItemDTO {
  id: string;
  sourceType: string;
  sourceSystem: string;
  title: string;
  excerpt: string | null;
  aiVerdict: string | null;
  aiScore: number | null;
  aiRationale: string | null;
  aiRoute: string | null;
  coded: boolean;
  codedResponsive: boolean | null;
  codedPrivileged: boolean;
  redact: boolean;
  reviewNote: string | null;
  reviewedAt: string | null;
}

function toItemDTO(r: {
  id: string; sourceType: string; sourceSystem: string; title: string; excerpt: string | null;
  aiVerdict: string | null; aiScore: number | null; aiRationale: string | null; aiRoute?: string | null;
  reviewDecision: string; codedResponsive: boolean | null; codedPrivileged: boolean; redact: boolean; reviewNote: string | null; reviewedAt: Date | null;
}): ReviewSetItemDTO {
  return {
    id: r.id, sourceType: r.sourceType, sourceSystem: r.sourceSystem, title: r.title, excerpt: r.excerpt,
    aiVerdict: r.aiVerdict, aiScore: r.aiScore, aiRationale: r.aiRationale, aiRoute: r.aiRoute ?? null,
    coded: r.reviewDecision !== "PENDING", codedResponsive: r.codedResponsive, codedPrivileged: r.codedPrivileged,
    redact: r.redact, reviewNote: r.reviewNote, reviewedAt: r.reviewedAt?.toISOString() ?? null,
  };
}

export interface ReviewSetDetail {
  summary: ReviewSetSummary;
  items: ReviewSetItemDTO[];
  progress: { total: number; coded: number; responsive: number; privileged: number; redacted: number };
}

export async function getReviewSetDetail(organizationId: string, id: string): Promise<ReviewSetDetail | null> {
  const summary = await getReviewSetSummary(organizationId, id);
  if (!summary) return null;
  const rows = await prisma.reviewSetItem.findMany({ where: { reviewSetId: id }, orderBy: [{ createdAt: "asc" }] });
  const items = rows.map(toItemDTO);
  const progress = {
    total: items.length,
    coded: items.filter((i) => i.coded).length,
    responsive: items.filter((i) => i.codedResponsive === true).length,
    privileged: items.filter((i) => i.codedPrivileged).length,
    redacted: items.filter((i) => i.redact).length,
  };
  return { summary, items, progress };
}

export interface CodeReviewItemInput {
  responsive?: boolean | null;
  privileged?: boolean;
  redact?: boolean;
  note?: string | null;
}

/** Code one item (responsiveness / privilege / redaction). Chain-sealed. */
export async function codeReviewItem(organizationId: string, itemId: string, input: CodeReviewItemInput, actor: Actor): Promise<ReviewSetItemDTO> {
  const item = await prisma.reviewSetItem.findFirst({ where: { id: itemId, organizationId } });
  if (!item) throw new Error("Review item not found");

  const data: Record<string, unknown> = { reviewedById: actor.id, reviewedAt: new Date() };
  if (input.responsive !== undefined) { data.codedResponsive = input.responsive; data.reviewDecision = input.responsive === null ? "PENDING" : "CONFIRMED"; }
  if (input.privileged !== undefined) data.codedPrivileged = input.privileged;
  if (input.redact !== undefined) data.redact = input.redact;
  if (input.note !== undefined) data.reviewNote = input.note;

  const updated = await prisma.reviewSetItem.update({ where: { id: itemId }, data: data as never });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.item.coded", resourceType: "ReviewSet", resourceId: item.reviewSetId,
    afterJson: { itemId, responsive: updated.codedResponsive, privileged: updated.codedPrivileged, redact: updated.redact } as never,
    metadata: { source: "matter", channel: "ediscovery" } as never,
  });
  return toItemDTO(updated);
}

export async function freezeReviewSet(organizationId: string, id: string, actor: Actor): Promise<ReviewSetSummary> {
  const rs = await prisma.reviewSet.findFirst({ where: { id, organizationId }, select: { status: true } });
  if (!rs) throw new Error("Review set not found");
  if (rs.status !== "OPEN") throw new Error(`Review set is ${rs.status} and cannot be frozen.`);
  await prisma.reviewSet.update({ where: { id }, data: { status: "FROZEN", frozenAt: new Date() } });
  await logAudit({ organizationId, actorId: actor.id, actorType: actor.type ?? "USER", action: "reviewset.frozen", resourceType: "ReviewSet", resourceId: id, afterJson: { status: "FROZEN" } as never, metadata: { source: "matter" } as never });
  return (await getReviewSetSummary(organizationId, id))!;
}

// ── Production (pure manifest builder) ────────────────────────────────

export interface ProductionItem { bates: string; title: string; sourceSystem: string; redacted: boolean }
export interface PrivilegeLogEntry { logNo: string; title: string; sourceSystem: string; basis: string }
export interface ProductionManifest {
  batesPrefix: string;
  produced: ProductionItem[];
  privilegeLog: PrivilegeLogEntry[];
  counts: { produced: number; privileged: number; nonResponsive: number; uncoded: number };
}

interface CodeableItem { title: string; sourceSystem: string; codedResponsive: boolean | null; codedPrivileged: boolean; redact: boolean; reviewNote: string | null }

/** Assemble a Bates-numbered production + privilege log (pure). Responsive &
 *  non-privileged → produced with sequential Bates; responsive & privileged →
 *  withheld to the privilege log; non-responsive → excluded. */
export function buildProductionManifest(items: CodeableItem[], batesPrefix: string, pad = 6): ProductionManifest {
  const produced: ProductionItem[] = [];
  const privilegeLog: PrivilegeLogEntry[] = [];
  let uncoded = 0, nonResponsive = 0, seq = 0, logSeq = 0;
  for (const it of items) {
    if (it.codedResponsive == null) { uncoded += 1; continue; }
    if (!it.codedResponsive) { nonResponsive += 1; continue; }
    if (it.codedPrivileged) {
      logSeq += 1;
      privilegeLog.push({ logNo: `PRIV-${String(logSeq).padStart(4, "0")}`, title: it.title, sourceSystem: it.sourceSystem, basis: (it.reviewNote || "").trim() || "Attorney-client privilege / work product" });
      continue;
    }
    seq += 1;
    produced.push({ bates: `${batesPrefix}-${String(seq).padStart(pad, "0")}`, title: it.title, sourceSystem: it.sourceSystem, redacted: it.redact });
  }
  return { batesPrefix, produced, privilegeLog, counts: { produced: produced.length, privileged: privilegeLog.length, nonResponsive, uncoded } };
}

export interface ProduceReviewSetResult {
  summary: ReviewSetSummary;
  manifest: ProductionManifest;
}

/** Produce a frozen review set: build the manifest, mark PRODUCED, chain-seal. */
export async function produceReviewSet(organizationId: string, id: string, opts: { batesPrefix?: string }, actor: Actor): Promise<ProduceReviewSetResult> {
  const rs = await prisma.reviewSet.findFirst({ where: { id, organizationId }, select: { status: true, name: true } });
  if (!rs) throw new Error("Review set not found");
  if (rs.status === "PRODUCED") throw new Error("This review set has already been produced.");
  if (rs.status !== "FROZEN") throw new Error("Freeze the review set before producing it.");

  const rows = await prisma.reviewSetItem.findMany({ where: { reviewSetId: id }, select: { title: true, sourceSystem: true, codedResponsive: true, codedPrivileged: true, redact: true, reviewNote: true } });
  const uncoded = rows.filter((r) => r.codedResponsive == null).length;
  if (uncoded > 0) throw new Error(`${uncoded} item(s) are uncoded — code every item before producing.`);

  const prefix = (opts.batesPrefix || "").trim() || "AEGIS";
  const manifest = buildProductionManifest(rows as CodeableItem[], prefix);

  await prisma.reviewSet.update({ where: { id }, data: { status: "PRODUCED", producedAt: new Date() } });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.produced", resourceType: "ReviewSet", resourceId: id,
    afterJson: { status: "PRODUCED", batesPrefix: prefix, counts: manifest.counts } as never,
    metadata: { source: "matter", channel: "ediscovery" } as never,
  });
  return { summary: (await getReviewSetSummary(organizationId, id))!, manifest };
}
