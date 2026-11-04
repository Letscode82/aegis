import { describe, it, expect } from "vitest";
import { buildTemplateSkeleton } from "../src/internal/template-skeleton";

describe("buildTemplateSkeleton — never-falter deterministic fallback", () => {
  it("always returns a usable body with the skeleton banner and base sections", () => {
    const out = buildTemplateSkeleton({ kind: "CONTRACT", name: "Services Agreement", instructions: "" });
    expect(out).toContain("SERVICES AGREEMENT");
    expect(out).toContain("STRUCTURED SKELETON");
    expect(out).toContain("1. Parties");
    expect(out).toContain("13. Governing Law");
    expect(out).toContain("{{governingLaw}}");
    expect(out).toContain("SIGNATURES");
  });

  it("seeds RBI Digital Lending mandatory clauses when the brief implies it", () => {
    const out = buildTemplateSkeleton({
      kind: "CONTRACT",
      name: "Jio Finance LSP Agreement",
      instructions: "Lending Service Provider agreement capturing RBI Digital Lending Guidelines mandatory requirements, clauses in favour of Jio",
    });
    expect(out).toContain("RBI Digital Lending Guidelines");
    expect(out).toContain("Key Fact Statement");
    expect(out).toContain("APR");
    expect(out).toContain("Cooling-off");
    expect(out).toContain("Grievance redressal");
  });

  it("matches the LSP acronym and 'reserve bank' phrasing", () => {
    expect(buildTemplateSkeleton({ instructions: "standard LSP onboarding" })).toContain("RBI Digital Lending Guidelines");
    expect(buildTemplateSkeleton({ instructions: "per Reserve Bank circular" })).toContain("RBI Digital Lending Guidelines");
  });

  it("seeds GDPR Art. 28 processor clauses for a DPA brief", () => {
    const out = buildTemplateSkeleton({ kind: "CONTRACT", name: "DPA", instructions: "GDPR data processing agreement for personal data" });
    expect(out).toContain("GDPR Art. 28");
    expect(out).toContain("sub-processor");
    expect(out).toContain("breach notification");
  });

  it("does not add a regime block for a generic NDA brief", () => {
    const out = buildTemplateSkeleton({ kind: "NDA", name: "Mutual NDA", instructions: "3-year mutual NDA, California law" });
    expect(out).toContain("MUTUAL NDA");
    expect(out).not.toContain("RBI Digital Lending Guidelines");
    expect(out).not.toContain("GDPR Art. 28");
  });

  it("echoes the drafter's instructions so nothing is lost", () => {
    const out = buildTemplateSkeleton({ kind: "OTHER", instructions: "favour the licensor on IP ownership" });
    expect(out).toContain("Drafter's instructions");
    expect(out).toContain("favour the licensor on IP ownership");
  });

  it("tolerates empty / missing input without throwing", () => {
    expect(() => buildTemplateSkeleton({})).not.toThrow();
    const out = buildTemplateSkeleton({});
    expect(out).toContain("STRUCTURED SKELETON");
    expect(out.length).toBeGreaterThan(200);
  });
});
