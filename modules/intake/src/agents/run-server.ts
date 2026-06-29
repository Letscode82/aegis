/**
 * Server-side agent execution (hardening — server-side triage).
 *
 * The intake agents were written to run in the browser: they call Claude
 * and the counterparty / sanctions helpers via *relative* fetch, which
 * only resolves with a page origin. So a ticket created server-side
 * (email webhook, M365 mailbox poll) used to sit untriaged until a human
 * opened the Cockpit, where the client store ran the agent.
 *
 * This runner runs the SAME agents in-process so a server-created ticket
 * is triaged on arrival:
 *   - installs the direct Anthropic transport (callClaude works server-side);
 *   - injects DB-backed resolvers for the two helper lookups;
 *   - routes + runs the agent, then persists the AgentRecommendation, the
 *     PENDING AgentDecision (the conservative-AI gate — still requires the
 *     attorney's approve keystroke), sets agentProcessedAt, and writes a
 *     chain-sealed audit row.
 *
 * Org scoping for the counterparty lookup rides an AsyncLocalStorage so
 * concurrent runs for different orgs can share the one injected resolver
 * without cross-talk.
 *
 * Server-only — imports @aegis/db + @aegis/ai/server.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { prisma, logAudit, AgentRecommendationStatus } from "@aegis/db";
import { ensureServerClaudeTransport } from "@aegis/ai/server";
import { setCounterpartyResolver } from "./counterparty-lookup.js";
import { setSanctionsResolver } from "./sanctions-lookup.js";
import { processTicketWithAgent } from "./index.js";
import { lookupCounterpartyRelationship } from "../counterparty/server";
import { screenAgainstSanctions } from "../sanctions/server";
import { syncAgentDecisionForTicket } from "../agent-decision/server";

interface RunContext {
  organizationId: string;
}
const als = new AsyncLocalStorage<RunContext>();

function currentOrgId(): string {
  const store = als.getStore();
  if (!store) throw new Error("[agent-run] no run context — organizationId unavailable");
  return store.organizationId;
}

let _wired = false;
/** Install the server transport + DB resolvers once per process. The
 * counterparty resolver reads orgId from the per-run AsyncLocalStorage,
 * so it stays correct under concurrency without being re-set per call. */
function ensureWiring(): void {
  if (_wired) return;
  ensureServerClaudeTransport();
  setCounterpartyResolver((name: string) =>
    lookupCounterpartyRelationship(currentOrgId(), name),
  );
  setSanctionsResolver((name: string, country: string) =>
    screenAgainstSanctions(name, country),
  );
  _wired = true;
}

export interface ServerAgentTicket {
  id: string;
  from?: string | null;
  dept?: string | null;
  type?: string | null;
  priority?: string | null;
  desc?: string | null;
}

export interface ServerAgentResult {
  agentId: string | null;
  suggestedAction: string | null;
  confidence: number | null;
  degraded: boolean;
}

/**
 * Route + run the best-fit agent for a server-created ticket and persist
 * the result. Best-effort: agent errors degrade to a flag-for-review
 * recommendation (the agents' own fallback), never throwing into the
 * ingest path. Returns a summary for the caller / audit.
 */
export async function runAgentForTicketServer(
  organizationId: string,
  ticket: ServerAgentTicket,
): Promise<ServerAgentResult> {
  ensureWiring();
  return als.run({ organizationId }, async () => {
    const t = {
      id: ticket.id,
      from: ticket.from ?? "",
      dept: ticket.dept ?? "",
      type: ticket.type ?? "",
      priority: ticket.priority ?? "Medium",
      desc: ticket.desc ?? "",
    };

    const { agent, recommendation } = await processTicketWithAgent(t, undefined);
    const now = new Date();

    if (!agent || !recommendation) {
      await prisma.intakeTicket.update({
        where: { id: ticket.id },
        data: { agentProcessedAt: now },
      });
      await logAudit({
        organizationId,
        actorId: null,
        actorType: "SYSTEM",
        action: "intake.ticket.agent_no_match",
        resourceType: "IntakeTicket",
        resourceId: ticket.id,
        afterJson: { type: t.type, descSnippet: (t.desc || "").slice(0, 80) },
        metadata: { source: "server-agent-runner" },
      });
      return { agentId: null, suggestedAction: null, confidence: null, degraded: false };
    }

    const rec = recommendation;
    const agentId = rec.agentId ?? agent.id;
    const degraded = rec.mock === true;

    await prisma.agentRecommendation.deleteMany({ where: { ticketId: ticket.id } });
    await prisma.agentRecommendation.create({
      data: {
        ticketId: ticket.id,
        agentId,
        confidence: rec.confidence ?? 0,
        suggestedAction: rec.suggestedAction ?? "review",
        draftedResponse: rec.draftedResponse ?? "",
        reasoning: rec.reasoning ?? "",
        concerns: (rec.concerns ?? []) as never,
        citations: (rec.precedentLinks ?? []) as never,
        shortFormReply: rec.alternativeTone ?? null,
        status: AgentRecommendationStatus.PENDING,
        reviewedBy: null,
        reviewedAt: null,
      },
    });

    // Conservative-AI: a PENDING decision the attorney's approve keystroke
    // must still resolve before any downstream mutation (matter spawn).
    await syncAgentDecisionForTicket({
      organizationId,
      ticketId: ticket.id,
      rec: {
        agentId,
        confidence: rec.confidence,
        suggestedAction: rec.suggestedAction,
        draftedResponse: rec.draftedResponse,
        reasoning: rec.reasoning,
        mock: degraded,
      },
      action: null,
    });

    await prisma.intakeTicket.update({
      where: { id: ticket.id },
      data: { agentProcessedAt: now },
    });

    await logAudit({
      organizationId,
      actorId: null,
      actorType: "AGENT",
      action: "intake.recommendation.generated",
      resourceType: "IntakeTicket",
      resourceId: ticket.id,
      afterJson: {
        agentId,
        suggestedAction: rec.suggestedAction ?? null,
        confidence: rec.confidence ?? null,
        degraded,
      },
      metadata: { source: "server-agent-runner" },
    });

    return {
      agentId,
      suggestedAction: rec.suggestedAction ?? null,
      confidence: rec.confidence ?? null,
      degraded,
    };
  });
}

/**
 * Adapter matching the email-ingest `triage` hook shape, so the webhook
 * and the mailbox poller can pass it straight through.
 */
export function serverTriageRunner(input: {
  organizationId: string;
  ticketId: string;
  from?: string | null;
  dept?: string | null;
  type?: string | null;
  priority?: string | null;
  desc?: string | null;
}): Promise<ServerAgentResult> {
  return runAgentForTicketServer(input.organizationId, {
    id: input.ticketId,
    from: input.from,
    dept: input.dept,
    type: input.type,
    priority: input.priority,
    desc: input.desc,
  });
}
