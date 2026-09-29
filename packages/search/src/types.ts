/** @aegis/search — public types. */

/**
 * Logical resource an embedding chunk belongs to. Mirrors the shared-entity
 * vocabulary; kept as a plain string so callers aren't coupled to a Prisma
 * enum (embeddings can index resources across every module).
 */
export type SearchOwnerType =
  | "DOCUMENT"
  | "CONTRACT"
  | "MATTER"
  | "INTAKE_TICKET"
  | "OBLIGATION"
  | "KNOWLEDGE"
  | string;

/** A single retrieval hit, unified across semantic and keyword paths. */
export interface SearchHit {
  ownerType: SearchOwnerType;
  ownerId: string;
  documentId: string | null;
  /** The matched chunk (semantic) or an excerpt (keyword). */
  content: string;
  /** 0..1 relevance. Cosine similarity for semantic; a coarse score for keyword. */
  score: number;
  /** Which path produced this hit. */
  source: "semantic" | "keyword";
}

export interface SemanticSearchInput {
  organizationId: string;
  query: string;
  /** Restrict to these logical resource types. Omit for all. */
  ownerTypes?: SearchOwnerType[];
  /**
   * Restrict retrieval to these owner ids (for indexed documents, the Document
   * row ids). Used to scope a query to a collection, e.g. a Vault's documents.
   * Omit for the whole org. An empty array yields no results.
   */
  ownerIds?: string[];
  /** Max hits (default 8, capped 50). */
  limit?: number;
}

export interface IndexResourceInput {
  organizationId: string;
  ownerType: SearchOwnerType;
  ownerId: string;
  /** The Document row id, when the source is a Document. */
  documentId?: string | null;
  /** Full text to chunk + embed. */
  text: string;
}

export interface IndexResult {
  indexed: number;
  /** Present when nothing was indexed (why). */
  reason?: "no-capability" | "no-embeddings" | "empty-text" | "embed-failed";
  model?: string;
  dim?: number;
}

/** Result of embedding a batch of texts. */
export interface EmbedResult {
  vectors: number[][];
  model: string;
  dim: number;
}
