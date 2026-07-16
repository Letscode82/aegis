/**
 * Regression: routing (both the rule engine and the agent router) must
 * key on the human-authored request LEAD, never the appended document
 * body. A commercial contract full of "notice of termination" / "breach"
 * language previously (a) fired a "breach" keyword rule → false Critical,
 * and (b) pulled the ticket to the Notice agent instead of Contract
 * Review. Both are fixed by matching descriptionLead(), not the full desc.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { ruleMatches } from "../src/routing/rules";

// A Contract Review request: clean typed lead, a contract body appended.
const LEAD = "Please review and approve the attached MSA with Nimbus Analytics. Need sign-off to execute.";
const DOC_BODY =
  "\n--- Attached document: MSA ---\n" +
  "Section 7 Termination. Neither party may terminate for convenience. Notice of termination... " +
  "This cap applies to breach of confidentiality and IP breaches...";
const fullDesc = LEAD + DOC_BODY;

describe("routing keys on the request lead, not the document body", () => {
  it('a "breach" keyword rule does NOT fire on a contract whose lead is clean', () => {
    const rule = {
      id: "r1", name: "Data-breach keywords escalate", enabled: true, evalOrder: 10,
      matchType: null, matchPriority: null, matchDepartment: null,
      matchKeyword: "breach", matchComplexity: null,
      setPriority: "Critical", setSlaHours: null, setAssigneeUserId: null,
      setTeamId: null, escalateToUserId: null, requireApprovalUserId: null,
    } as never;
    const ticket = { type: "Contract Review", priority: "Medium", department: "Sales", description: fullDesc } as never;
    // "breach" only appears in the appended document → must NOT match.
    expect(ruleMatches(rule, ticket)).toBe(false);
  });

  it("the same rule DOES fire when the keyword is in the typed lead", () => {
    const rule = {
      id: "r1", name: "x", enabled: true, evalOrder: 10,
      matchType: null, matchPriority: null, matchDepartment: null,
      matchKeyword: "breach", matchComplexity: null,
      setPriority: "Critical", setSlaHours: null, setAssigneeUserId: null,
      setTeamId: null, escalateToUserId: null, requireApprovalUserId: null,
    } as never;
    const ticket = { type: "Incident", priority: "Medium", department: "Security", description: "We had a data breach overnight — need urgent help." } as never;
    expect(ruleMatches(rule, ticket)).toBe(true);
  });
});

describe("agent router keys on the lead — contract with notice-y doc → Contract Review", () => {
  let routeToAgent: (t: unknown, s?: unknown, p?: unknown) => { id: string } | null;
  beforeAll(async () => {
    process.env.NEXT_PUBLIC_AEGIS_DEMO_AGENTS = "true";
    const mod = await import("../src/agents/index.js");
    routeToAgent = mod.routeToAgent as typeof routeToAgent;
  });

  it("routes to notice-mgmt on the FULL doc body (the old bug) but Contract Review on the lead (the fix)", () => {
    const onFull = routeToAgent({ type: "Contract Review", desc: fullDesc }, undefined, undefined);
    const onLead = routeToAgent({ type: "Contract Review", desc: LEAD }, undefined, undefined);
    // The document body trips the Notice agent…
    expect(onFull?.id).toBe("notice-mgmt-agent");
    // …but the lead (what processTicketWithAgent now routes on) is correct.
    expect(onLead?.id).toBe("contract-review-agent");
  });
});
