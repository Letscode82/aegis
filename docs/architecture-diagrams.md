# AEGIS — Architecture Diagrams

Renderable Mermaid (GitHub renders these inline). `*` = designed / next
build phase; everything else is built today.

## 1. System architecture

```mermaid
flowchart TB
  U["Users<br/>attorneys · requesters · admins"]
  U -->|"HTTPS · Auth0 session"| WEB

  subgraph WEB["apps/web — Next.js 14 (single deployable)"]
    UI["React UI (Aurora)"]
    API["API routes<br/>Node functions = backend"]
    UI --> API
  end

  subgraph MODS["Product modules (isolated)"]
    INTAKE["intake"]
    MATTER["matter"]
    ADMIN["admin"]
  end

  subgraph PKGS["Shared packages"]
    DB["@aegis/db<br/>Prisma · logAudit"]
    AUTH["@aegis/auth<br/>RBAC · 38 perms"]
    AIP["@aegis/ai<br/>Claude proxy"]
    SRCH["@aegis/search*<br/>GraphRAG"]
    IG["@aegis/identity-graph*<br/>knowledge graph"]
  end

  API --> MODS
  MODS --> PKGS

  DB --> PG[("PostgreSQL<br/>shared entities · chained audit<br/>pgvector + graph*")]
  AUTH -. "swappable" .-> IDP[("Auth0 → Entra / Okta / Ping")]
  AIP -->|"server-side · key hidden"| CLAUDE[("Anthropic Claude<br/>swappable")]
  MODS -->|"Microsoft Graph"| M365[("Microsoft 365<br/>mailbox · eDiscovery")]

  classDef roadmap stroke-dasharray:5 4,fill:#eef;
  class SRCH,IG roadmap;
```

**Key points to say over it:** one deployable app; the "backend" is the
Next.js API layer; **one PostgreSQL** holds shared entities + the audit
chain (+ vectors/graph later); Auth, AI, and email are external and
**swappable** behind package boundaries.

## 2. Intake request flow (all three channels → one governed pipeline)

```mermaid
flowchart LR
  F["Web form"] --> ING
  E["Email<br/>webhook + M365 poll"] --> ING
  D["Document upload<br/>.docx · .txt · .pdf"] --> ING
  ING["Ingest<br/>classify + route"] --> AG["Agent · 1 of 6<br/>Claude + real-data lookups"]
  AG --> REC["PENDING recommendation<br/>+ AgentDecision"]
  REC --> H{"Human<br/>approves?"}
  H -->|yes| ACT["Send reply / spawn Matter"]
  H -->|no| RJ["Rejected"]
  ING -. "every step" .-> AUD[("Chained AuditLog")]
  AG -. .-> AUD
  ACT -. .-> AUD
```

**Key points:** three channels, one pipeline; a deterministic router picks
one specialist agent; **nothing acts without human approval**; every step
is on the tamper-evident audit chain.

## 3. The Brain — knowledge graph + GraphRAG

```mermaid
flowchart TB
  Q["Natural-language question"] --> EL["Entity-link to graph anchors"]
  EL --> TR["Graph traversal<br/>k-hop · permission-filtered"]
  TR --> SUB["Candidate subgraph"]
  SUB --> VEC["Vector search WITHIN subgraph<br/>pgvector"]
  VEC --> CTX["Compact, cited context"]
  CTX --> LLM["Claude synthesis"]
  LLM --> ANS["Answer + source-node citations"]

  EV["Event stream (append-only)"] --> IDX["Indexer · event-driven"]
  IDX --> G[("Knowledge graph + embeddings<br/>in PostgreSQL")]
  G --- TR
  G --- VEC
```

**Key points:** the graph is **authored** by the modules (not extracted
from documents) → cheaper + accurate; graph traversal **pre-filters**
before vector search → small, connected, **cited** context → faster and
cheaper than plain vector RAG; graph + vectors + records all in **one
Postgres, in your region**.
