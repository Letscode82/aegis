/**
 * POST /api/one-legal/record — persist a completed ONE Legal task (OL-4).
 *
 * Durable record of the agentic front door's runs so a session survives reload
 * and its actions appear in the Working folder. Best-effort: if the
 * ConsoleSession/LegalTask tables aren't deployed yet, this no-ops and the
 * console keeps working unpersisted. Gated intake:create_ticket.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { prisma } from "@aegis/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  try {
    assertUserCanDo(user, Permission.IntakeCreateTicket);
    const b = (req.body || {}) as Record<string, unknown>;
    const sessionId = String(b.sessionId || "").trim();
    const title = String(b.title || "").trim().slice(0, 200);
    const request = String(b.request || "").slice(0, 2000);
    const kind = ["file", "tool", "ask"].includes(String(b.kind)) ? String(b.kind) : "file";
    if (!sessionId || !title) return res.status(400).json({ ok: false, error: "sessionId + title required" });

    const str = (v: unknown, n = 200) => (v == null ? null : String(v).slice(0, n));
    try {
      await prisma.consoleSession.upsert({
        where: { id: sessionId },
        create: { id: sessionId, organizationId: user.organizationId, startedById: user.id },
        update: {},
      });
      await prisma.legalTask.create({
        data: {
          organizationId: user.organizationId,
          sessionId,
          title,
          request,
          kind,
          toolId: str(b.toolId, 80),
          status: str(b.status, 20) || "done",
          resourceType: str(b.resourceType, 80),
          resourceId: str(b.resourceId, 120),
          resourceLabel: str(b.resourceLabel, 200),
          navigate: str(b.navigate, 40),
          error: str(b.error, 500),
        },
      });
    } catch { /* tables not deployed yet → best-effort no-op */ }
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
