/**
 * Retrieval entry point. Uses pgvector cosine search when the column exists AND
 * an embedding provider is configured; otherwise (or if the semantic path finds
 * nothing) falls back to keyword search over the Document corpus. Every caller
 * gets grounded results with zero configuration and better results as infra is
 * added — no branching required at the call site.
 */
import { prisma } from "@aegis/db";
import { embedTexts, isSemanticSearchConfigured } from "./embeddings";
import { hasVectorColumn } from "./capability";
import { keywordSearch } from "./keyword";
import type { SearchHit, SemanticSearchInput } from "./types";

function vectorLiteral(vec: number[]): string {
  return `[${vec.map((n) => (Number.isFinite(n) ? n : 0)).join(",")}]`;
}

function sanitizeOwnerTypes(types?: string[]): string[] {
  if (!types) return [];
  return types.map((t) => String(t).replace(/[^A-Za-z0-9_]/g, "")).filter(Boolean);
}

/** Cosine search over DocumentEmbedding. Returns [] if the semantic path can't run. */
async function semanticOnly(input: SemanticSearchInput): Promise<SearchHit[]> {
  if (!isSemanticSearchConfigured()) return [];
  if (!(await hasVectorColumn())) return [];
  const embedded = await embedTexts([input.query]);
  const qvec = embedded?.vectors[0];
  if (!embedded || !qvec) return [];

  const limit = Math.min(Math.max(1, input.limit ?? 8), 50);
  const owners = sanitizeOwnerTypes(input.ownerTypes);
  // ownerIds are ids (not a controlled vocab), so bind them as a parameter
  // rather than inlining. An explicit empty array means "nothing in scope".
  const ownerIds = input.ownerIds;
  if (ownerIds && ownerIds.length === 0) return [];

  const params: unknown[] = [vectorLiteral(qvec), input.organizationId, embedded.model];
  let ownerClause = "";
  if (owners.length > 0) {
    ownerClause += ` AND "ownerType" = ANY($${params.length + 1}::text[])`;
    params.push(`{${owners.join(",")}}`);
  }
  if (ownerIds && ownerIds.length > 0) {
    // Bind as a Postgres array-literal string (same approach as ownerTypes) —
    // the raw driver casts $n::text[]. Ids are quoted + sanitized defensively.
    const literal = `{${ownerIds.map((id) => `"${String(id).replace(/["\\]/g, "")}"`).join(",")}}`;
    params.push(literal);
    ownerClause += ` AND "ownerId" = ANY($${params.length}::text[])`;
  }
  params.push(limit);
  const limitParam = `$${params.length}`;

  const sql = `
    SELECT "ownerType", "ownerId", "documentId", content,
           1 - (embedding <=> $1::vector) AS score
    FROM "DocumentEmbedding"
    WHERE "organizationId" = $2 AND "embeddingModel" = $3 AND embedding IS NOT NULL${ownerClause}
    ORDER BY embedding <=> $1::vector
    LIMIT ${limitParam}`;

  const rows = await prisma.$queryRawUnsafe<
    Array<{ ownerType: string; ownerId: string; documentId: string | null; content: string; score: number }>
  >(sql, ...params);

  return rows.map((r) => ({
    ownerType: r.ownerType,
    ownerId: r.ownerId,
    documentId: r.documentId,
    content: r.content,
    score: typeof r.score === "number" ? r.score : Number(r.score) || 0,
    source: "semantic" as const,
  }));
}

/**
 * Semantic search with automatic keyword fallback. When the semantic path is
 * available and returns hits, those win; otherwise keyword results are returned.
 */
export async function semanticSearch(input: SemanticSearchInput): Promise<SearchHit[]> {
  if (!input.organizationId || !(input.query || "").trim()) return [];
  try {
    const hits = await semanticOnly(input);
    if (hits.length > 0) return hits;
  } catch {
    // fall through to keyword on any raw-SQL / provider error
  }
  return keywordSearch(input);
}
