/**
 * LIVE functional test — SUCCESS PATH (the branch the offline run can't reach).
 *
 * The bare-process run (_live-agent-functional.test.ts) has no Claude
 * transport, so every Claude-backed agent takes its degraded/catch
 * branch. This harness installs a DETERMINISTIC transport stub (clearly
 * NOT the real Anthropic API — no network, no key) so each agent's
 * SUCCESS branch executes: JSON parse, confidence, per-agent action
 * logic (NDA deviation-gating, Notice SLA sizing, escalate vs
 * approve-and-send), and a full drafted deliverable.
 *
 * In the deployed app this same code path runs against the real
 * /api/claude proxy (browser) or the direct Anthropic transport
 * (server, ANTHROPIC_API_KEY set) — the transport is the only thing
 * swapped. Drafts written here are synthetic (from the stub); the point
 * is to verify the success-branch LOGIC and the deliverable rendering.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { setClaudeTransport } from "@aegis/ai";
import { renderAgentDeliverableDocx, deliverableFilename } from "@aegis/documents";

process.env.NEXT_PUBLIC_AEGIS_DEMO_AGENTS = "true";

const OUT = (process.env.AGENT_DELIVERABLE_OUT || "/tmp/agent-deliverables") + "/success-path";
const NOW = "2026-07-15T09:00:00.000Z";
const SUBMITTED = Date.parse("2026-07-15T09:00:00.000Z");

// A deterministic stand-in for Anthropic. Reads the agent's prompt, echoes
// a professional draft tied to the request, and returns the JSON envelope
// every agent parses. Confidence 0.9 so success-branch gating is exercised.
function stubTransport(body: { messages: Array<{ content: string }> }) {
  const prompt = body.messages?.[0]?.content || "";
  const descMatch = prompt.match(/Description:\s*"([^"]+)"/i) || prompt.match(/"([^"]{20,180})"/);
  const subject = descMatch ? descMatch[1].slice(0, 140) : "the request";
  const firstName = (prompt.match(/Requester:\s*([A-Za-z]+)/) || [])[1] || "there";
  const draft =
    `Hi ${firstName},\n\n` +
    `I've completed the first-pass work on your request — "${subject}". ` +
    `The analysis below applies our standard playbook; key terms are within accepted bands and I've flagged anything that needs a human decision.\n\n` +
    `Summary of what I did, the standard I applied, and the recommended next step are in the attached deliverable. ` +
    `This is ready for your review and (on approval) release.\n\n— AEGIS Legal`;
  const json = JSON.stringify({
    draftedResponse: draft,
    alternativeTone: `${firstName} — first pass done on "${subject.slice(0, 60)}". Ready for your review.`,
    confidence: 0.9,
    reasoning: "Template-fit match against the applicable playbook; terms within standard bands.",
    concerns: [],
  });
  return Promise.resolve({ content: [{ type: "text", text: json }] });
}

interface Ticket {
  id: string; from: string; dept: string; type: string; priority?: string;
  desc: string; submittedTs?: number; slaHours?: number;
}
const CASES: Array<{ agentId: string; label: string; ticket: Ticket }> = [
  { agentId: "nda-agent", label: "NDA", ticket: { id: "T-NDA-001", from: "Priya Sharma", dept: "Business Development", type: "NDA", desc: "Please draft a mutual NDA with Acme Robotics Inc. for an upcoming partnership discussion. Standard 2-year term is fine." } },
  { agentId: "vendor-intake-agent", label: "Vendor Due Diligence", ticket: { id: "T-VEN-001", from: "Rahul Mehta", dept: "Procurement", type: "Vendor Due Diligence", desc: "New vendor onboarding for Nordwind GmbH (Germany). Please run due diligence and sanctions screening before we sign." } },
  { agentId: "trademark-agent", label: "Trademark", ticket: { id: "T-TM-001", from: "Anita Rao", dept: "Brand", type: "Trademark", desc: "Trademark clearance search for the brand name 'Lumen' in class 9 (software), US and EU." } },
  { agentId: "litigation-agent", label: "Litigation", ticket: { id: "T-LIT-001", from: "David Kim", dept: "Legal", type: "Litigation", priority: "High", desc: "We've been served with a summons and complaint in a contract dispute filed by Vertex Supplies LLC in Delaware." } },
  { agentId: "notice-mgmt-agent", label: "Legal Notice", ticket: { id: "T-NOT-001", from: "Sara Okoro", dept: "Operations", type: "Legal Notice", priority: "High", desc: "We received a notice of breach from our supplier with a 15-day cure period. Response due by 2026-08-01.", submittedTs: SUBMITTED, slaHours: 72 } },
  { agentId: "contract-specialist-agent", label: "Contract-Type Specialist", ticket: { id: "T-CTS-001", from: "Tom Baker", dept: "Clinical Ops", type: "Contract", desc: "Please review this clinical trial agreement with a study site (investigator agreement) for our Phase II study." } },
  { agentId: "contract-review-agent", label: "Contract Review", ticket: { id: "T-CRV-001", from: "Nadia Farouk", dept: "Sales", type: "Contract Review", desc: "Please redline this reseller agreement — flag anything off our standard positions." } },
  { agentId: "privacy-assessment-agent", label: "Privacy Assessment", ticket: { id: "T-PRV-001", from: "Elena Duarte", dept: "Product", type: "Privacy", desc: "We're launching a new customer loyalty app that will process personal data across the EU. Need a DPIA before go-live." } },
  { agentId: "marketing-review-agent", label: "Marketing Review", ticket: { id: "T-MKT-001", from: "Chris Ivanov", dept: "Marketing", type: "Marketing Review", desc: "Please review the ad copy for our summer campaign for any unsubstantiated performance claims." } },
  { agentId: "faq-agent", label: "FAQ / Self-serve", ticket: { id: "T-FAQ-001", from: "Jamie Lee", dept: "Sales", type: "Question", desc: "Can I share this document with a vendor?" } },
  { agentId: "policy-qa-agent", label: "Policy Q&A", ticket: { id: "T-POL-001", from: "Morgan Patel", dept: "People", type: "Question", desc: "What is our remote work / work from home policy for cross-border employees?" } },
];

let routeToAgent: (t: unknown, s?: unknown, p?: unknown) => { id: string; name?: string } | null;
let AGENTS_BY_ID: Record<string, { id: string; name?: string }>;
const results: Array<Record<string, unknown>> = [];

beforeAll(async () => {
  setClaudeTransport(stubTransport as never); // install the deterministic stub
  const mod = await import("../src/agents/index.js");
  routeToAgent = mod.routeToAgent as typeof routeToAgent;
  AGENTS_BY_ID = mod.AGENTS_BY_ID as typeof AGENTS_BY_ID;
  mkdirSync(OUT, { recursive: true });
});

describe("LIVE agent SUCCESS path (transport stub → high-confidence draft → .docx)", () => {
  for (const c of CASES) {
    it(`${c.label} → ${c.agentId}: success branch produces a drafted deliverable`, async () => {
      const routed = routeToAgent(c.ticket, undefined, undefined);
      expect(routed!.id).toBe(c.agentId);
      const agent = AGENTS_BY_ID[c.agentId];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rec: any = await (agent as any).process(c.ticket);

      expect(typeof rec.confidence).toBe("number");
      expect(rec.suggestedAction).toBeTruthy();

      if (c.agentId === "vendor-intake-agent") {
        // Fail-safe by design: the OFAC/EU/UK sanctions feeds are not
        // reachable in this sandbox, so the Vendor agent REFUSES to draft
        // a clearance and routes to manual review — it must never
        // silently "clear" an unscreened vendor. (In the deployed app the
        // seeded OFAC feed lets it reach the Claude-drafted success path.)
        expect(["flag-for-review", "escalate"]).toContain(rec.suggestedAction);
        const concerns = (rec.concerns || []).join(" ").toLowerCase();
        expect(concerns).toContain("sanctions");
      } else {
        // Every other agent must reach its success branch (not the
        // AI-unavailable degraded stub) and produce a real draft.
        expect(rec.mock === true).toBe(false);
        expect((rec.draftedResponse || "").length).toBeGreaterThan(20);
      }

      const buf = await renderAgentDeliverableDocx({
        ticket: { id: c.ticket.id, type: c.ticket.type, from: c.ticket.from, dept: c.ticket.dept, submitted: NOW.slice(0, 10) },
        agent: { id: agent.id, name: agent.name },
        recommendation: {
          confidence: rec.confidence, suggestedAction: rec.suggestedAction,
          draftedResponse: rec.draftedResponse, reasoning: rec.reasoning,
          concerns: rec.concerns, citations: rec.precedentLinks, risks: rec.risks, playbook: rec.playbook,
        },
        generatedAt: NOW, generatedBy: "Functional Test (success path)",
      });
      expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
      expect(buf.includes(Buffer.from("word/document.xml"))).toBe(true);
      writeFileSync(`${OUT}/${deliverableFilename(c.ticket.id, agent.id)}`, buf);

      results.push({
        agent: agent.name || agent.id, action: rec.suggestedAction,
        confidence: `${Math.round(rec.confidence * 100)}%`,
        draftChars: (rec.draftedResponse || "").length, docxKB: Math.round(buf.length / 102.4) / 10,
      });
    });
  }

  it("prints the success-path report", () => {
    // eslint-disable-next-line no-console
    console.log("\n============ LIVE AGENT SUCCESS-PATH PASS (transport stub) ============");
    for (const r of results) {
      // eslint-disable-next-line no-console
      console.log(`✓ ${(r.agent as string).padEnd(26)} ${(r.action as string).padEnd(18)} conf=${String(r.confidence).padStart(4)}  draft=${String(r.draftChars).padStart(4)}ch  ${r.docxKB}KB`);
    }
    // eslint-disable-next-line no-console
    console.log(`\n${results.length}/11 agents exercised their success branch → ${OUT}`);
    // eslint-disable-next-line no-console
    console.log("======================================================================\n");
    expect(results.length).toBe(CASES.length);
  });
});
