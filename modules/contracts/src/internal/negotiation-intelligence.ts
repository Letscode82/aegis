/**
 * Negotiation intelligence (CLM C-8 — builds on C-7's clause library).
 *
 * The turn-based negotiation loop (negotiation.ts) records each counterparty
 * revision as a COUNTERPARTY version and re-extracts the clause set. This adds
 * the *intelligence* layer a GC needs to run that loop against a playbook:
 *
 *   1. Playbook posture — every current clause matched against the org clause
 *      library by type, classified deterministically (on standard / approved
 *      fallback available / off playbook / no position) with a plain-language
 *      recommendation (accept / counter with the approved fallback / escalate).
 *      This turns the review-time "vs playbook" drill-down into a cross-clause
 *      roll-up that says, in one read, where the paper stands versus the
 *      firm's pre-approved positions.
 *
 *   2. Redline summary — a structured summary of what moved in the latest
 *      revision, derived from the existing version-diff (diffContractVersions),
 *      with per-clause deviation/risk deltas and a headline.
 *
 * Deterministic and degrade-safe: no @aegis/ai call, no new persistence. Reads
 * the clause library (getClauseLibraryByType) + the live clauses + the version
 * history that negotiation.ts already writes. Pure helpers are unit-tested.
 */
import { prisma } from "@aegis/db";
import { getClauseLibraryByType, type ClauseLibraryEntryDTO } from "./clause-library";
import { listContractVersions, diffContractVersions, type ClauseChange } from "./versions";

type Risk = "LOW" | "MEDIUM" | "HIGH";

export type PlaybookStatus = "on_standard" | "fallback_available" | "off_playbook" | "no_position";

export interface CurrentClause {
  type: string;
  text: string;
  risk: Risk;
  deviation: boolean;
}

export interface PlaybookPosition {
  clauseType: string;
  title: string;
  current: { text: string; risk: Risk; deviation: boolean };
  standardText: string | null;
  fallbackText: string | null;
  guidance: string | null;
  riskIfDeviated: Risk | null;
  status: PlaybookStatus;
  recommendation: string;
}

export interface RedlineItem {
  kind: "added" | "removed" | "changed";
  clauseType: string;
  fields: string[];
  /** deviation flag went off→on ("introduced") or on→off ("resolved"). */
  deviationDelta: "introduced" | "resolved" | null;
  riskDelta: { from: Risk; to: Risk } | null;
  headline: string;
}

export interface NegotiationRedline {
  fromVersion: number;
  toVersion: number;
  counts: { added: number; removed: number; changed: number; unchanged: number };
  items: RedlineItem[];
  headline: string;
}

export interface NegotiationIntelligence {
  contractId: string;
  status: string;
  turnCount: number;
  positions: PlaybookPosition[];
  counts: { onStandard: number; fallbackAvailable: number; offPlaybook: number; noPosition: number; deviating: number };
  /** Clause types needing a human position first — off_playbook, then fallback_available. */
  escalations: string[];
  redline: NegotiationRedline | null;
}

const humanize = (type: string): string =>
  type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// ── Pure helpers (unit-tested; no DB) ────────────────────────────────

/**
 * Classify one current clause against its library entry. Deterministic:
 *  - no library entry           → no_position
 *  - not deviating              → on_standard
 *  - deviating, fallback exists  → fallback_available (counter to the approved fallback)
 *  - deviating, no fallback      → off_playbook (no pre-approved position; escalate)
 */
export function classifyPlaybookStatus(
  deviation: boolean,
  entry: Pick<ClauseLibraryEntryDTO, "fallbackText"> | null | undefined,
): PlaybookStatus {
  if (!entry) return "no_position";
  if (!deviation) return "on_standard";
  return entry.fallbackText && entry.fallbackText.trim() ? "fallback_available" : "off_playbook";
}

export function recommendationFor(status: PlaybookStatus): string {
  switch (status) {
    case "on_standard": return "Matches your standard position — accept.";
    case "fallback_available": return "Deviates from standard. Counter with your approved fallback position.";
    case "off_playbook": return "Deviates with no pre-approved fallback — escalate for a position.";
    case "no_position": return "No playbook position on file for this clause.";
  }
}

/** Build a per-clause playbook position from a current clause + its library entry. */
export function buildPosition(current: CurrentClause, entry: ClauseLibraryEntryDTO | null | undefined): PlaybookPosition {
  const status = classifyPlaybookStatus(current.deviation, entry);
  return {
    clauseType: current.type,
    title: entry?.title || humanize(current.type),
    current: { text: current.text, risk: current.risk, deviation: current.deviation },
    standardText: entry?.standardText ?? null,
    fallbackText: entry?.fallbackText ?? null,
    guidance: entry?.guidance ?? null,
    riskIfDeviated: entry?.riskIfDeviated ?? null,
    status,
    recommendation: recommendationFor(status),
  };
}

/** Summarise one version-diff clause change into a negotiation redline item. */
export function summarizeRedlineChange(change: ClauseChange): RedlineItem {
  const label = humanize(change.type);
  if (change.kind === "added") {
    return { kind: "added", clauseType: change.type, fields: [], deviationDelta: null, riskDelta: null, headline: `${label} added${change.to.deviation ? " (deviates from playbook)" : ""}.` };
  }
  if (change.kind === "removed") {
    return { kind: "removed", clauseType: change.type, fields: [], deviationDelta: null, riskDelta: null, headline: `${label} removed.` };
  }
  const deviationDelta: RedlineItem["deviationDelta"] =
    change.fields.includes("deviation")
      ? (change.to.deviation ? "introduced" : "resolved")
      : null;
  const riskDelta = change.fields.includes("risk") ? { from: change.from.risk, to: change.to.risk } : null;
  const parts: string[] = [];
  if (change.fields.includes("text")) parts.push("wording changed");
  if (deviationDelta === "introduced") parts.push("now deviates from playbook");
  if (deviationDelta === "resolved") parts.push("back within playbook");
  if (riskDelta) parts.push(`risk ${riskDelta.from} → ${riskDelta.to}`);
  if (parts.length === 0 && change.fields.includes("summary")) parts.push("summary changed");
  return {
    kind: "changed",
    clauseType: change.type,
    fields: change.fields,
    deviationDelta,
    riskDelta,
    headline: `${label}: ${parts.join(", ") || "changed"}.`,
  };
}

export function redlineHeadline(counts: NegotiationRedline["counts"]): string {
  const moved = counts.added + counts.removed + counts.changed;
  if (moved === 0) return "No clause-level change in the latest revision.";
  const bits: string[] = [];
  if (counts.changed) bits.push(`${counts.changed} changed`);
  if (counts.added) bits.push(`${counts.added} added`);
  if (counts.removed) bits.push(`${counts.removed} removed`);
  return `Latest revision moved ${moved} clause${moved === 1 ? "" : "s"}: ${bits.join(", ")}.`;
}

// ── DB service ───────────────────────────────────────────────────────

export async function getNegotiationIntelligence(
  organizationId: string,
  contractId: string,
): Promise<NegotiationIntelligence> {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, organizationId },
    select: { id: true, status: true },
  });
  if (!contract) throw new Error("Contract not found");

  const [clauseRows, library, versions, turnCount] = await Promise.all([
    prisma.contractClause.findMany({
      where: { contractId },
      select: { type: true, text: true, risk: true, deviation: true },
      orderBy: { createdAt: "asc" },
    }),
    getClauseLibraryByType(organizationId),
    listContractVersions(organizationId, contractId),
    prisma.contractVersion.count({ where: { contractId, source: "COUNTERPARTY" } }),
  ]);

  const positions = clauseRows.map((c) =>
    buildPosition({ type: c.type, text: c.text, risk: c.risk as Risk, deviation: c.deviation }, library[c.type]),
  );

  const counts = {
    onStandard: positions.filter((p) => p.status === "on_standard").length,
    fallbackAvailable: positions.filter((p) => p.status === "fallback_available").length,
    offPlaybook: positions.filter((p) => p.status === "off_playbook").length,
    noPosition: positions.filter((p) => p.status === "no_position").length,
    deviating: positions.filter((p) => p.current.deviation).length,
  };

  // Escalations first: off_playbook (no approved position), then fallback_available.
  const escalations = [
    ...positions.filter((p) => p.status === "off_playbook").map((p) => p.clauseType),
    ...positions.filter((p) => p.status === "fallback_available").map((p) => p.clauseType),
  ];

  // Redline of the latest revision = diff of the two most recent versions.
  let redline: NegotiationRedline | null = null;
  // listContractVersions returns newest-first, so [0] is the latest revision.
  const [latest, previous] = versions;
  if (latest && previous) {
    const toVersion = latest.version;
    const fromVersion = previous.version;
    const diff = await diffContractVersions(organizationId, contractId, fromVersion, toVersion);
    if (diff) {
      const items = diff.changes.map(summarizeRedlineChange);
      redline = { fromVersion, toVersion, counts: diff.counts, items, headline: redlineHeadline(diff.counts) };
    }
  }

  return { contractId, status: contract.status, turnCount, positions, counts, escalations, redline };
}
