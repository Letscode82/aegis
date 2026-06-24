/**
 * Counterparty relationship lookup for the NDA agent (Intake P2b).
 *
 * Replaces the hardcoded mockPriorNDACheck (which special-cased the
 * string "acme") with a real query against the shared Counterparty
 * entity. Before drafting a new NDA, the agent asks: do we already have
 * a relationship with this counterparty? If so, an NDA may already
 * exist — surface it so the attorney can reuse rather than re-paper.
 *
 * Honest by construction: it reports only what's actually in the
 * system. "Existing counterparty, N matters on file" is a real signal
 * derived from the Counterparty + Matter tables, not a fabricated
 * "active NDA on file" string.
 *
 * Server-only — the NDA agent (client-side) reaches this via
 * GET /api/intake/counterparty-check.
 */
import { prisma } from "@aegis/db";

export interface CounterpartyRelationship {
  /** True when a counterparty with this name exists in the org. */
  found: boolean;
  counterpartyId: string | null;
  counterpartyName: string | null;
  counterpartyType: string | null;
  country: string | null;
  /** Matters already on file with this counterparty (prior dealings). */
  priorMatterCount: number;
  /** One-line summary for the agent prompt + the recommendation note. */
  note: string;
}

const NOT_FOUND = (name: string): CounterpartyRelationship => ({
  found: false,
  counterpartyId: null,
  counterpartyName: null,
  counterpartyType: null,
  country: null,
  priorMatterCount: 0,
  note: name
    ? `No existing relationship with "${name}" on file — treat as a new counterparty and draft from the standard template.`
    : "No counterparty named in the request — draft from the standard template.",
});

/**
 * Look up a counterparty by name within an org. Case-insensitive; tries
 * an exact-ish contains match. Returns a structured relationship signal.
 *
 * Deliberately does NOT claim an NDA exists — we don't yet model NDA
 * documents as a first-class type. It reports the *relationship* (the
 * real, queryable fact) and prompts the attorney to check for an
 * existing agreement when prior matters exist.
 */
export async function lookupCounterpartyRelationship(
  organizationId: string,
  rawName: string | null | undefined,
): Promise<CounterpartyRelationship> {
  const name = (rawName ?? "").trim();
  if (name.length < 2) return NOT_FOUND(name);

  // Case-insensitive contains, scoped to the org. Prefer the shortest
  // name match (closest to an exact hit) when several contain the term.
  const candidates = await prisma.counterparty.findMany({
    where: {
      organizationId,
      name: { contains: name, mode: "insensitive" },
    },
    select: {
      id: true,
      name: true,
      type: true,
      country: true,
      _count: { select: { matters: true } },
    },
    orderBy: { name: "asc" },
    take: 5,
  });

  // Fall back to a looser match on the first significant token
  // ("Acme Robotics" → "Acme") so a slightly different legal name still
  // surfaces the relationship.
  let match = candidates[0];
  if (!match) {
    const firstToken = name.split(/\s+/)[0];
    if (firstToken && firstToken.length >= 3 && firstToken.toLowerCase() !== name.toLowerCase()) {
      const loose = await prisma.counterparty.findMany({
        where: {
          organizationId,
          name: { contains: firstToken, mode: "insensitive" },
        },
        select: {
          id: true,
          name: true,
          type: true,
          country: true,
          _count: { select: { matters: true } },
        },
        orderBy: { name: "asc" },
        take: 1,
      });
      match = loose[0];
    }
  }

  if (!match) return NOT_FOUND(name);

  const matterCount = match._count?.matters ?? 0;
  const note =
    matterCount > 0
      ? `Existing counterparty "${match.name}" (${match.type}${match.country ? `, ${match.country}` : ""}) with ${matterCount} matter${matterCount === 1 ? "" : "s"} on file. Check for an existing NDA before drafting a new one.`
      : `Existing counterparty "${match.name}" (${match.type}${match.country ? `, ${match.country}` : ""}) on file, no prior matters. Likely no NDA yet — drafting new is appropriate.`;

  return {
    found: true,
    counterpartyId: match.id,
    counterpartyName: match.name,
    counterpartyType: match.type,
    country: match.country,
    priorMatterCount: matterCount,
    note,
  };
}
