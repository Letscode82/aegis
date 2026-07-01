/**
 * P2a (demo-lite) — routing-rule persistence + admin surface.
 *
 * Server-only. The evaluation semantics live in ./rules.js (pure);
 * the saveTicketsV8 chokepoint in storage/server.ts calls
 * `loadEnabledRoutingRules` + `recordRuleFirings` around the pure
 * evaluator. This module additionally backs the Smart Routing tab
 * (list + enable/disable toggle) and the SLA Operations
 * effectiveness panel.
 */
import { prisma, logAudit, getCurrentUser } from "@aegis/db";

export interface RoutingRuleDTO {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  evalOrder: number;
  matchType: string | null;
  matchPriority: string | null;
  matchDepartment: string | null;
  matchKeyword: string | null;
  setAssigneeUserId: string | null;
  /** Resolved User.name for the setAssigneeUserId action. */
  assigneeName: string | null;
  setPriority: string | null;
  setSlaHours: number | null;
  /** Item 5 — route-to-pool action + resolved IntakeTeam.name mirror. */
  setTeamId: string | null;
  teamName: string | null;
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
  matchPriority: string | null;
  matchDepartment: string | null;
  matchKeyword: string | null;
  setAssigneeUserId: string | null;
  setPriority: string | null;
  setSlaHours: number | null;
  setTeamId: string | null;
  timesFired: number;
  lastFiredAt: Date | null;
  assignee: { name: string } | null;
  team: { name: string } | null;
};

const RULE_SELECT = {
  id: true,
  name: true,
  description: true,
  enabled: true,
  evalOrder: true,
  matchType: true,
  matchPriority: true,
  matchDepartment: true,
  matchKeyword: true,
  setAssigneeUserId: true,
  setPriority: true,
  setSlaHours: true,
  setTeamId: true,
  timesFired: true,
  lastFiredAt: true,
  assignee: { select: { name: true } },
  team: { select: { name: true } },
} as const;

function toDTO(r: RuleRow): RoutingRuleDTO {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    enabled: r.enabled,
    evalOrder: r.evalOrder,
    matchType: r.matchType,
    matchPriority: r.matchPriority,
    matchDepartment: r.matchDepartment,
    matchKeyword: r.matchKeyword,
    setAssigneeUserId: r.setAssigneeUserId,
    assigneeName: r.assignee?.name ?? null,
    setPriority: r.setPriority,
    setSlaHours: r.setSlaHours,
    setTeamId: r.setTeamId,
    teamName: r.team?.name ?? null,
    timesFired: r.timesFired,
    lastFiredAt: r.lastFiredAt?.toISOString() ?? null,
  };
}

/** All rules for the Smart Routing tab (disabled ones included). */
export async function listRoutingRules(
  organizationId: string,
): Promise<RoutingRuleDTO[]> {
  const rows = await prisma.intakeRoutingRule.findMany({
    where: { organizationId },
    select: RULE_SELECT,
    orderBy: { evalOrder: "asc" },
  });
  return rows.map(toDTO);
}

/** Enabled rules only, in evaluation shape — for the write chokepoint. */
export async function loadEnabledRoutingRules(organizationId: string) {
  const rows = await prisma.intakeRoutingRule.findMany({
    where: { organizationId, enabled: true },
    select: RULE_SELECT,
    orderBy: { evalOrder: "asc" },
  });
  return rows.map((r) => ({ ...toDTO(r), assigneeName: r.assignee?.name ?? null }));
}

export class RoutingRuleNotFoundError extends Error {
  constructor(id: string) {
    super(`Routing rule ${id} not found`);
    this.name = "RoutingRuleNotFoundError";
  }
}

/**
 * Enable / disable a rule. Writes a chain-sealed
 * `intake.routing_rule.updated` audit row attributed to the session
 * user — toggling automation behavior is a governance event.
 */
export async function setRoutingRuleEnabled(
  organizationId: string,
  ruleId: string,
  enabled: boolean,
  ctx?: {
    req?: { headers: Record<string, string | string[] | undefined> };
    res?: unknown;
  },
): Promise<RoutingRuleDTO> {
  const before = await prisma.intakeRoutingRule.findFirst({
    where: { id: ruleId, organizationId },
    select: { enabled: true, name: true },
  });
  if (!before) throw new RoutingRuleNotFoundError(ruleId);

  const updated = await prisma.intakeRoutingRule.update({
    where: { id: ruleId },
    data: { enabled },
    select: RULE_SELECT,
  });

  if (before.enabled !== enabled) {
    const actor = await getCurrentUser(ctx?.req, ctx?.res);
    await logAudit({
      organizationId,
      actorId: actor.id,
      actorType: "USER",
      action: "intake.routing_rule.updated",
      resourceType: "IntakeRoutingRule",
      resourceId: ruleId,
      beforeJson: { enabled: before.enabled },
      afterJson: { enabled },
      metadata: { ruleName: before.name },
    });
  }
  return toDTO(updated);
}

/** Bump effectiveness counters after rules fire on a ticket. */
export async function recordRuleFirings(ruleIds: string[]): Promise<void> {
  if (ruleIds.length === 0) return;
  await prisma.intakeRoutingRule.updateMany({
    where: { id: { in: ruleIds } },
    data: { timesFired: { increment: 1 }, lastFiredAt: new Date() },
  });
}

// ── Composable editor (P2a full) ────────────────────────────────────

/** Shape accepted by create / update. Null clears, undefined preserves. */
export interface RoutingRuleInput {
  name?: string;
  description?: string | null;
  enabled?: boolean;
  evalOrder?: number;
  matchType?: string | null;
  matchPriority?: string | null;
  matchDepartment?: string | null;
  matchKeyword?: string | null;
  setAssigneeUserId?: string | null;
  setPriority?: string | null;
  setSlaHours?: number | null;
  setTeamId?: string | null;
}

export class RoutingRuleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutingRuleValidationError";
  }
}

function normalizeNullable<T>(v: T | undefined | null): T | null | undefined {
  // Undefined → "don't touch"; null → "clear"; value → set.
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return v;
}

/**
 * A rule has to do at least one thing to one kind of ticket — empty
 * conditions OR empty actions would either match everything or
 * change nothing. Validates the post-merge state so an update can
 * patch a subset of fields without re-sending the whole row.
 */
function assertRuleSemantics(merged: {
  name: string;
  matchType: string | null;
  matchPriority: string | null;
  matchDepartment: string | null;
  matchKeyword: string | null;
  setAssigneeUserId: string | null;
  setPriority: string | null;
  setSlaHours: number | null;
  setTeamId: string | null;
}) {
  if (!merged.name || merged.name.trim().length === 0) {
    throw new RoutingRuleValidationError("Rule name is required");
  }
  const hasCondition =
    !!merged.matchType ||
    !!merged.matchPriority ||
    !!merged.matchDepartment ||
    !!merged.matchKeyword;
  if (!hasCondition) {
    throw new RoutingRuleValidationError(
      "A rule needs at least one condition (type / priority / department / keyword).",
    );
  }
  const hasAction =
    !!merged.setAssigneeUserId ||
    !!merged.setPriority ||
    merged.setSlaHours != null ||
    !!merged.setTeamId;
  if (!hasAction) {
    throw new RoutingRuleValidationError(
      "A rule needs at least one action (assignee / pool / priority / SLA).",
    );
  }
}

/**
 * Create a routing rule. Writes a chain-sealed
 * `intake.routing_rule.created` audit row attributed to the session
 * user. Validates that the rule has at least one condition and one
 * action so it can't silently match-everything or no-op.
 */
export async function createRoutingRule(
  organizationId: string,
  input: RoutingRuleInput,
  ctx?: {
    req?: { headers: Record<string, string | string[] | undefined> };
    res?: unknown;
  },
): Promise<RoutingRuleDTO> {
  const merged = {
    name: input.name ?? "",
    description: input.description ?? null,
    enabled: input.enabled ?? true,
    evalOrder: input.evalOrder ?? 100,
    matchType: input.matchType ?? null,
    matchPriority: input.matchPriority ?? null,
    matchDepartment: input.matchDepartment ?? null,
    matchKeyword: input.matchKeyword ?? null,
    setAssigneeUserId: input.setAssigneeUserId ?? null,
    setPriority: input.setPriority ?? null,
    setSlaHours: input.setSlaHours ?? null,
    setTeamId: input.setTeamId ?? null,
  };
  assertRuleSemantics(merged);
  if (merged.setTeamId) {
    await assertTeamExists(organizationId, merged.setTeamId);
  }

  const created = await prisma.intakeRoutingRule.create({
    data: { organizationId, ...merged },
    select: RULE_SELECT,
  });

  const actor = await getCurrentUser(ctx?.req, ctx?.res);
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.routing_rule.created",
    resourceType: "IntakeRoutingRule",
    resourceId: created.id,
    afterJson: {
      name: merged.name,
      conditions: {
        matchType: merged.matchType,
        matchPriority: merged.matchPriority,
        matchDepartment: merged.matchDepartment,
        matchKeyword: merged.matchKeyword,
      },
      actions: {
        setAssigneeUserId: merged.setAssigneeUserId,
        setPriority: merged.setPriority,
        setSlaHours: merged.setSlaHours,
        setTeamId: merged.setTeamId,
      },
      evalOrder: merged.evalOrder,
    },
  });
  return toDTO(created);
}

/** Guard: a route-to-pool action must point at a team in the same org. */
async function assertTeamExists(organizationId: string, teamId: string) {
  const team = await prisma.intakeTeam.findFirst({
    where: { id: teamId, organizationId },
    select: { id: true },
  });
  if (!team) {
    throw new RoutingRuleValidationError("Route-to-pool team not found in this organization");
  }
}

/**
 * Patch an existing routing rule. Any field left `undefined` is
 * preserved; explicit `null` clears it. Writes a chain-sealed
 * `intake.routing_rule.updated` row with the before/after diff so
 * auditors can reconstruct the configuration over time.
 */
export async function updateRoutingRule(
  organizationId: string,
  ruleId: string,
  input: RoutingRuleInput,
  ctx?: {
    req?: { headers: Record<string, string | string[] | undefined> };
    res?: unknown;
  },
): Promise<RoutingRuleDTO> {
  const before = await prisma.intakeRoutingRule.findFirst({
    where: { id: ruleId, organizationId },
    select: RULE_SELECT,
  });
  if (!before) throw new RoutingRuleNotFoundError(ruleId);

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined)
    patch.description = normalizeNullable(input.description);
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.evalOrder !== undefined) patch.evalOrder = input.evalOrder;
  if (input.matchType !== undefined)
    patch.matchType = normalizeNullable(input.matchType);
  if (input.matchPriority !== undefined)
    patch.matchPriority = normalizeNullable(input.matchPriority);
  if (input.matchDepartment !== undefined)
    patch.matchDepartment = normalizeNullable(input.matchDepartment);
  if (input.matchKeyword !== undefined)
    patch.matchKeyword = normalizeNullable(input.matchKeyword);
  if (input.setAssigneeUserId !== undefined)
    patch.setAssigneeUserId = normalizeNullable(input.setAssigneeUserId);
  if (input.setPriority !== undefined)
    patch.setPriority = normalizeNullable(input.setPriority);
  if (input.setSlaHours !== undefined)
    patch.setSlaHours = input.setSlaHours; // null OK to clear
  if (input.setTeamId !== undefined)
    patch.setTeamId = normalizeNullable(input.setTeamId);

  // Use Object.hasOwn so an explicit `null` in the patch is honored
  // (clears the field) instead of falling back to the prior value
  // the way `??` would.
  const pick = <K extends keyof typeof before>(k: K) =>
    Object.prototype.hasOwnProperty.call(patch, k) ? (patch as Record<K, typeof before[K]>)[k] : before[k];
  assertRuleSemantics({
    name: pick("name") as string,
    matchType: pick("matchType") as string | null,
    matchPriority: pick("matchPriority") as string | null,
    matchDepartment: pick("matchDepartment") as string | null,
    matchKeyword: pick("matchKeyword") as string | null,
    setAssigneeUserId: pick("setAssigneeUserId") as string | null,
    setPriority: pick("setPriority") as string | null,
    setSlaHours: pick("setSlaHours") as number | null,
    setTeamId: pick("setTeamId") as string | null,
  });
  const mergedTeamId = pick("setTeamId") as string | null;
  if (mergedTeamId && mergedTeamId !== before.setTeamId) {
    await assertTeamExists(organizationId, mergedTeamId);
  }

  const updated = await prisma.intakeRoutingRule.update({
    where: { id: ruleId },
    data: patch,
    select: RULE_SELECT,
  });

  const actor = await getCurrentUser(ctx?.req, ctx?.res);
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.routing_rule.updated",
    resourceType: "IntakeRoutingRule",
    resourceId: ruleId,
    beforeJson: toAuditSnapshot(before),
    afterJson: toAuditSnapshot(updated),
    metadata: { ruleName: updated.name },
  });
  return toDTO(updated);
}

function toAuditSnapshot(r: RuleRow) {
  return {
    name: r.name,
    enabled: r.enabled,
    evalOrder: r.evalOrder,
    conditions: {
      matchType: r.matchType,
      matchPriority: r.matchPriority,
      matchDepartment: r.matchDepartment,
      matchKeyword: r.matchKeyword,
    },
    actions: {
      setAssigneeUserId: r.setAssigneeUserId,
      setPriority: r.setPriority,
      setSlaHours: r.setSlaHours,
      setTeamId: r.setTeamId,
    },
  };
}

/** Delete a routing rule. Writes a chain-sealed
 * `intake.routing_rule.deleted` audit row with the deleted rule's
 * full shape preserved in `beforeJson` so configuration history is
 * reconstructible even after the row is gone. */
export async function deleteRoutingRule(
  organizationId: string,
  ruleId: string,
  ctx?: {
    req?: { headers: Record<string, string | string[] | undefined> };
    res?: unknown;
  },
): Promise<void> {
  const before = await prisma.intakeRoutingRule.findFirst({
    where: { id: ruleId, organizationId },
    select: RULE_SELECT,
  });
  if (!before) throw new RoutingRuleNotFoundError(ruleId);

  await prisma.intakeRoutingRule.delete({ where: { id: ruleId } });

  const actor = await getCurrentUser(ctx?.req, ctx?.res);
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.routing_rule.deleted",
    resourceType: "IntakeRoutingRule",
    resourceId: ruleId,
    beforeJson: toAuditSnapshot(before),
    metadata: { ruleName: before.name },
  });
}
