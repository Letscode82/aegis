/**
 * Turn-based contract negotiation (CLM Phase 4b).
 *
 * The counterparty round-trip (review tokens) already lets an external
 * contact ACCEPT / COUNTER / COMMENT on a draft, chain-sealed. This closes
 * the loop on the internal side: when a counterparty counters, the attorney
 * applies their proposed changes to the working `draftText` and this records
 * a NEGOTIATION TURN — a new COUNTERPARTY-source contract version whose
 * redline (and optional AI change-narrative, Phase 3b) shows exactly what
 * moved this round. Turns are derived from the COUNTERPARTY version history,
 * so the count is always reconstructable from the ledger.
 *
 * Nothing here auto-accepts: applying a turn re-extracts the clause set and
 * moves the contract into IN_NEGOTIATION, but the attorney still drives
 * approve / execute through the gated lifecycle routes. Governance is the
 * product.
 *
 * Reuse-first: the clause replacement + snapshot is the Phase 3a
 * re-extractor with a COUNTERPARTY result source; no new extraction logic.
 */
import { prisma, logAudit } from "@aegis/db";
import { reExtractContractClauses } from "./reextract";
import { transitionContractStatus } from "./service";
import { allowedContractTransitions } from "./contract-state-machine";
import { getContractReviewActivity } from "./review-token";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

export interface NegotiationTurnSummary {
  version: number;
  label: string;
  createdAt: string;
}

export interface NegotiationState {
  status: string;
  draftText: string | null;
  turnCount: number;
  turns: NegotiationTurnSummary[];
  /** The most recent counterparty verdict, if any — drives the "apply" CTA. */
  lastCounterparty: { action: string; decision: string | null; comment: string | null; personName: string | null; at: string } | null;
}

export interface ApplyTurnResult {
  turn: number;
  newVersion: number | null;
  clauseCount: number;
  deviationCount: number;
  status: string;
}

const CONTERPARTY_ACTIONS = new Set(["contract.review.countered", "contract.review.commented"]);

/** Read the negotiation state for the drill-in panel. */
export async function getNegotiationState(organizationId: string, contractId: string): Promise<NegotiationState> {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, organizationId },
    select: { status: true, draftText: true },
  });
  if (!contract) throw new Error("Contract not found");

  const turnRows = await prisma.contractVersion.findMany({
    where: { organizationId, contractId, source: "COUNTERPARTY" },
    orderBy: { version: "asc" },
    select: { version: true, label: true, createdAt: true },
  });

  let lastCounterparty: NegotiationState["lastCounterparty"] = null;
  try {
    const activity = await getContractReviewActivity(organizationId, contractId);
    const ev = activity.events.find((e) => CONTERPARTY_ACTIONS.has(e.action));
    if (ev) lastCounterparty = { action: ev.action, decision: ev.decision, comment: ev.comment, personName: ev.personName, at: ev.at };
  } catch { /* review activity is best-effort context */ }

  return {
    status: contract.status,
    draftText: contract.draftText ?? null,
    turnCount: turnRows.length,
    turns: turnRows.map((t) => ({ version: t.version, label: t.label, createdAt: t.createdAt.toISOString() })),
    lastCounterparty,
  };
}

/**
 * Apply a counterparty negotiation turn: persist the revised draft body,
 * re-extract the clause set into a new COUNTERPARTY version, and move the
 * contract into IN_NEGOTIATION (when the state machine allows it). Chain-
 * sealed. Returns the turn number + resulting version for the redline.
 */
export async function applyCounterpartyTurn(
  organizationId: string,
  contractId: string,
  newDraftText: string,
  actor: Actor,
  opts?: { note?: string | null },
): Promise<ApplyTurnResult> {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, organizationId },
    select: { id: true, status: true },
  });
  if (!contract) throw new Error("Contract not found");
  if (!newDraftText || !newDraftText.trim()) throw new Error("Revised draft text is required to apply a turn");
  if (contract.status === "EXECUTED" || contract.status === "TERMINATED") {
    throw new Error(`Cannot negotiate a ${contract.status} contract`);
  }

  const priorTurns = await prisma.contractVersion.count({ where: { contractId, source: "COUNTERPARTY" } });
  const turn = priorTurns + 1;

  // Persist the working body, then re-extract into a COUNTERPARTY version.
  await prisma.contract.update({ where: { id: contractId }, data: { draftText: newDraftText } });
  const ext = await reExtractContractClauses(organizationId, contractId, newDraftText, actor, {
    beforeLabel: `Before counterparty turn ${turn}`,
    resultLabel: `Counterparty turn ${turn}`,
    resultSource: "COUNTERPARTY",
  });

  // Reflect active negotiation in the lifecycle when the transition is legal.
  let status: string = contract.status;
  if (status !== "IN_NEGOTIATION" && allowedContractTransitions(contract.status).includes("IN_NEGOTIATION")) {
    const updated = await transitionContractStatus(organizationId, contractId, "IN_NEGOTIATION", actor);
    status = updated.status;
  }

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
    action: "contract.negotiation.turn_applied",
    resourceType: "Contract",
    resourceId: contractId,
    afterJson: { turn, newVersion: ext.newVersion, clauseCount: ext.clauseCount, deviationCount: ext.deviationCount, note: opts?.note ?? null } as never,
    metadata: { source: "contracts", turn } as never,
  });

  return { turn, newVersion: ext.newVersion, clauseCount: ext.clauseCount, deviationCount: ext.deviationCount, status };
}
