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
import { screenAgainstMarks, normalizeMark, type Conflict } from "./similarity";
import { getConfiguredRegistries, searchAllRegistries } from "./registries/factory";
import type { RegistryMark } from "./registries/types";

export type TrademarkStatus = "conflict" | "clear" | "unavailable";

export interface TrademarkScreenResult {
  status: TrademarkStatus;
  conflicts: Conflict[];
  /** Total marks screened against (0 → unavailable). */
  screened: number;
  /** When the underlying data was last refreshed (ISO), or null. */
  listAsOf: string | null;
  /** Registries queried live for this screen (empty → local table only). */
  sources: string[];
  note: string;
}

/** Cache live registry hits into TrademarkMark (source-tagged) so repeat
 *  screens are fast, offline-capable, and on the audit trail. Best-effort. */
async function cacheRegistryMarks(marks: RegistryMark[]): Promise<void> {
  const now = new Date();
  for (const m of marks) {
    const norm = normalizeMark(m.wordMark);
    if (!norm) continue;
    try {
      await prisma.trademarkMark.upsert({
        where: { source_sourceRef: { source: m.source, sourceRef: m.ref } },
        create: { source: m.source, sourceRef: m.ref, wordMark: m.wordMark, normalizedMark: norm, niceClasses: m.classes, status: m.status, ownerName: m.owner ?? null, registeredAt: m.registeredAt ? new Date(m.registeredAt) : null, refreshedAt: now },
        update: { wordMark: m.wordMark, normalizedMark: norm, niceClasses: m.classes, status: m.status, ownerName: m.owner ?? null, refreshedAt: now },
      });
    } catch { /* skip a bad row; never fail the screen */ }
  }
}

/**
 * Query the configured registries (USPTO/EUIPO/WIPO) live for the candidate
 * and cache the hits. Returns the sources actually queried. No registries
 * configured → returns [] and the screen runs on the local table only.
 */
async function enrichFromRegistries(candidate: string, classes: number[]): Promise<{ sources: string[]; errors: Array<{ source: string; error: string }> }> {
  let clients;
  try { clients = getConfiguredRegistries(); }
  catch (e) { return { sources: [], errors: [{ source: "config", error: String((e as Error).message) }] }; }
  if (clients.length === 0) return { sources: [], errors: [] };
  const { marks, errors } = await searchAllRegistries(clients, candidate, classes);
  await cacheRegistryMarks(marks);
  return { sources: clients.map((c) => c.source), errors };
}

/** Data older than this is treated as unusable → "unavailable". */
export const STALE_AFTER_DAYS = 90;

const UNAVAILABLE = (note: string): TrademarkScreenResult => ({
  status: "unavailable",
  conflicts: [],
  screened: 0,
  listAsOf: null,
  sources: [],
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

  // Live registry search (USPTO/EUIPO/WIPO) when configured — hits are
  // cached into TrademarkMark before we read the table below. Best-effort;
  // no registries configured → local table only.
  const { sources } = await enrichFromRegistries(candidate, classes);

  let rows: TrademarkMark[];
  try {
    rows = await prisma.trademarkMark.findMany({ take: 5000, orderBy: { refreshedAt: "desc" } });
  } catch {
    return { ...UNAVAILABLE("Trademark screening service unreachable — manual search required."), sources };
  }
  if (rows.length === 0) {
    return { ...UNAVAILABLE("No trademark reference data loaded — a formal registry search is required."), sources };
  }

  const newest = rows.reduce((acc, r) => (r.refreshedAt > acc ? r.refreshedAt : acc), rows[0]!.refreshedAt);
  const ageDays = (Date.now() - new Date(newest).getTime()) / 86_400_000;
  const listAsOf = new Date(newest).toISOString();
  if (ageDays > STALE_AFTER_DAYS) {
    return { ...UNAVAILABLE(`Trademark reference data is stale (${Math.round(ageDays)}d old) — run a fresh formal search.`), listAsOf, sources };
  }

  const via = sources.length ? ` (live: ${sources.join(", ")})` : "";
  const conflicts = screenAgainstMarks(candidate, classes, rows);
  if (conflicts.length > 0) {
    return {
      status: "conflict",
      conflicts,
      screened: rows.length,
      listAsOf,
      sources,
      note: `${conflicts.length} potential conflict${conflicts.length === 1 ? "" : "s"} found against ${rows.length} screened marks${via}. A formal registry clearance is still required.`,
    };
  }
  return {
    status: "clear",
    conflicts: [],
    screened: rows.length,
    listAsOf,
    sources,
    note: `No knock-out conflicts against ${rows.length} screened marks${via}. This is a preliminary screen — a formal USPTO/EUIPO/WIPO clearance + counsel sign-off is still required.`,
  };
}

/** Admin visibility: which registries are wired + local cache health. */
export async function getRegistryStatus(): Promise<{ configured: string[]; localMarks: number; bySource: Record<string, number>; listAsOf: string | null }> {
  let configured: string[] = [];
  try { configured = getConfiguredRegistries().map((c) => c.source); } catch { configured = ["(partial config)"]; }
  const rows = await prisma.trademarkMark.groupBy({ by: ["source"], _count: { _all: true }, _max: { refreshedAt: true } }).catch(() => []);
  const bySource: Record<string, number> = {};
  let localMarks = 0;
  let newest: Date | null = null;
  for (const r of rows) {
    bySource[r.source] = r._count._all;
    localMarks += r._count._all;
    if (r._max.refreshedAt && (!newest || r._max.refreshedAt > newest)) newest = r._max.refreshedAt;
  }
  return { configured, localMarks, bySource, listAsOf: newest ? newest.toISOString() : null };
}

/** Pre-warm the cache by live-searching a list of terms across registries. */
export async function warmRegistries(terms: string[]): Promise<{ sources: string[]; cached: number; errors: Array<{ source: string; error: string }> }> {
  let clients;
  try { clients = getConfiguredRegistries(); } catch (e) { return { sources: [], cached: 0, errors: [{ source: "config", error: String((e as Error).message) }] }; }
  if (clients.length === 0) return { sources: [], cached: 0, errors: [] };
  let cached = 0;
  const allErrors: Array<{ source: string; error: string }> = [];
  for (const term of terms.filter((t) => t && t.trim())) {
    const { marks, errors } = await searchAllRegistries(clients, term.trim(), []);
    await cacheRegistryMarks(marks);
    cached += marks.length;
    allErrors.push(...errors);
  }
  return { sources: clients.map((c) => c.source), cached, errors: allErrors };
}
