import { describe, it, expect } from "vitest";
import { buildProductionManifest } from "../src/internal/services/review-set-coding";

const item = (p: Partial<{ title: string; sourceSystem: string; codedResponsive: boolean | null; codedPrivileged: boolean; redact: boolean; reviewNote: string | null }>) => ({
  title: "doc", sourceSystem: "Exchange", codedResponsive: null, codedPrivileged: false, redact: false, reviewNote: null, ...p,
});

describe("buildProductionManifest", () => {
  it("Bates-numbers responsive non-privileged, logs privileged, excludes non-responsive", () => {
    const items = [
      item({ title: "A", codedResponsive: true }),
      item({ title: "B", codedResponsive: true, redact: true }),
      item({ title: "C", codedResponsive: true, codedPrivileged: true, reviewNote: "counsel advice" }),
      item({ title: "D", codedResponsive: false }),
      item({ title: "E", codedResponsive: null }), // uncoded
    ];
    const m = buildProductionManifest(items, "ACME");
    expect(m.produced.map((p) => p.bates)).toEqual(["ACME-000001", "ACME-000002"]);
    expect(m.produced.find((p) => p.title === "B")?.redacted).toBe(true);
    expect(m.privilegeLog).toHaveLength(1);
    expect(m.privilegeLog[0]).toMatchObject({ logNo: "PRIV-0001", title: "C", basis: "counsel advice" });
    expect(m.counts).toEqual({ produced: 2, privileged: 1, nonResponsive: 1, uncoded: 1 });
  });
  it("defaults the privilege basis when no note", () => {
    const m = buildProductionManifest([item({ codedResponsive: true, codedPrivileged: true })], "X");
    expect(m.privilegeLog[0]!.basis).toMatch(/privilege/i);
  });
  it("continuous Bates across the produced set only", () => {
    const items = [item({ codedResponsive: true }), item({ codedResponsive: false }), item({ codedResponsive: true })];
    const m = buildProductionManifest(items, "Z", 4);
    expect(m.produced.map((p) => p.bates)).toEqual(["Z-0001", "Z-0002"]);
  });
});
