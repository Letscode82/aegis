/**
 * Intake → Matter spawn (P2b core).
 *
 * When an attorney approves an intake ticket whose type implies a
 * matter (Contract Review, Litigation/Dispute, Employment Issue,
 * Vendor Due Diligence, Regulatory, Trademark Check), this module
 * creates the corresponding Matter row through `@aegis/matter` and
 * links it back via `IntakeTicket.matterId`. The result is the "one
 * brain" loop the platform thesis promises: intake, matter,
 * documents, and audit all attached to the same shared entities, no
 * copying between silos.
 *
 * Q&A-shaped intake types (Contract Question, IP Question, Privacy
 * Question, Legal Question — General, NDA Request, Other) do not
 * spawn matters — those are advisory and close in-place. NDA
 * intentionally excluded: standard NDAs are template work, not
 * matter-scoped engagements.
 *
 * Server-only. The intake `saveTicketsV8` chokepoint calls
 * `maybeSpawnMatterForApprovedTicket` after the
 * `intake.recommendation.approved` audit row fires. Idempotent:
 * tickets already linked to a matter are skipped.
 */
import {
  prisma,
  logAudit,
  type IntakeTicket,
  MatterType,
} from "@aegis/db";
import { createMatter } from "@aegis/matter";

/**
 * Intake type → MatterType mapping. Only the keys present here
 * spawn matters; everything else returns null.
 */
const INTAKE_TYPE_TO_MATTER_TYPE: Readonly<Record<string, MatterType>> =
  Object.freeze({
    "Contract Review": MatterType.TRANSACTIONAL,
    "Litigation / Dispute": MatterType.LITIGATION,
    "Employment Issue": MatterType.EMPLOYMENT,
    "Vendor Due Diligence": MatterType.TRANSACTIONAL,
    Regulatory: MatterType.REGULATORY,
    "Trademark Check": MatterType.IP,
  });

export function intakeTypeSpawnsMatter(intakeType: string | null | undefined): boolean {
  return !!intakeType && intakeType in INTAKE_TYPE_TO_MATTER_TYPE;
}

export function intakeTypeToMatterType(
  intakeType: string,
): MatterType | null {
  return INTAKE_TYPE_TO_MATTER_TYPE[intakeType] ?? null;
}

/** Resolved-user shape from @aegis/auth/server. */
interface SpawnActor {
  id: string;
  organizationId: string;
  email?: string;
  name?: string;
}

export interface MatterSpawnResult {
  matterId: string;
  matterNumber: string | null;
  matterTitle: string;
}

/**
 * Derive a one-line matter title from the ticket. Uses the first
 * sentence of the description (up to ~80 chars) so the matter list
 * shows something meaningful immediately. Falls back to the type +
 * requester combo if the description is empty.
 */
export function deriveMatterTitle(input: {
  type: string;
  description: string | null | undefined;
  requesterName: string | null | undefined;
}): string {
  const desc = (input.description ?? "").trim();
  if (desc) {
    const firstSentence = desc.split(/[.!?\n]/)[0]?.trim();
    if (firstSentence && firstSentence.length > 0) {
      return firstSentence.length > 80
        ? `${firstSentence.slice(0, 77)}...`
        : firstSentence;
    }
  }
  const requester = input.requesterName ?? "Unknown requester";
  return `${input.type} — ${requester}`;
}

/**
 * Spawn a matter for a freshly-approved intake ticket if the type
 * implies one. Idempotent: returns `null` and writes no audit when:
 *   - the ticket type is not in the spawn list, OR
 *   - the ticket already has a `matterId` set.
 *
 * On a successful spawn:
 *   - `@aegis/matter.createMatter` writes its own chain-sealed
 *     `matter.created` audit (twin-recorded with `MatterTimeline`);
 *   - `IntakeTicket.matterId` is set to the new matter id;
 *   - a chain-sealed `intake.ticket.matter_spawned` audit row fires
 *     so the intake-side timeline carries the cross-module event.
 */
export async function maybeSpawnMatterForApprovedTicket(
  ticket: Pick<
    IntakeTicket,
    "id" | "type" | "description" | "matterId" | "organizationId"
  > & { requesterName?: string | null },
  actor: SpawnActor,
): Promise<MatterSpawnResult | null> {
  if (ticket.matterId) return null;
  const matterType = intakeTypeToMatterType(ticket.type);
  if (!matterType) return null;

  const title = deriveMatterTitle({
    type: ticket.type,
    description: ticket.description,
    requesterName: ticket.requesterName ?? null,
  });

  const matter = await createMatter(
    {
      title,
      type: matterType,
      description: ticket.description ?? undefined,
      intakeTicketId: ticket.id,
      initialStatus: "OPEN",
    },
    {
      id: actor.id,
      organizationId: actor.organizationId,
      email: actor.email,
      name: actor.name,
    },
  );

  await prisma.intakeTicket.update({
    where: { id: ticket.id },
    data: { matterId: matter.id },
  });

  await logAudit({
    organizationId: ticket.organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.ticket.matter_spawned",
    resourceType: "IntakeTicket",
    resourceId: ticket.id,
    afterJson: {
      matterId: matter.id,
      matterNumber: matter.matterNumber,
      matterType,
    },
    metadata: { intakeType: ticket.type, source: "intake-storage-api" },
  });

  return {
    matterId: matter.id,
    matterNumber: matter.matterNumber,
    matterTitle: title,
  };
}
