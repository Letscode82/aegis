/**
 * GET /api/one-legal/task?id= — fetch one persisted ONE Legal task with its
 * saved answer body (OL-5), so the console can reopen a past ask / deep-review
 * / document analysis read-only from the Recent list (ChatGPT/Claude-style).
 *
 * Kept separate from /history so the list stays light — the (potentially large)
 * answer body is fetched only when a row is actually reopened. Best-effort:
 * returns 404 if the LegalTask table isn't deployed yet. Gated
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
    await assertAndAudit(user, Permission.IntakeCreateTicket, { route: "one-legal.task" });
    const id = typeof req.query.id === "string" ? req.query.id : "";
    if (!id) return res.status(400).json({ ok: false, error: "id is required." });
    try {
      // Org-scoped lookup — a task id from another organization returns 404,
      // never another tenant's content.
      const task = await prisma.legalTask.findFirst({
        where: { id, organizationId: user.organizationId },
        select: {
          id: true, title: true, request: true, kind: true, toolId: true, status: true,
          resourceType: true, resourceId: true, resourceLabel: true, navigate: true,
          error: true, answerSnapshot: true, createdAt: true,
        },
      });
      if (!task) return res.status(404).json({ ok: false, error: "Task not found." });
      return res.status(200).json({ ok: true, task });
    } catch {
      return res.status(404).json({ ok: false, error: "Task history is not available." });
    }
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
