# @aegis/search

**Status: K1 shipped (semantic + keyword retrieval).** The event-driven
cross-module *index* (below, "planned") is still ahead; this package now
provides the retrieval layer that grounds ONE Legal's cited Q&A and, later,
the Vault.

## What ships today (K1.1)

Two retrieval layers behind one call site — `semanticSearch()` picks the best
available path and degrades transparently, so no consumer branches on infra:

- **Semantic** — pgvector cosine over `DocumentEmbedding`. Active when the
  pgvector `embedding` column exists (Neon) **and** an embedding provider is
  configured. Vectors are provider-agnostic; retrieval only ever compares
  vectors from the same `embeddingModel`.
- **Keyword** — a scan over the `Document` corpus (name + extracted text). The
  always-available floor: works with zero infrastructure.

```ts
import { semanticSearch, indexDocument } from "@aegis/search";

// Index (no-op if pgvector/provider absent — safe to call anywhere):
await indexDocument(documentId);

// Retrieve (semantic if available, else keyword — always grounded):
const hits = await semanticSearch({
  organizationId,
  query: "limitation of liability cap for Acme",
  ownerTypes: ["DOCUMENT", "CONTRACT"], // optional
  limit: 8,
});
// hits: { ownerType, ownerId, documentId, content, score, source }[]
```

All functions are **server-side only** — they read privileged text and call an
embedding provider. Never import from the browser.

### Configuration (all optional — unset ⇒ keyword fallback)

Embedding provider, resolved in priority order:

| Env | Meaning |
|---|---|
| `EMBEDDINGS_URL` | Self-hosted endpoint (e.g. a CPU model on Railway). `POST {input:string[]}` → `{embeddings:number[][]}` or `{data:[{embedding}]}`. Keeps confidential text in-tenant. **Preferred.** |
| `EMBEDDINGS_API_KEY` | Optional bearer token for that endpoint. |
| `EMBEDDINGS_MODEL` | Model label stored as the retrieval partition key (default `default`). |
| `VOYAGE_API_KEY` (+ `VOYAGE_MODEL`, default `voyage-3`) | Voyage AI managed embeddings. |
| `OPENAI_API_KEY` (+ `OPENAI_EMBED_MODEL`, default `text-embedding-3-small`) | OpenAI embeddings. |

The pgvector column is created by migration
`20260929120000_document_embeddings` **only where pgvector is available**
(Neon). On a plain Postgres image (CI) the column is skipped and the package
uses keyword search — the migration still applies cleanly. `hasVectorColumn()`
is the runtime probe.

> Switching providers changes the vector dimension/space. Re-index the corpus
> after a provider change — retrieval partitions on `embeddingModel`, so old
> and new vectors never mix, but old vectors become unreachable by the new
> query model until re-indexed.

## Planned (post-K1): event-driven cross-module index

The single search index that spans every module: matters, contracts,
documents, DSARs, regulations, intake tickets, board pack content, knowledge
entries — the technical backbone of the **Knowledge Management** module's
"Company Brain" (not the module itself; the module owns UX, curation, access).

Indexing becomes event-driven: any module that creates/updates/archives a
record emits an `Event`; an indexer worker consumes those and updates the
index. Modules do not call `indexResource()` in their hot path.

```ts
import { search, indexResource, searchByEntity, buildEntityRelationGraph } from "@aegis/search";
```

## Entities owned/managed
- `DocumentEmbedding` (K1) — text-chunk embeddings; the `embedding` column is
  pgvector, read/written only via raw SQL in this package.
- The cross-module search index (planned) — `SearchIndexEntry`.
- Reads from but does not own: `Document`, `Matter`, `Contract`, `Person`,
  `Counterparty`, `Obligation`, `Event`.

## Out of scope
- Knowledge curation, contributors, moderation (Knowledge Management module).
- Question answering / RAG composition (lives in callers that combine
  `@aegis/search` hits with `@aegis/ai` — e.g. ONE Legal's cited Q&A).
