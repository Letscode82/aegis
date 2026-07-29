/**
 * Counterparty contacts (CLM Phase 5a).
 *
 * The counterparty review round-trip (CTR-3) invites a `Person` of type
 * COUNTERPARTY_CONTACT whose `metadata.counterpartyId` matches the contract's
 * counterparty. Until now those Person rows only existed in the seed, so a
 * freshly-authored contract had "No counterparty contacts on file" and the
 * review/negotiation flow was unreachable. This adds the create path.
 *
 * Shared-entity discipline: a counterparty contact is a `Person` (the shared
 * identity entity), never a module-local table. The link to the counterparty
 * rides `metadata.counterpartyId` — the same convention the review-token
 * eligibility filter already reads. Chain-sealed.
 */
import { prisma, logAudit } from "@aegis/db";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

export interface CounterpartyContactDTO {
  personId: string;
  name: string;
  email: string | null;
  counterpartyId: string;
}

export interface CreateCounterpartyContactInput {
  counterpartyId: string;
  name: string;
  email?: string | null;
}

/**
 * Create a COUNTERPARTY_CONTACT Person linked to a counterparty. Idempotent
 * on (counterpartyId, lowercased email) when an email is given — re-adding
 * the same contact returns the existing row instead of duplicating it.
 */
export async function createCounterpartyContact(
  organizationId: string,
  input: CreateCounterpartyContactInput,
  actor: Actor,
): Promise<CounterpartyContactDTO> {
  const name = input.name?.trim();
  const email = input.email?.trim() || null;
  if (!input.counterpartyId) throw new Error("counterpartyId is required");
  if (!name) throw new Error("Contact name is required");

  const cp = await prisma.counterparty.findFirst({
    where: { id: input.counterpartyId, organizationId },
    select: { id: true, name: true },
  });
  if (!cp) throw new Error("Counterparty not found");

  // De-dupe on email within the same counterparty.
  if (email) {
    const existing = await prisma.person.findFirst({
      where: {
        organizationId,
        type: "COUNTERPARTY_CONTACT",
        email: { equals: email, mode: "insensitive" },
      },
    });
    if (existing && (existing.metadata as { counterpartyId?: string } | null)?.counterpartyId === cp.id) {
      return { personId: existing.id, name: existing.name, email: existing.email, counterpartyId: cp.id };
    }
  }

  const person = await prisma.person.create({
    data: {
      organizationId,
      type: "COUNTERPARTY_CONTACT",
      name,
      email,
      metadata: { counterpartyId: cp.id, counterpartyName: cp.name } as never,
    },
  });

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
    action: "contract.counterparty_contact.created",
    resourceType: "Person",
    resourceId: person.id,
    afterJson: { name, email, counterpartyId: cp.id, counterpartyName: cp.name } as never,
    metadata: { source: "contracts" } as never,
  });

  return { personId: person.id, name: person.name, email: person.email, counterpartyId: cp.id };
}
