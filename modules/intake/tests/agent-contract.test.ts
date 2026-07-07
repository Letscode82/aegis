/**
 * GC Suite agent contract (Working Architecture doc) — every registered
 * agent's recommendation carries the approver risk checklist and the
 * playbook stamp, on BOTH the happy path and the degraded path; the NDA
 * decision tree forces flag-for-review on playbook deviations; the FAQ
 * agent hands off on dispute/regulator/deadline wording.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const callClaudeJSONMock = vi.fn();
vi.mock("@aegis/ai", () => ({
  callClaudeJSON: callClaudeJSONMock,
  friendlyAIError: (e: unknown) => `AI unavailable: ${String(e)}`,
  classifyIntakeRegex: () => null,
}));
// Retrieval helpers hit the network/DB — neutralize.
vi.mock("../src/agents/counterparty-lookup", () => ({
  checkCounterpartyRelationship: vi.fn().mockResolvedValue({ found: false, note: "No prior relationship on record." }),
}));
vi.mock("../src/agents/sanctions-lookup", () => ({
  screenSanctions: vi.fn().mockResolvedValue({ status: "clear", flags: [], note: "clear" }),
}));
vi.mock("../src/storage/agent-log", () => ({ appendAgentLog: vi.fn() }));

const { AGENT_PROFILES } = await import("../src/agents/agent-profiles");
const {
  NDAAgent, FAQAgent, VendorIntakeAgent, ContractReviewAgent,
  TrademarkAgent, LitigationAgent, PolicyQAAgent,
} = await import("../src/agents/index");

const AGENTS = [NDAAgent, FAQAgent, VendorIntakeAgent, ContractReviewAgent, TrademarkAgent, LitigationAgent, PolicyQAAgent];

const TICKETS: Record<string, object> = {
  "nda-agent": { id: "t1", from: "Dana Lee", dept: "Sales", type: "NDA Request", desc: "Need a mutual NDA with Acme Robotics for the pilot" },
  "faq-agent": { id: "t2", from: "Dana Lee", dept: "HR", type: "Legal Question — General", desc: "What is our data retention period for customer data?" },
  "vendor-intake-agent": { id: "t3", from: "Dana Lee", dept: "Procurement", type: "Vendor Due Diligence", desc: "Vendor: Globex Corp in Germany, new supplier onboarding", aiTriage: { category: "Vendor Due Diligence" } },
  "contract-review-agent": { id: "t4", from: "Dana Lee", dept: "Ops", type: "Contract Review", desc: "MSA review — uncapped liability and 90-day auto-renewal", aiTriage: { category: "Contract Review" } },
  "trademark-agent": { id: "t5", from: "Dana Lee", dept: "Marketing", type: "Trademark Check", desc: 'Trademark clearance for "Zephyrion" in US and EU' },
  "litigation-agent": { id: "t6", from: "Dana Lee", dept: "Legal", type: "Litigation Notice", desc: "We received a demand letter from Meridian Corp" },
  "policy-qa-agent": { id: "t7", from: "Dana Lee", dept: "Finance", type: "Legal Question — General", desc: "What does our travel policy say about business class?" },
};

beforeEach(() => {
  callClaudeJSONMock.mockReset().mockResolvedValue({
    draftedResponse: "Drafted response text.",
    alternativeTone: "Short version.",
    confidence: 0.9,
    reasoning: "test",
    concerns: [],
  });
});

describe("profiles exist for every registered agent", () => {
  for (const a of AGENTS) {
    it(`${a.id} has a profile with risks + playbook`, () => {
      const p = AGENT_PROFILES[a.id as keyof typeof AGENT_PROFILES];
      expect(p, `missing profile for ${a.id}`).toBeTruthy();
      expect(p.risks.length).toBeGreaterThanOrEqual(3);
      expect(p.playbook.id).toBeTruthy();
    });
  }
});

describe("happy path carries the contract fields", () => {
  for (const a of AGENTS) {
    it(`${a.id} rec includes risks[] and playbook`, async () => {
      const ticket = TICKETS[a.id];
      expect(ticket, `no fixture ticket for ${a.id}`).toBeTruthy();
      const rec = (await a.process(ticket)) as { risks?: string[]; playbook?: { id?: string } };
      expect(rec.risks && rec.risks.length, `${a.id} missing risks`).toBeGreaterThan(0);
      expect(rec.playbook?.id, `${a.id} missing playbook`).toBeTruthy();
    });
  }
});

describe("degraded path (Claude down) still carries the contract", () => {
  it("nda-agent degraded rec has risks + playbook + never auto-send", async () => {
    callClaudeJSONMock.mockRejectedValue(new Error("boom"));
    const rec = (await NDAAgent.process(TICKETS["nda-agent"])) as {
      risks?: string[]; playbook?: { id?: string }; suggestedAction?: string; confidence?: number;
    };
    expect(rec.risks!.length).toBeGreaterThan(0);
    expect(rec.playbook?.id).toBe("NDA-PLAYBOOK");
    expect(rec.suggestedAction).toBe("flag-for-review");
    expect(rec.confidence).toBeLessThanOrEqual(0.4);
  });
});

describe("NDA decision tree — playbook deviations force review", () => {
  it("indefinite confidentiality downgrades approve-and-send", async () => {
    const rec = (await NDAAgent.process({
      ...TICKETS["nda-agent"],
      desc: "NDA with Acme Robotics but they want perpetual confidentiality with no expiry",
    })) as { suggestedAction?: string; concerns?: string[] };
    expect(rec.suggestedAction).toBe("flag-for-review");
    expect(rec.concerns!.some((c) => /deviation/i.test(c))).toBe(true);
  });

  it("a clean template request still approves", async () => {
    const rec = (await NDAAgent.process(TICKETS["nda-agent"])) as { suggestedAction?: string };
    expect(rec.suggestedAction).toBe("approve-and-send");
  });
});

describe("FAQ hard handoff triggers", () => {
  it("refuses questions mentioning disputes/regulators/deadlines", () => {
    expect(FAQAgent.canHandle({ desc: "What is our data retention period for customer data?" })).toBe(true);
    expect(FAQAgent.canHandle({ desc: "What is our data retention period — we are in a lawsuit and got a subpoena" })).toBe(false);
    expect(FAQAgent.canHandle({ desc: "retention question — the regulator asked about it" })).toBe(false);
  });
});
