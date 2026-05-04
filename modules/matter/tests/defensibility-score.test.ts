/**
 * Unit tests for the v2 defensibility score math (sub-PR 4c.3).
 *
 * The full `getHoldDefensibilityScoreService` requires a Postgres
 * connection (it walks `verifyAuditChain`). These tests cover the
 * pure aggregation helpers — which is what the v2 schema bump
 * changes — without booting the DB.
 */
import { describe, expect, it } from "vitest";
import {
  computeWeightedScore,
  ratio,
} from "../src/internal/legal-hold/services/defensibility";

describe("ratio()", () => {
  it("returns null when the denominator is zero", () => {
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(5, 0)).toBeNull();
  });

  it("clamps to [0, 1]", () => {
    expect(ratio(0, 1)).toBe(0);
    expect(ratio(1, 1)).toBe(1);
    expect(ratio(2, 1)).toBe(1); // over-saturated still clamps to 1
    expect(ratio(-1, 1)).toBe(0); // negative still clamps to 0
  });

  it("computes the obvious cases", () => {
    expect(ratio(1, 2)).toBe(0.5);
    expect(ratio(3, 4)).toBe(0.75);
  });
});

describe("computeWeightedScore() — v2 null-component handling", () => {
  it("returns 100 when every component is fully satisfied", () => {
    const components = [
      { value: 1, weight: 25 },
      { value: 1, weight: 15 },
      { value: 1, weight: 20 },
      { value: 1, weight: 20 },
      { value: 1, weight: 10 },
      { value: 1, weight: 10 },
    ];
    expect(computeWeightedScore(components)).toBe(100);
  });

  it("returns 0 when every applicable component is failing", () => {
    const components = [
      { value: 0, weight: 25 },
      { value: 0, weight: 15 },
      { value: 0, weight: 20 },
      { value: 0, weight: 20 },
      { value: 0, weight: 10 },
      { value: 0, weight: 10 },
    ];
    expect(computeWeightedScore(components)).toBe(0);
  });

  it("excludes null components from the divisor (the v2 fix)", () => {
    // 4b bug: a hold with zero custodians used to score 100 because
    // every per-custodian component reported 1.0 against an empty
    // denominator. Under v2 those components are null and dropped
    // from the divisor — only the always-applicable audit-chain
    // component (weight 10, value 1) is left, so the score is 100.
    const components = [
      { value: null, weight: 25 }, // ack rate — N/A, no custodians
      { value: null, weight: 15 }, // re-attestation — N/A
      { value: null, weight: 20 }, // ds preservation — N/A
      { value: null, weight: 20 }, // it confirmation — N/A
      { value: null, weight: 10 }, // template integrity — N/A
      { value: 1, weight: 10 }, // audit chain — always applicable
    ];
    expect(computeWeightedScore(components)).toBe(100);
  });

  it("collapses to 0 when every component is null", () => {
    const components = [
      { value: null, weight: 25 },
      { value: null, weight: 15 },
    ];
    expect(computeWeightedScore(components)).toBe(0);
  });

  it("weighted average expressed on 0..100, regardless of total weight", () => {
    // Two components, one perfect, one half — averaged on weight.
    // (1.0 * 20 + 0.5 * 20) / (20 + 20) = 0.75 → 75
    const components = [
      { value: 1, weight: 20 },
      { value: 0.5, weight: 20 },
    ];
    expect(computeWeightedScore(components)).toBe(75);
  });

  it("the brief's exact case: 0 acks, scorecard should not penalise re-attestation", () => {
    // From the brief Item 4: "a 67/100 hold with one inapplicable
    // component should NOT be penalized for the inapplicable
    // component". Mock: 5 of 6 perfect, 1 inapplicable.
    const components = [
      { value: 1, weight: 25 }, // ack 100%
      { value: null, weight: 15 }, // re-attestation N/A
      { value: 1, weight: 20 }, // ds preservation 100%
      { value: 1, weight: 20 }, // it confirmation 100%
      { value: 1, weight: 10 }, // template integrity 100%
      { value: 1, weight: 10 }, // audit chain 100%
    ];
    // With re-attestation null: (25+20+20+10+10) / (25+20+20+10+10) = 1 → 100
    expect(computeWeightedScore(components)).toBe(100);

    // Make ack 50% to recreate the brief's "67/100 with N/A re-att" feel:
    const realistic = [
      { value: 0.5, weight: 25 },
      { value: null, weight: 15 },
      { value: 0.6, weight: 20 },
      { value: 0.5, weight: 20 },
      { value: 1, weight: 10 },
      { value: 1, weight: 10 },
    ];
    // (12.5 + 12 + 10 + 10 + 10) / (25+20+20+10+10) = 54.5 / 85 ≈ 0.641 → 64
    expect(computeWeightedScore(realistic)).toBe(64);
  });
});
