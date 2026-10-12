import { describe, it, expect } from "vitest";
import { wantsQuickDraft, contractCreationType } from "../lib/one-legal/creation-routing";

// Phase 7 — the Assistance vs Tracked routing decision. A mis-route either
// sends a real contract to the ungoverned canvas (no REQ, no approval trail)
// or drops a throwaway draft onto the record.

describe("wantsQuickDraft", () => {
  it("fires on explicit quick/rough/throwaway/scratch draft phrasing", () => {
    for (const t of [
      "quick draft an NDA for Acme",
      "rough draft of a services agreement",
      "throwaway draft of a memo",
      "scratch draft a clause",
      "just a draft of the MSA",
    ]) {
      expect(wantsQuickDraft(t)).toBe(true);
    }
  });
  it("fires on don't-file / no-ticket overrides", () => {
    expect(wantsQuickDraft("draft an NDA but don't file it")).toBe(true);
    expect(wantsQuickDraft("draft an NDA, no ticket")).toBe(true);
    expect(wantsQuickDraft("dont file this")).toBe(true);
  });
  it("does not fire on a plain creation request (that path is Tracked)", () => {
    expect(wantsQuickDraft("draft an NDA for Acme")).toBe(false);
    expect(wantsQuickDraft("prepare a services agreement")).toBe(false);
    expect(wantsQuickDraft("")).toBe(false);
    expect(wantsQuickDraft(undefined)).toBe(false);
  });
});

describe("contractCreationType", () => {
  it("maps an NDA creation to the NDA Request intake type", () => {
    for (const t of [
      "draft an NDA for Acme Corp",
      "create a mutual non-disclosure agreement",
      "prepare a confidentiality agreement",
      "write a nondisclosure agreement",
    ]) {
      expect(contractCreationType(t)).toBe("NDA Request");
    }
  });
  it("maps other contract creations to Contract Review", () => {
    for (const t of [
      "draft an MSA with Vortex",
      "prepare a statement of work",
      "create a data processing agreement",
      "author a licence agreement",
      "put together a master services agreement",
    ]) {
      expect(contractCreationType(t)).toBe("Contract Review");
    }
  });
  it("prefers NDA when both NDA and a generic contract noun appear", () => {
    expect(contractCreationType("draft an NDA (a confidentiality contract) for Acme")).toBe("NDA Request");
  });
  it("returns null when there is no creation verb (a question, not a draft)", () => {
    expect(contractCreationType("what does our NDA policy say?")).toBeNull();
    expect(contractCreationType("how many contracts are open?")).toBeNull();
    expect(contractCreationType("review this agreement against the playbook")).toBeNull();
  });
  it("returns null for a creation request with no contract noun (stays normal routing)", () => {
    expect(contractCreationType("draft a memo on remote work")).toBeNull();
    expect(contractCreationType("prepare a summary of the board meeting")).toBeNull();
    expect(contractCreationType("")).toBeNull();
    expect(contractCreationType(undefined)).toBeNull();
  });
});
