/**
 * Privacy cross-links (module #10) — the "one brain" reads that join the
 * privacy program to entities other modules own, without re-implementing
 * them:
 *   • DPAs           → Contracts module (contracts of type "DPA"), read
 *                      through @aegis/contracts.api — never Contract internals.
 *   • Obligations    → the SHARED `Obligation` entity in @aegis/db, filtered
 *                      to sourceType = PRIVACY_LAW. Privacy owns the privacy-
 *                      law slice; the Regulatory module (#11) owns the rest.
 * Pure reads, gated at the route (privacy:dpia:read). No new table.
 */
import { prisma } from "@aegis/db";
import { listDataProcessingAgreements, type DpaSummary } from "@aegis/contracts";

export type { DpaSummary };

/** Data-processing agreements sourced from the Contracts module. */
export async function listPrivacyDpas(organizationId: string): Promise<DpaSummary[]> {
  return listDataProcessingAgreements(organizationId);
}

export interface PrivacyObligationDTO {
  id: string;
  description: string;
  status: string;
  type: string;
  dueDate: string | null;
  ownerId: string | null;
  createdAt: string;
}

/** Privacy-law obligations from the shared Obligation entity (the privacy
 *  slice of the platform-wide obligations ledger). */
export async function listPrivacyObligations(organizationId: string): Promise<PrivacyObligationDTO[]> {
  const rows = await prisma.obligation.findMany({
    where: { organizationId, sourceType: "PRIVACY_LAW" },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });
  return rows.map((o) => ({
    id: o.id,
    description: o.description,
    status: o.status,
    type: o.type,
    dueDate: o.dueDate ? o.dueDate.toISOString() : null,
    ownerId: o.ownerId,
    createdAt: o.createdAt.toISOString(),
  }));
}
