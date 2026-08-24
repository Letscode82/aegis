import { describe, it, expect } from "vitest";
import { parseAiTags, orderedAiTags, isConfidentResponsive, hasConfidentCall } from "../src/ai-tags";

const tags = [
  { kind: "KEY_DOCUMENT", value: true, confidence: 0.8, citation: "approved", rationale: "hot" },
  { kind: "RESPONSIVE", value: true, confidence: 0.9, citation: "the pricing model", rationale: "on topic" },
  { kind: "PRIVILEGED", value: false, confidence: 0.9, citation: null, rationale: "none" },
];

describe("parseAiTags", () => {
  it("coerces a well-formed array", () => {
    const out = parseAiTags(tags);
    expect(out).toHaveLength(3);
    expect(out[1]).toMatchObject({ kind: "RESPONSIVE", value: true, confidence: 0.9, citation: "the pricing model" });
  });
  it("returns [] for non-arrays / junk", () => {
    expect(parseAiTags(null)).toEqual([]);
    expect(parseAiTags("nope")).toEqual([]);
    expect(parseAiTags([null, 3, { noKind: 1 }])).toEqual([]);
  });
  it("defaults a missing/invalid confidence to 0 and empty citation to null", () => {
    const out = parseAiTags([{ kind: "PII", value: true, confidence: "x", citation: "" }]);
    expect(out[0]).toMatchObject({ confidence: 0, citation: null });
  });
});

describe("orderedAiTags", () => {
  it("sorts by the canonical dimension order", () => {
    expect(orderedAiTags(tags).map((t) => t.kind)).toEqual(["RESPONSIVE", "PRIVILEGED", "KEY_DOCUMENT"]);
  });
});

describe("isConfidentResponsive", () => {
  it("is true only for a confident, cited, positive responsive tag", () => {
    expect(isConfidentResponsive(tags)).toBe(true);
    expect(isConfidentResponsive([{ kind: "RESPONSIVE", value: true, confidence: 0.5, citation: "x" }])).toBe(false);
    expect(isConfidentResponsive([{ kind: "RESPONSIVE", value: true, confidence: 0.9, citation: null }])).toBe(false);
    expect(isConfidentResponsive([{ kind: "RESPONSIVE", value: false, confidence: 0.9, citation: "x" }])).toBe(false);
  });
  it("respects a custom threshold", () => {
    expect(isConfidentResponsive([{ kind: "RESPONSIVE", value: true, confidence: 0.6, citation: "x" }], 0.5)).toBe(true);
  });
});

describe("hasConfidentCall", () => {
  it("is true when any positive tag clears the threshold", () => {
    expect(hasConfidentCall(tags)).toBe(true);
    expect(hasConfidentCall([{ kind: "PII", value: false, confidence: 0.99, citation: null }])).toBe(false);
  });
});
