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

export interface PriorNDA {
  documentId: string;
  name: string;
  /** ISO date the NDA document was uploaded/recorded. */
  uploadedAt: string;
}

export interface CounterpartyRelationship {
  /** True when a counterparty with this name exists in the org. */
  found: boolean;
  counterpartyId: string | null;
  counterpartyName: string | null;
  counterpartyType: string | null;
  country: string | null;
  /** Matters already on file with this counterparty (prior dealings). */
  priorMatterCount: number;
  /** A real prior NDA document on file with this counterparty, if one
   * exists (found via the counterparty's matters). Null otherwise. */
  priorNda: PriorNDA | null;
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
  priorNda: null,
  note: name
    ? `No existing relationship with "${name}" on file — treat as a new counterparty and draft from the standard template.`
    : "No counterparty named in the request — draft from the standard template.",
});

/**
 * Find a real prior NDA document for a counterparty, via its matters.
 * Documents are polymorphic (ownerType, ownerId); an NDA lives on a
 * MATTER tied to the counterparty. Matches by name (NDA / non-disclosure
 * / confidentiality). Returns the most recent, or null.
 */
async function findPriorNdaDocument(
  organizationId: string,
  counterpartyId: string,
): Promise<PriorNDA | null> {
  const matters = await prisma.matter.findMany({
    where: { organizationId, counterpartyId },
    select: { id: true },
  });
  if (matters.length === 0) return null;
  const matterIds = matters.map((m) => m.id);
  const doc = await prisma.document.findFirst({
    where: {
      organizationId,
      ownerType: "MATTER",
      ownerId: { in: matterIds },
      OR: [
        { name: { contains: "NDA", mode: "insensitive" } },
        { name: { contains: "non-disclosure", mode: "insensitive" } },
        { name: { contains: "nondisclosure", mode: "insensitive" } },
        { name: { contains: "confidentialit", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, uploadedAt: true },
    orderBy: { uploadedAt: "desc" },
  });
  if (!doc) return null;
  return { documentId: doc.id, name: doc.name, uploadedAt: doc.uploadedAt.toISOString() };
}

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
  const priorNda = await findPriorNdaDocument(organizationId, match.id);
  const cpLabel = `"${match.name}" (${match.type}${match.country ? `, ${match.country}` : ""})`;

  let note: string;
  if (priorNda) {
    note = `Existing NDA on file with ${cpLabel}: "${priorNda.name}" (recorded ${priorNda.uploadedAt.slice(0, 10)}). Recommend REUSING / amending the existing agreement rather than drafting new — confirm it still covers the intended scope.`;
  } else if (matterCount > 0) {
    note = `Existing counterparty ${cpLabel} with ${matterCount} matter${matterCount === 1 ? "" : "s"} on file, but no NDA document found. Check the matter files before drafting a new NDA.`;
  } else {
    note = `Existing counterparty ${cpLabel} on file, no prior matters and no NDA on file. Drafting new is appropriate.`;
  }

  return {
    found: true,
    counterpartyId: match.id,
    counterpartyName: match.name,
    counterpartyType: match.type,
    country: match.country,
    priorMatterCount: matterCount,
    priorNda,
    note,
  };
}
