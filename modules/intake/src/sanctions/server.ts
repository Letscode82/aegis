/**
 * Sanctions screening (Intake P2b — replaces the hardcoded
 * mockSanctionsCheck, the biggest legal-liability mock in the codebase).
 *
 * Two real signals:
 *   1. Comprehensively-sanctioned jurisdiction check — OFAC maintains
 *      country-wide embargo programs (Iran, North Korea, Cuba, Syria,
 *      Crimea / so-called DNR-LNR regions). These are stable, public,
 *      and legitimate domain logic — not a fabrication.
 *   2. Name match against the SanctionsListEntry table (OFAC SDN / EU /
 *      UK consolidated), populated by refreshSanctionsList() from the
 *      live Treasury feed in production, seeded with a bootstrap set for
 *      demo/CI.
 *
 * SAFE DEFAULT — the load-bearing part: if the list is empty or stale
 * (older than STALE_AFTER_DAYS), screening returns status "unavailable",
 * NOT "clear". A missing/old feed can never produce a false all-clear;
 * the vendor agent turns "unavailable" into flag-for-review. You only
 * get "clear" results once real screening data is present and fresh.
 */
import { prisma, type SanctionsListEntry } from "@aegis/db";

export type SanctionsStatus = "clear" | "hit" | "unavailable";

export interface SanctionsScreenResult {
  status: SanctionsStatus;
  flags: string[];
  /** Names/programs that matched, for the escalation memo. */
  matches: Array<{ entityName: string; source: string; programs: string[] }>;
  /** When the underlying list was last refreshed (ISO), or null. */
  listAsOf: string | null;
  note: string;
}

/** A list older than this is treated as unusable → "unavailable". */
export const STALE_AFTER_DAYS = 30;

/**
 * OFAC comprehensive (country-wide) sanctions programs. Screening a
 * counterparty *from* one of these jurisdictions is a hit regardless of
 * name-list coverage. Public, stable program list — safe to hardcode.
 */
const COMPREHENSIVELY_SANCTIONED: Record<string, string> = {
  iran: "OFAC Iran program (comprehensive embargo)",
  "north korea": "OFAC North Korea program (comprehensive embargo)",
  dprk: "OFAC North Korea program (comprehensive embargo)",
  cuba: "OFAC Cuba program (comprehensive embargo)",
  syria: "OFAC Syria program (comprehensive embargo)",
  crimea: "OFAC Crimea region program (comprehensive embargo)",
};

/** Lowercase, strip punctuation, collapse whitespace — the match key. */
export function normalizeName(name: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(inc|llc|ltd|corp|co|plc|gmbh|sa|ag|company|limited|holdings?|group)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jurisdictionHit(country: string | null | undefined): string | null {
  const c = (country || "").toLowerCase().trim();
  if (!c) return null;
  for (const [key, label] of Object.entries(COMPREHENSIVELY_SANCTIONED)) {
    if (c.includes(key)) return label;
  }
  return null;
}

/** Newest refreshedAt across the table, or null if empty. */
async function listAsOf(): Promise<Date | null> {
  const newest = await prisma.sanctionsListEntry.findFirst({
    orderBy: { refreshedAt: "desc" },
    select: { refreshedAt: true },
  });
  return newest?.refreshedAt ?? null;
}

function isStale(asOf: Date | null, now: number): boolean {
  if (!asOf) return true;
  return now - asOf.getTime() > STALE_AFTER_DAYS * 24 * 3600 * 1000;
}

/**
 * Screen a counterparty by name + country.
 *
 * Order of operations:
 *   1. Comprehensively-sanctioned jurisdiction → immediate hit (works
 *      even with an empty name list).
 *   2. If the name list is empty or stale → unavailable (safe default).
 *   3. Otherwise, fuzzy name match against SanctionsListEntry.
 */
export async function screenAgainstSanctions(
  rawName: string | null | undefined,
  country: string | null | undefined,
  nowMs: number = Date.now(),
): Promise<SanctionsScreenResult> {
  const name = (rawName || "").trim();

  // 1. Jurisdiction embargo — always evaluable.
  const jHit = jurisdictionHit(country);
  if (jHit) {
    return {
      status: "hit",
      flags: [jHit],
      matches: [],
      listAsOf: null,
      note: `Counterparty jurisdiction is under a comprehensive OFAC embargo (${country}). Mandatory escalation.`,
    };
  }

  const asOf = await listAsOf();
  if (isStale(asOf, nowMs)) {
    return {
      status: "unavailable",
      flags: [
        asOf
          ? `Sanctions list is stale (last refreshed ${asOf.toISOString().slice(0, 10)}; older than ${STALE_AFTER_DAYS} days).`
          : "No sanctions list loaded — screening cannot be performed.",
      ],
      matches: [],
      listAsOf: asOf?.toISOString() ?? null,
      note: "Automated sanctions screening is unavailable. Manual screening required before onboarding — do NOT treat as cleared.",
    };
  }

  if (name.length < 2) {
    return {
      status: "unavailable",
      flags: ["No counterparty name to screen."],
      matches: [],
      listAsOf: asOf?.toISOString() ?? null,
      note: "No counterparty name provided — manual screening required.",
    };
  }

  // 3. Name match. Pull candidate rows by normalized-name token overlap.
  const norm = normalizeName(name);
  const tokens = norm.split(" ").filter((t) => t.length >= 3);
  const rows = await prisma.sanctionsListEntry.findMany({
    where: {
      OR: [
        { normalizedName: { contains: norm } },
        ...tokens.map((t) => ({ normalizedName: { contains: t } })),
      ],
    },
    take: 25,
  });

  const matches = rows.filter((r) => matchesEntry(norm, tokens, r));
  if (matches.length > 0) {
    return {
      status: "hit",
      flags: matches.map(
        (m) => `Name match on ${m.source}: "${m.entityName}"${m.programs.length ? ` [${m.programs.join(", ")}]` : ""}`,
      ),
      matches: matches.map((m) => ({
        entityName: m.entityName,
        source: m.source,
        programs: m.programs,
      })),
      listAsOf: asOf?.toISOString() ?? null,
      note: `Potential sanctions match against ${matches.length} list entr${matches.length === 1 ? "y" : "ies"}. Mandatory escalation — do NOT proceed.`,
    };
  }

  return {
    status: "clear",
    flags: [],
    matches: [],
    listAsOf: asOf?.toISOString() ?? null,
    note: `No sanctions match (screened against list refreshed ${asOf?.toISOString().slice(0, 10)}).`,
  };
}

/** A candidate row is a match if its normalized name equals the query,
 * the query contains it, or they share a strong multi-token overlap. */
function matchesEntry(
  norm: string,
  queryTokens: string[],
  entry: SanctionsListEntry,
): boolean {
  const en = entry.normalizedName;
  if (!en) return false;
  if (en === norm) return true;
  if (norm.length >= 4 && (en.includes(norm) || norm.includes(en))) return true;
  // Token overlap: require all entry tokens present in the query (so a
  // 2-word listed entity must fully appear), to keep false positives low.
  const entryTokens = en.split(" ").filter((t) => t.length >= 3);
  if (entryTokens.length === 0) return false;
  const qset = new Set(queryTokens);
  const overlap = entryTokens.filter((t) => qset.has(t)).length;
  return overlap === entryTokens.length && entryTokens.length >= 2;
}

// ── List refresh ─────────────────────────────────────────────────────

export interface RawSanctionsEntry {
  source: string;
  sourceRef: string;
  entityName: string;
  entityType?: string | null;
  programs?: string[];
  aliases?: string[];
  country?: string | null;
  listedAt?: string | null;
}

/** Pluggable feed fetcher — defaults to the live OFAC SDN feed; tests
 * and the demo bootstrap inject their own. Returns raw entries. */
export type SanctionsFeedFetcher = () => Promise<RawSanctionsEntry[]>;

export interface SanctionsRefreshResult {
  source: string;
  upserted: number;
  refreshedAt: string;
}

/**
 * Refresh the sanctions list from a feed. Upserts on (source,
 * sourceRef); stamps refreshedAt = now so staleness resets. Admin
 * trigger (pg-boss-ready) calls this; production points the default
 * fetcher at the Treasury SDN feed.
 */
export async function refreshSanctionsList(
  fetcher: SanctionsFeedFetcher,
  nowMs: number = Date.now(),
): Promise<SanctionsRefreshResult[]> {
  const entries = await fetcher();
  const refreshedAt = new Date(nowMs);
  const bySource = new Map<string, number>();

  for (const e of entries) {
    await prisma.sanctionsListEntry.upsert({
      where: { source_sourceRef: { source: e.source, sourceRef: e.sourceRef } },
      create: {
        source: e.source,
        sourceRef: e.sourceRef,
        entityName: e.entityName,
        normalizedName: normalizeName(e.entityName),
        entityType: e.entityType ?? null,
        programs: e.programs ?? [],
        aliasesJson: (e.aliases ?? []).map(normalizeName) as never,
        country: e.country ?? null,
        listedAt: e.listedAt ? new Date(e.listedAt) : null,
        refreshedAt,
      },
      update: {
        entityName: e.entityName,
        normalizedName: normalizeName(e.entityName),
        entityType: e.entityType ?? null,
        programs: e.programs ?? [],
        aliasesJson: (e.aliases ?? []).map(normalizeName) as never,
        country: e.country ?? null,
        listedAt: e.listedAt ? new Date(e.listedAt) : null,
        refreshedAt,
      },
    });
    bySource.set(e.source, (bySource.get(e.source) ?? 0) + 1);
  }

  return Array.from(bySource.entries()).map(([source, upserted]) => ({
    source,
    upserted,
    refreshedAt: refreshedAt.toISOString(),
  }));
}
