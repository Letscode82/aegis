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
import { intakeStorageSet } from "@aegis/intake/server";

const TICKETS_KEY = "aegis:tickets:v1";

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

    const now = new Date();
    const id = "REQ-" + (5000 + Math.floor(Math.random() * 4999));
    const ticket = {
      id,
      _source: "copilot",
      from: user.name || "(via Command Bar)",
      dept: dept || "Unspecified",
      type: body.type || triage.cat || "Other",
      priority: triage.priority || "Medium",
      submitted: now.toISOString().slice(0, 16).replace("T", " "),
      submittedTs: now.getTime(),
      sla: triage.sla,
      slaHours: triage.slaHours,
      slaStatus: "On Track",
      desc,
      assigned: "Cockpit Queue",
      status: "Awaiting Triage",
      stage: "new",
      seeded: false,
      workflow: [
        { label: "Submitted (Command Bar)", done: true },
        { label: "Agent Analysis", active: true },
        { label: "Attorney Review" },
        { label: "Close" },
      ],
      aiTriage: {
        category: triage.cat,
        riskFlag: `${triage.risk} — ${triage.note}`,
        suggestedAssignee: triage.team,
        estimatedHours: triage.hrs,
        similarMatters: 0,
        confidence: triage.conf,
        routingRule: `${triage.rule}: ${triage.cat}`,
        source: triage.source || "copilot",
      },
    };

    const result = (await intakeStorageSet(TICKETS_KEY, JSON.stringify([ticket]), { req, res })) as
      | { spawnedMatters?: unknown[]; spawnedContracts?: unknown[] }
      | undefined;

    return res.status(200).json({
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
      spawned: {
        matters: (result && result.spawnedMatters) || [],
        contracts: (result && result.spawnedContracts) || [],
      },
    });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
