/**
 * Backfill embeddings for existing Documents (K1.2).
 *
 * Idempotent + re-runnable: indexResource replaces prior vectors for each
 * (resource, model), so running this again after adding documents — or after
 * switching embedding providers — is safe.
 *
 * Preflight-guarded: if pgvector isn't installed (no `embedding` column) or no
 * embedding provider is configured, it prints guidance and exits 0 without
 * touching anything.
 *
 * Usage (from repo root, with DATABASE_URL + EMBEDDINGS_URL set):
 *   pnpm --filter @aegis/search run backfill
 *   AEGIS_ORG_ID=org_123 pnpm --filter @aegis/search run backfill   # one org
 *   BACKFILL_LIMIT=50 pnpm --filter @aegis/search run backfill      # cap docs
 */
import { prisma } from "@aegis/db";
import { indexResource } from "../src/indexer";
import { hasVectorColumn } from "../src/capability";
import { isSemanticSearchConfigured, resolveProvider, providerModelId } from "../src/embeddings";

async function main() {
  const orgId = (process.env.AEGIS_ORG_ID || "").trim() || undefined;
  const limit = Number(process.env.BACKFILL_LIMIT) || 0; // 0 = no cap

  const provider = resolveProvider();
  if (!isSemanticSearchConfigured() || !provider) {
    console.log(
      "[backfill] No embedding provider configured (set EMBEDDINGS_URL, VOYAGE_API_KEY, or OPENAI_API_KEY).\n" +
        "           Nothing to do — semantic search will use the keyword fallback until a provider is set.",
    );
    return;
  }
  if (!(await hasVectorColumn())) {
    console.log(
      "[backfill] pgvector `embedding` column is absent on this database.\n" +
        "           Run the 20260929120000_document_embeddings migration against a Postgres with pgvector\n" +
        "           (Neon has it): pnpm --filter @aegis/db run db:migrate:deploy",
    );
    return;
  }

  console.log(`[backfill] provider=${providerModelId(provider)}${orgId ? ` org=${orgId}` : " (all orgs)"}${limit ? ` limit=${limit}` : ""}`);

  const batchSize = 100;
  let cursor: string | undefined;
  let scanned = 0;
  let indexed = 0;
  let skipped = 0;
  let chunks = 0;

  for (;;) {
    const docs = await prisma.document.findMany({
      where: {
        ...(orgId ? { organizationId: orgId } : {}),
        extractedText: { not: null },
      },
      select: { id: true, organizationId: true, name: true, extractedText: true },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (docs.length === 0) break;
    cursor = docs[docs.length - 1]?.id;

    for (const doc of docs) {
      if (limit && scanned >= limit) break;
      scanned += 1;
      const text = [doc.name, doc.extractedText || ""].filter(Boolean).join("\n\n").trim();
      if (!text) {
        skipped += 1;
        continue;
      }
      try {
        const resourceInput = {
          organizationId: doc.organizationId,
          ownerType: "DOCUMENT" as const,
          ownerId: doc.id,
          documentId: doc.id,
          text,
        };
        let res = await indexResource(resourceInput);
        // Retry once on a TRANSIENT embed miss. "no-embeddings" means the
        // provider returned nothing for this call (a one-off timeout / cold
        // start) — a brief pause + one retry recovers it. Deterministic
        // reasons ("no-capability", "empty-text") are never retried.
        if (res.indexed === 0 && res.reason === "no-embeddings") {
          await new Promise((r) => setTimeout(r, 1500));
          res = await indexResource(resourceInput);
        }
        if (res.indexed > 0) {
          indexed += 1;
          chunks += res.indexed;
        } else {
          skipped += 1;
          if (res.reason) console.warn(`[backfill] doc ${doc.id} not indexed: ${res.reason}`);
        }
      } catch (err) {
        skipped += 1;
        console.warn(`[backfill] doc ${doc.id} failed: ${String((err as Error).message || err)}`);
      }
      if (scanned % 25 === 0) console.log(`[backfill] …${scanned} scanned, ${indexed} indexed (${chunks} chunks)`);
    }
    if (limit && scanned >= limit) break;
  }

  console.log(`[backfill] done — scanned=${scanned} indexed=${indexed} skipped=${skipped} chunks=${chunks}`);
}

main()
  .catch((err) => {
    console.error("[backfill] fatal:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
