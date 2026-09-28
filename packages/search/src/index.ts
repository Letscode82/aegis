/**
 * @aegis/search — cross-module semantic + keyword search (K1).
 *
 * Retrieval that grounds ONE Legal's cited Q&A and (later) the Vault. Two
 * layers, one call site:
 *   - Semantic: pgvector cosine over DocumentEmbedding, when the pgvector
 *     column exists (Neon) AND an embedding provider is configured.
 *   - Keyword: Document-corpus scan — the always-available floor.
 * `semanticSearch()` picks the best available path and degrades transparently,
 * so no consumer branches on infrastructure.
 *
 * All functions are server-side only (they read privileged text and, for the
 * semantic path, call an embedding provider). Never import from the browser.
 */
export { semanticSearch } from "./search";
export { indexResource, indexDocument } from "./indexer";
export { keywordSearch } from "./keyword";
export { embedTexts, isSemanticSearchConfigured, resolveProvider, providerModelId } from "./embeddings";
export { hasVectorColumn } from "./capability";
export { chunkText } from "./chunk";
export type {
  SearchHit,
  SearchOwnerType,
  SemanticSearchInput,
  IndexResourceInput,
  IndexResult,
  EmbedResult,
} from "./types";
