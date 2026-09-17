/**
 * Consent & preference records (module #10). Server-only, chain-sealed.
 * CRUD over the existing ConsentRecord model — capture a data subject's
 * consent for a purpose, and withdraw it (proof-of-consent audit trail).
 * The data subject is resolved as a shared Person (one brain). No new table.
 */
import { prisma, logAudit, findOrCreatePersonByEmail } from "@aegis/db";

export const CONSENT_MECHANISMS = ["EXPLICIT", "LEGITIMATE_INTEREST", "CONTRACT", "LEGAL_OBLIGATION", "VITAL_INTEREST", "PUBLIC_TASK"] as const;

export interface ConsentDTO {
  id: string;
  personId: string;
  personName: string;
  personEmail: string | null;
  purpose: string;
  mechanism: string;
  capturedAt: string;
  withdrawnAt: string | null;
  active: boolean;
}

export interface ConsentSummary {
  total: number;
  active: number;
  withdrawn: number;
  byPurpose: Array<{ purpose: string; active: number }>;
}

export async function listConsents(organizationId: string): Promise<{ items: ConsentDTO[]; summary: ConsentSummary }> {
  const rows = await prisma.consentRecord.findMany({
    where: { organizationId },
    include: { dataSubjectPerson: { select: { id: true, name: true, email: true } } },
    orderBy: [{ capturedAt: "desc" }],
  });
  const items: ConsentDTO[] = rows.map((r) => ({
    id: r.id,
    personId: r.dataSubjectPersonId,
    personName: r.dataSubjectPerson?.name || r.dataSubjectPersonId,
    personEmail: r.dataSubjectPerson?.email ?? null,
    purpose: r.purpose,
    mechanism: r.mechanism,
    capturedAt: r.capturedAt.toISOString(),
    withdrawnAt: r.withdrawnAt ? r.withdrawnAt.toISOString() : null,
    active: !r.withdrawnAt,
  }));
  const byPurposeMap: Record<string, number> = {};
  for (const i of items) if (i.active) byPurposeMap[i.purpose] = (byPurposeMap[i.purpose] || 0) + 1;
  const summary: ConsentSummary = {
    total: items.length,
    active: items.filter((i) => i.active).length,
    withdrawn: items.filter((i) => !i.active).length,
    byPurpose: Object.entries(byPurposeMap).map(([purpose, active]) => ({ purpose, active })).sort((a, b) => b.active - a.active),
  };
  return { items, summary };
}

export interface RecordConsentInput {
  email?: string;
  name: string;
  purpose: string;
  mechanism: string;
}

export async function recordConsent(organizationId: string, input: RecordConsentInput, actorId: string | null): Promise<ConsentDTO> {
  const name = String(input.name || "").trim().slice(0, 200);
  const purpose = String(input.purpose || "").trim().slice(0, 300);
  const mechanism = String(input.mechanism || "EXPLICIT").toUpperCase();
  if (!name) throw new Error("A data-subject name is required");
  if (!purpose) throw new Error("A purpose is required");
  if (!(CONSENT_MECHANISMS as readonly string[]).includes(mechanism)) throw new Error(`mechanism must be one of ${CONSENT_MECHANISMS.join(", ")}`);

  const { person } = await findOrCreatePersonByEmail(organizationId, { email: String(input.email || ""), name });
  const created = await prisma.consentRecord.create({
    data: { organizationId, dataSubjectPersonId: person.id, purpose, mechanism: mechanism as never },
    include: { dataSubjectPerson: { select: { id: true, name: true, email: true } } },
  });
  await logAudit({
    organizationId, actorId, actorType: actorId ? "USER" : "SYSTEM",
    action: "privacy.consent.recorded", resourceType: "ConsentRecord", resourceId: created.id,
    afterJson: { personId: person.id, purpose, mechanism } as never, metadata: { source: "privacy-consent" } as never,
  });
  return {
    id: created.id, personId: person.id, personName: created.dataSubjectPerson?.name || person.id,
    personEmail: created.dataSubjectPerson?.email ?? null, purpose, mechanism,
    capturedAt: created.capturedAt.toISOString(), withdrawnAt: null, active: true,
  };
}

export async function withdrawConsent(organizationId: string, id: string, actorId: string): Promise<ConsentDTO> {
  const existing = await prisma.consentRecord.findFirst({ where: { id, organizationId }, include: { dataSubjectPerson: { select: { id: true, name: true, email: true } } } });
  if (!existing) throw new Error("Consent record not found");
  if (existing.withdrawnAt) throw new Error("Consent is already withdrawn.");
  const updated = await prisma.consentRecord.update({
    where: { id }, data: { withdrawnAt: new Date() },
    include: { dataSubjectPerson: { select: { id: true, name: true, email: true } } },
  });
  await logAudit({
    organizationId, actorId, actorType: "USER",
    action: "privacy.consent.withdrawn", resourceType: "ConsentRecord", resourceId: id,
    beforeJson: { purpose: existing.purpose } as never,
    afterJson: { withdrawnAt: updated.withdrawnAt?.toISOString() } as never, metadata: { source: "privacy-consent" } as never,
  });
  return {
    id: updated.id, personId: updated.dataSubjectPersonId,
    personName: updated.dataSubjectPerson?.name || updated.dataSubjectPersonId,
    personEmail: updated.dataSubjectPerson?.email ?? null, purpose: updated.purpose, mechanism: updated.mechanism,
    capturedAt: updated.capturedAt.toISOString(), withdrawnAt: updated.withdrawnAt?.toISOString() ?? null, active: false,
  };
}
