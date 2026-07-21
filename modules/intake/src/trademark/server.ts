/**
 * Trademark knock-out screening — the real conflict engine behind the
 * Trademark Clearance agent (replaces "you cannot search registries").
 *
 * Matches a proposed mark against the TrademarkMark table (USPTO / EUIPO /
 * bootstrap) using the deterministic phonetic + visual + NICE-class
 * similarity in similarity.ts. Three outcomes:
 *   conflict    → similar live/dead marks found (surface + recommend caution)
 *   clear       → no knock-out conflicts (still needs a formal search)
 *   unavailable → table empty or stale → flag for review, NEVER a false
 *                 all-clear (same safe-default discipline as sanctions).
 *
 * A knock-out screen is a first pass — it can miss common-law marks and
 * near-misses; the agent ALWAYS recommends a formal registry clearance +
 * counsel sign-off before any naming commitment.
 */
import { prisma, type TrademarkMark } from "@aegis/db";
import { screenAgainstMarks, type Conflict } from "./similarity";

export type TrademarkStatus = "conflict" | "clear" | "unavailable";

export interface TrademarkScreenResult {
  status: TrademarkStatus;
  conflicts: Conflict[];
  /** Total marks screened against (0 → unavailable). */
  screened: number;
  /** When the underlying data was last refreshed (ISO), or null. */
  listAsOf: string | null;
  note: string;
}

/** Data older than this is treated as unusable → "unavailable". */
export const STALE_AFTER_DAYS = 90;

const UNAVAILABLE = (note: string): TrademarkScreenResult => ({
  status: "unavailable",
  conflicts: [],
  screened: 0,
  listAsOf: null,
  note,
});

/**
 * Screen a proposed mark. `classes` are the candidate's NICE classes (may
 * be empty → conservative overlap). Candidate marks are matched against the
 * whole normalized-mark index (bounded); for a large registry this would
 * pre-filter by soundex/prefix, but the bootstrap + demo scale reads all.
 */
export async function screenTrademark(mark: string, classes: number[] = []): Promise<TrademarkScreenResult> {
  const candidate = String(mark || "").trim();
  if (!candidate) return UNAVAILABLE("No mark provided — nothing to screen.");

  let rows: TrademarkMark[];
  try {
    rows = await prisma.trademarkMark.findMany({ take: 5000, orderBy: { refreshedAt: "desc" } });
  } catch {
    return UNAVAILABLE("Trademark screening service unreachable — manual search required.");
  }
  if (rows.length === 0) {
    return UNAVAILABLE("No trademark reference data loaded — a formal registry search is required.");
  }

  const newest = rows.reduce((acc, r) => (r.refreshedAt > acc ? r.refreshedAt : acc), rows[0]!.refreshedAt);
  const ageDays = (Date.now() - new Date(newest).getTime()) / 86_400_000;
  const listAsOf = new Date(newest).toISOString();
  if (ageDays > STALE_AFTER_DAYS) {
    return { ...UNAVAILABLE(`Trademark reference data is stale (${Math.round(ageDays)}d old) — run a fresh formal search.`), listAsOf };
  }

  const conflicts = screenAgainstMarks(candidate, classes, rows);
  if (conflicts.length > 0) {
    return {
      status: "conflict",
      conflicts,
      screened: rows.length,
      listAsOf,
      note: `${conflicts.length} potential conflict${conflicts.length === 1 ? "" : "s"} found against ${rows.length} screened marks. A formal registry clearance is still required.`,
    };
  }
  return {
    status: "clear",
    conflicts: [],
    screened: rows.length,
    listAsOf,
    note: `No knock-out conflicts against ${rows.length} screened marks. This is a preliminary screen — a formal USPTO/EUIPO/WIPO clearance + counsel sign-off is still required.`,
  };
}
