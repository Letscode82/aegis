/**
 * MatterParty service — assignment + removal.
 *
 * The (matterId, personId, role) unique constraint enforces "no
 * duplicate role assignments". A person can hold multiple roles on the
 * same matter (e.g. attorney + custodian) by separate rows.
 *
 * Lead attorney is a singleton-by-convention: helpers below ensure
 * setting a new LEAD_ATTORNEY first removes the prior one and updates
 * Matter.leadAttorneyId.
 */
import {
  prisma,
  type MatterParty,
  type MatterPartyRole,
} from "@aegis/db";
import type { MatterActor } from "../types";
import { recordMatterEvent } from "./timeline";

export async function listMatterParties(
  matterId: string,
): Promise<MatterParty[]> {
  return prisma.matterParty.findMany({
    where: { matterId },
    orderBy: [{ role: "asc" }, { addedAt: "asc" }],
  });
}

export async function addMatterPartyService(
  matterId: string,
  personId: string,
  role: MatterPartyRole,
  actor: MatterActor,
): Promise<MatterParty> {
  // Confirm matter belongs to actor's org.
  const matter = await prisma.matter.findFirst({
    where: { id: matterId, organizationId: actor.organizationId },
    select: { id: true, leadAttorneyId: true },
  });
  if (!matter) {
    throw new Error(
      `Matter ${matterId} not found in organization ${actor.organizationId}`,
    );
  }

  // Lead attorney is singleton-by-convention. Replacing means removing
  // the prior holder and updating Matter.leadAttorneyId.
  if (role === "LEAD_ATTORNEY") {
    await prisma.matterParty.deleteMany({
      where: { matterId, role: "LEAD_ATTORNEY" },
    });
    await prisma.matter.update({
      where: { id: matterId },
      data: { leadAttorneyId: personId },
    });
  }

  const created = await prisma.matterParty.upsert({
    where: { matterId_personId_role: { matterId, personId, role } },
    update: {},
    create: { matterId, personId, role },
  });

  await recordMatterEvent({
    matterId,
    actor,
    eventType: "matter.party.added",
    auditAction: "matter.party.added",
    summary: `Added ${role} to matter`,
    afterJson: { matterPartyId: created.id, personId, role },
    metadata: { role, personId },
  });

  return created;
}

export async function removeMatterPartyService(
  matterId: string,
  personId: string,
  actor: MatterActor,
): Promise<void> {
  const matter = await prisma.matter.findFirst({
    where: { id: matterId, organizationId: actor.organizationId },
    select: { id: true, leadAttorneyId: true },
  });
  if (!matter) {
    throw new Error(
      `Matter ${matterId} not found in organization ${actor.organizationId}`,
    );
  }

  const removed = await prisma.matterParty.findMany({
    where: { matterId, personId },
  });

  await prisma.matterParty.deleteMany({ where: { matterId, personId } });

  if (matter.leadAttorneyId === personId) {
    await prisma.matter.update({
      where: { id: matterId },
      data: { leadAttorneyId: null },
    });
  }

  await recordMatterEvent({
    matterId,
    actor,
    eventType: "matter.party.removed",
    auditAction: "matter.party.removed",
    summary: `Removed person ${personId} from matter`,
    beforeJson: { roles: removed.map((r) => r.role) },
    metadata: { personId },
  });
}
