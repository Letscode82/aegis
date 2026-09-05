import { describe, it, expect } from "vitest";
import { deriveEngines } from "../src/internal/services/pipeline-capabilities";

describe("deriveEngines (pipeline planner B1)", () => {
  it("native extract and AI review are always available", () => {
    const e = deriveEngines({ ediscoveryConnected: false, tikaReachable: false });
    expect(e.nativeExtract).toBe(true);
    expect(e.aiReview).toBe(true);
    expect(e.tikaExtract).toBe(false);
    expect(e.purviewPreserve).toBe(false);
    expect(e.purviewProcess).toBe(false);
  });

  it("Tika extraction tracks sidecar reachability", () => {
    expect(deriveEngines({ ediscoveryConnected: false, tikaReachable: true }).tikaExtract).toBe(true);
  });

  it("Purview preserve + process track delegated eDiscovery connection", () => {
    const e = deriveEngines({ ediscoveryConnected: true, tikaReachable: false });
    expect(e.purviewPreserve).toBe(true);
    expect(e.purviewProcess).toBe(true);
  });

  it("all engines available when both Tika and eDiscovery are up", () => {
    const e = deriveEngines({ ediscoveryConnected: true, tikaReachable: true });
    expect(Object.values(e).every(Boolean)).toBe(true);
  });
});
