import { describe, it, expect, vi, afterEach } from "vitest";
import { embedTexts, providerModelId, resolveProvider } from "../src/embeddings";

const origFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = origFetch;
  vi.restoreAllMocks();
});

function mockFetch(json: unknown, ok = true) {
  globalThis.fetch = vi.fn(async () => ({ ok, json: async () => json }) as unknown as Response) as typeof fetch;
}

describe("resolveProvider", () => {
  it("returns null when no provider env is set", () => {
    const saved = { ...process.env };
    delete process.env.EMBEDDINGS_URL;
    delete process.env.VOYAGE_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect(resolveProvider()).toBeNull();
    process.env = saved;
  });
});

describe("embedTexts", () => {
  it("returns null when no provider is configured", async () => {
    const r = await embedTexts(["hello"], { provider: null });
    expect(r).toBeNull();
  });

  it("returns an empty well-formed result for empty input", async () => {
    const r = await embedTexts([], { provider: { kind: "self", url: "http://x", model: "m" } });
    expect(r).toEqual({ vectors: [], model: "self:m", dim: 0 });
  });

  it("parses OpenAI/Voyage { data: [{embedding}] } shape", async () => {
    mockFetch({ data: [{ embedding: [0.1, 0.2, 0.3] }, { embedding: [0.4, 0.5, 0.6] }] });
    const r = await embedTexts(["a", "b"], { provider: { kind: "voyage", apiKey: "k", model: "voyage-3" } });
    expect(r).not.toBeNull();
    expect(r?.model).toBe("voyage:voyage-3");
    expect(r?.dim).toBe(3);
    expect(r?.vectors).toHaveLength(2);
  });

  it("parses self-hosted { embeddings: number[][] } shape", async () => {
    mockFetch({ embeddings: [[1, 2, 3, 4]] });
    const r = await embedTexts(["only"], { provider: { kind: "self", url: "http://embed", model: "minilm" } });
    expect(r?.dim).toBe(4);
    expect(r?.vectors[0]).toEqual([1, 2, 3, 4]);
  });

  it("returns null when vector count doesn't match input count", async () => {
    mockFetch({ embeddings: [[1, 2, 3]] });
    const r = await embedTexts(["a", "b"], { provider: { kind: "self", url: "http://embed", model: "m" } });
    expect(r).toBeNull();
  });

  it("returns null when dimensions are inconsistent", async () => {
    mockFetch({ data: [{ embedding: [1, 2, 3] }, { embedding: [1, 2] }] });
    const r = await embedTexts(["a", "b"], { provider: { kind: "openai", apiKey: "k", model: "text-embedding-3-small" } });
    expect(r).toBeNull();
  });

  it("returns null on a non-ok HTTP response", async () => {
    mockFetch({}, false);
    const r = await embedTexts(["a"], { provider: { kind: "voyage", apiKey: "k", model: "voyage-3" } });
    expect(r).toBeNull();
  });

  it("sub-batches large inputs (>96) and concatenates aligned vectors", async () => {
    const batchSizes: number[] = [];
    globalThis.fetch = vi.fn(async (_url: unknown, init: unknown) => {
      const body = JSON.parse((init as { body: string }).body) as { input: string[] };
      batchSizes.push(body.input.length);
      return { ok: true, json: async () => ({ embeddings: body.input.map(() => [1, 2, 3]) }) } as unknown as Response;
    }) as typeof fetch;
    const inputs = Array.from({ length: 150 }, (_, i) => `t${i}`);
    const r = await embedTexts(inputs, { provider: { kind: "self", url: "http://embed", model: "m" } });
    expect(r?.vectors).toHaveLength(150);
    expect(r?.dim).toBe(3);
    expect(batchSizes).toEqual([96, 54]); // 150 split into 96 + 54, not one oversized request
  });
});

describe("providerModelId", () => {
  it("is a stable provider:model partition key", () => {
    expect(providerModelId({ kind: "self", url: "http://x", model: "bge" })).toBe("self:bge");
    expect(providerModelId({ kind: "openai", apiKey: "k", model: "text-embedding-3-small" })).toBe(
      "openai:text-embedding-3-small",
    );
  });
});
