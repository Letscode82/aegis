import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { CustodianAlreadyAcknowledgedError, acknowledgeHold } from "@aegis/matter";
import { requireActor } from "../../../../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const holdId = req.query.holdId;
  const personId = req.query.personId;
  if (typeof holdId !== "string" || typeof personId !== "string") {
    return res.status(400).json({ error: "Invalid params" });
  }
  // Custodian-side acknowledgment requires the custodian-view scoped
  // permission. The authoritative scope check (resource-scoped to
  // self) lives in @aegis/auth.canUserDo's resource layer.
  const actor = await requireActor(
    req,
    res,
    Permission.MatterLegalHoldCustodianView,
  );
  if (!actor) return;
  const body = (req.body ?? {}) as { attestationStatement?: string };

  try {
    const updated = await acknowledgeHold(
      {
        holdId,
        personId,
        attestationStatement: body.attestationStatement,
        ip: typeof req.headers["x-forwarded-for"] === "string"
          ? (req.headers["x-forwarded-for"] as string).split(",")[0]
          : undefined,
        userAgent:
          typeof req.headers["user-agent"] === "string"
            ? (req.headers["user-agent"] as string)
            : undefined,
      },
      actor,
    );
    return res.status(200).json({
      id: updated.id,
      acknowledgedAt: updated.acknowledgedAt?.toISOString() ?? null,
    });
  } catch (err) {
    if (err instanceof CustodianAlreadyAcknowledgedError) {
      return res.status(409).json({ error: err.message });
    }
    console.error("[acknowledge] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
