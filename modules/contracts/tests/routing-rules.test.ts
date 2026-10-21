import { describe, it, expect } from "vitest";
import { ruleMatchesContract, matchContractRoutingRule, type ContractRoutingRuleDTO } from "../src/internal/routing-rules";

// Redesign PR 5 — the admin-configurable approval routing evaluator. These lock
// the pure matcher (the only part with no DB): conditions AND together, a value
// condition never matches a valueless contract, and a conditionless rule never
// match-everythings.

const rule = (over: Partial<ContractRoutingRuleDTO>): ContractRoutingRuleDTO => ({
  id: "r1",
  name: "Rule",
  description: null,
  enabled: true,
  evalOrder: 100,
  matchType: null,
  matchPerspective: null,
  minValue: null,
  maxValue: null,
  setLadderKey: "clm_contract_approval",
  timesFired: 0,
  lastFiredAt: null,
  ...over,
});

describe("ruleMatchesContract", () => {
  it("matches a type substring (case-insensitive)", () => {
    const r = rule({ matchType: "nda" });
    expect(ruleMatchesContract(r, { type: "Mutual NDA" })).toBe(true);
    expect(ruleMatchesContract(r, { type: "MSA" })).toBe(false);
  });

  it("matches a perspective exactly", () => {
    const r = rule({ matchPerspective: "THEIR_SIDE" });
    expect(ruleMatchesContract(r, { type: "MSA", perspective: "THEIR_SIDE" })).toBe(true);
    expect(ruleMatchesContract(r, { type: "MSA", perspective: "OUR_SIDE" })).toBe(false);
    expect(ruleMatchesContract(r, { type: "MSA", perspective: null })).toBe(false);
  });

  it("matches an inclusive value range and never matches a valueless contract", () => {
    const r = rule({ minValue: 10000, maxValue: 100000 });
    expect(ruleMatchesContract(r, { type: "MSA", value: 50000 })).toBe(true);
    expect(ruleMatchesContract(r, { type: "MSA", value: 10000 })).toBe(true); // inclusive
    expect(ruleMatchesContract(r, { type: "MSA", value: 100000 })).toBe(true);
    expect(ruleMatchesContract(r, { type: "MSA", value: 9999 })).toBe(false);
    expect(ruleMatchesContract(r, { type: "MSA", value: 100001 })).toBe(false);
    expect(ruleMatchesContract(r, { type: "MSA", value: null })).toBe(false);
  });

  it("ANDs all non-null conditions", () => {
    const r = rule({ matchType: "supply", minValue: 250000 });
    expect(ruleMatchesContract(r, { type: "Supply Agreement", value: 300000 })).toBe(true);
    expect(ruleMatchesContract(r, { type: "Supply Agreement", value: 100000 })).toBe(false); // value fails
    expect(ruleMatchesContract(r, { type: "License", value: 300000 })).toBe(false); // type fails
  });

  it("a conditionless rule never matches (no match-everything)", () => {
    expect(ruleMatchesContract(rule({}), { type: "anything", value: 999999 })).toBe(false);
  });
});

describe("matchContractRoutingRule", () => {
  it("returns the first matching ENABLED rule in order", () => {
    const rules = [
      rule({ id: "a", enabled: false, matchType: "nda", setLadderKey: "nda_fasttrack" }), // disabled — skipped
      rule({ id: "b", matchType: "nda", setLadderKey: "legal_notice" }),
      rule({ id: "c", matchType: "nda", setLadderKey: "clm_contract_approval" }),
    ];
    const hit = matchContractRoutingRule(rules, { type: "Mutual NDA" });
    expect(hit?.id).toBe("b");
  });

  it("returns null when nothing matches", () => {
    const rules = [rule({ id: "a", matchType: "nda" })];
    expect(matchContractRoutingRule(rules, { type: "MSA", value: 100 })).toBeNull();
  });
});
