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
import { startWorkflow, autoRunCurrentAgentStep } from "@aegis/workflow";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JS agents module
import { intakeWorkflowAgentHandler } from "../agents/index.js";

// Default ladder per intake request type — so EVERY inbound ticket
// gets a governance ladder automatically, not only types an admin
// pre-bound. Matched on the ticket's type (case-insensitive substring)
// against the seeded pharma-GC library keys. Only assigned when a
// definition with that key actually exists for the org (library
// seeded); otherwise the ticket runs laddered-off, unchanged.
const DEFAULT_LADDER_RULES: Array<[RegExp, string]> = [
  [/nda|non.?disclosure|confidential/i, "nda_fasttrack"],
  [/data.?breach|dpdp|privacy incident|personal data breach/i, "data_breach"],
  [/privacy|dpia/i, "data_breach"],
  [/litigation|dispute|lawsuit|subpoena|para.?iv|patent/i, "patent_litigation"],
  [/notice/i, "legal_notice"],
  [/regulator|usfda|\bfda\b|nppa|483|warning letter/i, "regulatory_response"],
  [/vendor|supplier|due diligence|onboarding/i, "vendor_onboarding"],
  [/investigation|whistleblow|ucpmp|bribery|compliance/i, "compliance_investigation"],
  [/employment|posh|harassment|termination|disciplinary/i, "employment_matter"],
  [/board|secretarial|resolution|power of attorney/i, "board_approval"],
  [/contract|\bmsa\b|\bsow\b|agreement|licens|supply/i, "clm_contract_approval"],
];

export function defaultLadderKeyForType(type: string | null | undefined): string | null {
  const t = String(type || "");
  for (const [re, key] of DEFAULT_LADDER_RULES) if (re.test(t)) return key;
  return null;
}

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

    // Resolve which ladder to run: an explicit binding on the request
    // type wins; otherwise fall back to the default-by-type map so
    // every ticket is auto-assigned a ladder when the library exists.
    let definitionKey = requestType?.workflowKey || defaultLadderKeyForType(ticket.type);
    if (!definitionKey) return null;

    // Only start if a definition with that key actually exists for the
    // org (graceful when the library isn't seeded / no match).
    const def = await prisma.workflowDefinition.findUnique({
      where: { organizationId_key: { organizationId, key: definitionKey } },
      select: { key: true, isActive: true },
    });
    if (!def || !def.isActive) return null;
    definitionKey = def.key;

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
      definitionKey,
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

    // If the ladder starts on an AGENT step, run it now so the agent's
    // work happens automatically. Best-effort; never blocks ingest.
    await autoRunCurrentAgentStep(instance.id, intakeWorkflowAgentHandler).catch(() => {});
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
