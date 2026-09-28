import { describe, it, expect } from "vitest";
import { chunkText } from "../src/chunk";

describe("chunkText", () => {
  it("returns [] for empty/whitespace input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n  ")).toEqual([]);
  });

  it("returns a single chunk when text is under size", () => {
    const out = chunkText("A short clause about indemnification.");
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("indemnification");
  });

  it("splits long text into overlapping chunks", () => {
    const para = "This is a sentence about the limitation of liability cap. ".repeat(60);
    const out = chunkText(para, { size: 400, overlap: 80 });
    expect(out.length).toBeGreaterThan(1);
    for (const c of out) expect(c.length).toBeLessThanOrEqual(500);
    // Overlap: the tail of chunk 0 should reappear at the head region of chunk 1.
    const tail = (out[0] as string).slice(-40);
    expect((out[1] as string).includes(tail.trim().split(" ")[0] as string)).toBe(true);
  });

  it("clamps overlap to at most half the size", () => {
    const text = "word ".repeat(300);
    const out = chunkText(text, { size: 300, overlap: 9999 });
    expect(out.length).toBeGreaterThan(1);
    // Must terminate with a bounded number of chunks (forward progress —
    // overlap can't exceed half the size, so it can't stall the cursor).
    expect(out.length).toBeLessThan(text.length);
    for (const c of out) expect(c.length).toBeLessThanOrEqual(400);
  });

  it("normalizes CRLF and collapses excessive blank lines", () => {
    const out = chunkText("a\r\n\r\n\r\n\r\nb");
    expect(out).toHaveLength(1);
    expect(out[0]).toBe("a\n\nb");
  });
});
