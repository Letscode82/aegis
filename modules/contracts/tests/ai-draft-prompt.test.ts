import { describe, it, expect } from "vitest";
import { postureLine, buildDraftPrompt, buildPrecedentPrompt, unwrapDraftText } from "../src/internal/ai-draft";

describe("unwrapDraftText — plain-text draft with JSON-envelope back-compat", () => {
  it("returns plain text unchanged", () => {
    const body = "MUTUAL NDA\n\n1. TERM. This Agreement...\n\n2. CONFIDENTIALITY. Each party...";
    expect(unwrapDraftText(body)).toBe(body);
  });
  it("salvages an older {\"draftText\":...} JSON envelope", () => {
    const body = "MUTUAL NDA\n\n1. TERM...";
    expect(unwrapDraftText(JSON.stringify({ draftText: body }))).toBe(body);
  });
  it("strips a fenced block", () => {
    const body = "MUTUAL NDA\n\n1. TERM...";
    expect(unwrapDraftText("```text\n" + body + "\n```")).toBe(body);
  });
  it("does NOT mangle prose that merely contains braces/quotes", () => {
    const body = 'Section 4 defines "Confidential Information" as {broadly scoped} materials.';
    expect(unwrapDraftText(body)).toBe(body);
  });
  it("empty in, empty out", () => {
    expect(unwrapDraftText("")).toBe("");
  });
});

describe("ai-draft prompt asks for plain text, not JSON", () => {
  it("draft + precedent prompts do not demand STRICT JSON", () => {
    const d = buildDraftPrompt({ title: "NDA", type: "NDA", brief: "x" }, {});
    const p = buildPrecedentPrompt({ title: "X", type: "NDA", body: "long enough body text here", perspective: "OUR_SIDE" }, { precedentContractId: "c1", brief: "y" });
    expect(d).not.toMatch(/STRICT JSON/i);
    expect(p).not.toMatch(/STRICT JSON/i);
    expect(d).toMatch(/ONLY the agreement text/i);
  });
});

describe("ai-draft posture (PR A — guided draft)", () => {
  it("postureLine reflects perspective", () => {
    expect(postureLine("MUTUAL")).toMatch(/EVEN-HANDED \(MUTUAL\)/);
    expect(postureLine("THEIR_SIDE")).toMatch(/COUNTERPARTY/);
    expect(postureLine("NEUTRAL")).toMatch(/NEUTRAL/);
    expect(postureLine("OUR_SIDE")).toMatch(/OUR PAPER/);
    // default (null/undefined) is OUR_SIDE
    expect(postureLine(null)).toMatch(/OUR PAPER/);
    expect(postureLine(undefined)).toMatch(/OUR PAPER/);
  });

  it("a mutual NDA prompt is not framed as protective-of-us", () => {
    const p = buildDraftPrompt(
      { title: "Mutual NDA", type: "NDA", brief: "Evaluate a partnership", perspective: "MUTUAL" },
      {},
    );
    expect(p).toMatch(/EVEN-HANDED/);
    expect(p).not.toMatch(/protective of us/);
    expect(p).toContain("Mutual NDA");
  });

  it("special terms are folded into the draft prompt", () => {
    const p = buildDraftPrompt(
      { title: "NDA", type: "NDA", brief: "x", specialTerms: "residuals carve-out" },
      {},
    );
    expect(p).toMatch(/Special terms \/ carve-outs/);
    expect(p).toContain("residuals carve-out");
  });

  it("precedent prompt carries the precedent body + brief and inherits perspective", () => {
    const p = buildPrecedentPrompt(
      { title: "ACME MSA 2024", type: "MSA", body: "1. TERM. Two years...", perspective: "OUR_SIDE" },
      { precedentContractId: "c1", brief: "swap counterparty to Globex, 3-year term" },
    );
    expect(p).toMatch(/OUR PAPER/); // inherited from precedent
    expect(p).toContain("ACME MSA 2024");
    expect(p).toContain("swap counterparty to Globex");
    expect(p).toContain("1. TERM. Two years");
  });

  it("precedent prompt lets the caller override perspective to MUTUAL", () => {
    const p = buildPrecedentPrompt(
      { title: "X", type: "NDA", body: "body text here that is long enough", perspective: "OUR_SIDE" },
      { precedentContractId: "c1", brief: "make it mutual", perspective: "MUTUAL" },
    );
    expect(p).toMatch(/EVEN-HANDED/);
  });
});
