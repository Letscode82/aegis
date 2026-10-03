/**
 * POST /api/one-legal/run — the ONE Legal orchestration front door (OL-2′).
 *
 * A single streaming (Server-Sent Events) route that unifies planning
 * (`/plan`) and governed execution (`/act`) behind one task-graph stream.
 * It has two modes on the same endpoint:
 *
 *   Plan mode   (no `execute` in the body): decompose the request into tasks
 *     (shared `planTasks`), attach a governed tool proposal to each, and emit
 *     them as they resolve. Mutates nothing — governed tasks stream a
 *     `needs_approval` frame; the human approves each in the console.
 *
 *   Execute mode (`execute: [{ toolId, text, targetId? }]`): run ONLY the
 *     human-approved tools the caller lists, each through the universal gate
 *     (`executeGovernedTool`, OL-3): PENDING AgentDecision → permission →
 *     mutate → APPROVED + chain-sealed audit. Nothing runs that the caller
 *     didn't explicitly approve, so conservative AI governance is intact.
 *
 * Frame shape (one JSON object per `data:` frame):
 *   { type: "plan",           count }
 *   { type: "task",           index, title, request, tool }
 *   { type: "needs_approval", index, tool }
 *   { type: "task_started",   index, toolId }
 *   { type: "task_succeeded", index, result }
 *   { type: "task_failed",    index, error }
 *   { type: "complete",       planned?, executed? }
 *   { type: "error",          error }
 *
 * The console degrades to the synchronous `/plan` + `/act` routes if streaming
 * is unavailable. Gated intake:create_ticket (same as the other console routes).
 * No new table.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { assertAndAudit } from "../../../lib/authz";
import { planTasks } from "../../../lib/one-legal/plan-tasks";
import { getTool, executeGovernedTool, toolProposalFor, proposalForTool, type ToolProposal } from "../../../lib/one-legal/tools";
import { detectSpine } from "../../../lib/one-legal/spine";

type ExecItem = { toolId?: string; text?: string; targetId?: string };

type Frame =
  | { type: "plan"; count: number; spine?: boolean }
  | { type: "task"; index: number; title: string; request: string; tool: ToolProposal | null; dependsOn?: number | null }
  | { type: "needs_approval"; index: number; tool: ToolProposal }
  | { type: "task_started"; index: number; toolId: string }
  | { type: "task_succeeded"; index: number; result: { resourceId: string; resourceLabel: string; label: string; navigate: string; argsSummary: string } }
  | { type: "task_failed"; index: number; error: string }
  | { type: "complete"; planned?: number; executed?: number }
  | { type: "error"; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  // Auth + input validation happen before the stream opens, so a failure here
  // is still a normal JSON status response.
  let text: string;
  let execute: ExecItem[] | null;
  try {
    await assertAndAudit(user, Permission.IntakeCreateTicket, { route: "one-legal.run" });
    const body = (req.body || {}) as { text?: string; execute?: ExecItem[] };
    text = String(body.text || "").trim();
    execute = Array.isArray(body.execute) && body.execute.length ? body.execute : null;
    if (!execute && text.length < 3) return res.status(400).json({ ok: false, error: "Describe your request in a few words." });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }

  // Open the SSE stream. Headers must be set before any write.
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  const send = (f: Frame): void => { res.write(`data: ${JSON.stringify(f)}\n\n`); };

  try {
    if (execute) {
      // Execute mode — run each human-approved tool through the universal gate.
      let executed = 0;
      for (let i = 0; i < execute.length; i++) {
        const item = execute[i] || {};
        const toolId = String(item.toolId || "");
        const itemText = String(item.text || "").trim();
        const targetId = item.targetId ? String(item.targetId) : undefined;
        const tool = getTool(toolId);
        if (!tool) { send({ type: "task_failed", index: i, error: `Unknown tool: ${toolId}` }); continue; }
        if (itemText.length < 3) { send({ type: "task_failed", index: i, error: "Missing request text." }); continue; }
        if (tool.needsTarget && !targetId) { send({ type: "task_failed", index: i, error: `Select a ${tool.needsTarget.label.toLowerCase()} first.` }); continue; }
        send({ type: "task_started", index: i, toolId });
        try {
          const r = await executeGovernedTool(tool, { text: itemText, targetId, user }, { route: "one-legal.run" });
          send({ type: "task_succeeded", index: i, result: { resourceId: r.resourceId, resourceLabel: r.resourceLabel, label: r.label, navigate: r.navigate, argsSummary: r.argsSummary } });
          executed += 1;
        } catch (err) {
          const msg = err instanceof AccessDeniedError ? err.decision.message : String((err as Error).message || err);
          send({ type: "task_failed", index: i, error: msg });
        }
      }
      send({ type: "complete", executed });
      return res.end();
    }

    // Plan mode — decompose + propose. Mutates nothing.
    // The cross-module demo spine (OL-7) takes priority: a litigation-service
    // trigger fans out into the ordered governed graph with chained targets.
    const spine = detectSpine(text);
    if (spine) {
      send({ type: "plan", count: spine.length, spine: true });
      spine.forEach((step, i) => {
        const tool = proposalForTool(step.toolId, step.request);
        send({ type: "task", index: i, title: step.title, request: step.request, tool, dependsOn: step.dependsOn });
        if (tool) send({ type: "needs_approval", index: i, tool });
      });
      send({ type: "complete", planned: spine.length });
      return res.end();
    }

    const tasks = await planTasks(text);
    send({ type: "plan", count: tasks.length });
    tasks.forEach((tk, i) => {
      const tool = toolProposalFor(tk.request);
      send({ type: "task", index: i, title: tk.title, request: tk.request, tool, dependsOn: null });
      if (tool) send({ type: "needs_approval", index: i, tool });
    });
    send({ type: "complete", planned: tasks.length });
    return res.end();
  } catch (err) {
    // Mid-stream failure — the client has headers already, so surface it as a
    // frame rather than a status code, then end cleanly.
    try { send({ type: "error", error: String((err as Error).message || err) }); } catch { /* socket gone */ }
    return res.end();
  }
}
