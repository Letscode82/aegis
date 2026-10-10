/**
 * POST /api/intake/request — the command-bar / omnibox front door (WS-1).
 *
 * Takes a free-text legal request, classifies it with the deterministic
 * intake classifier, builds a v8 intake ticket (source COPILOT), and
 * persists it through the same chokepoint the Copilot/form use — so the
 * server-side routing rules and the chain-sealed audit fire automatically.
 * Returns the classification + routed destination so the command bar can
 * show where the request landed, plus any matter/contract it spawned.
 *
 * Gated intake:create_ticket. No new table — this is a thin adapter over
 * the existing intake create pipeline.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { classifyIntakeRegex, classifyIntakeLaya } from "@aegis/ai";
import { fileIntakeTicket } from "@aegis/intake/create";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    assertUserCanDo(user, Permission.IntakeCreateTicket);

    const body = (req.body || {}) as { text?: string; dept?: string; type?: string };
    const text = String(body.text || "").trim();
    if (text.length < 3) return res.status(400).json({ ok: false, error: "Describe your request in a few words." });
    const dept = String(body.dept || "").trim();

    const desc = text.slice(0, 500);
    // Laya (System-1) first, deterministic regex as the floor, default last.
    // Laya returns null when disabled / unavailable / low-confidence.
    type Triage = { cat: string; priority: string; team: string; sla: string; slaHours: number; rule: string; conf: number; risk: string; note: string; hrs: number; source?: string };
    const regex = classifyIntakeRegex(desc, dept) as Triage | null;
    const laya = (await classifyIntakeLaya(desc, dept)) as Triage | null;
    const triage: Triage = laya || regex || {
      cat: body.type || "General Inquiry",
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

    // Unified create path: mints the sequential REQ number, builds the
    // canonical v8 ticket, and persists through the intake chokepoint
    // (routing rules + chain-sealed audit fire inside).
    const { ticketId, spawnedMatters, spawnedContracts } = await fileIntakeTicket({
      user,
      dept,
      type: body.type,
      desc,
      triage,
      context: { req, res },
    });

    return res.status(200).json({
      ok: true,
      ticketId,
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
      spawned: {
        matters: spawnedMatters,
        contracts: spawnedContracts,
      },
    });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
