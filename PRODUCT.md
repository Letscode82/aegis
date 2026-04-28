# PRODUCT — AEGIS

> The locked product plan. Architectural commitments are in this document and
> in [CLAUDE.md](./CLAUDE.md). Do not relitigate them in PRs or sessions.

AEGIS is a legal operations platform for Fortune 50 General Counsel offices.
The differentiator is **one brain across legal operations** — every module
queries a shared Postgres database via shared entities, so the platform can
answer cross-cutting questions that point solutions cannot.

---

## The 11 modules (locked)

These are the only modules. We do not add a 12th. We do not split one. If a
feature does not fit, we stop and ask before changing scope.

| # | Module | Includes | Owns (module-specific) |
|---|---|---|---|
| 1 | **Legal Intake** | Cockpit, Copilot, agents, triage | `IntakeTicket`, `AgentRecommendation`, `IntakeConversation` |
| 2 | **Matter Management** | **Legal Hold** as a first-class capability | `Matter`, `MatterParty`, `MatterTimeline`, `MatterTag`, `LegalHold`, `HoldNotice`, `HoldAttestation`, `PreservationOrder` |
| 3 | **Contracts** | CLM, redlines, executed, renewals | `Contract`, `ContractClause`, `Renewal` |
| 4 | **Command Center** | Mission Control + **Board Pack** view | dashboards & briefings (read-only views over other entities) |
| 5 | **Legal Spend & Counsel** | LEDES invoices, vendor mgmt, budgets | `Vendor`, `Invoice`, `InvoiceLineItem`, `Budget`, `Timekeeper` |
| 6 | **Regulatory Compliance** | Horizon-scan, comment windows, attestations | `Regulation`, `RegulatoryProceeding`, regulator-flagged `Obligation` rows |
| 7 | **Governance** | Policies, committees, attestations, delegations | `Policy`, `Committee`, `Delegation`, governance-flagged `Obligation` rows |
| 8 | **Knowledge Management** | Company Brain — natural-language search across the firm | `KnowledgeEntry`, curation/moderation metadata over `@aegis/search` |
| 9 | **Insights** | **Risk Graph** + **Scenarios** simulator | `RiskGraphSnapshot`, `Scenario`, `ScenarioRun` |
| 10 | **Privacy & Compliance Operations** | DSAR, ROPA, consent, incidents | `DataSubjectRequest`, `DSARDataLocation`, `ConsentRecord`, `DataProcessingActivity`, `PrivacyIncident` |
| 11 | **Entity Management** | Counterparty CRM, hierarchy, sanctions | UI over `Counterparty` (entity owned in `@aegis/db`; identity-graph logic owned by `@aegis/identity-graph`) |

Cross-module flows are explicit (see *Module dependencies* below). Modules
communicate **only** through each other's `api.ts` and through the shared
`packages/*` infrastructure.

---

## Architectural commitments (non-negotiable)

1. **Differentiator #1 — one brain.** Module isolation is at the *code* level,
   not the *data* level. Every module queries the same Postgres database via
   shared entities. The schema is the architectural backbone.
2. **Differentiator #3 — conservative AI governance.** Every AI-generated
   action requires human approval. Every state-changing action writes an
   `AuditLog` entry. The schema and review workflows must support full audit
   trails out of the box.
3. **Module isolation rule.** Modules import from `packages/*` or from another
   module's `api.ts`. They never import from another module's `internal/**`.
   `apps/web` is the composition root and may import from anywhere.
   `packages/*` may not depend on `modules/*` or `apps/*`.
   Enforced by `eslint-plugin-import`'s `no-restricted-paths`. **Never relax.**
4. **Shared entities are not re-implemented.** `Counterparty`, `Person`,
   `Document`, `Obligation`, `Event`, `Tag`/`Tagging` are first-class shared
   entities owned by `@aegis/db`. Modules attach to them — they do not create
   parallel `MatterCounterparty`, `ContractParty`, etc. tables.
5. **The demo never breaks.** Every PR keeps the v8 Intake demo working
   end-to-end (Mission Control briefing, Cockpit, Copilot, agents,
   approve/edit/reject keyboard shortcuts).

---

## Repository layout

```
aegis/
├── apps/
│   └── web/                  Next.js 14 (Pages Router). Composition root.
├── packages/
│   ├── ui/                   Aurora design tokens + shared atoms
│   ├── types/                Cross-cutting TypeScript types
│   ├── ai/                   Claude API client + serverless proxy
│   ├── db/                   Prisma schema + queries           (Step 2)
│   ├── auth/                 Auth0 + RBAC + permission model   (Step 3)
│   ├── workflow/             Cross-module workflow primitives  (stub)
│   ├── documents/            Shared document storage           (stub)
│   ├── search/               Cross-module search               (stub)
│   ├── identity-graph/       Person/Counterparty entity graph  (stub)
│   └── eslint-config/        Shared ESLint + module-isolation rule
├── modules/
│   └── intake/               Step 1 — bulk-moved; api.ts split in Step 5
│       (matter/, spend/, … added in Steps 4–6)
├── reference/
│   └── aegis-v7-aurora.jsx   Preserved monolith (read-only)
├── docs/
├── infra/
├── .github/workflows/        CI
├── turbo.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vercel.json
├── PRODUCT.md
└── CLAUDE.md
```

### What each shared package owns

| Package | Owns | Consumed by |
|---|---|---|
| `@aegis/ui` | Aurora tokens (`C`, `F`, `M`, `SR`), keyframes, atoms (`Card`, `Pill`, `Dot`, `Stat`, `Bar`, `SH`, `Row`, `WorkflowSteps`, `ApprovalBadge`, `inputStyle`, `FormField`) | every module + apps/web |
| `@aegis/types` | `Id<Brand>`, `Page<T>`, `Result<T,E>`, ISO time strings, plus (Step 2) re-exports of Prisma-generated entity types | every module + apps/web |
| `@aegis/ai` | `callClaude`, `callClaudeJSON`, `parseJSONLoose`, `friendlyAIError`, `CLAUDE_MODEL`, `classifyIntakeRegex`, server-only `handleClaudeRequest` | any caller of Claude |
| `@aegis/db` | `PrismaClient` singleton, shared entity types, `logAudit()`, common helpers | every module that reads/writes data |
| `@aegis/auth` | Auth0 wiring, `Permission` enum, role→permission map, `useCurrentUser()`, `canUserDo()` | every module + apps/web |
| `@aegis/workflow` *(stub)* | Workflow definitions, instances, step transitions, escalations | modules with multi-step approvals |
| `@aegis/documents` *(stub)* | `Document` storage, versioning, encryption, retention, signed URLs | every module that attaches files |
| `@aegis/search` *(stub)* | Cross-module index + query API | Knowledge Management UX, also queried by modules for "where else does this appear" |
| `@aegis/identity-graph` *(stub)* | `Person` resolution / merge, `Counterparty` hierarchy, sanctions screening | Insights, Privacy, Legal Hold, Entity Management |

---

## Dependency rules

```
                      ┌──────────────────────┐
                      │       apps/web       │  composition root —
                      │  (Next.js, pages)    │  imports anywhere
                      └──────────┬───────────┘
                                 │
        ┌────────────┬───────────┼───────────┬────────────┐
        ▼            ▼           ▼           ▼            ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ …  modules/intake
  │ matter   │ │ intake   │ │  spend   │ │ contracts│   ↑ may also import
  │ /api.ts  │ │ /api.ts  │ │ /api.ts  │ │ /api.ts  │   from another
  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘   module's api.ts
       │            │            │            │
       └────────────┴───────────┬┴────────────┘
                                ▼
                    ┌────────────────────┐
                    │     packages/*     │  shared infrastructure —
                    │  (ui, ai, db,      │  may NOT depend on modules
                    │   auth, workflow,  │  or apps
                    │   documents, …)    │
                    └────────────────────┘
```

- `apps/web` → may import anything.
- `modules/<m>` → may import from `packages/*` and from `modules/<other>/api.ts`.
- `modules/<m>` → may **not** import from `modules/<other>/internal/**` or `src/**`.
- `packages/<p>` → may **not** import from `modules/*` or `apps/*`.

ESLint enforces this via `eslint-plugin-import`'s `no-restricted-paths`.
See `packages/eslint-config/module-isolation.cjs`.

---

## Module dependencies (inter-module imports through `api.ts`)

| Module | Imports from |
|---|---|
| **Intake** | `Matter` (create matter from ticket; link ticket; legal hold for high-priority) |
| **Matter** | `Spend` (`getMatterSpendSummary` for cost basis); reads `Counterparty`, `Person`, `Document`, `Obligation`, `Event` from `@aegis/db` |
| **Spend** | `Matter` (matter ID validation, budget context) |
| **Contracts** | `Counterparty`, `Document`, `Obligation`; (Step 7+) `Privacy` for DPA flags |
| **Privacy** | `Person`, `Document`, `Obligation`; `identity-graph` for custodian/data-subject overlap |
| **Command Center** | reads from every module's `api.ts` via dashboard summary calls |
| **Insights** | `identity-graph`, `search`; reads from every module |

Step 1 ships **Intake** only. Steps 4–6 add **Matter** (with Legal Hold) and
**Spend**. Modules 3, 6–11 follow in later phases.

---

## Step 1 status (this PR)

- [x] Turborepo monorepo with pnpm workspaces.
- [x] Vite → Next.js 14 (Pages Router).
- [x] All AI features bulk-moved into `modules/intake/` (no internal split yet — Step 5 does that).
- [x] Aurora tokens + atoms in `packages/ui`.
- [x] Claude client + serverless proxy in `packages/ai`.
- [x] `packages/db`, `packages/auth` empty (Steps 2–3 fill them).
- [x] Stub packages `workflow`, `documents`, `search`, `identity-graph` with substantive READMEs.
- [x] `packages/eslint-config` with `no-restricted-paths` module-isolation rule.
- [x] GitHub Actions CI: build + lint + typecheck + test.
- [x] Vercel deployment config — Next.js app at `apps/web`.
- [x] PRODUCT.md (this file) and CLAUDE.md authored.
