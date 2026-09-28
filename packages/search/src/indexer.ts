/**
 * Embedding indexer. Chunks text, embeds it, and upserts rows into
 * DocumentEmbedding. The `embedding` column is pgvector (Unsupported by the
 * Prisma client) so vectors are written via raw SQL; the scalar bookkeeping
 * columns come from the generated client.
 *
 * Degrade-safe: no pgvector column → no-op ("no-capability"); no embedding
 * provider → no-op ("no-embeddings"). Callers never need to guard.
 */
import { randomUUID } from "node:crypto";
import { prisma, sha256Hex } from "@aegis/db";
import { chunkText } from "./chunk";
import { embedTexts } from "./embeddings";
import { hasVectorColumn } from "./capability";
import type { IndexResourceInput, IndexResult } from "./types";

function toVectorLiteral(vec: number[]): string {
  // pgvector text input: "[0.1,0.2,...]". Guard against non-finite values.
  return `[${vec.map((n) => (Number.isFinite(n) ? n : 0)).join(",")}]`;
}

export async function indexResource(input: IndexResourceInput): Promise<IndexResult> {
  const text = (input.text || "").trim();
  if (!text) return { indexed: 0, reason: "empty-text" };
  if (!(await hasVectorColumn())) return { indexed: 0, reason: "no-capability" };

  const chunks = chunkText(text);
  if (chunks.length === 0) return { indexed: 0, reason: "empty-text" };

  const embedded = await embedTexts(chunks);
  if (!embedded || embedded.vectors.length !== chunks.length) return { indexed: 0, reason: "no-embeddings" };
  const { vectors, model, dim } = embedded;

  await prisma.$transaction(async (tx) => {
    // Replace any prior vectors for this (resource, model) so re-indexing is
    // idempotent and a shortened document doesn't leave stale chunks behind.
    await tx.documentEmbedding.deleteMany({
      where: { ownerType: input.ownerType, ownerId: input.ownerId, embeddingModel: model },
    });
    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i] as string;
      const vec = vectors[i] as number[];
      await tx.$executeRawUnsafe(
        `INSERT INTO "DocumentEmbedding"
           ("id","organizationId","ownerType","ownerId","documentId","chunkIndex","content","contentHash","embeddingModel","dim","embedding")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::vector)`,
        randomUUID(),
        input.organizationId,
        input.ownerType,
        input.ownerId,
        input.documentId ?? null,
        i,
        content,
        sha256Hex(content),
        model,
        dim,
        toVectorLiteral(vec),
      );
    }
  });

  return { indexed: chunks.length, model, dim };
}

/** Index a Document by id, using its extracted text. */
export async function indexDocument(documentId: string): Promise<IndexResult> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, organizationId: true, name: true, extractedText: true },
  });
  if (!doc) return { indexed: 0, reason: "empty-text" };
  const text = [doc.name, doc.extractedText || ""].filter(Boolean).join("\n\n");
  return indexResource({
    organizationId: doc.organizationId,
    ownerType: "DOCUMENT",
    ownerId: doc.id,
    documentId: doc.id,
    text,
  });
}
