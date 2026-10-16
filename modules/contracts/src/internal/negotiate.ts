/**
 * Playbook-driven negotiation (PR D).
 *
 * The legacy negotiation-intelligence layer (C-8) reads the KnowledgePack
 * clause library for a coarse accept/counter/escalate posture. This builds the
 * NEGOTIATE verb on the structured Playbook (PR B): per clause a concrete
 * counter drawn from the preferred → fallback(s) → walk-away ladder, the full
 * concession path the GC can pick a rung from, and — across the COUNTERPARTY
 * turn history — which clauses moved toward us, away from us, or stalled.
 *
 *   1. Counter proposal — grade the counterparty's current clause against the
 *      rule, then propose the counter language: push to our preferred when
 *      they're off-playbook, hold at the acceptable fallback when they've
 *      landed on one, or surface the walk-away when they're past every rung.
 *   2. Concession ladder — [preferred, ...fallbacks, walk-away] so the counter
 *      is an informed pick, not a single number.
 *   3. Movement — grade each clause across its COUNTERPARTY versions to see the
 *      trajectory (toward / away / stalled), and flag a contested clause that
 *      hasn't moved in two or more turns as an advisory, human-gated PENDING
 *      AgentDecision (conservative governance — nothing acts on a stale flag
 *      until a human approves it).
 *
 * Deterministic and degrade-safe: no @aegis/ai. Pure helpers are unit-tested;
 * the DB service composes them with the Playbook + the version history that
 * negotiation.ts already writes.
 */
import { prisma, logAudit, sha256Hex, AgentApprovalStatus } from "@aegis/db";
import { CLAUDE_MODEL } from "@aegis/ai";
import { getPlaybookForContract, ensureDefaultPlaybook, gradeClauseAgainstRule, type PlaybookRuleDTO, type ContractPlaybookDTO } from "./playbook";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

const AGENT_NAME = "contract-negotiator";
const RESOURCE_TYPE = "NegotiationFlag";

export type CounterAction = "accept" | "hold_fallback" | "counter_preferred" | "walk_away" | "no_position";
export type MovementDir = "toward" | "away" | "stalled" | "new" | "resolved";

export interface LadderRung {
  rung: "preferred" | "fallback" | "walk_away";
  index: number | null;
  text: string;
}

export interface CounterProposal {
  clauseType: string;
  grade: "STANDARD" | "FALLBACK" | "ESCALATE";
  action: CounterAction;
  /** The language to send back, or null when we accept as-is. */
  counterText: string | null;
  rationale: string;
  ladder: LadderRung[];
}

export interface ClauseMovement {
  clauseType: string;
  /** Oldest → newest grade across the counterparty turns (+ current). */
  trajectory: ("STANDARD" | "FALLBACK" | "ESCALATE")[];
  direction: MovementDir;
  /** Consecutive turns the graded position has not improved, from the tail. */
  stalledTurns: number;
  headline: string;
}

export interface NegotiationFlagDTO {
  decisionId: string;
  clauseType: string;
  status: "PENDING" | "APPROVED" | "APPROVED_WITH_OVERRIDE" | "REJECTED" | "AUTO_REJECTED";
  reason: string;
}

export interface NegotiationPlan {
  contractId: string;
  status: string;
  playbookId: string | null;
  turnCount: number;
  proposals: CounterProposal[];
  movement: ClauseMovement[];
  flags: NegotiationFlagDTO[];
  counts: { accept: number; holdFallback: number; counterPreferred: number; walkAway: number; noPosition: number };
  /** One-line "what moved this round" banner. */
  movedHeadline: string;
}

const humanize = (t: string): string => t.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// ── Pure core (no DB, no AI — unit-tested) ────────────────────────────

/** The full concession path for a rule: preferred, each fallback, walk-away. */
export function positionLadder(rule: Pick<PlaybookRuleDTO, "preferredText" | "fallbackTexts" | "walkAwayText">): LadderRung[] {
  const ladder: LadderRung[] = [{ rung: "preferred", index: null, text: rule.preferredText }];
  (rule.fallbackTexts || []).forEach((t, i) => { if (t && t.trim()) ladder.push({ rung: "fallback", index: i, text: t }); });
  if (rule.walkAwayText && rule.walkAwayText.trim()) ladder.push({ rung: "walk_away", index: null, text: rule.walkAwayText });
  return ladder;
}

/**
 * Propose the counter for the counterparty's current clause text.
 *   STANDARD → accept (no counter)
 *   FALLBACK → hold at their acceptable fallback (optionally push to preferred)
 *   ESCALATE → counter with our preferred; if a walk-away exists, surface it
 */
export function buildCounterProposal(
  clauseText: string,
  rule: PlaybookRuleDTO,
): CounterProposal {
  const ladder = positionLadder(rule);
  const g = gradeClauseAgainstRule(clauseText, rule);
  if (g.grade === "STANDARD") {
    return { clauseType: rule.clauseType, grade: "STANDARD", action: "accept", counterText: null, rationale: "On our standard position — accept.", ladder };
  }
  if (g.grade === "FALLBACK") {
    return {
      clauseType: rule.clauseType, grade: "FALLBACK", action: "hold_fallback",
      counterText: rule.preferredText,
      rationale: "They've landed on an acceptable fallback. Accept it, or counter once more toward our preferred language.",
      ladder,
    };
  }
  // ESCALATE — off every acceptable rung.
  const hasWalkAway = !!(rule.walkAwayText && rule.walkAwayText.trim());
  return {
    clauseType: rule.clauseType, grade: "ESCALATE",
    action: hasWalkAway && g.score < 0.2 ? "walk_away" : "counter_preferred",
    counterText: rule.preferredText,
    rationale: hasWalkAway && g.score < 0.2
      ? `Off every acceptable position. ${rule.escalationTrigger ?? "Counter with our preferred language; our walk-away is on the ladder if they won't move."}`.trim()
      : `Off our acceptable positions — counter with our preferred language. ${rule.escalationTrigger ?? rule.guidance ?? ""}`.trim(),
    ladder,
  };
}

/**
 * Trajectory of one clause across turns (oldest→newest graded positions).
 * Direction compares the newest two graded points; "stalled" when the tail is
 * a run of equal, non-STANDARD grades.
 */
export function describeMovement(clauseType: string, trajectory: ("STANDARD" | "FALLBACK" | "ESCALATE")[]): ClauseMovement {
  const rank = { ESCALATE: 0, FALLBACK: 1, STANDARD: 2 } as const;
  const label = humanize(clauseType);
  if (trajectory.length === 0) {
    return { clauseType, trajectory, direction: "new", stalledTurns: 0, headline: `${label}: no graded history.` };
  }
  const last = trajectory[trajectory.length - 1]!;
  if (trajectory.length === 1) {
    return { clauseType, trajectory, direction: "new", stalledTurns: 0, headline: `${label}: ${last.toLowerCase()} (first graded turn).` };
  }
  const prev = trajectory[trajectory.length - 2]!;
  let direction: MovementDir;
  if (rank[last] > rank[prev]) direction = last === "STANDARD" ? "resolved" : "toward";
  else if (rank[last] < rank[prev]) direction = "away";
  else direction = last === "STANDARD" ? "resolved" : "stalled";

  // Count the trailing run of equal grades (the stall depth).
  let stalledTurns = 0;
  if (direction === "stalled") {
    for (let i = trajectory.length - 1; i >= 0 && trajectory[i] === last; i--) stalledTurns++;
  }
  const headline =
    direction === "toward" ? `${label}: moved toward us (${prev.toLowerCase()} → ${last.toLowerCase()}).`
    : direction === "away" ? `${label}: moved away (${prev.toLowerCase()} → ${last.toLowerCase()}).`
    : direction === "resolved" ? `${label}: resolved to our position.`
    : `${label}: stalled at ${last.toLowerCase()} for ${stalledTurns} turns.`;
  return { clauseType, trajectory, direction, stalledTurns, headline };
}

export function movedHeadline(movement: ClauseMovement[]): string {
  const toward = movement.filter((m) => m.direction === "toward" || m.direction === "resolved").length;
  const away = movement.filter((m) => m.direction === "away").length;
  const stalled = movement.filter((m) => m.direction === "stalled" && m.stalledTurns >= 2).length;
  if (toward + away + stalled === 0) return "No graded movement across turns yet.";
  const bits: string[] = [];
  if (toward) bits.push(`${toward} moved toward us`);
  if (away) bits.push(`${away} moved away`);
  if (stalled) bits.push(`${stalled} stalled`);
  return `This round: ${bits.join(", ")}.`;
}

// ── DB service ────────────────────────────────────────────────────────

/** occurrence-stable key so same-type clauses line up across versions. */
function occKey(items: { type: string }[]): string[] {
  const seen: Record<string, number> = {};
  return items.map((it) => { const i = seen[it.type] ?? 0; seen[it.type] = i + 1; return `${it.type}#${i}`; });
}

/**
 * Build the Playbook-driven negotiation plan for a contract: per-clause
 * counters off the concession ladder, trajectory across counterparty turns,
 * and advisory PENDING flags for contested clauses that have stalled. Resolves
 * the published Playbook (backfilling a default from the clause library when
 * none is published). Stale flags are written idempotently — one PENDING
 * AgentDecision per (clauseType, turnCount), so re-reading the plan in the same
 * turn doesn't duplicate them.
 */
export async function getNegotiationPlan(organizationId: string, contractId: string, actor: Actor): Promise<NegotiationPlan> {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, organizationId },
    select: { id: true, status: true, type: true, perspective: true, clauses: { select: { type: true, text: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!contract) throw new Error("Contract not found");

  let playbook: ContractPlaybookDTO | null = await getPlaybookForContract(organizationId, { contractType: contract.type, perspective: contract.perspective });
  if (!playbook) playbook = await ensureDefaultPlaybook(organizationId, actor);
  const rules = playbook?.rules ?? [];
  const ruleByType = new Map<string, PlaybookRuleDTO>();
  for (const r of rules) if (!ruleByType.has(r.clauseType)) ruleByType.set(r.clauseType, r);

  // Counter proposals for the current clause set.
  const proposals: CounterProposal[] = [];
  const counts = { accept: 0, holdFallback: 0, counterPreferred: 0, walkAway: 0, noPosition: 0 };
  for (const c of contract.clauses) {
    const rule = ruleByType.get(c.type);
    if (!rule) {
      proposals.push({ clauseType: c.type, grade: "STANDARD", action: "no_position", counterText: null, rationale: "No playbook position on file for this clause type.", ladder: [] });
      counts.noPosition++;
      continue;
    }
    const p = buildCounterProposal(c.text, rule);
    proposals.push(p);
    if (p.action === "accept") counts.accept++;
    else if (p.action === "hold_fallback") counts.holdFallback++;
    else if (p.action === "walk_away") counts.walkAway++;
    else if (p.action === "counter_preferred") counts.counterPreferred++;
  }

  // Trajectory across COUNTERPARTY versions + the current live set.
  const counterpartyVersions = await prisma.contractVersion.findMany({
    where: { contractId, organizationId, source: "COUNTERPARTY" },
    orderBy: { version: "asc" },
    select: { version: true, clausesJson: true },
  });
  const turnCount = counterpartyVersions.length;

  // Per occurrence-key grade history. Each version's clause set keyed by
  // type#occurrence; grade each against the current rule.
  const gradeAt = (clauses: { type: string; text: string }[]): Map<string, "STANDARD" | "FALLBACK" | "ESCALATE"> => {
    const keys = occKey(clauses);
    const m = new Map<string, "STANDARD" | "FALLBACK" | "ESCALATE">();
    clauses.forEach((c, i) => {
      const rule = ruleByType.get(c.type);
      const k = keys[i];
      if (!rule || !k) return;
      m.set(k, gradeClauseAgainstRule(c.text, rule).grade);
    });
    return m;
  };

  const history = counterpartyVersions.map((v) => gradeAt(((v.clausesJson as unknown as { type: string; text: string }[]) ?? [])));
  const currentGrades = gradeAt(contract.clauses);

  // Collect every occurrence key we've seen, build a trajectory per key.
  const allKeys = new Set<string>();
  for (const h of history) for (const k of h.keys()) allKeys.add(k);
  for (const k of currentGrades.keys()) allKeys.add(k);

  const movement: ClauseMovement[] = [];
  for (const key of allKeys) {
    const clauseType = key.split("#")[0] ?? key;
    const traj: ("STANDARD" | "FALLBACK" | "ESCALATE")[] = [];
    for (const h of history) { const g = h.get(key); if (g) traj.push(g); }
    const cur = currentGrades.get(key); if (cur) traj.push(cur);
    if (traj.length === 0) continue;
    movement.push(describeMovement(clauseType, traj));
  }
  movement.sort((a, b) => b.stalledTurns - a.stalledTurns);

  // Advisory flags: a contested clause (non-STANDARD) stalled ≥2 turns.
  const flags: NegotiationFlagDTO[] = [];
  const stalled = movement.filter((m) => m.direction === "stalled" && m.stalledTurns >= 2);
  for (const m of stalled) {
    const promptHash = sha256Hex(`${contractId}:${m.clauseType}:stalled:${turnCount}`);
    // Idempotent: don't re-flag the same clause for the same turn count.
    const existing = await prisma.agentDecision.findFirst({
      where: { organizationId, agentName: AGENT_NAME, resourceType: RESOURCE_TYPE, resourceId: contractId, promptHash },
      select: { id: true, approvalStatus: true },
    });
    const tail = m.trajectory[m.trajectory.length - 1] ?? "ESCALATE";
    const reason = `${humanize(m.clauseType)} has stalled at ${tail.toLowerCase()} for ${m.stalledTurns} turns — escalate or concede a rung.`;
    if (existing) {
      flags.push({ decisionId: existing.id, clauseType: m.clauseType, status: existing.approvalStatus as NegotiationFlagDTO["status"], reason });
      continue;
    }
    const d = await prisma.agentDecision.create({
      data: {
        organizationId, resourceType: RESOURCE_TYPE, resourceId: contractId,
        agentName: AGENT_NAME, modelId: CLAUDE_MODEL, modelVersion: "deterministic-negotiate",
        promptHash, recommendationJson: { contractId, clauseType: m.clauseType, stalledTurns: m.stalledTurns, reason } as never,
        confidence: null, approvalStatus: AgentApprovalStatus.PENDING,
      },
    });
    flags.push({ decisionId: d.id, clauseType: m.clauseType, status: "PENDING", reason });
  }

  if (stalled.length > 0) {
    await logAudit({
      organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
      action: "contract.negotiation.flagged", resourceType: "Contract", resourceId: contractId,
      afterJson: { stalled: stalled.map((m) => m.clauseType), turnCount } as never,
      metadata: { source: "contracts", agent: AGENT_NAME } as never,
    });
  }

  return {
    contractId, status: contract.status, playbookId: playbook?.id ?? null, turnCount,
    proposals, movement, flags, counts, movedHeadline: movedHeadline(movement),
  };
}

/**
 * Resolve an advisory negotiation flag (the human gate). Approve acknowledges
 * the escalation; reject dismisses it. Chain-sealed. The flag never acts on its
 * own — this is the only path off PENDING.
 */
export async function resolveNegotiationFlag(
  organizationId: string,
  decisionId: string,
  action: "approve" | "reject",
  actor: Actor,
): Promise<NegotiationFlagDTO> {
  const decision = await prisma.agentDecision.findFirst({
    where: { id: decisionId, organizationId, agentName: AGENT_NAME, resourceType: RESOURCE_TYPE },
  });
  if (!decision) throw new Error("Flag not found");
  const rec = (decision.recommendationJson ?? {}) as Record<string, unknown>;
  const clauseType = String(rec.clauseType ?? "");
  const reason = String(rec.reason ?? "");
  if (decision.approvalStatus !== AgentApprovalStatus.PENDING) {
    return { decisionId: decision.id, clauseType, status: decision.approvalStatus as NegotiationFlagDTO["status"], reason };
  }
  const auditId = await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: action === "approve" ? "contract.negotiation.flag_acknowledged" : "contract.negotiation.flag_dismissed",
    resourceType: RESOURCE_TYPE, resourceId: decision.resourceId ?? "",
    afterJson: { clauseType } as never, metadata: { source: "contracts", agent: AGENT_NAME } as never,
  });
  const updated = await prisma.agentDecision.update({
    where: { id: decision.id },
    data: {
      approvalStatus: action === "approve" ? AgentApprovalStatus.APPROVED : AgentApprovalStatus.REJECTED,
      approvedById: actor.id, approvedAt: new Date(), resultingAuditLogId: auditId,
    },
  });
  return { decisionId: updated.id, clauseType, status: updated.approvalStatus as NegotiationFlagDTO["status"], reason };
}
