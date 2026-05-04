/**
 * PUT    /api/saved-views/[id]  — update
 * DELETE /api/saved-views/[id]  — delete
 *
 * Both restricted to the view's owner (enforced by the service).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { deleteSavedView, updateSavedView } from "@aegis/matter";
import { requireActorAny } from "../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const id = req.query.id;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid id" });
  }
  const actor = await requireActorAny(req, res, [
    Permission.MatterReadAll,
    Permission.MatterReadAssigned,
    Permission.MatterLegalHoldCustodianView,
    Permission.IntakeReadOwnTickets,
    Permission.IntakeReadAllTickets,
    Permission.AuditReadAll,
  ]);
  if (!actor) return;

  if (req.method === "PUT") {
    const body = (req.body ?? {}) as {
      name?: string;
      filterState?: unknown;
      isShared?: boolean;
      isDefault?: boolean;
    };
    try {
      const updated = await updateSavedView(
        {
          viewId: id,
          name: body.name,
          filterState: body.filterState,
          isShared: body.isShared,
          isDefault: body.isDefault,
        },
        actor,
      );
      return res.status(200).json(updated);
    } catch (err) {
      console.error("[saved-views PUT] failed:", err);
      return res.status(500).json({ error: String(err) });
    }
  }

  if (req.method === "DELETE") {
    try {
      await deleteSavedView(id, actor);
      return res.status(204).end();
    } catch (err) {
      console.error("[saved-views DELETE] failed:", err);
      return res.status(500).json({ error: String(err) });
    }
  }

  res.setHeader("Allow", "PUT,DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
