/**
 * GET /api/intake/tickets/[id]/deliverable — streams the agent's
 * recommendation for this ticket as a Word (.docx) document the
 * reviewer can download and (after approval) share with the client /
 * counterparty. Gated intake:read_all_tickets. Read-only; the .docx is
 * generated on demand from the persisted recommendation, so no storage
 * or extra state.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { prisma } from "@aegis/db";
import { renderAgentDeliverableDocx, deliverableFilename } from "@aegis/documents";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JS agent registry, no types
import { AGENTS_BY_ID } from "@aegis/intake/agents";
import { requireActor } from "../../../../../lib/matter-actor";

export const config = { api: { responseLimit: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.IntakeReadAllTickets);
  if (!actor) return;
  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) return res.status(400).json({ ok: false, error: "Missing ticket id" });

  const ticket = await prisma.intakeTicket.findFirst({
    where: { id, organizationId: actor.organizationId },
    select: {
      id: true, type: true, description: true, submittedAt: true, department: true,
      requester: { select: { name: true } },
      recommendations: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          agentId: true, confidence: true, suggestedAction: true, draftedResponse: true,
          reasoning: true, concerns: true, citations: true, risksJson: true, playbookJson: true,
        },
      },
    },
  });
  if (!ticket) return res.status(404).json({ ok: false, error: "Ticket not found" });
  const rec = ticket.recommendations[0];
  if (!rec) return res.status(404).json({ ok: false, error: "No agent recommendation to render yet" });

  const agentMeta = (AGENTS_BY_ID as Record<string, { name?: string }>)[rec.agentId];
  const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

  const buffer = await renderAgentDeliverableDocx({
    ticket: {
      id: ticket.id,
      type: ticket.type,
      from: ticket.requester?.name ?? null,
      dept: ticket.department ?? null,
      submitted: ticket.submittedAt ? ticket.submittedAt.toISOString().slice(0, 16).replace("T", " ") : null,
    },
    agent: { id: rec.agentId, name: agentMeta?.name ?? rec.agentId },
    recommendation: {
      confidence: rec.confidence,
      suggestedAction: rec.suggestedAction,
      draftedResponse: rec.draftedResponse,
      reasoning: rec.reasoning,
      concerns: asStrings(rec.concerns),
      citations: Array.isArray(rec.citations) ? (rec.citations as Array<{ id?: string; title?: string }>) : [],
      risks: asStrings(rec.risksJson),
      playbook: (rec.playbookJson as { id?: string; version?: string } | null) ?? null,
    },
    generatedAt: new Date().toISOString(),
    generatedBy: actor.name,
  });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", `attachment; filename="${deliverableFilename(ticket.id, rec.agentId)}"`);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(buffer);
}
