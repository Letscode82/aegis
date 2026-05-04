/**
 * GET  /api/saved-views?scope=LEGAL_HOLD_CUSTODIANS
 *      List views visible to the actor for one scope (own + shared).
 * POST /api/saved-views
 *      Create. Body: { scope, name, filterState, isShared?, isDefault? }
 *
 * No special permission gate — every authenticated user can manage
 * their own saved views. Sharing is a per-row toggle. Cross-org
 * access is impossible because we always scope to the actor's org.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  createSavedView,
  listSavedViews,
} from "@aegis/matter";
import type { SavedViewScope } from "@aegis/db";
import { requireActorAny } from "../../../lib/matter-actor";

const VALID_SCOPES: SavedViewScope[] = [
  "LEGAL_HOLD_CUSTODIANS",
  "LEGAL_HOLDS_LIST",
  "MATTER_LIST",
  "AUDIT_LOG",
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Anyone with a baseline read permission can manage views — saved
  // views don't gate behind any specific perm because they're
  // user-state, not system-state.
  const actor = await requireActorAny(req, res, [
    Permission.MatterReadAll,
    Permission.MatterReadAssigned,
    Permission.MatterLegalHoldCustodianView,
    Permission.IntakeReadOwnTickets,
    Permission.IntakeReadAllTickets,
    Permission.AuditReadAll,
  ]);
  if (!actor) return;

  if (req.method === "GET") {
    const scope = req.query.scope;
    if (typeof scope !== "string" || !(VALID_SCOPES as string[]).includes(scope)) {
      return res
        .status(400)
        .json({ error: "scope query param required (one of the SavedViewScope enum values)" });
    }
    const rows = await listSavedViews(actor, scope as SavedViewScope);
    return res.status(200).json(rows);
  }

  if (req.method === "POST") {
    const body = (req.body ?? {}) as {
      scope?: string;
      name?: string;
      filterState?: unknown;
      isShared?: boolean;
      isDefault?: boolean;
    };
    if (
      typeof body.scope !== "string" ||
      !(VALID_SCOPES as string[]).includes(body.scope) ||
      typeof body.name !== "string" ||
      !body.name.trim()
    ) {
      return res.status(400).json({ error: "scope + name required" });
    }
    try {
      const created = await createSavedView(
        {
          scope: body.scope as SavedViewScope,
          name: body.name,
          filterState: body.filterState ?? {},
          isShared: body.isShared,
          isDefault: body.isDefault,
        },
        actor,
      );
      return res.status(201).json(created);
    } catch (err) {
      console.error("[saved-views POST] failed:", err);
      return res.status(500).json({ error: String(err) });
    }
  }

  res.setHeader("Allow", "GET,POST");
  return res.status(405).json({ error: "Method not allowed" });
}
