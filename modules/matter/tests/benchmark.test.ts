import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { benchmarkExtraction } from "../src/internal/services/benchmark";

describe("benchmarkExtraction (A6)", () => {
  let prev: string | undefined;
  beforeAll(() => { prev = process.env.TIKA_SERVER_URL; delete process.env.TIKA_SERVER_URL; });
  afterAll(() => { if (prev !== undefined) process.env.TIKA_SERVER_URL = prev; });

  it("returns a native throughput result", async () => {
    const { results } = await benchmarkExtraction({ count: 5, sizeBytes: 500, concurrency: 2 });
    expect(results).toHaveLength(1); // native only (no Tika configured)
    const r = results[0];
    expect(r.engine).toBe("native");
    expect(r.docs).toBe(5);
    expect(r.concurrency).toBe(2);
    expect(r.elapsedMs).toBeGreaterThan(0);
    expect(r.docsPerMin).toBeGreaterThan(0);
  });

  it("clamps out-of-range inputs", async () => {
    const { results } = await benchmarkExtraction({ count: 99999, sizeBytes: 1, concurrency: 999 });
    expect(results[0].docs).toBe(200); // count clamp
    expect(results[0].bytesPerDoc).toBe(100); // size floor
    expect(results[0].concurrency).toBe(16); // concurrency cap
  });
});
