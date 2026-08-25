import { describe, it, expect } from "vitest";
import { shingles, minhashSignature, estimateJaccard, nearDuplicateGroups, detectLanguage } from "../src/similarity";

describe("shingles + minhash", () => {
  it("estimates high similarity for near-identical text", () => {
    const a = minhashSignature(shingles("the vendorx pricing model and discount schedule for the deal"));
    const b = minhashSignature(shingles("the vendorx pricing model and discount schedule for the deal today"));
    expect(estimateJaccard(a, b)).toBeGreaterThan(0.6);
  });
  it("estimates low similarity for unrelated text", () => {
    const a = minhashSignature(shingles("vendorx pricing model discount schedule negotiation"));
    const b = minhashSignature(shingles("lunch menu sandwiches for the office party friday"));
    expect(estimateJaccard(a, b)).toBeLessThan(0.3);
  });
  it("identical text → identical signatures (Jaccard 1)", () => {
    const t = "confidential section 8.2 ip ownership dispute";
    expect(estimateJaccard(minhashSignature(shingles(t)), minhashSignature(shingles(t)))).toBe(1);
  });
});

describe("nearDuplicateGroups", () => {
  it("groups near-duplicate variants and leaves distinct docs out", () => {
    const groups = nearDuplicateGroups([
      { id: "a", text: "the vendorx pricing model and discount schedule for the deal" },
      { id: "b", text: "the vendorx pricing model and discount schedule for the deal, updated" },
      { id: "c", text: "an entirely separate memo about the sec inquiry response plan" },
    ], { threshold: 0.5 });
    expect(groups).toHaveLength(1);
    expect(groups[0]!.ids).toEqual(["a", "b"]);
    expect(groups[0]!.size).toBe(2);
  });
  it("ignores empty-text docs and returns [] when nothing is near-dup", () => {
    expect(nearDuplicateGroups([{ id: "x", text: null }, { id: "y", text: "unique content here about pricing" }])).toEqual([]);
  });
});

describe("detectLanguage", () => {
  it("detects English / German / French", () => {
    expect(detectLanguage("the pricing model and the discount schedule is not for that vendor")).toBe("en");
    expect(detectLanguage("der vertrag und das modell ist nicht mit den preisen zu vereinbaren")).toBe("de");
    expect(detectLanguage("le modele et les prix des une pour dans que est")).toBe("fr");
  });
  it("returns unknown for too little text", () => {
    expect(detectLanguage("hi")).toBe("unknown");
    expect(detectLanguage("")).toBe("unknown");
  });
});
