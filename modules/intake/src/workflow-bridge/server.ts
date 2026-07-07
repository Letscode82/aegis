/**
 * W-C — intake ↔ workflow-engine bridge.
 *
 * When a newly created ticket's request type binds a
 * `WorkflowDefinition.key` (`IntakeRequestType.workflowKey`), start an
 * approval-ladder instance on the ticket. Best-effort by design: a
 * ladder failure must never break ticket ingest — failures land as a
 * SYSTEM audit row instead of an exception.
 *
 * Resolution order: the ticket's typed `requestTypeId` first; exact
 * `name` match on an active request type as the fallback so built-in
 * form types can be laddered by configuration alone.
 *
 * Context passed to the instance: a `ticket` snapshot plus the
 * ticket's structured request-field values FLATTENED to the top level
 * (numbers/strings/booleans only) so ladder skip rules like
 * `{"field":"contract_value","op":"lt","value":10000}` can bind to
 * client-authored intake fields directly.
 */
import { prisma, logAudit } from "@aegis/db";
import { startWorkflow } from "@aegis/workflow";

export interface WorkflowBridgeTicket {
  id: string;
  type?: string | null;
  requestTypeId?: string | null;
  from?: string | null;
  dept?: string | null;
  desc?: string | null;
  priority?: string | null;
  slaHours?: number | null;
  submittedTs?: number | null;
  requestFieldValues?: Record<string, unknown> | null;
}

export async function maybeStartWorkflowForTicket(
  organizationId: string,
  ticket: WorkflowBridgeTicket,
  startedById: string,
): Promise<string | null> {
  try {
    const requestType = ticket.requestTypeId
      ? await prisma.intakeRequestType.findFirst({
          where: { id: ticket.requestTypeId, organizationId, active: true },
          select: { workflowKey: true, key: true },
        })
      : ticket.type
        ? await prisma.intakeRequestType.findFirst({
            where: { organizationId, active: true, name: ticket.type },
            select: { workflowKey: true, key: true },
          })
        : null;
    if (!requestType?.workflowKey) return null;

    // Idempotence: one ladder per ticket.
    const existing = await prisma.workflowInstance.findFirst({
      where: { organizationId, entityType: "intake_ticket", entityId: ticket.id },
      select: { id: true },
    });
    if (existing) return existing.id;

    // Flatten scalar request-field values for skip rules.
    const fieldContext: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(ticket.requestFieldValues ?? {})) {
      if (["number", "string", "boolean"].includes(typeof v)) fieldContext[k] = v;
    }

    const instance = await startWorkflow({
      organizationId,
      definitionKey: requestType.workflowKey,
      entityType: "intake_ticket",
      entityId: ticket.id,
      startedById,
      context: {
        ...fieldContext,
        ticket: {
          id: ticket.id,
          type: ticket.type ?? null,
          from: ticket.from ?? null,
          dept: ticket.dept ?? null,
          desc: ticket.desc ?? null,
          priority: ticket.priority ?? null,
          slaHours: ticket.slaHours ?? null,
          submittedTs: ticket.submittedTs ?? null,
        },
      },
    });
    return instance.id;
  } catch (err) {
    console.error("[intake:workflow-bridge] start failed:", err);
    await logAudit({
      organizationId,
      actorId: null,
      actorType: "SYSTEM",
      action: "intake.ticket.workflow_start_failed",
      resourceType: "IntakeTicket",
      resourceId: ticket.id,
      afterJson: { error: String(err).slice(0, 300) },
      metadata: { source: "workflow-bridge" },
    });
    return null;
  }
}
