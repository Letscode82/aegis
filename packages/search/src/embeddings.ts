/**
 * Embedding provider client for @aegis/search.
 *
 * Provider-agnostic and degrade-safe: whichever of these is configured (in
 * priority order) is used; if none is, `embedTexts` returns null and every
 * caller falls back to keyword search. All calls are server-side only —
 * privileged legal text must never be embedded from the browser.
 *
 *   EMBEDDINGS_URL     Self-hosted endpoint (e.g. a CPU sentence-embedding
 *                      service on Railway). POST {input:string[]} → embeddings.
 *                      Keeps confidential text in-tenant. Preferred.
 *     EMBEDDINGS_API_KEY  optional bearer token for that endpoint
 *     EMBEDDINGS_MODEL    label for the model (stored so only same-model
 *                         vectors are ever compared); default "default"
 *   VOYAGE_API_KEY     Voyage AI managed embeddings (voyage-3 / voyage-law-2).
 *     VOYAGE_MODEL        default "voyage-3"
 *   OPENAI_API_KEY     OpenAI embeddings (text-embedding-3-small).
 *     OPENAI_EMBED_MODEL  default "text-embedding-3-small"
 *
 * The stored `embeddingModel` id (e.g. "voyage:voyage-3") is the retrieval
 * partition key — index and query must resolve to the same provider, so never
 * mix providers within one corpus without a re-index.
 */
import type { EmbedResult } from "./types";

type Provider =
  | { kind: "self"; url: string; apiKey?: string; model: string }
  | { kind: "voyage"; apiKey: string; model: string }
  | { kind: "openai"; apiKey: string; model: string };

function env(name: string): string | undefined {
  return typeof process !== "undefined" && process.env ? process.env[name] : undefined;
}

/** Resolve the active provider from env, or null if none configured. */
export function resolveProvider(): Provider | null {
  const url = (env("EMBEDDINGS_URL") || "").replace(/\/+$/, "");
  if (url) {
    return { kind: "self", url, apiKey: env("EMBEDDINGS_API_KEY"), model: env("EMBEDDINGS_MODEL") || "default" };
  }
  const voyage = env("VOYAGE_API_KEY");
  if (voyage) return { kind: "voyage", apiKey: voyage, model: env("VOYAGE_MODEL") || "voyage-3" };
  const openai = env("OPENAI_API_KEY");
  if (openai) return { kind: "openai", apiKey: openai, model: env("OPENAI_EMBED_MODEL") || "text-embedding-3-small" };
  return null;
}

/** Stable id stored in DocumentEmbedding.embeddingModel — the retrieval partition key. */
export function providerModelId(p: Provider): string {
  return `${p.kind}:${p.model}`;
}

/** True when an embedding provider is configured (server-side). */
export function isSemanticSearchConfigured(): boolean {
  return resolveProvider() !== null;
}

/** Extract number[][] from the various provider/response shapes. */
function parseVectors(data: unknown): number[][] | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  // OpenAI / Voyage: { data: [{ embedding: number[] }, ...] }
  if (Array.isArray(obj.data)) {
    const out: number[][] = [];
    for (const row of obj.data) {
      const emb = row && typeof row === "object" ? (row as Record<string, unknown>).embedding : undefined;
      if (Array.isArray(emb)) out.push(emb as number[]);
    }
    if (out.length) return out;
  }
  // Self-hosted conventions: { embeddings: number[][] } or { vectors: number[][] }
  for (const key of ["embeddings", "vectors"] as const) {
    const v = obj[key];
    if (Array.isArray(v) && (v.length === 0 || Array.isArray(v[0]))) return v as number[][];
  }
  return null;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<unknown | null> {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface EmbedOptions {
  timeoutMs?: number;
  /** Override provider resolution (tests). */
  provider?: Provider | null;
}

/**
 * Embed a batch of texts. Returns aligned vectors + the model id + dimension,
 * or null when no provider is configured or the call fails (caller degrades to
 * keyword). Empty input returns an empty, well-formed result.
 */
// Cap the number of texts in a single embed request. The self-hosted service
// rejects batches over its MAX_BATCH (128 by default) with HTTP 413, and the
// managed providers have their own per-request caps — so a long document that
// chunks into >128 pieces would fail to embed entirely. Sub-batching keeps every
// request well under those limits; 96 leaves headroom under the 128 default.
const MAX_EMBED_BATCH = 96;

/** Embed a single batch (already <= MAX_EMBED_BATCH). Returns aligned vectors or null. */
async function embedBatch(provider: Provider, batch: string[], timeout: number): Promise<number[][] | null> {
  let raw: unknown | null = null;
  if (provider.kind === "self") {
    const headers: Record<string, string> = {};
    if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
    raw = await postJson(`${provider.url}/embed`, headers, { input: batch, model: provider.model }, timeout);
    // Some self-hosted servers mount at the root rather than /embed.
    if (raw === null) raw = await postJson(provider.url, headers, { input: batch, model: provider.model }, timeout);
  } else if (provider.kind === "voyage") {
    raw = await postJson(
      "https://api.voyageai.com/v1/embeddings",
      { Authorization: `Bearer ${provider.apiKey}` },
      { input: batch, model: provider.model },
      timeout,
    );
  } else {
    raw = await postJson(
      "https://api.openai.com/v1/embeddings",
      { Authorization: `Bearer ${provider.apiKey}` },
      { input: batch, model: provider.model },
      timeout,
    );
  }
  const vectors = parseVectors(raw);
  if (!vectors || vectors.length !== batch.length) return null;
  return vectors;
}

export async function embedTexts(texts: string[], opts: EmbedOptions = {}): Promise<EmbedResult | null> {
  const provider = opts.provider !== undefined ? opts.provider : resolveProvider();
  if (!provider) return null;
  const clean = texts.map((t) => (t || "").trim()).filter((t) => t.length > 0);
  const modelId = providerModelId(provider);
  if (clean.length === 0) return { vectors: [], model: modelId, dim: 0 };

  const timeout = opts.timeoutMs ?? 20000;
  // Embed in sub-batches so a large input (many chunks) doesn't exceed the
  // provider's per-request cap. Any failed batch fails the whole call (caller
  // degrades to keyword), preserving the all-or-nothing contract.
  const vectors: number[][] = [];
  for (let i = 0; i < clean.length; i += MAX_EMBED_BATCH) {
    const batch = clean.slice(i, i + MAX_EMBED_BATCH);
    const got = await embedBatch(provider, batch, timeout);
    if (!got) return null;
    for (const v of got) vectors.push(v);
  }

  if (vectors.length !== clean.length) return null;
  const first = vectors[0];
  const dim = first ? first.length : 0;
  if (dim === 0) return null;
  // All vectors must share the dimension for a valid corpus.
  if (!vectors.every((v) => v.length === dim)) return null;
  return { vectors, model: modelId, dim };
}
