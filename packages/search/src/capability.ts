/**
 * Runtime probe for the pgvector `embedding` column. The
 * 20260929120000_document_embeddings migration adds it only where pgvector is
 * available (Neon); on a plain Postgres image the column is absent. Callers
 * probe once (result cached) and fall back to keyword search when false.
 */
import { prisma } from "@aegis/db";

let cached: boolean | null = null;

export async function hasVectorColumn(force = false): Promise<boolean> {
  if (cached !== null && !force) return cached;
  try {
    const rows = await prisma.$queryRaw<Array<{ present: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'DocumentEmbedding' AND column_name = 'embedding'
      ) AS present`;
    const first = rows[0];
    cached = !!(first && first.present);
  } catch {
    cached = false;
  }
  return cached;
}

/** Test seam — clears the cached probe result. */
export function __resetCapabilityCache(): void {
  cached = null;
}
