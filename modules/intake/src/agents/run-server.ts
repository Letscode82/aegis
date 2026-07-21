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
import { setTrademarkResolver } from "./trademark-lookup.js";
import { processTicketWithAgent, setOkfDocResolver } from "./index.js";
import { getPublishedAgentDocument } from "./okf/store";
import { screenTrademark } from "../trademark/server";
import { lookupCounterpartyRelationship } from "../counterparty/server";
import { screenAgainstSanctions } from "../sanctions/server";
import { syncAgentDecisionForTicket } from "../agent-decision/server";
import { resolveEffectiveAgentIdForType } from "../request-types/server";

/** The recommendation fields this runner reads off the JS agent result. */
interface AgentRecShape {
  agentId?: string;
  confidence?: number;
  suggestedAction?: string;
  draftedResponse?: string;
  reasoning?: string;
  concerns?: unknown;
  precedentLinks?: unknown;
  /** GC Suite contract — approver risk checklist + playbook stamp. */
  risks?: unknown;
  playbook?: unknown;
  /** Agent 9 — SLA sized to the shortest extracted deadline. */
  proposedSlaHours?: number | null;
  alternativeTone?: string | null;
  mock?: boolean;
}

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
  // Real trademark knock-out screen for server-created tickets (no page
  // origin to fetch). GLOBAL reference data → no org scoping needed.
  setTrademarkResolver((mark: string, classes: number[]) =>
    screenTrademark(mark, classes),
  );
  // Unify the oKF execution flip with the browser path: resolve the
  // published definition straight from the DB (no page origin to fetch),
  // so an "okf" agent runs its definition on server-created tickets too.
  // orgId rides the per-run AsyncLocalStorage.
  setOkfDocResolver((agentKey: string) =>
    getPublishedAgentDocument(currentOrgId(), agentKey),
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
  /** Current SLA window (hours) — Agent 9's deadline-derived SLA is
   *  applied only when tighter than this. */
  slaHours?: number | null;
  /** Receipt epoch ms — computed notice periods anchor to this. */
  submittedTs?: number | null;
  /** Configured request type of this ticket, if any (program #5). */
  requestTypeId?: string | null;
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

    // Program #5 + ladder binding — honour the request type's effective
    // agent: explicit preferredAgentId, else the bound ladder's first
    // AGENT-step agent. This is what makes "I bound an agent to my ladder
    // step" actually process the ticket.
    let preferredAgentId: string | undefined;
    if (ticket.requestTypeId) {
      preferredAgentId = (await resolveEffectiveAgentIdForType(organizationId, ticket.requestTypeId)) ?? undefined;
    }

    // processTicketWithAgent comes from the JS agent registry; the
    // recommendation shape is JS-defined, so assert it to a typed view.
    const outcome = (await processTicketWithAgent(t, undefined, preferredAgentId)) as unknown as {
      agent: { id: string } | null;
      recommendation: AgentRecShape | null;
    };
    const agent = outcome.agent;
    const recommendation = outcome.recommendation;
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
        risksJson: (rec.risks ?? []) as never,
        playbookJson: (rec.playbook ?? null) as never,
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

    // Agent 9 (Notice Management) — apply the deadline-derived SLA when
    // TIGHTER than the current one (an agent can accelerate a clock,
    // never relax it). Chain-sealed audit row records the tightening.
    const proposed = rec.proposedSlaHours;
    const currentSla =
      typeof ticket.slaHours === "number" ? ticket.slaHours : 24;
    const tightenedSla =
      typeof proposed === "number" && proposed > 0 && proposed < currentSla
        ? Math.round(proposed)
        : null;
    await prisma.intakeTicket.update({
      where: { id: ticket.id },
      data: {
        agentProcessedAt: now,
        ...(tightenedSla ? { slaHours: tightenedSla } : {}),
      },
    });
    if (tightenedSla) {
      await logAudit({
        organizationId,
        actorId: null,
        actorType: "AGENT",
        action: "intake.ticket.sla_tightened",
        resourceType: "IntakeTicket",
        resourceId: ticket.id,
        beforeJson: { slaHours: currentSla },
        afterJson: { slaHours: tightenedSla, source: "deadline-extraction" },
        metadata: { agentId },
      });
    }

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
  slaHours?: number | null;
  submittedTs?: number | null;
  requestTypeId?: string | null;
}): Promise<ServerAgentResult> {
  return runAgentForTicketServer(input.organizationId, {
    id: input.ticketId,
    from: input.from,
    dept: input.dept,
    type: input.type,
    priority: input.priority,
    desc: input.desc,
    slaHours: input.slaHours ?? null,
    submittedTs: input.submittedTs ?? null,
    requestTypeId: input.requestTypeId ?? null,
  });
}
