# Agent Redline Workflow — Multi-PR Roadmap

> **This document is derived from
> [`agent-redline-architecture.md`](./agent-redline-architecture.md).**
> The architecture doc is the durable source of truth for the
> non-negotiable commitments (reliability, failover, multi-tenancy,
> security, compliance, etc.). This roadmap sequences PRs against
> those commitments.
>
> If the roadmap and the architecture disagree, **the architecture
> wins** and the roadmap is wrong. Read the architecture first.
>
> **Status:** DRAFT pending operator sign-off on architecture
> Assumptions A1–A8 and the 12 open questions at the end of the
> architecture doc. No code lands until sign-off.

## Why this exists

Per the Dani McGarry framing surfaced in the May 2026 product
review: *"AI & data is not all you need."* AEGIS's GC value comes
from the union of process re-engineering, workflow digitization,
and AI — not AI alone. A chatbot that answers NDA questions in
isolation is a toy; a system that **takes the inbound NDA, checks
it against your playbook, surfaces the deviations to the attorney
in their queue, captures their accept/reject decisions, and
generates the redlined response document** is a transformation
tool.

This is the hero feature. Document-aware intake is the wedge that
moves AEGIS from "intelligent inbox" to "operating system for the
GC's office." Every Fortune 50 GC interview to date has identified
the same loop as the highest-value automation candidate.

The build sequences across **9 intake agents** over an estimated
**6 weeks**, infrastructure-first so the first agent costs the most
and each subsequent agent costs ~2 days.

## Vision — the loop, end to end

```
┌──────────────────┐    ┌────────────────┐    ┌───────────────────┐
│  Intake form     │ →  │  Storage +     │ →  │  Agent reviews    │
│  uploads NDA     │    │  text extract  │    │  vs playbook      │
└──────────────────┘    └────────────────┘    └───────────────────┘
                                                       │
                                                       ▼
┌──────────────────┐    ┌────────────────┐    ┌───────────────────┐
│  Revised .docx   │ ←  │  Attorney      │ ←  │  Cockpit shows    │
│  with track      │    │  accept/reject │    │  N deviations as  │
│  changes sent    │    │  per redline   │    │  inline redlines  │
└──────────────────┘    └────────────────┘    └───────────────────┘
```

Two modes per agent:

- **REVIEW** — file attached → agent finds deviations from playbook
  → attorney redlines → revised document
- **DRAFT** — no file → agent generates from template + requirements
  → attorney edits → final document

Both modes write `AgentDecision` rows (4b contract) and chain-sealed
`AuditLog` rows. Conservative AI governance applies: every redline
the agent suggests requires explicit attorney accept/reject — no
"approve all" without a paranoia confirmation. Drift is caught by
the audit chain.

## The 9 intake agents

Mirrors the 9 request types on the New Request form. Each gets the
same architectural treatment, ordered by demo / sales value:

| Order | Agent | Playbook complexity | Modes | Why this order |
|---|---|---|---|---|
| 1 | **NDA** | Low (8-12 positions) | REVIEW + DRAFT | Iconic use case. Smallest playbook so the redline UI lands first against the simplest semantics. |
| 2 | **Contract Review** (MSA / SOW) | High (40-60 positions) | REVIEW only | Highest-volume use case for in-house. Best ROI demo for "this saves real attorney hours." |
| 3 | **Privacy / DSAR** | Medium (rule-driven cadence) | REVIEW + DRAFT | Regulatory pressure (GDPR/CCPA). Demos compliance value, not just efficiency. |
| 4 | **Vendor Due Diligence** | Medium (vendor T&Cs vs ours) | REVIEW only | Procurement-adjacent. Adoption easier — procurement teams already do this manually. |
| 5 | **Trademark Check** | Low (clearance search rules) | DRAFT primarily | Brand-team adjacent. Simple playbook (jurisdiction, classes, similarity rules). |
| 6 | **IP Question** | Low (advisory) | DRAFT | Q&A style; less redline value, more recommendation value. |
| 7 | **Contract Question** | Low (advisory) | DRAFT | Q&A style; same shape as IP. |
| 8 | **Legal Question — General** | Low (catch-all) | DRAFT | Routes to GC if confidence is low. |
| 9 | **Other** | None | Manual triage | Routing only — no agent automation. |

**The first agent (NDA) carries 100% of the new infrastructure
cost.** Agents 2-8 each cost roughly 2 days because they add a
new playbook + a new prompt + a per-agent output specialisation —
nothing else. Agent 9 is routing-only.

## Architecture

### New / re-loaded packages

| Package | Status before | Status after |
|---|---|---|
| `@aegis/documents` | **stub** | **load-bearing.** Real `StorageBackend` interface with Vercel Blob (default) + local-filesystem (dev) + S3 (plug-in). Document upload, retrieve, version chain, audit. |
| `@aegis/db` | adds | `Playbook`, `PlaybookEntry`, `PlaybookEntrySeverity` enum. Extensions to `Document` (storage key, content hash, MIME type, size, parent for versions, extracted text). New `AgentReview` model (links to `AgentRecommendation`, carries `Redline[]` JSON). |
| `@aegis/ai` | adds | New module-level prompts: `composeDocumentReview(playbook, doc, agentType)` returns `Promise<AgentReview>`. Same `callClaudeJSON` chokepoint, same audit. |
| `modules/intake` | adds | Per-agent specialisation (one TS file per agent in `src/agents/redline/`). Cockpit redline viewer. New form attachment widget. |

### New schema (cumulative across PRs in this roadmap)

```prisma
// PR1 — Documents foundation
model Document {
  // ... existing polymorphic fields ...
  storageBackend  String   // "vercel-blob" | "local-fs" | "s3"
  storageKey      String   // backend-specific opaque blob id
  contentHash     String   // SHA-256 of bytes — dedup + tamper detection
  mimeType        String
  sizeBytes       Int
  extractedText   String?  // text extracted from .docx/.pdf for agent input
  parentDocumentId String? // version chain — NULL on root, set on revisions
  parent          Document? @relation("DocumentVersions", fields: [parentDocumentId], references: [id])
  versions        Document[] @relation("DocumentVersions")
  // ... indexes on (org, ownerType, ownerId), (org, contentHash) ...
}

// PR2 — Playbook schema
model Playbook {
  id              String   @id @default(cuid())
  organizationId  String
  agentType       String   // "NDA" | "ContractReview" | "Privacy" | ...
  name            String   // "Standard NDA Playbook (US)"
  description     String?
  isDefault       Boolean  @default(false)  // one default per (org, agentType)
  // ...
  entries         PlaybookEntry[]
}

model PlaybookEntry {
  id              String   @id @default(cuid())
  playbookId      String
  position        String   // "Term length", "Governing law", "Mutual confidentiality", ...
  severity        PlaybookEntrySeverity  // BLOCKER | HIGH | MEDIUM | LOW
  acceptableLanguagePatterns Json  // array of regex / phrase patterns
  redlineLanguage String   // suggested replacement text
  rationale       String   // shown to attorney explaining the deviation
  orderInPlaybook Int      // display order
}

enum PlaybookEntrySeverity { BLOCKER HIGH MEDIUM LOW }

// PR3 — AgentReview output
model AgentReview {
  id                      String   @id @default(cuid())
  agentRecommendationId   String   @unique
  agentRecommendation     AgentRecommendation @relation(...)
  documentId              String?  // source document being reviewed (null for DRAFT mode)
  playbookId              String   // playbook used at review time
  playbookVersionSnapshot Json     // immutable snapshot of the playbook entries
  redlinesJson            Json     // Redline[] — see TS type below
  modeAtReview            String   // "REVIEW" | "DRAFT"
  // ...
}

// Redline TypeScript shape (stored in redlinesJson)
type Redline = {
  id: string;
  playbookEntryId: string | null;  // null for ad-hoc redlines
  position: string;
  severity: "BLOCKER" | "HIGH" | "MEDIUM" | "LOW";
  textSpanStart: number;     // char offset into document text
  textSpanEnd: number;
  originalText: string;
  suggestedText: string;
  rationale: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "EDITED";
  editedText?: string;       // attorney's override of suggestedText
  decidedBy?: string;        // User.id when status leaves PENDING
  decidedAt?: number;
};
```

### New permissions (`@aegis/auth`)

- `documents:upload` — file upload via the intake form
- `documents:read` — retrieve documents (resource-scoped — caller must
  have read access to the parent ticket / matter)
- `documents:delete` — remove a document version (admin / owner)
- `playbook:read` — view playbook entries
- `playbook:write` — admin CRUD for playbooks
- `agent:redline:override` — attorney-side accept/reject/edit per
  redline (granted to `attorney`, `gc`, `paralegal`, `legal_ops`)

Admin role auto-includes via the existing `ROLE_PERMISSIONS.admin =
[...all]` superset bundle (the module-load assertion catches drift
automatically — no separate maintenance burden).

### Audit actions (new)

- `document.uploaded` — file lands in storage
- `document.retrieved` — content fetched (rate-limited; one row per
  request, not per byte)
- `document.deleted` — version pruned
- `document.text_extracted` — async OCR / parse completes
- `playbook.created`, `playbook.updated`, `playbook.entry_added`,
  `playbook.entry_removed`, `playbook.deactivated`
- `agent.review.produced` — agent emits AgentReview
- `agent.review.redline.accepted` — attorney accepts a redline
- `agent.review.redline.rejected` — attorney rejects a redline
- `agent.review.redline.edited` — attorney accepts with text edit
- `agent.review.completed` — all redlines decided + final document
  generated

All written via the existing `logAudit()` chokepoint. Chain trigger
+ hash-link invariants are unchanged. Adding new action names
doesn't break older readers (they're filtered, not enumerated).

## PR sequence

Each PR ships independently and the demo works at every checkpoint.

### PR-A — Roadmap doc + Cockpit filter fix (this PR)

- This document.
- Cockpit `awaiting` filter expanded from `stage === "new"` to
  `stage === "new" || (stage === "assigned" && !triagedBy)`.
- Header "AWAITING TRIAGE" pill counter mirrors the same filter.
- No schema change, no migration.
- **Unblocks the demo** — without this, every ticket filed via the
  P1b path lands in the gap between "new" and "triaged."

### PR-B — `@aegis/documents` foundation

- `StorageBackend` interface (`upload`, `retrieve`, `delete`).
- `VercelBlobStorageBackend` (default in production).
- `LocalFilesystemStorageBackend` (default in dev — `.aegis-blob/`
  under `.gitignore`'d). 
- Schema migration: extend `Document` with `storageBackend`,
  `storageKey`, `contentHash`, `mimeType`, `sizeBytes`,
  `extractedText`, `parentDocumentId`.
- New audit actions: `document.uploaded`, `document.retrieved`,
  `document.deleted`.
- New permissions: `documents:upload`, `documents:read`,
  `documents:delete`.
- Endpoints: `POST /api/documents/upload` (multipart),
  `GET /api/documents/[id]/content` (signed URL or stream).
- Module-isolation: `@aegis/documents` is the only place that
  imports the storage backend; modules call its public API.
- Tests: storage backend interface contract (both
  implementations), audit emission, permission gating.
- **No UI yet** — pure infrastructure.

### PR-C — Playbook schema + admin editor + NDA seed

- Schema migration: `Playbook` + `PlaybookEntry` +
  `PlaybookEntrySeverity` enum.
- Admin pages at `/admin/playbooks` (list) and
  `/admin/playbooks/[id]` (edit).
- Seed: one default NDA Playbook with 8 positions covering the
  most common deviations:
  1. Mutual vs unilateral confidentiality (BLOCKER)
  2. Term length ≤ 3 years (HIGH)
  3. Governing law in {DE, NY, CA} (HIGH)
  4. Carve-out for residual knowledge (MEDIUM)
  5. No injunctive relief asymmetry (MEDIUM)
  6. Definition of Confidential Information not overbroad (HIGH)
  7. Standard 1-year survival post-termination (LOW)
  8. No assignment without consent (LOW)
- New permissions: `playbook:read`, `playbook:write`.
- New audit actions: `playbook.*`.
- Tests: playbook CRUD, default-uniqueness, audit emission.

### PR-D — NDA Agent v1 (paste-text mode, redline output)

- New `modules/intake/src/agents/redline/nda.ts` — implements
  `compose(documentText, playbook): Promise<AgentReview>` via
  `@aegis/ai.callClaudeJSON`.
- Schema migration: `AgentReview` model.
- New permission: `agent:redline:override`.
- New audit actions: `agent.review.*`.
- Form change: NDA-type tickets get a textarea ("Paste the NDA
  text here") in addition to the standard description field.
- Cockpit: when a ticket has an `AgentReview` row, render the
  `RedlineViewer` component:
  - Document text on the left with inline highlighting per redline
  - Right rail: list of redlines with severity pill, position,
    rationale, suggested text, and three buttons (Accept, Reject,
    Edit & Accept)
  - Footer: "Decide all" affordance with paranoia type-to-confirm
    when ≥3 BLOCKERS are still PENDING
- Generated revised document is stored as a child Document
  (`parentDocumentId` set).
- Tests: agent prompt composition, redline shape, accept/reject
  audit emission, RedlineViewer behavior under each state.
- **First demoable end-to-end loop.**

### PR-E — NDA Agent v2 (real file upload)

- Form change: file input for NDA tickets (.docx / .pdf only,
  ≤25 MB).
- Server-side text extraction:
  - `.docx` → `mammoth` (npm) — extracts plain text + preserves
    paragraph structure
  - `.pdf` → `pdf-parse` (npm) — text-only PDFs work; OCR for
    scanned PDFs is deferred to PR-J
- Async extraction job: upload returns immediately with the
  Document row at `extractedText: null`; a worker (admin HTTP
  trigger; pg-boss-ready, same pattern as the 4c.5 defensibility
  snapshot) extracts text and updates the row + emits
  `document.text_extracted` audit. Cockpit shows "Extracting…"
  state until extraction completes.
- Generated revised document = `.docx` with track-changes,
  produced by `docx` (npm) library.
- Tests: extraction backends, async job idempotency, generated
  .docx structure.

### PR-F — Contract Review Agent (full)

- Same shape as PR-D + PR-E combined, specialised for MSA / SOW.
- Seed: Default Contract Playbook with ~50 positions — limitation
  of liability, indemnity, IP assignment, termination convenience,
  payment terms, audit rights, etc.
- New per-agent prompt that emphasises liability allocation +
  indemnity asymmetry — the highest-value redlines for in-house.
- Tests: playbook coverage, prompt regression on three sample
  MSAs (Snowflake, Stripe, AWS-style — anonymised).

### PR-G — Privacy / DSAR Agent

- Same shape; specialised playbook for response cadence + required
  disclosures + applicability assessment.
- DRAFT mode: generates DSAR response template with deadline +
  required fields populated from the request type.
- REVIEW mode: incoming privacy request → checks against company
  policy + applicable regs (GDPR / CCPA / state-level).

### PR-H — Vendor Due Diligence Agent

- Vendor's standard T&Cs vs our requirements. Common deviations:
  unlimited liability, automatic renewal, data residency,
  subcontractor control, termination notice, audit rights.
- DRAFT mode N/A (always REVIEW — incoming vendor paper).

### PR-I — Trademark Check Agent

- Mostly DRAFT mode: clearance search request → generates summary
  + recommended next steps based on jurisdiction + classes.
- REVIEW mode: incoming trademark application → checks against
  our portfolio for conflicts.

### PR-J — IP Question + Contract Question + Legal General Agents

- Q&A-style agents. Lighter playbook (FAQ-style positions).
- DRAFT mode primary: produces an answer + confidence + escalation
  recommendation.
- These three share a common "Q&A agent base class" since their
  shape is identical — only the prompt + playbook differ.

### PR-K — Other (routing-only, no agent)

- Form change: "Other" requests skip the agent layer entirely and
  go straight to a routing decision (sets `assignedToUserId`).
- This is the catch-all; the 8 specialised agents handle 95% of
  expected volume.

### Out-of-scope (deferred — separate roadmap line)

- OCR for scanned PDFs (Tesseract or AWS Textract).
- Real `.docx` track-changes → Word XML mark-up (PR-E ships a
  simpler "before / after paragraph" diff display).
- Multi-document review (e.g., NDA + side letter together).
- Counterparty negotiation chain (multi-round redline tracking).
- E-signature integration (DocuSign / Adobe Sign).
- Playbook learning (auto-suggest new positions from
  attorney-edited redlines over time).

These all become future PRs after the 9 base agents ship.

## Documented exceptions table (additions when PRs land)

| Site | Sunset / permanent? |
|---|---|
| `@aegis/documents.LocalFilesystemStorageBackend` (PR-B) | **Permanent fallback** for dev environments without a Vercel Blob token. Production fail-loud guard mirrors the `AUTH0_SECRET` pattern. |
| `extractedText` async job HTTP trigger (PR-E) | **Sunset when worker runtime ships** — same pattern as 4c.5 snapshot jobs. The service is pg-boss-ready; only the schedule wiring changes. |
| `MockNDAAgent` (PR-D) | **Sunset when ANTHROPIC_API_KEY is set** — fallback to deterministic stub for dev / CI; real Claude in prod. |

## Module-load assertions (additions when PRs land)

| Guard | Triggers |
|---|---|
| Storage backend selection (PR-B) | If `NODE_ENV=production` and no `BLOB_READ_WRITE_TOKEN` (Vercel Blob) AND no `AWS_S3_BUCKET` (S3 plug-in) → throw at module load. |
| Playbook severity catalog (PR-C) | `Object.values(PlaybookEntrySeverity).length === 4` — guards against silent enum drift. |

## Demo arc — what the user sees as PRs land

| After PR | Demo win |
|---|---|
| **PR-A** (this PR) | Cockpit picks up new tickets correctly. Demo of P1b stage progression actually works end-to-end. |
| **PR-B** | No user-visible change. Pure infra. |
| **PR-C** | Admin can configure NDA playbook positions from `/admin/playbooks`. Still no agent change. |
| **PR-D** | **First hero demo.** GC requester pastes an NDA → agent finds 5 deviations → Cockpit shows them with severity pills → attorney clicks Accept on 3, Reject on 2 with rationale → revised document appears. |
| **PR-E** | Real .docx upload + redlined .docx download. The full "client sends NDA, AEGIS returns redlined NDA" loop. |
| **PR-F** | Same demo, much higher value (40-60 deviations on a real MSA). |
| **PR-G - PR-J** | Per-agent demos: privacy DSAR response, vendor T&C review, trademark clearance, etc. |
| **After all 9** | Every intake type has agent automation. Volume goes from "human triages everything" to "human reviews redlines on a fraction." |

## Permission model evolution

The 38 existing permissions grow by 6 to 44. The 8 canonical roles
get the new permissions per the table below:

| Permission | admin | gc | attorney | paralegal | legal_ops | requester | external | viewer |
|---|---|---|---|---|---|---|---|---|
| `documents:upload` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| `documents:read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (own) | ✓ (assigned) | ✓ |
| `documents:delete` | ✓ | ✓ | — | — | — | — | — | — |
| `playbook:read` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ |
| `playbook:write` | ✓ | ✓ | — | — | ✓ | — | — | — |
| `agent:redline:override` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — |

`requester` gets `documents:read (own)` because the GC's customer
(another department's filer) needs to see their own attached doc
and the redlined version when it comes back.

## Conservative AI governance — what's load-bearing here

Per CLAUDE.md non-negotiable #7: every AI action that mutates state
requires human approval AND writes an `AuditLog` row. In this
workflow:

- The agent **proposes** redlines; the attorney **accepts or
  rejects** each one. Status flips from `PENDING → ACCEPTED |
  REJECTED | EDITED`.
- The revised document is generated only from accepted/edited
  redlines.
- "Accept all" is gated by paranoia type-to-confirm when ≥3
  BLOCKERS remain PENDING (matches the 4c.4 hold-issuance pattern).
- Every accept / reject / edit emits a chain-sealed audit row
  with the redline's id, before/after status, and the actor.
- The `AgentDecision` table contract from 4b applies: each
  AgentReview produces one `AgentDecision` row at status
  `PENDING`; the row reaches `APPROVED` only when the attorney
  finalises the review.

No path lets the agent generate a final document without attorney
sign-off on every redline. This is the difference between AEGIS
and a chatbot.

## Estimated timeline

| PR | Effort |
|---|---|
| PR-A (this PR) | ~1 hour |
| PR-B (Documents foundation) | ~3-4 days |
| PR-C (Playbook + admin) | ~2-3 days |
| PR-D (NDA v1 paste-text) | ~3-4 days |
| PR-E (NDA v2 real upload) | ~3-4 days |
| PR-F (Contract Review) | ~2-3 days |
| PR-G (Privacy / DSAR) | ~2-3 days |
| PR-H (Vendor DD) | ~2 days |
| PR-I (Trademark) | ~2 days |
| PR-J (IP + Contract Q + Legal General) | ~3 days (three agents, shared base) |
| PR-K (Other routing-only) | ~1 day |
| **Total** | **~5-6 weeks** of focused work |

The first agent (NDA, PR-D + PR-E) takes ~7-8 days because it
carries 100% of the new infra cost. Each subsequent agent is
~2-3 days.
