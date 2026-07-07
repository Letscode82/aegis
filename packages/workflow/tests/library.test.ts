/**
 * Governance library — shape and governance invariants. Pure (no DB);
 * the idempotent-seed behaviour is covered in engine-db.test.ts.
 */
import { describe, expect, it } from "vitest";
import { GOVERNANCE_LIBRARY } from "../src/library";
import { MAX_STEPS } from "../src/rules";

// @aegis/auth's canonical role names (packages/auth/src/roles.ts).
const CANONICAL_ROLES = new Set([
  "admin", "gc", "attorney", "paralegal", "legal_ops", "requester", "external_counsel", "viewer",
]);

describe("GOVERNANCE_LIBRARY", () => {
  it("ships the 10 pharma-GC ladders with unique keys", () => {
    expect(GOVERNANCE_LIBRARY).toHaveLength(10);
    const keys = GOVERNANCE_LIBRARY.map((l) => l.key);
    expect(new Set(keys).size).toBe(10);
    expect(keys).toContain("patent_litigation");
    expect(keys).toContain("data_breach");
  });

  it("every ladder has contiguous 1..N steps within the 15-step ceiling", () => {
    for (const l of GOVERNANCE_LIBRARY) {
      expect(l.steps.length).toBeGreaterThan(0);
      expect(l.steps.length).toBeLessThanOrEqual(MAX_STEPS);
      l.steps.forEach((s, i) => expect(s.stepOrder).toBe(i + 1));
    }
  });

  it("approver roles are canonical platform roles", () => {
    for (const l of GOVERNANCE_LIBRARY) {
      for (const s of l.steps) {
        if (s.approverRole) {
          expect(CANONICAL_ROLES.has(s.approverRole), `${l.key} step ${s.stepOrder}: ${s.approverRole}`).toBe(true);
        }
      }
    }
  });

  it("AGENT steps carry an agentKey + minConfidence and a human approverRole", () => {
    let agentSteps = 0;
    for (const l of GOVERNANCE_LIBRARY) {
      for (const s of l.steps) {
        if (s.kind === "AGENT") {
          agentSteps += 1;
          const cfg = s.agentConfigJson as { agentKey?: string; minConfidence?: number };
          expect(cfg.agentKey, `${l.key} step ${s.stepOrder}`).toBeTruthy();
          expect(cfg.minConfidence).toBeGreaterThan(0);
          // Findings escalate to a human — every agent step names one.
          expect(s.approverRole, `${l.key} agent step needs a human role`).toBeTruthy();
        }
      }
    }
    expect(agentSteps).toBeGreaterThanOrEqual(6);
  });

  it("skip rules use the supported operator set", () => {
    for (const l of GOVERNANCE_LIBRARY) {
      for (const s of l.steps) {
        const rule = (s.metadataJson as { skip_if?: { op?: string } } | undefined)?.skip_if;
        if (rule) expect(["eq", "ne", "lt", "lte", "gt", "gte", "in"]).toContain(rule.op);
      }
    }
  });

  it("the DPDP breach ladder keeps the 72-hour clock honest", () => {
    const breach = GOVERNANCE_LIBRARY.find((l) => l.key === "data_breach")!;
    const cumulative = breach.steps.reduce((sum, s) => sum + (s.slaHours ?? 0), 0);
    expect(cumulative).toBeLessThanOrEqual(72);
  });
});
