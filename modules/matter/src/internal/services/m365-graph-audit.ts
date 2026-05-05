/**
 * Graph-call audit middleware.
 *
 * Every Graph call goes through `withGraphAudit` which writes a
 * chain-sealed AuditLog row recording the endpoint, HTTP method,
 * status code, correlation id, duration, and tenant. Failures are
 * recorded with the typed error name so defensibility queries can
 * later answer "what did Graph say when we tried to preserve
 * Marcus Reid's mailbox at T?".
 *
 * actorType is USER when called within a user-initiated mutation
 * (the actor is passed in), SYSTEM when called from a scheduled job
 * or cold-start probe.
 */
import { logAudit, type AuditActorType } from "@aegis/db";
import type { M365GraphError } from "./m365-graph-errors";

export interface GraphAuditContext {
  organizationId: string;
  /** Logical Graph endpoint — e.g. "/security/cases/ediscoveryCases". */
  endpoint: string;
  /** HTTP method. Most Graph calls are GET / POST / PATCH / DELETE. */
  method: string;
  /** Resolved tenant id at call time (audit-friendly; not a secret). */
  tenantId: string | null;
  actor: { id: string } | null;
  actorType?: AuditActorType;
  /** Optional resource linkage — when the call is on behalf of a hold. */
  resource?: { type: string; id: string };
  /** Extra audit metadata. Sub-PR 4c.1 records `authMode` here so
   *  defensibility queries can reconstruct which auth path serviced
   *  each call ("app" for app-only client-credentials, "delegated"
   *  for the eDiscovery service-account flow). */
  metadata?: Record<string, unknown>;
}

/**
 * Wraps a Graph call. The fn is the actual SDK invocation. On
 * success: record a row with statusCode=200 + durationMs. On error:
 * record a row with statusCode (when known), correlationId, and the
 * error's class name; rethrow.
 */
export async function withGraphAudit<T>(
  ctx: GraphAuditContext,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - startedAt;
    await logAudit({
      organizationId: ctx.organizationId,
      actorId: ctx.actor?.id ?? null,
      actorType: ctx.actorType ?? (ctx.actor ? "USER" : "SYSTEM"),
      action: "m365.graph.call",
      resourceType: ctx.resource?.type ?? "GraphRequest",
      resourceId: ctx.resource?.id ?? "graph-request",
      metadata: {
        endpoint: ctx.endpoint,
        method: ctx.method,
        statusCode: 200,
        tenantId: ctx.tenantId,
        durationMs,
        ...(ctx.metadata ?? {}),
      },
    });
    return result;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const e = err as Partial<M365GraphError> & {
      name?: string;
      statusCode?: number | null;
      correlationId?: string | null;
    };
    await logAudit({
      organizationId: ctx.organizationId,
      actorId: ctx.actor?.id ?? null,
      actorType: ctx.actorType ?? (ctx.actor ? "USER" : "SYSTEM"),
      action: "m365.graph.call.failed",
      resourceType: ctx.resource?.type ?? "GraphRequest",
      resourceId: ctx.resource?.id ?? "graph-request",
      metadata: {
        endpoint: ctx.endpoint,
        method: ctx.method,
        statusCode: e.statusCode ?? null,
        correlationId: e.correlationId ?? null,
        errorName: e.name ?? "Error",
        tenantId: ctx.tenantId,
        durationMs,
        ...(ctx.metadata ?? {}),
      },
    });
    throw err;
  }
}
