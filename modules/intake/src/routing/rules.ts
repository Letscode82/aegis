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
 *   - Later rules see earlier rules' effects (a rule that sets
 *     priority to Critical can cause a matchPriority=Critical rule
 *     to fire next).
 *   - A rule fires when its conditions match AND it has at least one
 *     action that changes the working ticket state. No-op matches
 *     don't count as firings (keeps timesFired honest).
 *   - Attorney decisions always win: the caller must not evaluate
 *     rules for tickets that already have a triage action.
 */

export interface RoutingRuleLike {
  id: string;
  name: string;
  enabled: boolean;
  evalOrder: number;
  matchType: string | null;
  matchPriority: string | null;
  matchDepartment: string | null;
  matchKeyword: string | null;
  setAssigneeUserId: string | null;
  setPriority: string | null;
  setSlaHours: number | null;
  /** Resolved User.name for setAssigneeUserId (display mirror). */
  assigneeName?: string | null;
}

export interface RoutableTicket {
  type?: string | null;
  priority?: string | null;
  department?: string | null;
  description?: string | null;
  slaHours?: number | null;
  assignedToUserId?: string | null;
}

export interface RoutingPatch {
  priority?: string;
  slaHours?: number;
  assignedToUserId?: string;
  /** Display mirror of the assignee's name, when resolvable. */
  assignedTo?: string;
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
}

type Changes = Partial<
  Pick<WorkingTicket, "priority" | "slaHours" | "assignedToUserId">
>;

function describeActions(rule: RoutingRuleLike, changes: Changes): string[] {
  const out: string[] = [];
  if (changes.priority !== undefined) out.push(`priority → ${changes.priority}`);
  if (changes.slaHours !== undefined) out.push(`SLA → ${changes.slaHours}h`);
  if (changes.assignedToUserId !== undefined)
    out.push(`assignee → ${rule.assigneeName || rule.setAssigneeUserId}`);
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
    if (!ticket.description.toLowerCase().includes(rule.matchKeyword.toLowerCase()))
      return false;
  }
  return true;
}

export function evaluateRoutingRules(
  rules: RoutingRuleLike[],
  ticket: RoutableTicket,
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
    if (
      rule.setAssigneeUserId &&
      rule.setAssigneeUserId !== working.assignedToUserId
    )
      changes.assignedToUserId = rule.setAssigneeUserId;
    if (Object.keys(changes).length === 0) continue; // no-op match ≠ firing
    Object.assign(working, changes);
    if (changes.priority !== undefined) patch.priority = changes.priority;
    if (changes.slaHours !== undefined && changes.slaHours !== null)
      patch.slaHours = changes.slaHours;
    if (changes.assignedToUserId !== undefined && changes.assignedToUserId !== null) {
      patch.assignedToUserId = changes.assignedToUserId;
      if (rule.assigneeName) patch.assignedTo = rule.assigneeName;
    }
    fired.push({ id: rule.id, name: rule.name, actions: describeActions(rule, changes) });
  }
  return { patch, fired };
}
