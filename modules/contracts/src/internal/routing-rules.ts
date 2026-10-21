/**
 * Configurable contract approval routing (redesign PR 5).
 *
 * PR 3 made ladder selection request-driven in code (`selectApprovalLadder`):
 * an NDA fast-tracks, everything else takes the full ladder. This adds the
 * admin-editable layer on top — an org can set its OWN rules mapping a contract
 * condition (type substring / perspective / value range) to the ladder to run,
 * so "deals over $250k go to the GC-heavy ladder" or "vendor paper uses the
 * fast review ladder" is configuration, not a code change.
 *
 * `resolveLadderForContract` in approval.ts evaluates enabled rules in
 * `evalOrder`; the first match whose ladder is actually seeded wins, else it
 * falls back to the code default. The pure evaluator (`matchContractRoutingRule`)
 * is unit-tested; the CRUD writes chain-sealed `contract.routing_rule.*` audit
 * rows — editing automation behavior is a governance event.
 */
import { prisma, logAudit, type ContractPerspective } from "@aegis/db";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

export interface ContractRoutingRuleDTO {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  evalOrder: number;
  matchType: string | null;
  matchPerspective: ContractPerspective | null;
  minValue: number | null;
  maxValue: number | null;
  setLadderKey: string;
  timesFired: number;
  lastFiredAt: string | null;
}

type RuleRow = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  evalOrder: number;
  matchType: string | null;
  matchPerspective: ContractPerspective | null;
  minValue: number | null;
  maxValue: number | null;
  setLadderKey: string;
  timesFired: number;
  lastFiredAt: Date | null;
};

function toDTO(r: RuleRow): ContractRoutingRuleDTO {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    enabled: r.enabled,
    evalOrder: r.evalOrder,
    matchType: r.matchType,
    matchPerspective: r.matchPerspective,
    minValue: r.minValue,
    maxValue: r.maxValue,
    setLadderKey: r.setLadderKey,
    timesFired: r.timesFired,
    lastFiredAt: r.lastFiredAt?.toISOString() ?? null,
  };
}

// ── Pure evaluator (no DB — unit-tested) ─────────────────────────────

export interface ContractMatchInput {
  type?: string | null;
  perspective?: ContractPerspective | null;
  value?: number | null;
}

/** Does this one rule match the contract? All non-null conditions AND together;
 *  a rule with no conditions never matches (guards against match-everything). */
export function ruleMatchesContract(rule: ContractRoutingRuleDTO, c: ContractMatchInput): boolean {
  const hasCondition =
    !!rule.matchType || !!rule.matchPerspective || rule.minValue != null || rule.maxValue != null;
  if (!hasCondition) return false;

  if (rule.matchType) {
    const t = String(c.type || "").toLowerCase();
    if (!t.includes(rule.matchType.toLowerCase())) return false;
  }
  if (rule.matchPerspective) {
    if ((c.perspective ?? null) !== rule.matchPerspective) return false;
  }
  if (rule.minValue != null || rule.maxValue != null) {
    const v = c.value;
    if (v == null) return false; // a value condition can't match a valueless contract
    if (rule.minValue != null && v < rule.minValue) return false;
    if (rule.maxValue != null && v > rule.maxValue) return false;
  }
  return true;
}

/** First matching rule, evaluated in `evalOrder` (callers pass them sorted). */
export function matchContractRoutingRule(
  rules: ContractRoutingRuleDTO[],
  c: ContractMatchInput,
): ContractRoutingRuleDTO | null {
  for (const r of rules) {
    if (r.enabled && ruleMatchesContract(r, c)) return r;
  }
  return null;
}

const RULE_SELECT = {
  id: true,
  name: true,
  description: true,
  enabled: true,
  evalOrder: true,
  matchType: true,
  matchPerspective: true,
  minValue: true,
  maxValue: true,
  setLadderKey: true,
  timesFired: true,
  lastFiredAt: true,
} as const;

// ── Reads ────────────────────────────────────────────────────────────

/** All rules for the admin screen (disabled included), in evaluation order. */
export async function listContractRoutingRules(organizationId: string): Promise<ContractRoutingRuleDTO[]> {
  const rows = await prisma.contractRoutingRule.findMany({
    where: { organizationId },
    select: RULE_SELECT,
    orderBy: { evalOrder: "asc" },
  });
  return rows.map(toDTO);
}

/** Enabled rules only, in evaluation order — for the approval resolver. */
export async function loadEnabledContractRoutingRules(organizationId: string): Promise<ContractRoutingRuleDTO[]> {
  const rows = await prisma.contractRoutingRule.findMany({
    where: { organizationId, enabled: true },
    select: RULE_SELECT,
    orderBy: { evalOrder: "asc" },
  });
  return rows.map(toDTO);
}

/** Bump the effectiveness counter after a rule fires during submission. */
export async function recordContractRoutingRuleFired(ruleId: string): Promise<void> {
  await prisma.contractRoutingRule
    .update({ where: { id: ruleId }, data: { timesFired: { increment: 1 }, lastFiredAt: new Date() } })
    .catch(() => {}); // best-effort — never block the submission on a counter
}

// ── Mutations ──────────────────────────────────────────────────────────

export class ContractRoutingRuleNotFoundError extends Error {
  constructor(id: string) {
    super(`Contract routing rule ${id} not found`);
    this.name = "ContractRoutingRuleNotFoundError";
  }
}
export class ContractRoutingRuleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractRoutingRuleValidationError";
  }
}

export interface ContractRoutingRuleInput {
  name?: string;
  description?: string | null;
  enabled?: boolean;
  evalOrder?: number;
  matchType?: string | null;
  matchPerspective?: ContractPerspective | null;
  minValue?: number | null;
  maxValue?: number | null;
  setLadderKey?: string;
}

/** A rule needs a name, a ladder to route to, at least one condition, and a
 *  sane value range. Validated post-merge so an update can patch a subset. */
function assertRuleSemantics(m: {
  name: string;
  matchType: string | null;
  matchPerspective: ContractPerspective | null;
  minValue: number | null;
  maxValue: number | null;
  setLadderKey: string;
}) {
  if (!m.name || m.name.trim().length === 0) {
    throw new ContractRoutingRuleValidationError("Rule name is required");
  }
  if (!m.setLadderKey || m.setLadderKey.trim().length === 0) {
    throw new ContractRoutingRuleValidationError("A rule must set a ladder to route to (setLadderKey).");
  }
  const hasCondition = !!m.matchType || !!m.matchPerspective || m.minValue != null || m.maxValue != null;
  if (!hasCondition) {
    throw new ContractRoutingRuleValidationError(
      "A rule needs at least one condition (type / perspective / value range).",
    );
  }
  if (m.minValue != null && m.maxValue != null && m.minValue > m.maxValue) {
    throw new ContractRoutingRuleValidationError("minValue cannot be greater than maxValue.");
  }
}

function nn<T>(v: T | undefined | null): T | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || (v as unknown) === "") return null;
  return v;
}

function auditSnapshot(r: RuleRow) {
  return {
    name: r.name,
    enabled: r.enabled,
    evalOrder: r.evalOrder,
    conditions: { matchType: r.matchType, matchPerspective: r.matchPerspective, minValue: r.minValue, maxValue: r.maxValue },
    setLadderKey: r.setLadderKey,
  };
}

export async function createContractRoutingRule(
  organizationId: string,
  input: ContractRoutingRuleInput,
  actor: Actor,
): Promise<ContractRoutingRuleDTO> {
  const merged = {
    name: input.name ?? "",
    description: input.description ?? null,
    enabled: input.enabled ?? true,
    evalOrder: input.evalOrder ?? 100,
    matchType: input.matchType ?? null,
    matchPerspective: input.matchPerspective ?? null,
    minValue: input.minValue ?? null,
    maxValue: input.maxValue ?? null,
    setLadderKey: input.setLadderKey ?? "",
  };
  assertRuleSemantics(merged);

  const created = await prisma.contractRoutingRule.create({ data: { organizationId, ...merged }, select: RULE_SELECT });
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? "USER",
    action: "contract.routing_rule.created",
    resourceType: "ContractRoutingRule",
    resourceId: created.id,
    afterJson: auditSnapshot(created) as never,
    metadata: { ruleName: merged.name },
  });
  return toDTO(created);
}

export async function updateContractRoutingRule(
  organizationId: string,
  ruleId: string,
  input: ContractRoutingRuleInput,
  actor: Actor,
): Promise<ContractRoutingRuleDTO> {
  const before = await prisma.contractRoutingRule.findFirst({ where: { id: ruleId, organizationId }, select: RULE_SELECT });
  if (!before) throw new ContractRoutingRuleNotFoundError(ruleId);

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = nn(input.description);
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.evalOrder !== undefined) patch.evalOrder = input.evalOrder;
  if (input.matchType !== undefined) patch.matchType = nn(input.matchType);
  if (input.matchPerspective !== undefined) patch.matchPerspective = nn(input.matchPerspective);
  if (input.minValue !== undefined) patch.minValue = input.minValue; // null clears
  if (input.maxValue !== undefined) patch.maxValue = input.maxValue;
  if (input.setLadderKey !== undefined) patch.setLadderKey = input.setLadderKey;

  const pick = <K extends keyof RuleRow>(k: K): RuleRow[K] =>
    Object.prototype.hasOwnProperty.call(patch, k) ? (patch as Record<K, RuleRow[K]>)[k] : before[k];
  assertRuleSemantics({
    name: pick("name"),
    matchType: pick("matchType"),
    matchPerspective: pick("matchPerspective"),
    minValue: pick("minValue"),
    maxValue: pick("maxValue"),
    setLadderKey: pick("setLadderKey"),
  });

  const updated = await prisma.contractRoutingRule.update({ where: { id: ruleId }, data: patch, select: RULE_SELECT });
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? "USER",
    action: "contract.routing_rule.updated",
    resourceType: "ContractRoutingRule",
    resourceId: ruleId,
    beforeJson: auditSnapshot(before) as never,
    afterJson: auditSnapshot(updated) as never,
    metadata: { ruleName: updated.name },
  });
  return toDTO(updated);
}

export async function setContractRoutingRuleEnabled(
  organizationId: string,
  ruleId: string,
  enabled: boolean,
  actor: Actor,
): Promise<ContractRoutingRuleDTO> {
  return updateContractRoutingRule(organizationId, ruleId, { enabled }, actor);
}

export async function deleteContractRoutingRule(
  organizationId: string,
  ruleId: string,
  actor: Actor,
): Promise<void> {
  const before = await prisma.contractRoutingRule.findFirst({ where: { id: ruleId, organizationId }, select: RULE_SELECT });
  if (!before) throw new ContractRoutingRuleNotFoundError(ruleId);
  await prisma.contractRoutingRule.delete({ where: { id: ruleId } });
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? "USER",
    action: "contract.routing_rule.deleted",
    resourceType: "ContractRoutingRule",
    resourceId: ruleId,
    beforeJson: auditSnapshot(before) as never,
    metadata: { ruleName: before.name },
  });
}
