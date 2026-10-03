/**
 * POST /api/one-legal/plan — decompose a legal request into tasks (OL-1).
 *
 * ONE Legal's Cowork-style execution window: a compound request
 * ("open a matter and put a hold on the deal team") is split into an ordered
 * list of independently-actionable tasks, each of which the console then
 * runs through the existing governed intake pipeline (classify → route →
 * file → spawn). A simple single request returns one task.
 *
 * Decomposition uses Claude via the server transport (key stays server-side)
 * and DEGRADES to a deterministic splitter when the model is unavailable or
 * the output is malformed — so it always returns at least one task and never
 * blocks the console. No mutation, no schema; gated intake:create_ticket.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { assertAndAudit } from "../../../lib/authz";
import { planTasks } from "../../../lib/one-legal/plan-tasks";
import { toolProposalFor, proposalForTool } from "../../../lib/one-legal/tools";
import { detectSpine } from "../../../lib/one-legal/spine";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    await assertAndAudit(user, Permission.IntakeCreateTicket, { route: "one-legal.plan" });
    const text = String((req.body || {}).text || "").trim();
    if (text.length < 3) return res.status(400).json({ ok: false, error: "Describe your request in a few words." });

    // The cross-module demo spine (OL-7) takes priority — same ordered graph
    // the streaming /run route produces, so the degrade path matches it.
    const spine = detectSpine(text);
    if (spine) {
      const spineTasks = spine.map((step) => ({ title: step.title, request: step.request, tool: proposalForTool(step.toolId, step.request), dependsOn: step.dependsOn }));
      return res.status(200).json({ ok: true, spine: true, tasks: spineTasks });
    }

    const tasks = await planTasks(text);
    // Attach a governed tool proposal to each task where one applies (display
    // only — execution happens via /api/one-legal/act after human Approve).
    const withTools = tasks.map((tk) => ({ ...tk, tool: toolProposalFor(tk.request), dependsOn: null }));
    return res.status(200).json({ ok: true, tasks: withTools });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
