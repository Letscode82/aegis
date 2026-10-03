import { describe, it, expect } from "vitest";
import { enforceCitations } from "../src/grounding.js";

const THREE = [{ n: 1 }, { n: 2 }, { n: 3 }];

describe("enforceCitations", () => {
  it("keeps valid citations and reports which were cited", () => {
    const r = enforceCitations("The cap is $5M [1] and survives termination [3].", THREE);
    expect(r.text).toBe("The cap is $5M [1] and survives termination [3].");
    expect(r.citedIndices).toEqual([1, 3]);
    expect(r.droppedCitations).toBe(0);
    expect(r.grounded).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("strips a hallucinated citation that references no real source", () => {
    const r = enforceCitations("Clearly stated [1] and also here [7].", THREE);
    expect(r.text).toBe("Clearly stated [1] and also here.");
    expect(r.citedIndices).toEqual([1]);
    expect(r.droppedCitations).toBe(1);
    expect(r.warnings).toContain("dropped-citations");
  });

  it("warns when a grounded answer cites nothing", () => {
    const r = enforceCitations("The contract looks standard and low risk.", THREE);
    expect(r.grounded).toBe(false);
    expect(r.citedIndices).toEqual([]);
    expect(r.warnings).toContain("no-citations");
  });

  it("handles a multi-number bracket, dropping only the bad numbers", () => {
    const r = enforceCitations("See the indemnity terms [2, 9].", THREE);
    expect(r.text).toBe("See the indemnity terms [2].");
    expect(r.citedIndices).toEqual([2]);
    expect(r.droppedCitations).toBe(1);
  });

  it("leaves an ungrounded answer (no sources) untouched", () => {
    const r = enforceCitations("General guidance about NDAs [1].", []);
    expect(r.text).toBe("General guidance about NDAs [1].");
    expect(r.grounded).toBe(false);
    expect(r.droppedCitations).toBe(0);
    expect(r.warnings).toEqual([]);
  });

  it("tolerates non-string answers", () => {
    const r = enforceCitations(null, THREE);
    expect(r.text).toBe("");
    expect(r.grounded).toBe(false);
  });

  it("can be told not to require a citation", () => {
    const r = enforceCitations("A summary with no sources cited.", THREE, { requireCitation: false });
    expect(r.warnings).not.toContain("no-citations");
  });
});
