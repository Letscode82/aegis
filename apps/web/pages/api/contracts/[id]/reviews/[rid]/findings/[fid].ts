/**
 * Decide a single review finding (PR C) — the human gate.
 *   POST { verdict: "accept" | "reject" | "edit", editedText? }. contracts:approve.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { decideFinding } from "@aegis/contracts";

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
    const b = req.body ?? {};
    const verdict = b.verdict === "reject" ? "reject" : b.verdict === "edit" ? "edit" : "accept";
    const finding = await decideFinding(user.organizationId, fid, verdict, { id: user.id, type: "USER" }, { editedText: b.editedText ?? null });
    return res.status(200).json({ ok: true, finding });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
