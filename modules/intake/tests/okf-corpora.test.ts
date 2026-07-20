import { describe, it, expect } from "vitest";
import { STATIC_AGENT_DEFS } from "../src/agents/okf/static-defs";
import { validateOkfDocument } from "../src/agents/okf/schema";
import { selectItemsForTicket } from "../src/agents/okf/runtime";

const byKey = (k: string) => STATIC_AGENT_DEFS.find((d) => d.agent.key === k)!;

describe("oKF-3 corpora migration", () => {
  it("every agent's knowledge is real items (no pointer placeholders left)", () => {
    for (const d of STATIC_AGENT_DEFS) {
      expect(validateOkfDocument(d).ok, d.agent.key).toBe(true);
      const codes = d.knowledge.flatMap((p) => p.items.map((i) => i.code));
      expect(codes.some((c) => c === "REF.SOURCE"), `${d.agent.key} still has a pointer item`).toBe(false);
    }
  });

  it("FAQ carries the full approved-KB as QA items", () => {
    const kb = byKey("faq-agent").knowledge[0];
    expect(kb.kind).toBe("APPROVED_KB");
    expect(kb.items.length).toBeGreaterThanOrEqual(20);
    expect(kb.items.every((i) => i.kind === "QA")).toBe(true);
  });

  it("Policy Q&A carries the policy corpus", () => {
    const pol = byKey("policy-qa-agent").knowledge[0];
    expect(pol.items.length).toBeGreaterThanOrEqual(15);
  });

  it("Contract Specialist catalog uses cohorts, scoping items per contract type", () => {
    const cat = byKey("contract-specialist-agent").knowledge[0];
    expect(cat.cohorts.length).toBeGreaterThan(0);
    // A licensing ticket should pull the licensing playbook item, not all of them.
    const licensing = selectItemsForTicket([cat], { type: "Technology licensing agreement" });
    const all = cat.items.length;
    expect(licensing.length).toBeGreaterThan(0);
    expect(licensing.length).toBeLessThan(all);
    expect(licensing.some((i) => /licens/i.test(i.title))).toBe(true);
  });

  it("rule-engine agents captured their taxonomy as RULE items", () => {
    for (const key of ["notice-mgmt-agent", "privacy-assessment-agent", "vendor-intake-agent"]) {
      const items = byKey(key).knowledge.flatMap((p) => p.items);
      expect(items.some((i) => i.kind === "RULE"), key).toBe(true);
    }
  });
});
