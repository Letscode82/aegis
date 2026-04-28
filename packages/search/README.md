# @aegis/search

**Status: STUB.** Empty in Step 1. This README is an architectural commitment.

## What this package will do
The single search index that spans every module: matters, contracts,
documents, DSARs, regulations, intake tickets, board pack content,
knowledge entries. It is the technical backbone of the **Knowledge
Management** module's "Company Brain" — but it is not the module itself.
The module owns the UX, the curation, and the access controls; this
package owns the index and the query interface.

Without a shared index, "find all references to Counterparty X across the
firm" requires N separate queries hitting N module backends. With a shared
index keyed on the shared entities (`Counterparty`, `Person`, `Document`,
`Matter`, `Obligation`), one query returns the full graph.

## When it will be implemented
**Phase: post-Step 6, when the Knowledge Management module is built.**
Earlier modules can ship without it; the search hooks below get added then.

## Public API surface (planned)

```ts
import {
  search,
  indexResource,
  reindexResource,
  removeFromIndex,
  searchByEntity,
  buildEntityRelationGraph,
} from "@aegis/search";

const results = await search({
  organizationId,
  query: "data processing addendum Acme",
  filters: { resourceTypes: ["MATTER", "CONTRACT", "DOCUMENT"] },
  permissionContext: currentUser,
});
```

Indexing is event-driven: any module that creates / updates / archives a
record emits an `Event`, and an indexer worker consumes those events and
updates the index. Modules do **not** call `indexResource()` directly in
their hot path.

## Entities owned/managed
- The search index (backend TBD — Postgres `tsvector`, OpenSearch, or
  pg_vector for embeddings; pluggable).
- `SearchIndexEntry` (resourceType, resourceId, organizationId, vector,
  text, fields, lastIndexedAt) — opaque to consumers.
- Reads from but does not own: `Document`, `Matter`, `Contract`, `Person`,
  `Counterparty`, `Obligation`, `Event`.

## Why a shared service vs. a module
- One ranking model, one tokenizer, one permission filter.
- Cross-module queries are the *point* — a module-scoped search can't return
  "every place this Counterparty appears."
- Re-indexing strategy (incremental vs. nightly full rebuild) is
  infrastructure.

## Out of scope
- Knowledge curation, contributors, moderation (those live in the
  **Knowledge Management** module).
- Question answering / retrieval-augmented generation (lives in callers
  that combine `@aegis/search` results with `@aegis/ai`).
