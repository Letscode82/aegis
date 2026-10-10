/**
 * POST /api/intake/request-stream — the command-bar front door (WS-1),
 * streamed.
 *
 * Same pipeline as `POST /api/intake/request` (classify → build v8 ticket →
 * persist through the intake chokepoint so routing rules + chain-sealed
 * audit fire), but each stage is emitted as a Server-Sent Event the moment
 * its real server-side work completes — so the Command Console's plan ticks
 * off against actual progress rather than client-side timers.
 *
 * Frame shape (one JSON object per `data:` frame):
 *   { type: "step",   key, state: "active" | "done" | "error", detail? }
 *   { type: "result", result: <same payload as the sync route> }
 *   { type: "error",  error: string }
 *
 * The Console degrades to the synchronous route if streaming is unavailable.
 * Gated intake:create_ticket. No new table.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { classifyIntakeRegex, classifyIntakeLaya } from "@aegis/ai";
import { fileIntakeTicket } from "@aegis/intake/create";

type StepState = "active" | "done" | "error";
type Frame =
  | { type: "step"; key: string; state: StepState; detail?: string }
  | { type: "result"; result: unknown }
  | { type: "error"; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  // Auth + input validation happen before the stream opens, so a failure
  // here is still a normal JSON status response.
  let text: string;
  let dept: string;
  let bodyType: string | undefined;
  try {
    assertUserCanDo(user, Permission.IntakeCreateTicket);
    const body = (req.body || {}) as { text?: string; dept?: string; type?: string };
    text = String(body.text || "").trim();
    if (text.length < 3) return res.status(400).json({ ok: false, error: "Describe your request in a few words." });
    dept = String(body.dept || "").trim();
    bodyType = body.type;
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

  const send = (f: Frame): void => {
    res.write(`data: ${JSON.stringify(f)}\n\n`);
  };

  try {
    // Step 1 — read: request received + parsed.
    send({ type: "step", key: "read", state: "active" });
    const desc = text.slice(0, 500);
    send({ type: "step", key: "read", state: "done" });

    // Step 2 — classify: Laya (System-1) first, deterministic regex as the
    // floor, default last. Laya returns null when disabled / unavailable /
    // low-confidence, so this degrades cleanly.
    send({ type: "step", key: "classify", state: "active" });
    type Triage = { cat: string; priority: string; team: string; sla: string; slaHours: number; rule: string; conf: number; risk: string; note: string; hrs: number; source?: string };
    const regex = classifyIntakeRegex(desc, dept) as Triage | null;
    const laya = (await classifyIntakeLaya(desc, dept)) as Triage | null;
    const triage: Triage = laya || regex || {
      cat: bodyType || "General Inquiry",
      priority: "Medium",
      team: "Triage Queue",
      sla: "24 hrs",
      slaHours: 24,
      rule: "RULE-default",
      conf: 70,
      risk: "Medium",
      note: "Command-bar intake",
      hrs: 2,
      source: "copilot",
    };
    send({ type: "step", key: "classify", state: "done", detail: `→ ${triage.cat}${laya ? " · Laya" : ""}` });

    // Step 3 — route: destination resolved from the classification.
    send({ type: "step", key: "route", state: "active" });
    send({ type: "step", key: "route", state: "done", detail: `→ ${triage.team} · ${triage.priority}` });

    // Step 4 — file: persist through the intake chokepoint (routing rules +
    // audit fire inside this call).
    send({ type: "step", key: "file", state: "active" });
    // Unified create path: mints the sequential REQ number, builds the
    // canonical v8 ticket, and persists through the intake chokepoint
    // (routing rules + chain-sealed audit fire inside).
    const { ticketId: id, spawnedMatters: matters, spawnedContracts: contracts } = await fileIntakeTicket({
      user,
      dept,
      type: bodyType,
      desc,
      triage,
      context: { req, res },
    });
    send({ type: "step", key: "file", state: "done", detail: `→ ${id}` });

    // Step 5 — dispatch (only when the intake pipeline spawned downstream work).
    if (matters.length + contracts.length > 0) {
      send({ type: "step", key: "dispatch", state: "active" });
      send({ type: "step", key: "dispatch", state: "done", detail: `→ ${matters.length} matter(s), ${contracts.length} contract(s)` });
    }

    // Step 6 — done.
    send({ type: "step", key: "done", state: "active" });
    send({ type: "step", key: "done", state: "done" });

    send({
      type: "result",
      result: {
        ok: true,
        ticketId: id,
        classification: {
          category: triage.cat,
          team: triage.team,
          priority: triage.priority,
          sla: triage.sla,
          slaHours: triage.slaHours,
          confidence: triage.conf,
          risk: triage.risk,
          routingRule: triage.rule,
          matched: !!(laya || regex),
        },
        spawned: { matters, contracts },
      },
    });
  } catch (err) {
    send({ type: "error", error: String((err as Error).message || err) });
  } finally {
    res.end();
  }
}
