/**
 * Governed redline review — inline accept/reject over a version diff (CLM Stage 2).
 *
 * The version redline (`diffClauseSets`) already shows what changed between two
 * snapshots as word-level track-changes. This module turns that read-only view
 * into a REVIEWABLE one: each grouped text edit inside a clause, and each
 * whole added/removed clause, becomes an accept-or-reject decision, and
 * `resolveRedlineReview` rebuilds the full resolved clause set from those
 * decisions. The merged set is what the governed apply path writes as a new
 * MANUAL version (chain-sealed) — the human's accept/reject IS the gate.
 *
 * Opt-out model: the `to` snapshot is the current state being reviewed (a
 * counterparty's returned markup, typically), so an undecided change DEFAULTS
 * TO ACCEPT (keep current). The reviewer actively REJECTS the edits they want
 * reverted to the `from` baseline.
 *
 * Pure + dependency-light (only the dependency-free `diffWords`) so it unit-
 * tests without a model, a DB, or a DOM — and so it is safe to import into the
 * client UI as well as the server apply service.
 */
import { diffWords, type WordDiffSegment } from "./word-diff";

/** A clause snapshot as stored in `ContractVersion.clausesJson`. */
export interface ReviewClause {
  type: string;
  text: string;
  summary: string | null;
  risk: "LOW" | "MEDIUM" | "HIGH";
  deviation: boolean;
}

export type RedlineOp =
  /** Unchanged text, shown as context between changes. */
  | { kind: "equal"; text: string }
  /**
   * A reviewable text change inside one clause. `del` is the `from` text
   * removed (empty for a pure insertion); `ins` is the `to` text added (empty
   * for a pure deletion); a replacement carries both. `id` is stable within the
   * op list.
   */
  | { kind: "change"; id: number; del: string; ins: string };

/** Accept keeps the revised text (`ins`); reject keeps the original (`del`). */
export type RedlineDecision = "accept" | "reject";

/** One clause's review decisions: per-text-change (`textOps`) and, for a whole
 *  added/removed/meta-only clause, a single `clause` verdict. */
export interface ClauseReviewDecision {
  textOps?: Record<number, RedlineDecision>;
  clause?: RedlineDecision;
}

/** Decisions for a whole version diff, keyed by the diff's occurrence-stable
 *  clause key (`TYPE#n`, identical to `diffClauseSets`). */
export type RedlineReviewDecisions = Record<string, ClauseReviewDecision>;

/**
 * Group word-level diff segments into ops. Adjacent delete/insert segments
 * merge into one replacement change so the reviewer sees "old → new" as a
 * single decision rather than two. Delete-only is a deletion; insert-only an
 * insertion.
 */
export function groupSegments(segments: WordDiffSegment[]): RedlineOp[] {
  const ops: RedlineOp[] = [];
  let id = 0;
  let del = "";
  let ins = "";
  const flush = () => {
    if (del || ins) {
      ops.push({ kind: "change", id: id++, del, ins });
      del = "";
      ins = "";
    }
  };
  for (const seg of segments) {
    if (seg.type === "equal") {
      flush();
      const last = ops[ops.length - 1];
      if (last && last.kind === "equal") last.text += seg.text;
      else ops.push({ kind: "equal", text: seg.text });
    } else if (seg.type === "delete") {
      del += seg.text;
    } else {
      ins += seg.text;
    }
  }
  flush();
  return ops;
}

/** The grouped track-changes ops between two clause texts. */
export function buildRedline(base: string, revised: string): RedlineOp[] {
  return groupSegments(diffWords(base || "", revised || ""));
}

/** The number of reviewable text changes in an op list. */
export function countChanges(ops: RedlineOp[]): number {
  return ops.reduce((n, op) => (op.kind === "change" ? n + 1 : n), 0);
}

/**
 * Rebuild one clause's text from its ops and the per-change decisions. An
 * undecided change defaults to ACCEPT (opt-out). Equal text always passes
 * through.
 */
export function applyRedline(ops: RedlineOp[], decisions: Record<number, RedlineDecision>): string {
  let out = "";
  for (const op of ops) {
    if (op.kind === "equal") out += op.text;
    else out += (decisions[op.id] ?? "accept") === "accept" ? op.ins : op.del;
  }
  return out;
}

// Occurrence-stable key, byte-identical to `versions.ts#keyed`, so the keys the
// UI reads off the diff line up with what the merge resolves here.
function keyed(clauses: ReviewClause[]): Map<string, ReviewClause> {
  const seen: Record<string, number> = {};
  const m = new Map<string, ReviewClause>();
  for (const c of clauses) {
    const i = seen[c.type] ?? 0;
    seen[c.type] = i + 1;
    m.set(`${c.type}#${i}`, c);
  }
  return m;
}

const sameMeta = (a: ReviewClause, b: ReviewClause): boolean =>
  a.risk === b.risk && a.deviation === b.deviation && (a.summary || "") === (b.summary || "");

/**
 * Rebuild the full resolved clause set from the `from` baseline, the `to`
 * current state, and the reviewer's decisions. `from`-order is the spine;
 * accepted additions are appended in `to`-order.
 *
 * - changed clause → text rebuilt from its `textOps`; its risk/deviation/
 *   summary follow the text outcome (if any `to` language survives, the clause
 *   sits on `to`'s metadata; if the text is reverted whole, on `from`'s).
 * - meta-only change (risk/deviation/summary moved, text identical) → a single
 *   clause verdict (default accept = take `to`'s metadata).
 * - removed clause (in `from`, gone in `to`) → default accept the removal
 *   (drop it); reject keeps the `from` clause.
 * - added clause (new in `to`) → default accept (keep it); reject drops it.
 */
export function resolveRedlineReview(
  from: ReviewClause[],
  to: ReviewClause[],
  decisions: RedlineReviewDecisions,
): ReviewClause[] {
  const A = keyed(from);
  const B = keyed(to);
  const result: ReviewClause[] = [];

  for (const [k, fc] of A) {
    const tc = B.get(k);
    if (!tc) {
      // Removed in `to`. Accept the removal → drop; reject → keep ours.
      if ((decisions[k]?.clause ?? "accept") === "reject") result.push(fc);
      continue;
    }
    const textChanged = fc.text.trim() !== tc.text.trim();
    if (!textChanged) {
      // Identical text — either unchanged, or a metadata-only change.
      if (sameMeta(fc, tc)) result.push(tc);
      else result.push((decisions[k]?.clause ?? "accept") === "accept" ? tc : fc);
      continue;
    }
    const ops = buildRedline(fc.text, tc.text);
    const resolvedText = applyRedline(ops, decisions[k]?.textOps ?? {});
    const movedToRevised = resolvedText.trim() !== fc.text.trim();
    const src = movedToRevised ? tc : fc;
    result.push({ type: src.type, text: resolvedText, summary: src.summary ?? null, risk: src.risk, deviation: src.deviation });
  }

  for (const [k, tc] of B) {
    if (A.has(k)) continue;
    // Added in `to`. Accept (default) → keep; reject → drop.
    if ((decisions[k]?.clause ?? "accept") === "accept") result.push(tc);
  }

  return result;
}
