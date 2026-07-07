# The Agent Brain — GraphRAG plan and constraints (Phase C)

> Companion to the **GC Suite Agents — Working Architecture** document
> (July 2026). Phases A and B of that plan shipped as PRs #153–#157:
> the 11-agent contract (risks checklist + playbook stamp on every
> recommendation) and the four new agents (Notice Management,
> Contract-Type Specialist, Privacy Assessment, Marketing Review) plus
> the Litigation case-brief upgrade. This document is Phase C: what
> the "central brain" needs, what already exists, the two honest
> constraints, and the phased path.

## What the doc asks for

One ontology-driven brain in one PostgreSQL:

- **Ontology graph** — typed business objects (Counterparty, Person,
  Matter, Document, Obligation, Notice, Assessment, Claim, …)
  connected by typed links, traversed via *"openCypher via Apache AGE,
  or recursive CTEs."*
- **pgvector embeddings** for hybrid retrieval (vector + BM25 + rank
  fusion) inside a permission-filtered candidate subgraph.
- **GraphRAG service** every agent reads through — same permission
  filter, same citations, same audit trail; no agent has a private
  data path.
- **Event-driven indexer** keeping edges/embeddings fresh off the hot
  path.

## What AEGIS already has (more than it looks)

The doc's differentiator — *"the ontology is authored, not
extracted"* — is already the platform's architecture. The shared
entities in `@aegis/db` (`Counterparty`, `Person`, `Document`,
`Obligation`, `Event`, `Tag`) plus the module tables ARE the typed
object layer; every module writes them as a byproduct of normal legal
work, so every edge is accurate and permissioned at birth. No
LLM graph-extraction pass is needed — that part of the doc is done by
construction.

Agents already coordinate through the ontology today, at intake scale:

| Doc concept | Shipped implementation |
|---|---|
| NDA agent reads Counterparty history | `counterparty-lookup` dual-mode resolver (server-injected in the agent worker, API fetch in the browser) |
| Vendor agent's sanctions flag visible platform-wide | `sanctions-lookup` writes screening results onto the recommendation + audit chain |
| "Have we ever dealt with X?" | W3-4 conflict check — one query across `IntakeTicketParty`, `Matter`, `MatterParty` off the shared entities, chain-audited per run |
| Litigation agent's k-hop record pull | Phase B4 record pull: adverse party → Counterparty → prior matters + prior agreements, cited in the case brief (`modules/intake/src/agents/litigation.js`) |
| PLAYBOOK_APPLIED edge | Phase B2 playbook stamp (`{id, version}`) persisted on every `AgentRecommendation` (`playbookJson`) |
| PENDING AgentDecision gate | Live intake-side since P2b; schema-enforced (`AgentDecisionPendingError`) |

What's missing is the *generalisation*: one GraphRAG read service with
k-hop traversal, hybrid search, and citations — instead of per-agent
bespoke lookups.

## The two honest constraints

### 1. Apache AGE is not available on Neon

Neon (our production Postgres) does not support the Apache AGE
extension, so the openCypher path is out. The doc explicitly allows
the alternative: **recursive CTEs over the shared entities**. This is
not a downgrade for our graph shape — legal-operations traversals are
shallow (2–4 hops: party → matters → documents → obligations) and
bounded by organisation + permission scope, exactly where recursive
CTEs perform well. The conflict check and the litigation record pull
are working 1–2 hop prototypes of this pattern already.

Decision: **graph layer = recursive CTEs in `@aegis/db`**, exposed
through a typed `traverse()` service. Revisit AGE only if we ever
leave Neon or Neon adds the extension.

### 2. Embeddings — DECIDED (July 2026): self-hosted, BGE-M3 first

pgvector itself IS available on Neon — but Claude models do not
produce embeddings, so hybrid search needs an embedding model. The
decision (evaluated: Microsoft Harrier-OSS, BAAI/BGE-M3, Jina
Embeddings):

**Primary: `BAAI/bge-m3`, self-hosted.**
- **MIT license** — free commercial self-hosting, no usage
  restrictions; no PII egress (legal text never leaves our
  infrastructure — the strongest posture for a legal platform).
- **Hybrid by design** — natively produces dense + sparse (lexical)
  vectors in one pass, which maps 1:1 onto the C2 rank-fusion design
  below; 100+ languages; 8k context; 1024-dim dense output.
- **Mature serving** — supported out of the box by standard inference
  servers (e.g. Hugging Face TEI); runs acceptably on CPU for pilot
  volumes, small GPU for production.

**Upgrade path: `Harrier-OSS-v1` (Microsoft Bing team, April 2026).**
MIT-licensed, tops the multilingual MTEB-v2 leaderboard, 32k context;
the 0.6B variant is the realistic self-host candidate (the 27B leader
is impractical for a pilot). It is ~3 months old with a younger
serving/ecosystem story — benchmark it against BGE-M3 on our own
retrieval set once C2 is live; swapping is a re-embed + one config
change, not an architecture change. Bonus: a Microsoft-origin model
is an easy story in a Microsoft-shop customer (Entra/M365 tenants).

**Ruled out: Jina embeddings (v3/v4).** Model weights are
CC-BY-NC — commercial self-hosting requires a paid license, and using
their API reintroduces the PII-egress problem the self-host decision
exists to avoid. Strong models; wrong license shape for us.

Remaining consequences (unchanged by the model choice):
- **Inference hosting** — self-hosting needs an embedding endpoint;
  Vercel serverless cannot run these models. Smallest viable: one
  container (TEI) on Azure Container Apps / a small VM, private to
  the indexer.
- **The worker constraint** — the event-driven indexer needs a
  long-running worker runtime; the repo doesn't have one yet (same
  documented constraint as the 4c.5 pg-boss snapshot jobs — admin HTTP
  triggers until the worker ships).

Until the inference endpoint is provisioned, retrieval is **BM25-style
lexical + graph traversal** (Postgres full-text search is available
today, no new infra). Vector search slots in as an additive
rank-fusion stage — the service interface below is designed so no
caller changes.

## Phased path

### C1 — GraphRAG read service (no new vendors, no schema changes)

`packages/search` (currently a stub — this is exactly its locked
scope) gains:

```
queryBrain(orgId, actor, {
  anchors,        // entity-linked graph anchors (counterpartyId, personId, matterId…)
  hops,           // 1..4, permission-filtered at every step
  question,       // optional natural-language question
}) → {
  subgraph,       // typed objects + edges, each with source table + id
  passages,       // FTS-ranked snippets from within the subgraph
  citations,      // stable ids the Cockpit can deep-link
  gaps,           // what the record does NOT contain (explicit, always)
}
```

- Traversal: recursive CTEs over shared entities, org-scoped, RBAC
  filter applied per hop (`canUserDo` resource scoping).
- Every call writes a chain-sealed audit row (same discipline as
  `withGraphAudit` and the conflict check).
- First consumers: litigation record pull (replaces the bespoke
  lookup), similar-matters affordance, "Ask Aurora" panel.

### C2 — Embeddings + hybrid rank fusion (model decided: BGE-M3)

- Provision the self-hosted embedding endpoint (TEI container serving
  `BAAI/bge-m3`; Azure Container Apps or a small VM, private network).
- `pgvector` column (1024-dim) on a new `SearchChunk` table owned by
  `packages/search`; indexer ships as admin HTTP trigger first
  (pg-boss-ready service shape, worker swap later — the 4c.5 pattern).
- `queryBrain` gains rank fusion (FTS + BGE-M3 dense/sparse) *inside*
  the permission-filtered subgraph — interface unchanged.
- Later: benchmark Harrier-OSS-v1-0.6b on our own retrieval set; swap
  = re-embed + config change.

### C3 — Natural-language brain surface

- "Ask Aurora" answers route through `queryBrain`; every answer
  carries citations and the mandatory gap note.
- Cockpit recommendation citations become clickable ontology objects.
- Cross-agent context: the Notice agent's extracted deadlines and the
  Contract-Type Specialist's playbook stamps become queryable edges
  ("which counterparties have open cure periods?").

## What Phase C does NOT change

- **Governance is already done.** PENDING-until-approved
  AgentDecision, the audit chain, and the human gate do not move.
- **Module isolation holds.** `packages/search` may not depend on
  `modules/*`; modules feed the index through their own api surfaces
  or shared entities, never the reverse.
- **No 12th module.** The brain is shared infrastructure
  (`packages/search` + `@aegis/db`), not a product module.
