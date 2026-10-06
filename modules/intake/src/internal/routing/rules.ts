/**
 * P2a (demo-lite) — pure routing-rule evaluation.
 *
 * No DB, no React: takes rule rows + a ticket-shaped object, returns
 * the patch to apply and a summary of which rules fired. The server
 * chokepoint (storage/server.ts) owns persistence + audit; this
 * module owns the semantics so they're unit-testable and identical
 * everywhere.
 *
 * Semantics:
 *   - Rules evaluate in ascending evalOrder.
 *   - All non-null match* conditions AND together.
 *   - Keyword matching keys on the request LEAD, not attached docs.
 *   - Later rules see earlier rules' effects (a rule that sets
 *     priority to Critical can cause a matchPriority=Critical rule
 *     to fire next).
 *   - A rule fires when its conditions match AND it has at least one
 *     action that changes the working ticket state. No-op matches
 *     don't count as firings (keeps timesFired honest).
 *   - Attorney decisions always win: the caller must not evaluate
 *     rules for tickets that already have a triage action.
 */

import { descriptionLead } from "../intake/ticket-desc.js";

export interface RoutingRuleLike {
  id: string;
  name: string;
  enabled: boolean;
  evalOrder: number;
  matchType: string | null;
  matchPriority: string | null;
  matchDepartment: string | null;
  matchKeyword: string | null;
  /** W2-1 — complexity band condition: "simple"|"standard"|"complex". */
  matchComplexity?: string | null;
  setAssigneeUserId: string | null;
  setPriority: string | null;
  setSlaHours: number | null;
  /** Item 5 (tiering) — route-to-pool action. Resolved to a concrete
   *  member at fire time via the injected pool resolver. A direct
   *  `setAssigneeUserId` on the same rule wins over the pool pick. */
  setTeamId?: string | null;
  /** W2-5 — escalate action: assign to this user (unless a direct
   *  assignee is set on the same rule), raise priority to Critical
   *  (unless the rule sets one explicitly), flag the ticket ESCALATED. */
  escalateToUserId?: string | null;
  /** W2-5 — approval gate: only this user may approve agent
   *  recommendations on matched tickets. */
  requireApprovalFromUserId?: string | null;
  /** Resolved User.name for setAssigneeUserId (display mirror). */
  assigneeName?: string | null;
  /** Resolved IntakeTeam.name for setTeamId (display mirror). */
  teamName?: string | null;
  /** Resolved User.name for escalateToUserId (display mirror). */
  escalateToName?: string | null;
  /** Resolved User.name for requireApprovalFromUserId (display mirror). */
  approverName?: string | null;
}

/** What the injected resolver returns for a route-to-pool action. */
export interface ResolvedPoolPick {
  teamId: string;
  teamName?: string | null;
  /** Chosen member, or null when the whole pool chain is at capacity. */
  userId: string | null;
  userName?: string | null;
  /** Pools traversed via overflow before landing on the pick. */
  overflowPath?: string[];
}

export interface EvaluateOptions {
  /** Resolve a route-to-pool action to a concrete member (load-balanced,
   *  overflow-aware). Omitted in DB-free contexts; pool rules then no-op. */
  resolvePool?: (teamId: string) => ResolvedPoolPick | null;
}

export interface RoutableTicket {
  type?: string | null;
  priority?: string | null;
  department?: string | null;
  description?: string | null;
  slaHours?: number | null;
  assignedToUserId?: string | null;
  /** W2-1 — derived complexity band ("standard" when no triage ran). */
  complexity?: string | null;
  /** W2-5 — current approval gate on the ticket, if any. */
  approvalGateUserId?: string | null;
}

export interface RoutingPatch {
  priority?: string;
  slaHours?: number;
  assignedToUserId?: string;
  /** Display mirror of the assignee's name, when resolvable. */
  assignedTo?: string;
  /** Item 5 — the pool a route-to-pool action selected from (post
   *  overflow). Present only when a pool rule assigned a member. */
  teamId?: string;
  teamName?: string;
  /** W2-5 — an escalate rule fired: the chokepoint flips the ticket
   *  to ESCALATED alongside the assignee/priority changes above. */
  escalated?: boolean;
  /** W2-5 — approval gate to stamp onto the ticket. */
  approvalGateUserId?: string;
}

export interface FiredRuleSummary {
  id: string;
  name: string;
  actions: string[];
}

interface WorkingTicket {
  type: string;
  priority: string;
  department: string;
  description: string;
  slaHours: number | null;
  assignedToUserId: string | null;
  complexity: string;
  approvalGateUserId: string | null;
}

type Changes = Partial<
  Pick<
    WorkingTicket,
    "priority" | "slaHours" | "assignedToUserId" | "approvalGateUserId"
  >
> & { escalated?: boolean };

function describeActions(
  rule: RoutingRuleLike,
  changes: Changes,
  poolPick: ResolvedPoolPick | null,
): string[] {
  const out: string[] = [];
  if (changes.escalated)
    out.push(`escalate → ${rule.escalateToName || rule.escalateToUserId}`);
  if (changes.priority !== undefined) out.push(`priority → ${changes.priority}`);
  if (changes.slaHours !== undefined) out.push(`SLA → ${changes.slaHours}h`);
  if (changes.assignedToUserId !== undefined && !changes.escalated) {
    if (poolPick) {
      const via = poolPick.teamName || rule.teamName || rule.setTeamId;
      const who = poolPick.userName || poolPick.userId;
      const overflowed =
        poolPick.overflowPath && poolPick.overflowPath.length > 0
          ? " (overflow)"
          : "";
      out.push(`pool ${via} → ${who}${overflowed}`);
    } else {
      out.push(`assignee → ${rule.assigneeName || rule.setAssigneeUserId}`);
    }
  }
  if (changes.approvalGateUserId !== undefined)
    out.push(
      `approval gate → ${rule.approverName || rule.requireApprovalFromUserId}`,
    );
  return out;
}

export function ruleMatches(
  rule: RoutingRuleLike,
  ticket: WorkingTicket,
): boolean {
  if (rule.matchType && rule.matchType !== ticket.type) return false;
  if (rule.matchPriority && rule.matchPriority !== ticket.priority) return false;
  if (rule.matchDepartment && rule.matchDepartment !== ticket.department)
    return false;
  if (rule.matchKeyword) {
    // Match the human-authored request LEAD only — never the appended
    // document body, whose incidental words (e.g. "breach" in a
    // commercial contract) otherwise fire rules spuriously.
    const lead = descriptionLead(ticket.description).toLowerCase();
    if (!lead.includes(rule.matchKeyword.toLowerCase())) return false;
  }
  if (rule.matchComplexity && rule.matchComplexity !== ticket.complexity) return false;
  return true;
}

export function evaluateRoutingRules(
  rules: RoutingRuleLike[],
  ticket: RoutableTicket,
  opts: EvaluateOptions = {},
): { patch: RoutingPatch; fired: FiredRuleSummary[] } {
  const ordered = [...rules]
    .filter((r) => r.enabled)
    .sort((a, b) => (a.evalOrder ?? 100) - (b.evalOrder ?? 100));
  const working: WorkingTicket = {
    type: ticket.type ?? "",
    priority: ticket.priority ?? "",
    department: ticket.department ?? "",
    description: ticket.description ?? "",
    slaHours: ticket.slaHours ?? null,
    assignedToUserId: ticket.assignedToUserId ?? null,
    complexity: ticket.complexity ?? "standard",
    approvalGateUserId: ticket.approvalGateUserId ?? null,
  };
  const patch: RoutingPatch = {};
  const fired: FiredRuleSummary[] = [];
  for (const rule of ordered) {
    if (!ruleMatches(rule, working)) continue;
    const changes: Changes = {};
    if (rule.setPriority && rule.setPriority !== working.priority)
      changes.priority = rule.setPriority;
    if (rule.setSlaHours != null && rule.setSlaHours !== working.slaHours)
      changes.slaHours = rule.setSlaHours;
    // Direct assignee action.
    if (
      rule.setAssigneeUserId &&
      rule.setAssigneeUserId !== working.assignedToUserId
    )
      changes.assignedToUserId = rule.setAssigneeUserId;
    // Item 5 — route-to-pool action. A direct assignee on the same rule
    // wins; otherwise load-balance across the pool via the resolver.
    let poolPick: ResolvedPoolPick | null = null;
    if (
      rule.setTeamId &&
      !rule.setAssigneeUserId &&
      typeof opts.resolvePool === "function"
    ) {
      const pick = opts.resolvePool(rule.setTeamId);
      if (pick && pick.userId && pick.userId !== working.assignedToUserId) {
        changes.assignedToUserId = pick.userId;
        poolPick = pick;
      }
    }
    // W2-5 — escalate: assign to the target (a direct assignee or pool
    // pick on the same rule wins the assignment), and raise to Critical
    // unless the rule sets a priority explicitly. Idempotent: once the
    // target holds the ticket at the escalated priority, nothing
    // changes and the rule stops firing.
    if (rule.escalateToUserId) {
      if (
        changes.assignedToUserId === undefined &&
        !rule.setAssigneeUserId &&
        rule.escalateToUserId !== working.assignedToUserId
      )
        changes.assignedToUserId = rule.escalateToUserId;
      if (!rule.setPriority && working.priority !== "Critical")
        changes.priority = "Critical";
      if (
        changes.assignedToUserId !== undefined ||
        changes.priority !== undefined
      )
        changes.escalated = true;
    }
    // W2-5 — approval gate: stamp the required approver onto the ticket.
    if (
      rule.requireApprovalFromUserId &&
      rule.requireApprovalFromUserId !== working.approvalGateUserId
    )
      changes.approvalGateUserId = rule.requireApprovalFromUserId;
    if (Object.keys(changes).length === 0) continue; // no-op match ≠ firing
    Object.assign(working, changes);
    if (changes.priority !== undefined) patch.priority = changes.priority;
    if (changes.slaHours !== undefined && changes.slaHours !== null)
      patch.slaHours = changes.slaHours;
    if (changes.assignedToUserId !== undefined && changes.assignedToUserId !== null) {
      patch.assignedToUserId = changes.assignedToUserId;
      if (poolPick) {
        patch.teamId = poolPick.teamId;
        if (poolPick.teamName) patch.teamName = poolPick.teamName;
        if (poolPick.userName) patch.assignedTo = poolPick.userName;
      } else if (
        changes.escalated &&
        changes.assignedToUserId === rule.escalateToUserId &&
        rule.escalateToName
      ) {
        patch.assignedTo = rule.escalateToName;
      } else if (rule.assigneeName) {
        patch.assignedTo = rule.assigneeName;
      }
    }
    if (changes.escalated) patch.escalated = true;
    if (changes.approvalGateUserId !== undefined && changes.approvalGateUserId !== null)
      patch.approvalGateUserId = changes.approvalGateUserId;
    fired.push({
      id: rule.id,
      name: rule.name,
      actions: describeActions(rule, changes, poolPick),
    });
  }
  return { patch, fired };
}
