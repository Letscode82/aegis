import { describe, it, expect } from "vitest";
import { describeIntent, type IntentSignals } from "../lib/one-legal/intent";

// Baseline: no document, nothing matched, a plain non-question request.
const base: IntentSignals = {
  hasText: true,
  hasDoc: false,
  wantsQuick: false,
  isCanvasDraft: false,
  createType: null,
  classified: "file",
};

describe("describeIntent", () => {
  it("previews nothing for an empty composer", () => {
    const p = describeIntent({ ...base, hasText: false });
    expect(p.kind).toBe("empty");
    expect(p.filed).toBe(false);
    expect(p.lead).toBe("");
  });

  it("offers the explicit fork for an NDA creation", () => {
    const p = describeIntent({ ...base, createType: "NDA Request" });
    expect(p.kind).toBe("create");
    expect(p.filed).toBe(true);
    expect(p.createType).toBe("NDA Request");
    expect(p.lead).toBe("File & track");
    expect(p.tail).toContain("an NDA request");
    expect(p.tail).toContain("REQ number");
  });

  it("names the contract-review type for a non-NDA contract", () => {
    const p = describeIntent({ ...base, createType: "Contract Review" });
    expect(p.kind).toBe("create");
    expect(p.tail).toContain("a contract review");
  });

  it("quick-draft phrasing overrides the create fork — nothing filed", () => {
    // wantsQuick wins over createType: even a contract goes to the canvas.
    const p = describeIntent({ ...base, wantsQuick: true, createType: "NDA Request" });
    expect(p.kind).toBe("draft");
    expect(p.filed).toBe(false);
    expect(p.lead).toBe("Open an editable draft");
  });

  it("treats a memo/email canvas draft as unfiled", () => {
    const p = describeIntent({ ...base, isCanvasDraft: true });
    expect(p.kind).toBe("draft");
    expect(p.filed).toBe(false);
  });

  it("reviews an attached document with no typed question", () => {
    const p = describeIntent({ ...base, hasText: false, hasDoc: true });
    expect(p.kind).toBe("review");
    expect(p.filed).toBe(false);
    expect(p.lead).toBe("Review");
    expect(p.tail).toContain("matching playbook");
  });

  it("answers a typed question against an attached document", () => {
    const p = describeIntent({ ...base, hasDoc: true, hasText: true });
    expect(p.kind).toBe("review");
    expect(p.lead).toBe("Answer");
    expect(p.tail).toContain("attached document");
  });

  it("a document in play wins over a create phrasing", () => {
    // Staged docs short-circuit the create logic in submitComposer.
    const p = describeIntent({ ...base, hasDoc: true, createType: "NDA Request" });
    expect(p.kind).toBe("review");
    expect(p.filed).toBe(false);
  });

  it("answers a capability or question — nothing filed", () => {
    expect(describeIntent({ ...base, classified: "ask" }).kind).toBe("answer");
    expect(describeIntent({ ...base, classified: "ask" }).filed).toBe(false);
    expect(describeIntent({ ...base, classified: "capability" }).kind).toBe("answer");
  });

  it("files & routes a plain request through intake", () => {
    const p = describeIntent(base);
    expect(p.kind).toBe("file");
    expect(p.filed).toBe(true);
    expect(p.lead).toBe("File & route");
  });
});
