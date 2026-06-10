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
  timesFired: number;
  lastFiredAt: Date | null;
  assignee: { name: string } | null;
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
  timesFired: true,
  lastFiredAt: true,
  assignee: { select: { name: true } },
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
