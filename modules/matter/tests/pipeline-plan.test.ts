import { describe, it, expect } from "vitest";
import { resolveMatterPipelinePlan } from "../src/internal/services/pipeline-plan";
import type { OrgProcessingCapabilities } from "../src/internal/services/pipeline-capabilities";

const caps = (over: Partial<OrgProcessingCapabilities["engines"]> = {}): OrgProcessingCapabilities => ({
  m365: { connected: true, mode: "real", tenantIdMasked: null },
  ediscovery: { connected: !!over.purviewPreserve, accountUpn: null, expired: false },
  processing: { configuredMode: "auto", effectiveMode: "native", tikaReachable: !!over.tikaExtract, tikaVersion: null },
  engines: { nativeExtract: true, aiReview: true, tikaExtract: false, purviewPreserve: false, purviewProcess: false, ...over },
});

const stage = (plan: ReturnType<typeof resolveMatterPipelinePlan>, key: string) => plan.stages.find((s) => s.stage === key)!;

describe("resolveMatterPipelinePlan (B2)", () => {
  it("bare org: everything native + AEGIS AI", () => {
    const p = resolveMatterPipelinePlan(caps());
    expect(stage(p, "collect").engine).toBe("native");
    expect(stage(p, "preserve").engine).toBe("native");
    expect(stage(p, "process").engine).toBe("native");
    expect(stage(p, "review").engine).toBe("aegis-ai");
  });

  it("Tika reachable → process routes to Tika with native fallback", () => {
    const p = resolveMatterPipelinePlan(caps({ tikaExtract: true }));
    expect(stage(p, "process").engine).toBe("tika");
    expect(stage(p, "process").fallback).toBe("native");
  });

  it("eDiscovery connected → preserve routes to Purview", () => {
    const p = resolveMatterPipelinePlan(caps({ purviewPreserve: true, purviewProcess: true }));
    expect(stage(p, "preserve").engine).toBe("purview");
    expect(stage(p, "preserve").fallback).toBe("native");
  });

  it("large volume + Purview → collect scales via Purview", () => {
    const p = resolveMatterPipelinePlan(caps({ purviewPreserve: true }), { estimatedVolume: "large" });
    expect(stage(p, "collect").engine).toBe("purview");
  });

  it("residency in-tenant + Purview process → process routes to Purview (with read-back caveat)", () => {
    const p = resolveMatterPipelinePlan(caps({ purviewProcess: true, purviewPreserve: true, tikaExtract: true }), { residency: "in-tenant" });
    expect(stage(p, "process").engine).toBe("purview");
    expect(stage(p, "process").reason).toMatch(/read-back/i);
  });

  it("min-cost overrides client Purview preference → stays on Tika", () => {
    const p = resolveMatterPipelinePlan(caps({ purviewProcess: true, purviewPreserve: true, tikaExtract: true }), { clientPrefersPurview: true, costPreference: "min-cost" });
    expect(stage(p, "process").engine).toBe("tika");
  });

  it("summary names all four engines", () => {
    const p = resolveMatterPipelinePlan(caps({ tikaExtract: true, purviewPreserve: true }));
    expect(p.summary).toMatch(/Collect:.*Preserve:.*Process:.*Review:/);
  });

  it("every stage carries cost + speed economics (B6)", () => {
    const p = resolveMatterPipelinePlan(caps({ tikaExtract: true, purviewPreserve: true }));
    for (const s of p.stages) {
      expect(s.economics.cost).toBeTruthy();
      expect(s.economics.speed).toBeTruthy();
    }
    // Tika process should read as "no E5"; Purview should read as needing Premium.
    expect(stage(p, "process").economics.cost).toMatch(/no E5/i);
  });
});
