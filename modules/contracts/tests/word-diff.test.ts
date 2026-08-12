import { describe, it, expect } from "vitest";
import { diffWords, wordDiffStats } from "../src/internal/word-diff";

const text = (segs: ReturnType<typeof diffWords>, type: string) =>
  segs.filter((s) => s.type === type).map((s) => s.text).join("");

describe("diffWords", () => {
  it("identical text is all equal", () => {
    const d = diffWords("the quick brown fox", "the quick brown fox");
    expect(d.every((s) => s.type === "equal")).toBe(true);
  });

  it("captures an inserted word", () => {
    const d = diffWords("liability is capped", "liability is strictly capped");
    expect(text(d, "insert")).toContain("strictly");
    expect(d.some((s) => s.type === "delete")).toBe(false);
  });

  it("captures a deleted word", () => {
    const d = diffWords("no indirect or consequential damages", "no consequential damages");
    expect(text(d, "delete")).toContain("indirect");
  });

  it("captures a replacement as delete + insert", () => {
    const d = diffWords("Net 45 payment", "Net 30 payment");
    expect(text(d, "delete")).toContain("45");
    expect(text(d, "insert")).toContain("30");
    // The unchanged words survive.
    expect(text(d, "equal")).toContain("Net");
    expect(text(d, "equal")).toContain("payment");
  });

  it("reconstructs both sides from the segments", () => {
    const oldT = "cap at fees paid in 12 months";
    const newT = "cap at fees paid in the preceding 12 months";
    const d = diffWords(oldT, newT);
    const reOld = d.filter((s) => s.type !== "insert").map((s) => s.text).join("");
    const reNew = d.filter((s) => s.type !== "delete").map((s) => s.text).join("");
    expect(reOld).toBe(oldT);
    expect(reNew).toBe(newT);
  });

  it("wordDiffStats counts added / removed words", () => {
    const d = diffWords("alpha beta gamma", "alpha delta epsilon gamma");
    const s = wordDiffStats(d);
    expect(s.added).toBe(2); // delta, epsilon
    expect(s.removed).toBe(1); // beta
  });

  it("handles empty sides", () => {
    expect(wordDiffStats(diffWords("", "new clause")).added).toBe(2);
    expect(wordDiffStats(diffWords("old clause", "")).removed).toBe(2);
  });
});
