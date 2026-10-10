/**
 * GET /api/one-legal/history?sessionId=&limit= — recent ONE Legal tasks (OL-4).
 *
 * Rehydrates the console's Working folder across reloads. Best-effort: returns
 * an empty list if the LegalTask table isn't deployed yet. Gated
 * intake:create_ticket; scoped to the caller's organization.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { assertAndAudit } from "../../../lib/authz";
import { prisma } from "@aegis/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  try {
    await assertAndAudit(user, Permission.IntakeCreateTicket, { route: "one-legal.history" });
    const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    // OL-4 / "My activity": scope=mine returns the caller's tasks across ALL
    // their ONE Legal sessions (sessions they started), not just the current
    // one — so the console can show a cross-session personal history. Default
    // stays session-scoped. Org scoping is always applied.
    const mine = req.query.scope === "mine";
    const where = mine
      ? { organizationId: user.organizationId, session: { startedById: user.id } }
      : { organizationId: user.organizationId, ...(sessionId ? { sessionId } : {}) };
    try {
      const rows = await prisma.legalTask.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        // OL-5: select answerSnapshot only to derive a `hasAnswer` flag — the
        // full body stays off the list (fetched on demand via /task) so the
        // list payload stays small.
        select: { id: true, title: true, request: true, kind: true, toolId: true, status: true, resourceType: true, resourceId: true, resourceLabel: true, navigate: true, createdAt: true, answerSnapshot: true },
      });
      const tasks = rows.map(({ answerSnapshot, ...t }) => ({ ...t, hasAnswer: !!answerSnapshot }));
      return res.status(200).json({ ok: true, tasks });
    } catch {
      return res.status(200).json({ ok: true, tasks: [] }); // table not deployed yet
    }
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
