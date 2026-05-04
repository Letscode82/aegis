/**
 * Actor display resolver — turns a raw `(actorId, actorType)` pair
 * (the shape stored on `LegalHoldEvent`, `AuditLog`, `HoldNoticeIssuance`,
 * etc.) into a human label suitable for the timeline modal,
 * acknowledgment metadata blocks, and notice "issued by" fields.
 *
 * `USER` actors resolve to the User row (name + role). Misses
 * (suspended user, deleted user, foreign-org leakage) fall through
 * to a `(unknown user)` label so the UI never crashes.
 *
 * `SYSTEM` actors render as `🤖 SYSTEM` — no lookup needed.
 *
 * `AGENT` actors will (in 4d) carry an `AgentDecision.modelName` that
 * the resolver surfaces; until 4d, we render a generic `🤖 AEGIS Agent`
 * label with `actorId` available on hover.
 */
import { prisma } from "@aegis/db";

export type ActorKind = "USER" | "SYSTEM" | "AGENT" | string;

export interface ResolvedActor {
  /** Raw id from the source row — keep so the UI can show on hover. */
  id: string | null;
  type: ActorKind;
  /** Human label for primary display ("Marcus Reid", "🤖 SYSTEM"). */
  displayName: string;
  /** Role chip for USER actors; null for system / agent. */
  roleLabel: string | null;
  /** True when the resolver couldn't find the user record. */
  unknown: boolean;
}

/**
 * Resolve a batch of actors in one round-trip. Pass the union of
 * `(actorId, actorType)` you need to render — the resolver dedupes
 * USER ids and runs a single `findMany`. Returns a Map keyed by a
 * stable `${type}:${id}` cache key.
 *
 * Usage:
 *   const lookup = await resolveActorsService(orgId, [
 *     { actorId: ev.actorId, actorType: ev.actorType },
 *     ...
 *   ]);
 *   const resolved = lookup.get(actorKey(ev.actorId, ev.actorType));
 */
export async function resolveActorsService(
  organizationId: string,
  inputs: Array<{ actorId: string | null; actorType: ActorKind }>,
): Promise<Map<string, ResolvedActor>> {
  const out = new Map<string, ResolvedActor>();
  const userIds = new Set<string>();
  for (const { actorId, actorType } of inputs) {
    if (actorType === "USER" && actorId) userIds.add(actorId);
  }

  const users = userIds.size
    ? await prisma.user.findMany({
        where: {
          id: { in: Array.from(userIds) },
          organizationId,
        },
        select: { id: true, name: true, role: { select: { name: true } } },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  for (const { actorId, actorType } of inputs) {
    const k = actorKey(actorId, actorType);
    if (out.has(k)) continue;
    if (actorType === "SYSTEM") {
      out.set(k, {
        id: actorId,
        type: "SYSTEM",
        displayName: "SYSTEM",
        roleLabel: null,
        unknown: false,
      });
      continue;
    }
    if (actorType === "AGENT") {
      out.set(k, {
        id: actorId,
        type: "AGENT",
        displayName: "AEGIS Agent",
        roleLabel: "AI",
        unknown: false,
      });
      continue;
    }
    if (actorType === "USER" && actorId) {
      const u = userMap.get(actorId);
      if (u) {
        out.set(k, {
          id: actorId,
          type: "USER",
          displayName: u.name,
          roleLabel: u.role?.name ?? null,
          unknown: false,
        });
        continue;
      }
      out.set(k, {
        id: actorId,
        type: "USER",
        displayName: "(unknown user)",
        roleLabel: null,
        unknown: true,
      });
      continue;
    }
    // Fallback for unexpected actorType values — surface them
    // verbatim so an audit reader can investigate.
    out.set(k, {
      id: actorId,
      type: actorType,
      displayName: actorType ?? "(no actor)",
      roleLabel: null,
      unknown: !actorId,
    });
  }
  return out;
}

export function actorKey(
  actorId: string | null,
  actorType: ActorKind,
): string {
  return `${actorType}:${actorId ?? ""}`;
}
