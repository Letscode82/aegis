/**
 * Contract version snapshots + redline diff (CTR-5b).
 *
 * A snapshot freezes the contract's clause set at a moment (on spawn /
 * (re)extraction / counterparty counter / manual). Diffing two snapshots
 * yields the redline: clauses added, removed, or changed (text / risk /
 * deviation). The snapshot is immutable — it stores its own copy of the
 * clauses (clausesJson) so it survives later edits to the live rows.
 */
import { prisma, logAudit } from "@aegis/db";
import type { ContractVersionSource } from "@aegis/db";
import { diffWords, type WordDiffSegment } from "./word-diff";
import { resolveRedlineReview, type RedlineReviewDecisions, type ReviewClause } from "./redline-review";

export interface SnapshotClause {
  type: string;
  text: string;
  summary: string | null;
  risk: "LOW" | "MEDIUM" | "HIGH";
  deviation: boolean;
}

export interface ContractVersionSummary {
  id: string;
  version: number;
  label: string;
  source: string;
  clauseCount: number;
  createdAt: string;
}

export interface ContractVersionDetail extends ContractVersionSummary {
  clauses: SnapshotClause[];
}

export type ClauseChange =
  | { kind: "added"; key: string; type: string; to: SnapshotClause }
  | { kind: "removed"; key: string; type: string; from: SnapshotClause }
  | { kind: "changed"; key: string; type: string; from: SnapshotClause; to: SnapshotClause; fields: string[]; textDiff?: WordDiffSegment[] };

export interface ContractDiff {
  fromVersion: number;
  toVersion: number;
  changes: ClauseChange[];
  counts: { added: number; removed: number; changed: number; unchanged: number };
}

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

// ── Pure diff (unit-tested; no DB) ───────────────────────────────────

/**
 * Occurrence-stable key so two clauses of the same type line up across
 * versions (LIABILITY_CAP#0 in v1 ↔ LIABILITY_CAP#0 in v2).
 */
function keyed(clauses: SnapshotClause[]): Map<string, SnapshotClause> {
  const seen: Record<string, number> = {};
  const m = new Map<string, SnapshotClause>();
  for (const c of clauses) {
    const i = seen[c.type] ?? 0;
    seen[c.type] = i + 1;
    m.set(`${c.type}#${i}`, c);
  }
  return m;
}

export function diffClauseSets(from: SnapshotClause[], to: SnapshotClause[]): ContractDiff["changes"] {
  const a = keyed(from);
  const b = keyed(to);
  const changes: ClauseChange[] = [];
  for (const [key, fc] of a) {
    const tc = b.get(key);
    if (!tc) { changes.push({ kind: "removed", key, type: fc.type, from: fc }); continue; }
    const fields: string[] = [];
    if (fc.text.trim() !== tc.text.trim()) fields.push("text");
    if (fc.risk !== tc.risk) fields.push("risk");
    if (fc.deviation !== tc.deviation) fields.push("deviation");
    if ((fc.summary || "") !== (tc.summary || "")) fields.push("summary");
    if (fields.length) {
      // Word-level track-changes diff for a text change (CTR-16).
      const textDiff = fields.includes("text") ? diffWords(fc.text, tc.text) : undefined;
      changes.push({ kind: "changed", key, type: fc.type, from: fc, to: tc, fields, textDiff });
    }
  }
  for (const [key, tc] of b) {
    if (!a.has(key)) changes.push({ kind: "added", key, type: tc.type, to: tc });
  }
  return changes;
}

export function diffCounts(changes: ContractDiff["changes"], fromLen: number): ContractDiff["counts"] {
  const added = changes.filter((c) => c.kind === "added").length;
  const removed = changes.filter((c) => c.kind === "removed").length;
  const changed = changes.filter((c) => c.kind === "changed").length;
  return { added, removed, changed, unchanged: Math.max(0, fromLen - removed - changed) };
}

// ── DB service ───────────────────────────────────────────────────────

const toSnapshotClauses = (rows: { type: string; text: string; summary: string | null; risk: string; deviation: boolean }[]): SnapshotClause[] =>
  rows.map((r) => ({ type: r.type, text: r.text, summary: r.summary, risk: r.risk as SnapshotClause["risk"], deviation: r.deviation }));

/** Order-independent canonical form (JSONB read-back reorders keys, so a
 *  plain JSON.stringify of the stored value can't be compared directly). */
const canon = (clauses: SnapshotClause[]): string =>
  JSON.stringify(clauses.map((c) => [c.type, c.text, c.summary ?? null, c.risk, c.deviation]));

/**
 * Freeze the contract's current clauses as a new version. Chain-sealed.
 * Skips creating an identical consecutive snapshot (no-op churn).
 */
export async function snapshotContractVersion(
  organizationId: string,
  contractId: string,
  opts: { label: string; source: ContractVersionSource },
  actor: Actor = { id: null, type: "SYSTEM" },
): Promise<ContractVersionSummary | null> {
  const contract = await prisma.contract.findFirst({ where: { id: contractId, organizationId }, select: { id: true } });
  if (!contract) throw new Error("Contract not found");

  const clauseRows = await prisma.contractClause.findMany({
    where: { contractId },
    select: { type: true, text: true, summary: true, risk: true, deviation: true },
    orderBy: { createdAt: "asc" },
  });
  const clauses = toSnapshotClauses(clauseRows);

  const last = await prisma.contractVersion.findFirst({ where: { contractId }, orderBy: { version: "desc" } });
  // Don't snapshot an unchanged clause set back-to-back.
  if (last && canon((last.clausesJson as unknown as SnapshotClause[]) ?? []) === canon(clauses)) return null;
  const version = (last?.version ?? 0) + 1;

  const row = await prisma.contractVersion.create({
    data: {
      organizationId, contractId, version, label: opts.label, source: opts.source,
      clausesJson: clauses as never, clauseCount: clauses.length, createdById: actor.id,
    },
  });
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? "SYSTEM",
    action: "contract.version.snapshotted",
    resourceType: "ContractVersion",
    resourceId: row.id,
    afterJson: { contractId, version, source: opts.source, clauseCount: clauses.length } as never,
    metadata: { source: "contracts" } as never,
  });
  return { id: row.id, version, label: row.label, source: row.source, clauseCount: row.clauseCount, createdAt: row.createdAt.toISOString() };
}

export async function listContractVersions(organizationId: string, contractId: string): Promise<ContractVersionSummary[]> {
  const rows = await prisma.contractVersion.findMany({
    where: { organizationId, contractId },
    orderBy: { version: "desc" },
    select: { id: true, version: true, label: true, source: true, clauseCount: true, createdAt: true },
  });
  return rows.map((r) => ({ id: r.id, version: r.version, label: r.label, source: r.source, clauseCount: r.clauseCount, createdAt: r.createdAt.toISOString() }));
}

async function loadVersion(organizationId: string, contractId: string, version: number): Promise<SnapshotClause[] | null> {
  const row = await prisma.contractVersion.findFirst({ where: { organizationId, contractId, version } });
  if (!row) return null;
  return (row.clausesJson as unknown as SnapshotClause[]) ?? [];
}

export async function diffContractVersions(
  organizationId: string,
  contractId: string,
  fromVersion: number,
  toVersion: number,
): Promise<ContractDiff | null> {
  const [from, to] = await Promise.all([
    loadVersion(organizationId, contractId, fromVersion),
    loadVersion(organizationId, contractId, toVersion),
  ]);
  if (!from || !to) return null;
  const changes = diffClauseSets(from, to);
  return { fromVersion, toVersion, changes, counts: diffCounts(changes, from.length) };
}

export interface ApplyRedlineReviewResult {
  /** The resulting MANUAL version, or null if the merge changed nothing. */
  newVersion: number | null;
  clauseCount: number;
  /** How many clauses the reviewer moved off the `to` state (reverted toward
   *  `from`, kept a removal they rejected, or dropped an addition). */
  revertedClauses: number;
}

/**
 * Apply a reviewer's accept/reject decisions over the `from → to` redline and
 * persist the merged clause set as a new MANUAL version. The accept/reject IS
 * the human gate (no AI recommendation to approve — the diff is deterministic),
 * so this writes a single chain-sealed `contract.redline.review_applied` audit
 * row rather than going through `AgentDecision`.
 *
 * Guarded so the merge stays coherent: `toVersion` must be the contract's
 * LATEST version (the current state the live clauses reflect). The resolved set
 * is composed from the immutable snapshots, then it replaces the live clause
 * rows and a new version is snapshotted — the same replace-set + snapshot
 * pattern re-extraction uses.
 */
export async function applyVersionRedlineReview(
  organizationId: string,
  contractId: string,
  input: { fromVersion: number; toVersion: number; decisions: RedlineReviewDecisions; label?: string },
  actor: Actor = { id: null, type: "USER" },
): Promise<ApplyRedlineReviewResult> {
  const contract = await prisma.contract.findFirst({ where: { id: contractId, organizationId }, select: { id: true } });
  if (!contract) throw new Error("Contract not found");

  const latest = await prisma.contractVersion.findFirst({ where: { contractId }, orderBy: { version: "desc" }, select: { version: true } });
  if (!latest) throw new Error("No versions to review");
  if (latest.version !== input.toVersion) {
    throw new Error(`Apply the review against the latest version (v${latest.version}). Re-compare v${input.fromVersion} → v${latest.version} first.`);
  }

  const [from, to] = await Promise.all([
    loadVersion(organizationId, contractId, input.fromVersion),
    loadVersion(organizationId, contractId, input.toVersion),
  ]);
  if (!from || !to) throw new Error("One or both versions not found");

  const resolved = resolveRedlineReview(from as ReviewClause[], to as ReviewClause[], input.decisions || {});
  const revertedClauses = diffClauseSets(to, resolved as SnapshotClause[]).length;

  // Nothing accepted away from current state — don't churn a no-op version.
  if (revertedClauses === 0) {
    return { newVersion: null, clauseCount: to.length, revertedClauses: 0 };
  }

  // Replace the live clause set with the merged result (same pattern as
  // re-extraction), then snapshot. Create rows directly — this is one reviewed
  // action, summarised by a single audit row below, not N clause extractions.
  await prisma.contractClause.deleteMany({ where: { contractId } });
  if (resolved.length) {
    await prisma.contractClause.createMany({
      data: resolved.map((c) => ({
        contractId,
        type: c.type,
        text: c.text,
        summary: c.summary ?? null,
        risk: c.risk,
        deviation: c.deviation,
      })),
    });
  }

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
    action: "contract.redline.review_applied",
    resourceType: "Contract",
    resourceId: contractId,
    beforeJson: { fromVersion: input.fromVersion, toVersion: input.toVersion, clauseCount: to.length } as never,
    afterJson: { clauseCount: resolved.length, revertedClauses } as never,
    metadata: { source: "contracts" } as never,
  });

  const snap = await snapshotContractVersion(
    organizationId,
    contractId,
    { label: input.label?.trim() || `Redline review applied (v${input.fromVersion}→v${input.toVersion})`, source: "MANUAL" },
    actor,
  );

  return { newVersion: snap?.version ?? null, clauseCount: resolved.length, revertedClauses };
}
