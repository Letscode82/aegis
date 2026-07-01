# AEGIS — Architecture Diagrams

Renderable Mermaid (GitHub renders these inline). `*` = designed / next
build phase; everything else is built today.

## 1. System architecture

```mermaid
flowchart TB
  U["Users: attorneys, requesters, admins"]

  subgraph WEB["apps/web — Next.js 14 (single deployable)"]
    UI["React UI (Aurora)"]
    API["API routes<br/>Node functions = backend"]
  end

  subgraph MODS["Product modules (isolated)"]
    INTAKE["intake"]
    MATTER["matter"]
    ADMIN["admin"]
  end

  subgraph PKGS["Shared packages"]
    DB["@aegis/db<br/>Prisma, logAudit"]
    AUTH["@aegis/auth<br/>RBAC, 38 perms"]
    AIP["@aegis/ai<br/>Claude proxy"]
    SRCH["@aegis/search*<br/>GraphRAG"]
    IG["@aegis/identity-graph*<br/>knowledge graph"]
  end

  PG[("PostgreSQL<br/>shared entities, chained audit, pgvector/graph*")]
  IDP[("Auth0 or Entra / Okta / Ping")]
  CLAUDE[("Anthropic Claude, swappable")]
  M365[("Microsoft 365<br/>mailbox, eDiscovery")]

  U -->|HTTPS, Auth0 session| UI
  UI --> API
  API --> MODS
  MODS --> PKGS
  DB --> PG
  AUTH -.->|swappable| IDP
  AIP -->|server-side, key hidden| CLAUDE
  MODS -->|Microsoft Graph| M365

  classDef roadmap stroke-dasharray:5 4,fill:#eef;
  class SRCH,IG roadmap;
```

**Key points:** one deployable app; the "backend" is the Next.js API
layer; **one PostgreSQL** holds shared entities + the audit chain (+
vectors/graph later); Auth, AI, and email are external and **swappable**
behind package boundaries.

## 2. Intake request flow (all three channels → one governed pipeline)

```mermaid
flowchart LR
  F["Web form"]
  E["Email: webhook + M365 poll"]
  D["Document upload: .docx, .txt, .pdf"]
  ING["Ingest: classify + route"]
  AG["Agent, 1 of 6<br/>Claude + real-data lookups"]
  REC["PENDING recommendation<br/>+ AgentDecision"]
  H{"Human approves?"}
  ACT["Send reply / spawn Matter"]
  RJ["Rejected"]
  AUD[("Chained AuditLog")]

  F --> ING
  E --> ING
  D --> ING
  ING --> AG
  AG --> REC
  REC --> H
  H -->|yes| ACT
  H -->|no| RJ
  ING -.-> AUD
  AG -.-> AUD
  ACT -.-> AUD
```

**Key points:** three channels, one pipeline; a deterministic router picks
one specialist agent; **nothing acts without human approval**; every step
is on the tamper-evident audit chain.

## 3. The Brain — knowledge graph + GraphRAG

```mermaid
flowchart TB
  Q["Natural-language question"]
  EL["Entity-link to graph anchors"]
  TR["Graph traversal<br/>k-hop, permission-filtered"]
  SUB["Candidate subgraph"]
  VEC["Vector search WITHIN subgraph (pgvector)"]
  CTX["Compact, cited context"]
  LLM["Claude synthesis"]
  ANS["Answer + source-node citations"]
  EV["Event stream (append-only)"]
  IDX["Indexer, event-driven"]
  G[("Knowledge graph + embeddings<br/>in PostgreSQL")]

  Q --> EL --> TR --> SUB --> VEC --> CTX --> LLM --> ANS
  EV --> IDX --> G
  G -.-> TR
  G -.-> VEC
```

**Key points:** the graph is **authored** by the modules (not extracted
from documents) → cheaper + accurate; graph traversal **pre-filters**
before vector search → small, connected, **cited** context → faster and
cheaper than plain vector RAG; graph + vectors + records all in **one
Postgres, in your region**.
