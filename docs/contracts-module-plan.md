# Contracts (CLM) module + Counterparty Review portal — plan

Answering: *"work on contracts, ensure the contracts agent works in CLM
and both are the same; what's best to have in contracts; and the pending
counterparty review portal."*

## The core problem: two contract worlds today

1. **The real one (intake).** A contract request enters via New Request
   → `Contract` type → the **`clm_contract_approval` ladder** (Draft &
   Submit → AI Risk Review → Legal Review → Finance → GC Approval →
   Counter-signature). The **`contract-review-agent`** (generalist) and
   **`contract-specialist-agent`** (Clinical / Licensing / Supply /
   Vendor-Services playbooks) already scrub the document. This path is
   live and governed.
2. **The mock one (`ContractsView`).** A rich CLM UI — lifecycle
   pipeline, clauses, versions, negotiation, obligations, alerts — driven
   entirely by **hardcoded `CONTRACTS` data**. Looks great, persists
   nothing.

There is **no `Contract` entity** in the schema. Documents are
polymorphic (`ownerType`/`ownerId`); `Obligation`, `Counterparty`,
`Person` are shared entities.

## The decision: ONE contract lifecycle, ONE brain

"Both are the same" = the Contracts module is the **system of record for
contracts**, and the intake CLM ladder **feeds** it — exactly how an
approved intake ladder spawns a `Matter` today (`IntakeTicket.matterId`).
The **same contract agent** runs in both places: at intake (first-pass
review) and inside the Contracts module (renewal/amendment review). One
playbook set, one governance path. No duplicate contract logic.

- Firm/counterparty = **`Counterparty`**; signatories/contacts =
  **`Person`**; the paper = **`Document`** (`ownerType = CONTRACT`);
  commitments = **`Obligation`**; approval flow = the **workflow ladder**
  (reused, not reinvented); contract value ↔ matter budget ↔ **Spend**.
  Never a `ContractParty` table.

## What's best to have in Contracts (research-informed, AEGIS-shaped)

1. **`Contract` entity** — counterpartyId, matterId (link), type, status
   / lifecycle stage, value + currency, effective/expiry dates, renewal
   terms (auto-renew, notice window), governing law. Additive migration;
   attaches to shared entities.
2. **Contract repository** — the `ContractsView` mockup made real: a
   searchable registry by status / expiry / value / counterparty / type,
   with risk + lifecycle-stage badges.
3. **Lifecycle on the ladder** — request → draft → review → negotiate →
   approve → execute → active → renew/expire, run on the existing ladder
   engine. An approved CLM ladder ending in `execute` **creates the
   `Contract` row** (mirror of matter-spawn) and populates `matterId`.
4. **AI review = the shared contract agent** — deviation flags become
   `Obligation`/risk rows; every AI recommendation is `AgentDecision`-
   gated (conservative-AI). Same agent intake uses.
5. **Obligations & key dates** — extracted obligations become
   `Obligation` rows feeding the timeline + renewal/notice-period
   reminders (the mock "alerts" made real).
6. **Versions & redlines** — document versioning via `@aegis/documents`
   (already productionised for `.docx`); side-by-side diff.
7. **Counterparty Review portal** (below) — the negotiation touchpoint.
8. **Renewals & expiry management** — auto-renew / notice-window alerts,
   surfaced on Mission Control.
9. **Spend link** — contract value drives the matter budget; `@aegis/spend`
   already owns invoices/budgets against the same matter.

## The Counterparty Review portal (the pending item)

The external negotiation touchpoint for **NDA and CLM** — the one piece
of the request→matter journey with no surface today.

- A contract (or intake CLM ticket) reaches a **"Counterparty Review"
  ladder step**.
- The counterparty contact (`Person` on a `Counterparty`, a
  counterparty-contact/`external_counsel` role) gets a **scoped,
  tokenised link** — no internal access, resource-scoped to that one
  contract. **Reuse the custodian self-service portal pattern** (already
  built for Legal Hold) + the tokenised-link + consent-gated + fully
  audited model.
- In the portal they **view the draft, redline/comment, and
  accept/counter** — the `.docx` deliverable renderer shows the draft;
  their response returns as a **new internal review step** (the redline
  round-trip), each turn chain-sealed.
- Governance: every counterparty action writes an `AuditLog` row; nothing
  they do auto-executes — internal approval + the ladder still gate.

This is the same shape as the eDiscovery custodian portal: a
resource-scoped external surface behind a token, feeding a governed
internal workflow.

## Build sequence (one PR per step, demo works throughout)

- **CTR-1 — `Contract` entity + repository.** Additive migration; a real
  `ContractsView` over persisted contracts (replaces the mock). Seed a
  handful (incl. the Nimbus MSA + the Snowflake matter's contracts).
- **CTR-2 — CLM ladder → Contract spawn.** An approved
  `clm_contract_approval` ladder that reaches `execute` creates the
  `Contract` row (mirror of matter-spawn), links `matterId`, and the
  shared contract agent's review carries over. This is the "both are
  the same" wiring.
- **CTR-3 — Counterparty Review portal.** New ladder step type +
  tokenised external portal (custodian-portal pattern) for NDA + CLM
  negotiation; redline round-trip; chain-sealed.
- **CTR-4 — Obligations, key dates & renewals.** Extract obligations,
  wire renewal/notice alerts to Mission Control.
- **CTR-5 — Clause library + version diff.** Playbook clause bank; doc
  version history + side-by-side redline.

## Module-count note

Contracts is one of the 11 locked modules (Contracts domain +
`contracts:*` permissions already exist). This is a `modules/contracts`
build with the standard `internal/` + `ui/` + `api.ts` layout — not a
12th module. The contract agents may **move** from intake into
`modules/contracts` and be consumed by intake via `@aegis/contracts`'s
`api.ts` (so there is literally one agent), or stay in intake and be
shared — a CTR-2 decision; either way, one implementation.
