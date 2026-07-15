/**
 * LIVE functional test — every intake agent, end to end.
 *
 * For each of the 11 registered agents this drives the REAL pipeline:
 *   1. routing      — routeToAgent() must pick the intended agent from a
 *                     representative ticket (canHandle + router order).
 *   2. processing   — agent.process(ticket) must return a real
 *                     recommendation (numeric confidence, a suggested
 *                     action, and non-empty drafted output).
 *   3. deliverable  — that recommendation must render to a valid Word
 *                     (.docx) via @aegis/documents.renderAgentDeliverableDocx.
 *
 * The .docx bytes are written to AGENT_DELIVERABLE_OUT so they can be
 * opened / handed to the client. Agents that call Claude degrade
 * gracefully offline (buildDegradedRec) — the test still exercises the
 * full path and still produces a deliverable.
 *
 * This is a driver, not app code: it lives in tests/ (intake lint scopes
 * to src/), and reaches the documents renderer by relative path — the
 * composition root (apps/web) is where the two normally meet.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { renderAgentDeliverableDocx, deliverableFilename } from "@aegis/documents";

// Surface the mock agents (Trademark / Contract Review) so all 11 route.
process.env.NEXT_PUBLIC_AEGIS_DEMO_AGENTS = "true";

const OUT = process.env.AGENT_DELIVERABLE_OUT || "/tmp/agent-deliverables";
const NOW = "2026-07-15T09:00:00.000Z";
const SUBMITTED = Date.parse("2026-07-15T09:00:00.000Z");

interface Ticket {
  id: string;
  from: string;
  dept: string;
  type: string;
  priority?: string;
  desc: string;
  submittedTs?: number;
  slaHours?: number;
}

// One representative ticket per agent — crafted to route to the agent
// under test through the real canHandle() + router-order logic.
const CASES: Array<{ agentId: string; label: string; ticket: Ticket }> = [
  {
    agentId: "nda-agent",
    label: "NDA",
    ticket: {
      id: "T-NDA-001", from: "Priya Sharma", dept: "Business Development", type: "NDA", priority: "Medium",
      desc: "Please draft a mutual NDA with Acme Robotics Inc. for an upcoming partnership discussion. Standard 2-year term is fine.",
    },
  },
  {
    agentId: "vendor-intake-agent",
    label: "Vendor Due Diligence",
    ticket: {
      id: "T-VEN-001", from: "Rahul Mehta", dept: "Procurement", type: "Vendor Due Diligence", priority: "Medium",
      desc: "New vendor onboarding for Nordwind GmbH (Germany). Please run due diligence and sanctions screening before we sign.",
    },
  },
  {
    agentId: "trademark-agent",
    label: "Trademark",
    ticket: {
      id: "T-TM-001", from: "Anita Rao", dept: "Brand", type: "Trademark", priority: "Medium",
      desc: "Trademark clearance search for the brand name 'Lumen' in class 9 (software), US and EU.",
    },
  },
  {
    agentId: "litigation-agent",
    label: "Litigation",
    ticket: {
      id: "T-LIT-001", from: "David Kim", dept: "Legal", type: "Litigation", priority: "High",
      desc: "We've been served with a summons and complaint in a contract dispute filed by Vertex Supplies LLC in Delaware.",
    },
  },
  {
    agentId: "notice-mgmt-agent",
    label: "Legal Notice",
    ticket: {
      id: "T-NOT-001", from: "Sara Okoro", dept: "Operations", type: "Legal Notice", priority: "High",
      desc: "We received a notice of breach from our supplier with a 15-day cure period. Response due by 2026-08-01.",
      submittedTs: SUBMITTED, slaHours: 72,
    },
  },
  {
    agentId: "contract-specialist-agent",
    label: "Contract-Type Specialist",
    ticket: {
      id: "T-CTS-001", from: "Tom Baker", dept: "Clinical Ops", type: "Contract", priority: "Medium",
      desc: "Please review this clinical trial agreement with a study site (investigator agreement) for our Phase II study.",
    },
  },
  {
    agentId: "contract-review-agent",
    label: "Contract Review",
    ticket: {
      id: "T-CRV-001", from: "Nadia Farouk", dept: "Sales", type: "Contract Review", priority: "Medium",
      desc: "Please redline this reseller agreement — flag anything off our standard positions.",
    },
  },
  {
    agentId: "privacy-assessment-agent",
    label: "Privacy Assessment",
    ticket: {
      id: "T-PRV-001", from: "Elena Duarte", dept: "Product", type: "Privacy", priority: "Medium",
      desc: "We're launching a new customer loyalty app that will process personal data across the EU. Need a DPIA before go-live.",
    },
  },
  {
    agentId: "marketing-review-agent",
    label: "Marketing Review",
    ticket: {
      id: "T-MKT-001", from: "Chris Ivanov", dept: "Marketing", type: "Marketing Review", priority: "Medium",
      desc: "Please review the ad copy for our summer campaign for any unsubstantiated performance claims.",
    },
  },
  {
    agentId: "faq-agent",
    label: "FAQ / Self-serve",
    ticket: {
      id: "T-FAQ-001", from: "Jamie Lee", dept: "Sales", type: "Question", priority: "Low",
      desc: "Can I share this document with a vendor?",
    },
  },
  {
    agentId: "policy-qa-agent",
    label: "Policy Q&A",
    ticket: {
      id: "T-POL-001", from: "Morgan Patel", dept: "People", type: "Question", priority: "Low",
      desc: "What is our remote work / work from home policy for cross-border employees?",
    },
  },
];

// Loaded after the demo flag is set so ALL_AGENTS includes the mocks.
let routeToAgent: (t: unknown, s?: unknown, p?: unknown) => { id: string; name?: string } | null;
let AGENTS_BY_ID: Record<string, { id: string; name?: string }>;

const results: Array<Record<string, unknown>> = [];

beforeAll(async () => {
  const mod = await import("../src/agents/index.js");
  routeToAgent = mod.routeToAgent as typeof routeToAgent;
  AGENTS_BY_ID = mod.AGENTS_BY_ID as typeof AGENTS_BY_ID;
  mkdirSync(OUT, { recursive: true });
});

describe("LIVE agent functional pass (route → process → .docx deliverable)", () => {
  for (const c of CASES) {
    it(`${c.label} → ${c.agentId}: routes, processes, and renders a deliverable`, async () => {
      // 1) ROUTING
      const routed = routeToAgent(c.ticket, undefined, undefined);
      expect(routed, `no agent routed for ${c.label}`).toBeTruthy();
      expect(routed!.id, `wrong agent for ${c.label}`).toBe(c.agentId);

      const agent = AGENTS_BY_ID[c.agentId];

      // 2) PROCESSING (real agent logic; degrades gracefully offline)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rec: any = await (agent as any).process(c.ticket);
      expect(typeof rec.confidence, "confidence must be numeric").toBe("number");
      expect(rec.suggestedAction, "must suggest an action").toBeTruthy();
      expect(
        (rec.draftedResponse && rec.draftedResponse.length > 0) ||
          (rec.reasoning && rec.reasoning.length > 0),
        "must produce drafted output or reasoning",
      ).toBe(true);

      // 3) DELIVERABLE — render the real .docx
      const buf = await renderAgentDeliverableDocx({
        ticket: {
          id: c.ticket.id, type: c.ticket.type, from: c.ticket.from, dept: c.ticket.dept,
          submitted: NOW.slice(0, 10),
        },
        agent: { id: agent.id, name: agent.name },
        recommendation: {
          confidence: rec.confidence,
          suggestedAction: rec.suggestedAction,
          draftedResponse: rec.draftedResponse,
          reasoning: rec.reasoning,
          concerns: rec.concerns,
          citations: rec.precedentLinks,
          risks: rec.risks,
          playbook: rec.playbook,
        },
        generatedAt: NOW,
        generatedBy: "Functional Test",
      });

      // Structural validation of the .docx (OOXML zip container).
      expect(buf.length).toBeGreaterThan(2000);
      expect(buf.subarray(0, 2).toString("latin1"), "not a ZIP/.docx").toBe("PK");
      // Zip stores entry filenames uncompressed in local headers.
      expect(buf.includes(Buffer.from("word/document.xml")), "missing document.xml").toBe(true);
      expect(buf.includes(Buffer.from("[Content_Types].xml")), "missing content types").toBe(true);

      const fname = deliverableFilename(c.ticket.id, agent.id);
      writeFileSync(`${OUT}/${fname}`, buf);

      results.push({
        agent: agent.name || agent.id,
        agentId: agent.id,
        ticket: c.ticket.id,
        confidence: typeof rec.confidence === "number" ? `${Math.round(rec.confidence * 100)}%` : "—",
        action: rec.suggestedAction,
        degraded: rec.mock === true,
        docxKB: Math.round(buf.length / 102.4) / 10,
        file: fname,
      });
    });
  }

  it("prints the functional-pass report", () => {
    // eslint-disable-next-line no-console
    console.log("\n================ LIVE AGENT FUNCTIONAL PASS ================");
    for (const r of results) {
      // eslint-disable-next-line no-console
      console.log(
        `✓ ${(r.agent as string).padEnd(26)} ${(r.action as string).padEnd(20)} ` +
          `conf=${String(r.confidence).padStart(4)} ${r.degraded ? "[offline-fallback]" : "[live]"}  ` +
          `${r.docxKB}KB  ${r.file}`,
      );
    }
    // eslint-disable-next-line no-console
    console.log(`\n${results.length}/11 agents produced a valid .docx deliverable → ${OUT}`);
    // eslint-disable-next-line no-console
    console.log("===========================================================\n");
    expect(results.length).toBe(CASES.length);
  });
});
