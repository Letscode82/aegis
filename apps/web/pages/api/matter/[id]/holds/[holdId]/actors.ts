/**
 * POST /api/matter/[id]/holds/[holdId]/actors
 *
 * Batch-resolve `(actorId, actorType)` pairs to display labels for
 * the hold's timeline / audit / notice surfaces. Body:
 *   { inputs: [{ actorId: string|null, actorType: string }, ...] }
 * Returns:
 *   { resolved: [{ key, id, type, displayName, roleLabel, unknown }, ...] }
 *
 * Gated identically to the timeline read — any of the matter read
 * permissions or the custodian-view permission grants access. The
 * resolver scopes lookups to the actor's organization, so a USER
 * id from a different org returns `unknown: true`.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { actorKey, resolveActors } from "@aegis/matter";
import { requireActorAny } from "../../../../../../lib/matter-actor";

interface BatchInput {
  actorId: string | null;
  actorType: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const actor = await requireActorAny(req, res, [
    Permission.MatterReadAll,
    Permission.MatterReadAssigned,
    Permission.MatterLegalHoldCustodianView,
  ]);
  if (!actor) return;

  const body = (req.body ?? {}) as { inputs?: BatchInput[] };
  if (!Array.isArray(body.inputs)) {
    return res.status(400).json({ error: "inputs must be an array" });
  }

  const inputs = body.inputs
    .filter((i) => typeof i.actorType === "string")
    .map((i) => ({
      actorId: typeof i.actorId === "string" ? i.actorId : null,
      actorType: i.actorType,
    }));

  const lookup = await resolveActors(actor.organizationId, inputs);
  return res.status(200).json({
    resolved: Array.from(lookup.values()).map((r) => ({
      key: actorKey(r.id, r.type),
      id: r.id,
      type: r.type,
      displayName: r.displayName,
      roleLabel: r.roleLabel,
      unknown: r.unknown,
    })),
  });
}
