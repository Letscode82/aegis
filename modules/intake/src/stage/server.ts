/**
 * W1-5 · Stage advancement — operable, server-enforced stage workflows
 * (issue #107).
 *
 * Moves a ticket one step through its stage sequence: the configured
 * request-type stages when the ticket was filed under a type, else the
 * legacy five-stage demo sequence. Transitions are advance-only (no
 * skipping), audited (`intake.ticket.stage_advanced`), and stamp an
 * append-only [{stage, at}] trail that feeds per-stage TAT and the
 * W2-4 multi-leg SLA legs.
 *
 * Server-only — imports @aegis/db.
 */
import { prisma, logAudit, getCurrentUser } from "@aegis/db";

export const LEGACY_STAGES = ["new", "triage", "assigned", "review", "complete"] as const;

const LEGACY_STATUS: Record<string, string> = {
  triage: "Triage",
  assigned: "Assigned",
  review: "In Review",
  complete: "Completed",
};

export class StageTicketNotFoundError extends Error {
  constructor(id: string) {
    super(`Intake ticket ${id} not found`);
    this.name = "StageTicketNotFoundError";
  }
}
export class FinalStageError extends Error {
  constructor(stage: string) {
    super(`Ticket is already at its final stage ("${stage}").`);
    this.name = "FinalStageError";
  }
}

/** Pure: given the current stage and the (possibly empty) configured
 *  type stages, compute the next stage + which sequence applied. A
 *  configured ticket whose stage predates the sequence (e.g. "new")
 *  advances into the sequence's first stage. */
export function computeStageAdvance(
  currentStage: string,
  typeStages: string[],
): { next: string; sequence: "configured" | "legacy"; index: number } {
  if (typeStages.length > 0) {
    const idx = typeStages.indexOf(currentStage);
    if (idx === typeStages.length - 1) throw new FinalStageError(currentStage);
    return { next: typeStages[idx + 1] ?? typeStages[0], sequence: "configured", index: idx + 1 };
  }
  const idx = LEGACY_STAGES.indexOf(currentStage as (typeof LEGACY_STAGES)[number]);
  if (idx === LEGACY_STAGES.length - 1) throw new FinalStageError(currentStage);
  const next = LEGACY_STAGES[idx + 1] ?? LEGACY_STAGES[1];
  return { next, sequence: "legacy", index: idx + 1 };
}

/** Rebuild the visible workflow steps for a configured sequence. */
export function buildConfiguredWorkflow(stages: string[], activeIdx: number) {
  return [
    { label: "Submitted", done: true },
    ...stages.map((s, i) => ({
      label: s,
      ...(i < activeIdx ? { done: true } : {}),
      ...(i === activeIdx ? { active: true } : {}),
    })),
    { label: "Close" },
  ];
}

export interface AdvanceStageResult {
  stage: string;
  status: string | null;
  workflow: unknown;
  stageTimestamps: Array<{ stage: string; at: string }>;
}

type Ctx = {
  req?: { headers: Record<string, string | string[] | undefined> };
  res?: unknown;
};

export async function advanceTicketStage(
  organizationId: string,
  ticketId: string,
  ctx: Ctx = {},
): Promise<AdvanceStageResult> {
  const ticket = await prisma.intakeTicket.findFirst({
    where: { id: ticketId, organizationId },
    select: {
      id: true,
      stage: true,
      status: true,
      requestTypeId: true,
      workflowJson: true,
      stageTimestampsJson: true,
    },
  });
  if (!ticket) throw new StageTicketNotFoundError(ticketId);

  // Configured sequence, when the ticket was filed under a type.
  let typeStages: string[] = [];
  if (ticket.requestTypeId) {
    const rt = await prisma.intakeRequestType.findFirst({
      where: { id: ticket.requestTypeId, organizationId },
      select: { stagesJson: true },
    });
    if (rt && Array.isArray(rt.stagesJson)) typeStages = rt.stagesJson as string[];
  }

  const { next, sequence, index } = computeStageAdvance(ticket.stage, typeStages);

  const stamps = Array.isArray(ticket.stageTimestampsJson)
    ? [...(ticket.stageTimestampsJson as Array<{ stage: string; at: string }>)]
    : [];
  stamps.push({ stage: next, at: new Date().toISOString() });

  // Legacy sequence mirrors the old client behavior (status + workflow
  // step flags); configured sequences own their workflow rendering and
  // leave the triage status untouched.
  let newStatus: string | null = null;
  let workflow: unknown = ticket.workflowJson;
  if (sequence === "legacy") {
    newStatus = LEGACY_STATUS[next] ?? null;
    const steps = Array.isArray(ticket.workflowJson)
      ? (ticket.workflowJson as Array<{ label: string }>)
      : [];
    workflow = steps.map((s, i) => ({
      ...s,
      done: i <= index - 1 || next === "complete",
      active: i === index && next !== "complete",
    }));
  } else {
    workflow = buildConfiguredWorkflow(typeStages, index);
  }

  // Status is deliberately NOT written here: the display status string
  // ("In Review") maps to the IntakeStatus enum inside the storage
  // chokepoint. We return it and the client persists it through the
  // normal save path, keeping one status-mapping codepath.
  await prisma.intakeTicket.update({
    where: { id: ticketId },
    data: {
      stage: next,
      workflowJson: workflow as never,
      stageTimestampsJson: stamps as never,
    },
  });

  const actor = await getCurrentUser(ctx.req, ctx.res);
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.ticket.stage_advanced",
    resourceType: "IntakeTicket",
    resourceId: ticketId,
    beforeJson: { stage: ticket.stage },
    afterJson: { stage: next },
    metadata: { sequence },
  });

  return { stage: next, status: newStatus, workflow, stageTimestamps: stamps };
}
