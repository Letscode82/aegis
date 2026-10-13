/**
 * ONE Legal redline model — document-level track changes.
 *
 * Turns a base document + an AI-revised document into a reviewable list of
 * discrete CHANGES (the Harvey / CLM redline experience): each change is a
 * contiguous insertion, deletion, or replacement the user accepts or rejects,
 * with the untouched text in between shown as context. The word-level diff
 * itself is the battle-tested `diffWords` engine from `@aegis/contracts` — we
 * do not re-implement diffing; this only GROUPS its segments into accept/reject
 * units and rebuilds the final text from the user's decisions.
 *
 * Pure + dependency-light so it unit-tests without a model or a DOM.
 */
import { diffWords, type WordDiffSegment } from "@aegis/contracts";

export type RedlineOp =
  /** Unchanged text, shown as context between changes. */
  | { kind: "equal"; text: string }
  /**
   * A reviewable change. `del` is the original text removed (empty for a pure
   * insertion); `ins` is the revised text added (empty for a pure deletion); a
   * replacement carries both. `id` is a stable per-document index.
   */
  | { kind: "change"; id: number; del: string; ins: string };

/** Accept keeps the revision (`ins`); reject keeps the original (`del`). */
export type RedlineDecision = "accept" | "reject";

/**
 * Group the word-level diff of base → revised into ops. Adjacent delete/insert
 * segments merge into one replacement change so a reviewer sees "old → new" as a
 * single decision rather than two. A run with only deletes is a deletion; only
 * inserts, an insertion.
 */
export function buildRedline(base: string, revised: string): RedlineOp[] {
  const segments: WordDiffSegment[] = diffWords(base || "", revised || "");
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
      // Merge consecutive equals (diffWords already merges, but be safe).
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

/** The number of reviewable changes in an op list. */
export function countChanges(ops: RedlineOp[]): number {
  return ops.reduce((n, op) => (op.kind === "change" ? n + 1 : n), 0);
}

/**
 * Rebuild the document text from the ops and the user's per-change decisions.
 * A change with no decision defaults to ACCEPT (the suggestions are opt-out —
 * the user rejects the ones they don't want). Equal text always passes through.
 */
export function applyRedline(ops: RedlineOp[], decisions: Record<number, RedlineDecision>): string {
  let out = "";
  for (const op of ops) {
    if (op.kind === "equal") {
      out += op.text;
    } else {
      const d = decisions[op.id] ?? "accept";
      out += d === "accept" ? op.ins : op.del;
    }
  }
  return out;
}
