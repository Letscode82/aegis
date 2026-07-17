/**
 * Playbook clause library (CTR-5).
 *   GET    — list entries (active; ?all=1 includes inactive). contracts:read_all.
 *   POST   — upsert an entry (on org+clauseType). contracts:approve.
 *   DELETE — remove an entry. body { id }. contracts:approve.
 * Mutations are chain-sealed inside the service.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { listClauseLibrary, upsertClauseLibraryEntry, deleteClauseLibraryEntry } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    if (req.method === "GET") {
      assertUserCanDo(user, Permission.ContractsReadAll);
      const includeInactive = req.query.all === "1";
      const entries = await listClauseLibrary(user.organizationId, { includeInactive });
      return res.status(200).json({ ok: true, entries });
    }
    if (req.method === "POST") {
      assertUserCanDo(user, Permission.ContractsApprove);
      const entry = await upsertClauseLibraryEntry(user.organizationId, req.body || {}, { id: user.id, type: "USER" });
      return res.status(200).json({ ok: true, entry });
    }
    if (req.method === "DELETE") {
      assertUserCanDo(user, Permission.ContractsApprove);
      const id = String(req.body?.id || "");
      if (!id) return res.status(400).json({ ok: false, error: "id is required" });
      await deleteClauseLibraryEntry(user.organizationId, id, { id: user.id, type: "USER" });
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
