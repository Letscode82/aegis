/**
 * Governed-action intake record (two-tier model).
 *
 * ONE Legal runs two tiers of request. Tier 1 (assistance — ask, analyze,
 * deep review, research, draft) needs no approval ladder and leaves no
 * ticket. Tier 2 (a governed mutation: open a matter, draft a contract, file
 * a DSAR, create/notice a legal hold, start a review) is human-approved in
 * the console, executes through the universal governed gate
 * (`executeGovernedTool`), and THEN back-fills a tracking intake ticket here
 * so the governed action carries a REQ number and surfaces in the intake
 * queue, linked to the resource it created.
 *
 * This is a sanctioned, dedicated create path — deliberately NOT the
 * `saveTicketsV8` chokepoint. The governed action already ran (resource +
 * AgentDecision + chain-sealed audit all exist), so this record must not
 * re-run routing rules or re-spawn a matter/contract. It writes one
 * `intake.ticket.created` audit row of its own, the same canonical action the
 * chokepoint uses, so the ledger stays complete.
 *
 * Fail-loud discipline (CLAUDE.md "Auto-create patterns are seed/dev only"):
 * the requester is the acting user's Person. If that Person can't be
 * resolved, the tracking ticket is skipped — never fabricated — because the
 * governed action and its evidence row already stand on their own.
 *
 * Server-only. Reached from the composition root (apps/web) via
 * `@aegis/intake/governed`; never imported by another module's internals.
 */
import {
  prisma,
  logAudit,
  nextRequestNumberInTx,
  IntakeSource,
  IntakeStatus,
} from "@aegis/db";

export interface GovernedActionTicketInput {
  organizationId: string;
  /** The acting (human-approving) user — becomes assignee + audit actor. */
  actor: { id: string; name?: string | null };
  /** The governed tool that ran (id + display label). */
  tool: { id: string; label: string };
  /** The free-text request the action was derived from. */
  requestText: string;
  /** The resource the governed action produced / acted on. */
  resource: { type: string; id: string; label: string; navigate: string };
  /** Typed matter link when the resource is (or hangs off) a matter. */
  matterId?: string | null;
}

export interface GovernedActionTicketResult {
  /** The minted "REQ-<n>" id, also the ticket's primary key. */
  ticketId: string;
}

/** Human-facing intake "type" label per governed tool. */
const TOOL_TYPE_LABEL: Readonly<Record<string, string>> = Object.freeze({
  "matter.create": "Matter — opened via ONE Legal",
  "contracts.draft": "Contract — drafted via ONE Legal",
  "privacy.dsar.create": "DSAR — filed via ONE Legal",
  "matter.legalhold.create": "Legal Hold — created via ONE Legal",
  "matter.legalhold.notice": "Hold Notice — issued via ONE Legal",
  "matter.review.start": "Document Review — started via ONE Legal",
  "spend.invoice.review": "Invoice Review — run via ONE Legal",
});

/**
 * Back-fill the tracking intake ticket for a governed ONE Legal action.
 * Returns the minted REQ id, or null when no requester Person resolves (the
 * governed action is unaffected either way).
 */
export async function recordGovernedActionTicket(
  input: GovernedActionTicketInput,
): Promise<GovernedActionTicketResult | null> {
  const { organizationId, actor } = input;

  const person = await prisma.person.findFirst({
    where: { organizationId, userId: actor.id },
    select: { id: true },
  });
  if (!person) return null;

  const desc = input.requestText.replace(/\s+/g, " ").trim().slice(0, 2000);
  const typeLabel =
    TOOL_TYPE_LABEL[input.tool.id] || `${input.tool.label} — via ONE Legal`;

  // Reserve the REQ number and insert the ticket in one advisory-locked
  // transaction so concurrent governed actions can't mint the same id.
  const ticketId = await prisma.$transaction(async (tx) => {
    const id = await nextRequestNumberInTx(tx, organizationId);
    await tx.intakeTicket.create({
      data: {
        id,
        organizationId,
        requesterId: person.id,
        matterId: input.matterId ?? null,
        source: IntakeSource.COPILOT,
        type: typeLabel,
        priority: "Medium",
        // The action was already approved + executed in the console, so this
        // record lands IN the working queue — not awaiting triage, not
        // closed. It tracks live governed work and links back to the resource.
        status: IntakeStatus.IN_REVIEW,
        stage: "triaged",
        description: desc || typeLabel,
        assignedTo: actor.name || "ONE Legal",
        assignedToUserId: actor.id,
        slaHours: 24,
        slaStatus: "On Track",
        aiTriageJson: {
          source: "one-legal",
          governed: true,
          toolId: input.tool.id,
          resourceType: input.resource.type,
          resourceId: input.resource.id,
          resourceLabel: input.resource.label,
          navigate: input.resource.navigate,
        } as never,
        workflowJson: [
          { label: "Requested (ONE Legal)", done: true },
          { label: `Approved — ${input.tool.label}`, done: true },
          { label: `Created ${input.resource.label}`, done: true },
          { label: "Working", active: true },
        ] as never,
      },
    });
    return id;
  });

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.ticket.created",
    resourceType: "IntakeTicket",
    resourceId: ticketId,
    afterJson: {
      status: "IN_REVIEW",
      source: "copilot",
      governed: true,
      toolId: input.tool.id,
    },
    metadata: {
      source: "one-legal",
      governed: true,
      resourceType: input.resource.type,
      resourceId: input.resource.id,
    },
  });

  return { ticketId };
}
