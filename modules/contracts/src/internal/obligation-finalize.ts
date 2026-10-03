/**
 * Post-signature obligation finalization + owner assignment (CLM C-9).
 *
 * When a contract reaches EXECUTED its tracked commitments become live. This
 * runs the deterministic extractor over the *executed* terms and reconciles
 * the Obligation ledger to them: it creates any commitment the signed paper
 * carries that isn't tracked yet, assigns each an owner, and backfills an
 * owner onto existing unowned open obligations. Existing / resolved
 * obligations are never duplicated or re-touched — idempotent, so a re-run (or
 * an amendment round-trip that re-executes) creates nothing new.
 *
 * Owner assignment ("assign"): an obligation with no owner inherits the
 * contract's matter lead — the matter's LEAD_ATTORNEY party (first ATTORNEY as
 * a fallback), resolved to a Person id. No matter, or no lead → left unowned.
 *
 * Deterministic and chain-sealed; no @aegis/ai. The daily sweep
 * (evaluateObligationBreaches) + the upcoming-due reminder pass then track and
 * alert on the finalized ledger via the F-6 worker runtime.
 */
import { prisma, logAudit } from "@aegis/db";
import { extractContractKnowledge } from "./extract";
import { createObligation } from "./service";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

const DAY_MS = 86_400_000;

export interface FinalizeObligationsResult {
  contractId: string;
  extracted: number;
  created: number;
  assigned: number;
  ownerId: string | null;
  createdObligationIds: string[];
}

// ── Pure helpers (unit-tested; no DB) ────────────────────────────────

/** Canonical comparison form for an obligation description (dedupe key). */
export function normalizeObligationDescription(description: string): string {
  return (description || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Of the extracted obligations, which are not already tracked (by normalized
 * description). Also dedups within the extracted set itself. Pure.
 */
export function selectNewObligations<T extends { description: string }>(
  extracted: T[],
  existingDescriptions: Set<string>,
): T[] {
  const seen = new Set<string>(existingDescriptions);
  const out: T[] = [];
  for (const o of extracted) {
    const key = normalizeObligationDescription(o.description);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}

// ── DB ───────────────────────────────────────────────────────────────

/** Resolve the Person id to own a contract's obligations: the matter's
 *  LEAD_ATTORNEY, else the first ATTORNEY, else null. */
export async function resolveContractObligationOwner(matterId: string | null): Promise<string | null> {
  if (!matterId) return null;
  const parties = await prisma.matterParty.findMany({
    where: { matterId, role: { in: ["LEAD_ATTORNEY", "ATTORNEY"] } },
    select: { personId: true, role: true },
  });
  const lead = parties.find((p) => p.role === "LEAD_ATTORNEY");
  return (lead ?? parties[0])?.personId ?? null;
}

/**
 * Finalize a contract's obligations post-signature. Safe to call on any
 * contract; it only extracts + reconciles, never deletes. Idempotent.
 */
export async function finalizeContractObligations(
  organizationId: string,
  contractId: string,
  actor: Actor = { id: null, type: "SYSTEM" },
): Promise<FinalizeObligationsResult> {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, organizationId },
    select: { id: true, draftText: true, type: true, title: true, matterId: true },
  });
  if (!contract) throw new Error("Contract not found");

  const { obligations: extracted } = extractContractKnowledge(contract.draftText || contract.title, contract.type);

  const existing = await prisma.obligation.findMany({
    where: { organizationId, sourceType: "CONTRACT", sourceId: contractId },
    select: { id: true, description: true, ownerId: true, status: true },
  });
  const existingDescriptions = new Set(existing.map((o) => normalizeObligationDescription(o.description)));

  const ownerId = await resolveContractObligationOwner(contract.matterId);
  const toCreate = selectNewObligations(extracted, existingDescriptions);

  const now = Date.now();
  const createdObligationIds: string[] = [];
  for (const o of toCreate) {
    const created = await createObligation(
      organizationId,
      contractId,
      {
        description: o.description,
        dueDate: o.dueInDays != null ? new Date(now + o.dueInDays * DAY_MS) : null,
        recurrence: o.recurrence,
        ownerId,
      },
      { id: actor.id, type: actor.type ?? "SYSTEM" },
    );
    createdObligationIds.push(created.id);
  }

  // Assign an owner to existing unowned, still-open obligations.
  let assigned = 0;
  if (ownerId) {
    const unownedOpen = existing.filter((o) => !o.ownerId && (o.status === "OPEN" || o.status === "IN_PROGRESS"));
    if (unownedOpen.length) {
      const r = await prisma.obligation.updateMany({
        where: { id: { in: unownedOpen.map((o) => o.id) }, ownerId: null },
        data: { ownerId },
      });
      assigned = r.count;
    }
  }

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? "SYSTEM",
    action: "contract.obligations.finalized",
    resourceType: "Contract",
    resourceId: contractId,
    afterJson: { extracted: extracted.length, created: createdObligationIds.length, assigned, ownerId } as never,
    metadata: { source: "contracts", job: "obligation-finalize" } as never,
  });

  return {
    contractId,
    extracted: extracted.length,
    created: createdObligationIds.length,
    assigned,
    ownerId,
    createdObligationIds,
  };
}
