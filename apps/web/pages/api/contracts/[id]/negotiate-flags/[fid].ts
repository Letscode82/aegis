/**
 * POST /api/contracts/[id]/negotiate-flags/[fid] — resolve an advisory
 * negotiation stall flag (PR D). The human gate: { action: "approve" |
 * "reject" } acknowledges or dismisses the flag; it never acts on its own.
 * contracts:approve.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { resolveNegotiationFlag } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const fid = String(req.query.fid || "");

  try {
    assertUserCanDo(user, Permission.ContractsApprove);
    const action = (req.body ?? {}).action === "reject" ? "reject" : "approve";
    const flag = await resolveNegotiationFlag(user.organizationId, fid, action, { id: user.id, type: "USER" });
    return res.status(200).json({ ok: true, flag });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
