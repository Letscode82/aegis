/**
 * Authorization enforcement with audit (SEC2).
 *
 * A single policy-enforcement chokepoint for privileged server actions. It runs
 * the same `assertUserCanDo` check as before, but on denial it also writes a
 * chain-sealed `access.denied` AuditLog row before rethrowing — so every blocked
 * privileged action is a first-class, tamper-evident governance event, not just
 * a silent 403. This is the "security layer records access decisions" posture:
 * approvals were already on the ledger (AgentDecision + one_legal.tool.executed);
 * SEC2 puts denials there too.
 *
 * Best-effort audit: a logging failure never changes the auth outcome (the
 * AccessDeniedError still propagates), and an allowed check adds no overhead.
 */
import { assertUserCanDo, AccessDeniedError, type AuthUser, type Permission, type ResourceContext } from "@aegis/auth";
import { logAudit } from "@aegis/db";

export interface EnforceContext {
  /** Resource-scope context for the four scoped permissions (matter/ticket/etc.). */
  resource?: ResourceContext;
  /** For the audit row: what kind of thing was being accessed. */
  resourceType?: string;
  /** For the audit row: which specific resource (id) — falls back to the permission. */
  resourceId?: string;
  /** A short route/operation label for the audit metadata (e.g. "one-legal.act"). */
  route?: string;
}

/**
 * Assert the user holds `permission` (with optional resource scope). On denial,
 * record a chain-sealed `access.denied` audit event, then throw
 * AccessDeniedError (handlers translate it to a 403 as before).
 */
export async function assertAndAudit(
  user: AuthUser,
  permission: Permission,
  ctx: EnforceContext = {},
): Promise<void> {
  try {
    assertUserCanDo(user, permission, ctx.resource);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      try {
        await logAudit({
          organizationId: user.organizationId,
          actorId: user.id,
          actorType: "USER",
          action: "access.denied",
          resourceType: ctx.resourceType ?? "Permission",
          resourceId: ctx.resourceId ?? String(permission),
          metadata: {
            permission: String(permission),
            route: ctx.route ?? null,
            reason: err.decision?.reason ?? null,
          },
        });
      } catch {
        /* audit is best-effort — never change the auth outcome */
      }
    }
    throw err;
  }
}
