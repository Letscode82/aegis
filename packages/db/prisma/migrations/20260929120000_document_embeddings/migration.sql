-- K1.1 — semantic layer foundation. Durable store for text-chunk embeddings
-- that back @aegis/search's semantic retrieval (cited Q&A / Vault later).
--
-- Merge-safety: this migration MUST apply cleanly on a plain Postgres image
-- that has no pgvector available (CI's db-integrity job) AND light up full
-- vector search on Neon (which ships pgvector). So:
--   1. The DocumentEmbedding table + its scalar bookkeeping columns + indexes
--      are created unconditionally (this is what Prisma's schema tracks).
--   2. The `vector` extension and the `embedding` column are added inside
--      guarded DO blocks. Where pgvector is unavailable they are skipped with
--      a NOTICE and the table simply has no embedding column — @aegis/search
--      probes for the column at runtime and falls back to keyword search.
-- `organizationId` is a plain scalar (same localized pattern as the DSAR and
-- ONE Legal console tables) so this migration touches no existing model.

-- CreateTable
CREATE TABLE "DocumentEmbedding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "documentId" TEXT,
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "embeddingModel" TEXT NOT NULL,
    "dim" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentEmbedding_organizationId_ownerType_ownerId_idx" ON "DocumentEmbedding"("organizationId", "ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "DocumentEmbedding_organizationId_embeddingModel_idx" ON "DocumentEmbedding"("organizationId", "embeddingModel");

-- CreateIndex — one row per (resource, chunk, model): re-embedding with the
-- same model replaces in place; a different model coexists.
CREATE UNIQUE INDEX "DocumentEmbedding_ownerType_ownerId_chunkIndex_embeddingMode_key" ON "DocumentEmbedding"("ownerType", "ownerId", "chunkIndex", "embeddingModel");

-- Enable pgvector where available (Neon has it). Guarded so a plain Postgres
-- image without the extension control file doesn't fail the migration.
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgvector unavailable (%); DocumentEmbedding.embedding column skipped — @aegis/search will use keyword fallback.', SQLERRM;
END $$;

-- Add the embedding column only if the `vector` type now exists. Unspecified
-- dimension keeps the column provider-agnostic (a 384-dim MiniLM row and a
-- 1024-dim Voyage row can coexist); cosine search filters by embeddingModel so
-- only same-model vectors are ever compared. An ANN index (hnsw/ivfflat) needs
-- a fixed dimension and is added in a later slice once a model is standardized;
-- exact `<=>` scan is correct and fine at demo/moderate corpus size.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
        ALTER TABLE "DocumentEmbedding" ADD COLUMN "embedding" vector;
    END IF;
END $$;
