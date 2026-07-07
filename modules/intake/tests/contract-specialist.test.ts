/**
 * Agent 11 · Contract-Type Specialist — deterministic playbook
 * selection, fallthrough to the generalist Contract Review agent,
 * playbook stamp + selection evidence on every rec, escalation gates
 * from the approval matrix.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const callClaudeJSONMock = vi.fn();
vi.mock("@aegis/ai", () => ({
  callClaudeJSON: callClaudeJSONMock,
  friendlyAIError: (e: unknown) => `AI unavailable: ${String(e)}`,
}));
vi.mock("../src/storage/agent-log", () => ({ appendAgentLog: vi.fn() }));

const { selectPlaybook, CONTRACT_PLAYBOOKS } = await import("../src/agents/contract-playbooks");
const { ContractSpecialistAgent } = await import("../src/agents/contract-specialist");
const { ContractReviewAgent } = await import("../src/agents/contract-review");
const { NDAAgent } = await import("../src/agents/nda");
const { routeToAgent } = await import("../src/agents/index");

const base = { id: "c1", from: "Dana Lee", dept: "Procurement", type: "Contract Review" };

beforeEach(() => {
  callClaudeJSONMock.mockReset().mockResolvedValue({
    draftedResponse: "Review text.",
    alternativeTone: "one line",
    confidence: 0.8,
    reasoning: "test",
    concerns: [],
  });
});

describe("playbook catalog governance", () => {
  it("every playbook carries id, version, owner, reviewedAt and non-empty bands", () => {
    for (const pb of CONTRACT_PLAYBOOKS) {
      expect(pb.id).toMatch(/^PB-/);
      expect(pb.version).toBeTruthy();
      expect(pb.owner).toBeTruthy();
      expect(pb.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(pb.mandatory.length).toBeGreaterThan(0);
      expect(pb.forbidden.length).toBeGreaterThan(0);
      expect(pb.negotiable.length).toBeGreaterThan(0);
    }
  });
});

describe("selectPlaybook — deterministic, cited", () => {
  it("selects the matching type and cites the matched text", () => {
    const sel = selectPlaybook({ ...base, desc: "Review this supply agreement with Nordic Components" });
    expect(sel!.playbook.id).toBe("PB-SUPPLY");
    expect(sel!.matchedOn.toLowerCase()).toContain("supply agreement");
  });

  it("flags hybrid documents that match more than one playbook", () => {
    const sel = selectPlaybook({
      ...base,
      desc: "Master supply agreement that includes a patent licensing agreement for the manufacturing process",
    });
    expect(sel!.alsoMatched.length).toBeGreaterThan(0);
  });

  it("returns null when no type matches (fallthrough contract)", () => {
    expect(selectPlaybook({ ...base, desc: "MSA review — uncapped liability and 90-day auto-renewal" })).toBeNull();
  });
});

describe("routing — specialist before generalist, fallthrough preserved", () => {
  it("typed contracts route to the specialist", () => {
    expect(routeToAgent({ ...base, desc: "Clinical trial agreement with Horizon Research sites" }, undefined))
      .toBe(ContractSpecialistAgent);
  });

  it("unmatched contract types fall through to the generalist Contract Review agent", () => {
    expect(routeToAgent({ ...base, desc: "Contract review please — bespoke barter arrangement", aiTriage: { category: "Contract Review" } }, undefined))
      .toBe(ContractReviewAgent);
  });

  it("NDAs stay in the NDA lane even when they mention a license", () => {
    expect(routeToAgent({ ...base, type: "NDA Request", desc: "Mutual NDA covering our licensing agreement discussions" }, undefined))
      .toBe(NDAAgent);
  });
});

describe("ContractSpecialistAgent recommendations", () => {
  it("stamps the SELECTED playbook (not the catalog default) and leads with selection evidence", async () => {
    const rec = (await ContractSpecialistAgent.process({
      ...base,
      desc: "Software licensing agreement from Vertex Labs, 4% royalty on net sales",
    })) as { playbook: { id: string; version: string }; concerns: string[]; suggestedAction: string };
    expect(rec.playbook).toEqual({ id: "PB-LICENSING", version: "v1" });
    expect(rec.concerns[0]).toMatch(/Playbook applied: Licensing/);
    expect(rec.concerns[0]).toMatch(/matched on/);
  });

  it("clinical agreements always escalate (approval matrix gate)", async () => {
    const rec = (await ContractSpecialistAgent.process({
      ...base,
      desc: "Clinical trial agreement for study AX-201 with three investigator sites",
    })) as { suggestedAction: string; concerns: string[] };
    expect(rec.suggestedAction).toBe("escalate");
    expect(rec.concerns.some((c) => /Escalation gate.*senior counsel/i.test(c))).toBe(true);
  });

  it("trigger-based gates fire: exclusive license escalates", async () => {
    const rec = (await ContractSpecialistAgent.process({
      ...base,
      desc: "Exclusive licensing agreement for the EU territory, 5-year term",
    })) as { suggestedAction: string };
    expect(rec.suggestedAction).toBe("escalate");
  });

  it("non-gated typed review flags for attorney sign-off (never auto-send)", async () => {
    const rec = (await ContractSpecialistAgent.process({
      ...base,
      desc: "Standard supply agreement, Incoterms DAP, indexed pricing",
    })) as { suggestedAction: string; concerns: string[] };
    expect(rec.suggestedAction).toBe("flag-for-review");
    expect(rec.concerns.some((c) => /sign.?off|attorney/i.test(c))).toBe(true);
  });

  it("degraded path (Claude down) keeps the playbook stamp + selection evidence", async () => {
    callClaudeJSONMock.mockRejectedValue(new Error("boom"));
    const rec = (await ContractSpecialistAgent.process({
      ...base,
      desc: "Supply agreement with Nordic Components — sole source for the sensor line",
    })) as { playbook: { id: string }; concerns: string[]; suggestedAction: string; confidence: number };
    expect(rec.playbook.id).toBe("PB-SUPPLY");
    expect(rec.concerns.some((c) => /Playbook applied: Supply/.test(c))).toBe(true);
    expect(rec.concerns.some((c) => /Escalation gate.*[Ss]ole-source/.test(c))).toBe(true);
    expect(rec.suggestedAction).toBe("flag-for-review"); // degraded invariant
    expect(rec.confidence).toBeLessThanOrEqual(0.4);
  });
});
