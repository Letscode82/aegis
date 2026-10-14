/**
 * GET /api/contracts/[id]/redline-docx?from=1&to=2 — download the redline
 * between two contract versions as a tracked-changes Word (.docx). The whole
 * clause diff renders as real `<w:ins>` / `<w:del>` revisions a reviewer
 * accepts or rejects in Word. Read-only — produces an artifact, mutates
 * nothing. Gated contracts:read_all, same as the contract Word download.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { generateContractRedlineDocx } from "@aegis/contracts";

export const config = { api: { responseLimit: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");
  const from = Number(req.query.from);
  const to = Number(req.query.to);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) {
    return res.status(400).json({ ok: false, error: "from and to versions are required and must differ" });
  }

  try {
    assertUserCanDo(user, Permission.ContractsReadAll);
    const result = await generateContractRedlineDocx(user.organizationId, contractId, from, to, user.name || user.email || null);
    if (!result) return res.status(404).json({ ok: false, error: "One or both versions not found" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    return res.status(200).send(result.buffer);
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
