# AEGIS — Architecture & Technical Briefing (for CTO / IT)

A single reference for the technical questions an enterprise buyer's
engineering team asks: stack, architecture, the AI/agent design, the
"brain" (knowledge graph + GraphRAG), security, swappability, and
deployment. Written to be accurate to the codebase and honest about what
is built today vs. the designed next phase.

> **One-liner:** AEGIS is a full-stack **TypeScript / Next.js** app on
> **PostgreSQL**, with **Claude** for AI and **Auth0** for login — all
> three swappable behind clean boundaries. Its differentiator is **one
> governed data brain** across legal operations, evolving into a
> **knowledge-graph + GraphRAG** intelligence layer.

---

## 1. Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5.6 (+ some JS); strict typing |
| Frontend | React 18 + **Next.js 14** (Pages Router) |
| Backend | The **same Next.js app** — API routes as Node functions. No separate backend service. |
| ORM / DB | **Prisma 5.22** → **PostgreSQL** (Neon today; any Postgres) |
| AI | **Anthropic Claude** (`claude-sonnet-4-6`), via a server-side proxy — key never reaches the browser |
| Auth | **Auth0** (`@auth0/nextjs-auth0` 3.5) + built-in RBAC |
| M365 / email | Microsoft Graph SDK + MSAL (`@azure/msal-node`) |
| Build / repo | pnpm 10 + Turborepo monorepo; Node ≥ 18.18 |
| Hosting | Vercel today; standard Next.js + Postgres → runs anywhere |

---

## 2. Architecture

- **Monorepo, one deployable app** (`apps/web`) + shared packages
  (`packages/*`: db, auth, ai, ui, search, identity-graph, …) + product
  modules (`modules/*`: intake, matter, admin, …).
- **One database, shared entities** *(the differentiator)*: every module
  reads/writes the **same** `Counterparty`, `Person`, `Document`,
  `Obligation`, `Event`, `AuditLog`. No siloed per-module tables.
- **Strict module isolation** — enforced by lint rules; modules talk only
  through public `api.ts` surfaces. Each piece is independently
  maintainable and replaceable.
- **Single chokepoints** — all DB access through `@aegis/db`, all AI
  through `@aegis/ai`. Easy to audit, govern, and swap.
- **Backend = Next.js API routes** (Node serverless functions); business
  logic in modules/packages; one Postgres for state. Stateless app tier →
  scales horizontally.

---

## 3. AI agents — framework, language, orchestration

**No third-party agentic framework.** Not LangChain, LlamaIndex, CrewAI,
AutoGen, Semantic Kernel, or even the Anthropic SDK. A purpose-built,
lightweight pattern — **registry + deterministic router + a common agent
contract** — chosen for control, auditability, and human-in-the-loop
governance.

- **Language:** agents in **JavaScript** (ES modules); orchestration,
  persistence, and governance in **TypeScript**. Runs on **Node**.
- **Agent contract:** `{ id, name, canHandle(ticket) → bool,
  process(ticket) → recommendation }`. Six specialists (NDA, Vendor/OFAC,
  Trademark, Contract Review, FAQ, Policy Q&A).
- **Orchestration — deterministic, single-agent-per-request:** a router
  evaluates `canHandle()` predicates in priority order, picks one
  specialist, which makes **one structured Claude call** plus real-data
  **tool lookups** (counterparty history, live OFAC screening), and
  returns a typed recommendation. **Not** an autonomous multi-agent loop.
- **Runs client-side** (browser → `/api/claude` proxy) **and server-side**
  (in-process on email/mailbox arrival; org context via
  `AsyncLocalStorage`).
- **Governance:** every recommendation is **PENDING** and requires human
  approval before it acts — enforced in the schema (`AgentDecision`), not
  just the UI. Every model + tool call is on the audit chain.

**Why no framework is a strength:** for a legal/compliance product,
autonomous-loop frameworks are opaque, non-deterministic, and hard to
audit. Ours is deterministic, testable, fully audited, human-gated, and
low-dependency (small security-review surface). The agent contract and
the `@aegis/ai` boundary are clean seams — agents could be backed by any
framework later **without** changing the router, governance, or audit
trail.

---

## 4. The Brain — knowledge graph + GraphRAG

### The core insight
Most GraphRAG systems spend heavily using an LLM to **extract** a graph
from unstructured documents. **AEGIS doesn't need to** — the shared-entity
schema **is already a curated, governed knowledge graph.** Every module,
as a byproduct of normal operations, authors typed nodes and edges
(Matter↔Counterparty↔Person↔Document↔Obligation↔Hold↔DSAR). The graph is
**authored, not extracted** → cheaper, accurate, and every edge is
trustworthy and permissioned.

### Components
1. **Graph layer** — shared entities as **nodes**, relationships as
   **typed edges**, plus the append-only `Event` stream. Owned by
   `@aegis/identity-graph`. Start with **Apache AGE** (openCypher inside
   Postgres) or recursive CTEs — no separate graph DB; Neo4j at scale.
2. **Vector layer** — embeddings of documents/clauses/tickets in
   **pgvector** (same Postgres), each linked to its graph entity.
3. **GraphRAG retrieval:** NL query → entity-link to graph anchors →
   graph traversal (k-hop, filtered by type **and permission**) →
   candidate subgraph → **vector search within that subgraph** →
   (optional) community summaries for global questions → compact **cited**
   context → Claude synthesizes.
4. **Event-driven indexer** — the `Event` stream keeps embeddings + edges
   fresh and recomputes summaries incrementally. Out of the hot path; no
   full re-index.
5. **Permission-aware + governed** — retrieval filters by RBAC *before*
   anything reaches the model; answers cite source nodes; AI actions still
   require human approval; every query is audited.

### Why graph + GraphRAG = efficiency
- **Smaller LLM context** — graph pre-filtering shrinks the vector search
  space → fewer tokens, lower latency + cost.
- **Multi-hop precision** — legal questions are relational; vector-only
  RAG can't hop, GraphRAG does → higher accuracy, fewer hallucinations.
- **No LLM graph-extraction cost** — the graph is authored, not mined.
- **Incremental, event-driven updates** — not batch re-embedding.
- **Built-in citations & explainability** — retrieved nodes *are* the
  sources; you can show the path an answer came from (legal defensibility).

### Tech (keeps it in one Postgres, in-region)
| Concern | Choice | Why |
|---|---|---|
| Graph | Apache AGE (Postgres) → Neo4j at scale | No new datastore to start |
| Vectors | pgvector (Postgres) | Same DB, same region |
| Embeddings | Voyage/Anthropic, or in-region model | Swappable / self-hostable |
| Synthesis | Claude via `@aegis/ai` proxy | Isolated, auditable, swappable |
| Retrieval | `@aegis/search` GraphRAG service | Clean package boundary |

### Build sequence
1. Graph traversal on (`@aegis/identity-graph`) over existing entities.
2. pgvector embeddings over Document/Contract/Ticket text, linked to nodes.
3. GraphRAG query service in `@aegis/search`.
4. Community summaries for global questions.
5. Event-driven indexer + the "Company Brain" UI.

---

## 5. Security, data & compliance

- **AuthZ:** role-based (8 roles, 38 fine-grained permissions), enforced
  **server-side** on every mutation — no "trust the client" path.
- **Audit:** every state change writes to a **cryptographically chained,
  append-only `AuditLog`** (SHA-256 per-org chain; Postgres triggers block
  UPDATE/DELETE). Tamper-evident.
- **Secrets at rest:** M365 tokens are **AES-256-GCM** encrypted (key via
  `AEGIS_ENCRYPTION_KEY`); production **fails to boot** without it.
- **AI governance:** every AI action requires human approval
  (schema-enforced); every AI/Graph call is on the audit chain.
- **Inbound email webhook:** authenticated (constant-time secret),
  fail-closed in production, rate-limited, idempotent.
- **Data residency:** the DB is any Postgres, any region, on-prem if
  required. The one external touchpoint is AI inference — isolated and
  swappable (can be in-region).

---

## 6. "Can we change X?" — swappability

| Component | Swappable? | How |
|---|---|---|
| **Auth (Auth0 → Entra ID / Okta / Ping)** | **Yes — designed for it** | Only one function (`getResolvedUser`) touches Auth0; roles/permissions/modules are vendor-agnostic. SAML/OIDC federation to their IdP is a scoped change (~½ day). |
| **Database (Neon → their Postgres / RDS / Azure / on-prem)** | **Yes — trivial** | Standard PostgreSQL via one `DATABASE_URL`; change the string, run `prisma migrate deploy`. |
| **Hosting (Vercel → their cloud / container / on-prem)** | **Yes** | Plain Next.js + Postgres; runs on any Node host. Vercel not required. |
| **AI model (Claude → Azure OpenAI / their model)** | **Yes, moderate** | All AI through one proxy + one client; model id is env-configurable; prompts want light re-tuning. Only external AI dependency, fully isolated. |
| **Email (M365 → sovereign clouds / other)** | **Yes** | Graph integration behind a factory interface; GCC High / Azure China = another implementation, no caller changes. |

---

## 7. Deployment & operations

- **Deploy:** `prisma migrate deploy` → seed → build → run. Migrations are
  versioned and reviewed; a CI job re-applies every migration from scratch
  + verifies the audit chain on every PR.
- **Client-only-Intake profile:** `NEXT_PUBLIC_AEGIS_PROFILE=intake` ships
  an Intake-only navigation (the rest of the platform runs underneath).
- **Production seed:** `AEGIS_SEED_PROFILE=production` seeds only the
  foundation (org, admin, roles, matter-type configs, sanctions list) —
  no demo data.
- **Scaling:** stateless app tier scales horizontally; Postgres holds
  state. **Backups/HA** via the chosen Postgres (Neon PITR / RDS / Azure).
- **Config:** all secrets via env vars; nothing sensitive in the repo.
- **Honest gaps** (roadmap, fine for a single-client dedicated deploy):
  centralized observability/error-tracking, and a formal multi-tenant
  row-isolation layer for shared SaaS.

---

## 8. What's built vs. designed (honesty line)

**Built & production-ready today (Intake):**
- The **shared-entity data foundation** (the "brain" foundation — the hard
  part), append-only `Event` stream, chained `AuditLog`.
- Intake end-to-end: web form + **document upload** (.docx/.txt/.pdf) +
  **email** (webhook + real **M365 mailbox polling**), all on one
  classify → route → audit pipeline.
- **6 real Claude agents**, **server-side triage** on arrival, RBAC,
  secrets-at-rest encryption, webhook hardening.
- **Cross-entity intelligence in miniature** already works: the NDA agent
  queries shared `Counterparty`/`Document` for prior NDAs; the Vendor
  agent screens the shared sanctions list.

**Designed — interfaces defined, next build phase:**
- `@aegis/search` (cross-module index) and `@aegis/identity-graph` (the
  graph traversal), the **GraphRAG** query layer, and the "Company Brain"
  natural-language UX. Sequenced **after** the transactional modules so
  there is real governed data to reason over.

> The foundation of the brain is built (a unified, governed, audited data
> model). The graph + GraphRAG intelligence layer is the next phase, with
> defined interfaces and a clear build sequence.

---

## 9. Soundbites

- *"Full-stack TypeScript / Next.js on PostgreSQL — Claude and Auth0 are both swappable behind clean boundaries."*
- *"No external agent framework — a purpose-built, deterministic, human-in-the-loop design; agents in JS, orchestration/governance in TS on Node."*
- *"The brain is a governed knowledge graph with GraphRAG. Our graph is authored by the platform, not extracted from documents — cheaper, accurate, permissioned."*
- *"Graph traversal pre-filters before vector search, so the model gets a small, connected, cited context — faster and cheaper than plain vector RAG."*
- *"Graph, vectors, and records live in one Postgres in your region. Your data doesn't leave; the only external call is AI inference, which is isolated and replaceable."*
- *"Every state change is on a tamper-evident audit chain, and no AI action happens without human approval."*
