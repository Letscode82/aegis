# AEGIS GC Suite — Presentation Briefing
### Agentic AI in Legal Operations: the platform ("one brain") approach vs. point tools

**Purpose:** source material for a client/prospect presentation
(triggered by a global-FMCG-group inquiry: *"looking for inspiration on
Agentic AI use cases in legal space… to assess in our legal
operations"*). Everything here is organized so it can be pasted into a
deck-preparation session as-is. §10 is the suggested slide outline;
§11 is the claims-discipline guardrail — read it before presenting.

Version 1.0 · July 2026 · Grounded in: PRODUCT.md, the shipped intake
module (22-item world-class backlog complete), and the adversarially
verified market benchmark (`docs/market-benchmark-2026.md`).

---

## 1 · The market moment (why now — verified facts)

- **Gartner created "agentic AI for legal" as a named category** in
  its September 2025 Hype Cycle for Legal, Risk, Compliance and Audit
  Technologies — positioned **pre-mainstream**. The category exists;
  no vendor is at mainstream adoption; the early-mover window is open.
- **The buying climate is pragmatic, not hype-driven.** Gartner
  advises leaders to demand *measurable outcomes and sustainable
  adoption* — not AI demos.
- **The shakeout is already predicted:** Gartner forecasts **>40% of
  agentic-AI projects will be canceled by end-2027** — for cost,
  unclear value, and (their words) **inadequate risk controls**.
  Forrester sees 25% of planned AI spend deferred to 2027.
- **In-house legal is the fastest-adopting buyer:** GenAI use jumped
  **23% → 52% in one year** (ACC/Everlaw, Oct 2025); 64% of in-house
  teams expect *less* reliance on outside counsel.

**The strategic read:** the winners of this wave will not be the tools
with the most impressive demo. They will be the platforms that (a)
prove measurable workflow outcomes and (b) survive the risk-controls
audit that kills the other 40%. That is precisely the design center of
the GC Suite.

---

## 2 · What the GC Suite is

AEGIS is a **legal operations platform for large-enterprise General
Counsel offices** — eleven modules over **one shared database, one
shared set of entities, one audit ledger, one AI governance layer**.

| # | Module | What it covers |
|---|---|---|
| 1 | **Legal Intake** | The front door: multi-channel filing (form, AI copilot, Teams, email), AI triage agents, keyboard-first attorney cockpit, smart routing with seniority tiers, SLA operations |
| 2 | **Matter Management** | Matter lifecycle + **Legal Hold** as a first-class capability (custodians, notices, attestation, preservation, defensibility scorecard, M365/Purview integration) |
| 3 | **Contracts** | CLM: drafting, redlines, execution, renewals |
| 4 | **Command Center** | Mission Control + Board Pack — the GC's executive layer over everything |
| 5 | **Legal Spend & Counsel** | LEDES invoices, vendor management, budgets, timekeepers |
| 6 | **Regulatory Compliance** | Horizon scanning, comment windows, attestations |
| 7 | **Governance** | Policies, committees, delegations, attestations |
| 8 | **Knowledge Management** | The Company Brain — natural-language search across the department |
| 9 | **Insights** | Risk Graph + scenario simulation |
| 10 | **Privacy & Compliance Ops** | DSAR, ROPA, consent, privacy incidents |
| 11 | **Entity Management** | Counterparty CRM, corporate hierarchy, sanctions screening |

**The architectural claim that everything else follows from:** modules
are isolated in *code* but unified in *data*. `Counterparty`,
`Person`, `Document`, `Obligation`, `Event` exist **once**. A
counterparty in an intake ticket is the same row as the counterparty
on a matter, a contract, an invoice, and a sanctions screen. That is
the "one brain."

---

## 3 · The problems each area solves with modern tech

| Area | The pain today (any large legal dept) | The GC Suite answer |
|---|---|---|
| Front door | Hundreds of emails; requests lost; "any update?" pings; no data on demand volume | One intake with AI triage, self-service deflection, live requester tracking, SLA clocks |
| Work allocation | Partners doing paralegal work; no view of who's loaded | Seniority-tier pools with load-balanced routing + overflow; utilization and complexity-mix dashboards |
| AI adoption | Pilots stall on trust: "what did the AI do and who approved it?" | Every agent action gated on named-human approval **in the database schema**, on a tamper-evident ledger |
| Matter chaos | Spreadsheets; no timeline; no linkage to the request that started it | Matters spawn from approved intake automatically, twin-recorded to timeline + audit |
| Legal hold | The single scariest defensibility exposure | Event-sourced hold lifecycle, custodian attestation, defensibility scorecard, court-exportable chain |
| Spend | Invoice review theater; no budget correlation | LEDES ingestion, budgets tied to the same matters the work lives on |
| Privacy | DSAR sprawl across mailboxes | DSAR/ROPA/consent as first-class objects sharing the Person entity with everything else |
| Knowledge | The answer exists in someone's outbox | Curated knowledge + natural-language search over the whole brain |
| The GC's view | Ten tools, ten dashboards, zero coherence | Command Center reads *everything* because everything is one database |

---

## 4 · Why "one brain" beats a stack of point tools (the correlation argument)

This is the core of the pitch. Point tools are excellent at their
segment. The GC Suite's bet is that **the value of legal ops data
compounds only when it correlates** — and correlation is exactly what
a stack of SaaS tools structurally cannot do.

### 4.1 Questions only a shared-entity platform can answer

Live today in AEGIS (not roadmap):

- **"Have we ever dealt with this entity?"** — one click on any party
  runs a conflict check across every intake ticket AND every matter,
  because they reference the same `Counterparty` row. In a point-tool
  stack, that's an email thread and three CSV exports.
- **"Approve this NDA"** → the matter is created automatically, linked
  to the request, the counterparty, and the audit trail — one
  keystroke, three systems' worth of coordination, zero integration
  code.
- **"Who actually held this request when the SLA breached — the AI,
  the paralegal, or senior counsel?"** — the custody ledger + per-leg
  SLA clocks answer it per ticket. No point tool even models
  agent↔human custody.
- **"Is Tier 1 really taking the simple work?"** — routing complexity
  bands + pool utilization + logged effort hours correlate in one
  dashboard because triage, routing, and time capture share a schema.
- **A vendor-due-diligence request is screened against sanctions at
  intake** — because Entity Management's screening and Intake's agent
  read the same counterparty record.

### 4.2 The compounding effect (the long-run argument)

Each new module doesn't add value linearly — it multiplies the
questions the platform can answer, because it attaches to entities
every other module already populates:

- When **Spend** ships, "what does this counterparty cost us across
  matters?" needs zero integration — Invoice rows attach to the same
  Matter and Counterparty that intake and matters already write.
- When **Insights** ships, the Risk Graph is drawn over data that is
  *already correlated* — no warehouse project, no identity-resolution
  program, no "single customer view" initiative.
- Ten years of operation produces **one coherent, chain-verified
  corpus** of how the legal department actually works — the training
  substrate and negotiation-leverage asset no tool stack accumulates.

With N point tools, the same ambition costs: N×identity-mapping
(the same counterparty spelled five ways), N×integration maintenance,
N×audit exports that don't reconcile, N×per-seat contracts, and a
data-warehouse program just to ask cross-cutting questions —
answered at ETL latency, without an audit chain.

### 4.3 One governance layer for ALL agents

The under-appreciated one: in a tool stack, every vendor's AI has its
own definition of "human in the loop," its own logs, its own model
choices. In the GC Suite there is **one** approval gate (schema-level:
a PENDING agent recommendation *cannot* mutate state), **one**
append-only custody ledger, **one** cryptographically chained audit
log covering human and AI actions alike. When the board or a regulator
asks "govern your AI," the answer is one screen — not a vendor
questionnaire program.

---

## 5 · Segment coverage: GC Suite vs. the named tools

How the market maps onto the eleven modules. (Vendor rows reflect
their public positioning — see §11 for claims discipline.)

| Segment | Point tool(s) in that lane | GC Suite module | The correlation the point tool can't make |
|---|---|---|---|
| AI legal work assistant (drafting, research) | **Harvey**, **Legora** | The agent layer inside every module (via one governed AI package) | Their output lands in documents; ours lands in *workflow objects* linked to matters, parties, deadlines, and the audit chain |
| CLM | **Ironclad**, **Conga**, (Luminance, Robin AI for negotiation) | Contracts (module 3) | A contract that knows its intake request, its matter, its counterparty's litigation history, and its invoices |
| Legal front door / intake | **Checkbox**, **Tonkean**, **Xakia**, **Streamline**, ServiceNow LSD | Intake (module 1) — **shipped, production-grade** | Intake that spawns matters, screens sanctions, and conflict-checks against the whole platform at filing time |
| Matter management | Various ELM suites | Matters (module 2) | Matters born from intake with the full pre-history attached |
| Legal hold / eDiscovery | Exterro, Relativity, Mitratech | Legal Hold inside Matters — deep (M365/Purview, attestation, defensibility scoring) | Hold custodians are the same Person rows the rest of the platform knows |
| Spend / e-billing | Various | Spend (module 5) | Spend against the same matters and vendors, not a parallel taxonomy |
| Privacy ops | OneTrust et al. | Privacy (module 10) | DSAR subjects are shared Person entities |
| Entity / conflicts | (usually nobody — spreadsheets) | Entity Management (module 11) | The connective tissue itself |
| Executive view | (usually PowerPoint) | Command Center (module 4) | Reads everything because everything is one database |
| **AI governance & audit** | **(no vendor owns this lane)** | Cross-cutting: AgentDecision gate + custody ledger + chained AuditLog | **This is the open lane the 40%-cancellation prediction creates** |

**The one-slide takeaway:** each named vendor is a *row*. The GC Suite
is the *table* — plus the governance column nobody else has.

**Positioning discipline (important):** we don't claim Harvey or
Ironclad are bad — they're excellent in their lane, and a client's
existing tools can coexist (AEGIS can be the system of record and
orchestration layer they plug into). The claim is: **a lane is not an
operating model.** The GC's problems are cross-lane by nature.

---

## 6 · Agentic AI use-case catalog (the "inspiration" the client asked for)

Concrete, demonstrable use cases — each with its governance control
and its measurable outcome, per the Gartner buying guidance.

| # | Use case | What the agent does | Human control | Measurable outcome |
|---|---|---|---|---|
| 1 | **Conversational intake (Copilot)** | Interviews the requester, extracts structured facts, files the ticket | n/a (assistive) | Intake completeness; time-to-file |
| 2 | **AI triage & classification** | Type, priority, risk, effort estimate, complexity band on every request | Attorney verdict in the Cockpit | Triage time (seconds vs. hours) |
| 3 | **First-draft agents** (NDA, contract review, trademark, policy Q&A) | Drafts the response with reasoning + confidence + concerns | **Schema-enforced approval gate** — a pending draft cannot act | Attorney accept-rate per agent (tracked in-product) |
| 4 | **Vendor due diligence + sanctions screening** | Screens counterparty against OFAC SDN at filing | Flags, never blocks silently; attorney decides | Screens per month; hits caught pre-contract |
| 5 | **Litigation notice extraction** | Parses a served summons: parties, court, dates → tracking object | Tracking-only by design (no legal-hold action without humans) | Zero missed response deadlines |
| 6 | **Smart routing + seniority tiers** | Routes by type/keyword/department/complexity to load-balanced pools with overflow | Rules are human-authored config; attorney decisions always override | % simple work leaving senior desks; utilization per tier |
| 7 | **Agent↔human baton-pass** | The pipeline records its own chain of custody automatically | Append-only ledger; visible on every ticket | Custody accountability (who held it, when) |
| 8 | **SLA enforcement** | Detects breaches, escalates, notifies — with per-leg custody clocks so a hand-off can't hide a breach | Escalation targets are human-configured | SLA adherence %; breach attribution |
| 9 | **Auto matter creation** | Approved matter-eligible requests become linked Matters instantly | Fires **only** on named-human approval of the agent decision | Zero re-keying; 100% intake→matter lineage |
| 10 | **Self-service deflection** | KB + policy Q&A answers before a ticket exists | Curated content | Deflection rate (tickets avoided) |
| 11 | **Conflict check** | Every ticket + matter for any party, on demand, check itself recorded | Read-only; evidence-grade | Minutes vs. days; documented diligence |
| 12 | *(Roadmap)* Legal-hold AI: custodian recommendation, notice drafting, defensibility narrative | Suggests custodians/cadence/drafts | Same AgentDecision gate — contract already enforced in schema | Hold defensibility score trend |

**The demo spine** (15 minutes, all live): employee asks `@AEGIS` in
Teams for an NDA → agent triages, drafts, routes to Tier 1 →
attorney presses one key to approve → matter exists, requester
notified, and the entire story — AI actions and human actions — is
one verifiable chain on the ticket timeline.

---

## 7 · The governance story (the 40% survival kit)

Gartner's #1 predicted cancellation cause is **inadequate risk
controls**. The GC Suite's answer, all shipped:

1. **Approval gate in the schema, not the prompt.** Every AI
   recommendation writes a PENDING `AgentDecision` row; downstream
   effects are database-gated on APPROVED by a named human. A clever
   prompt cannot bypass a foreign-key constraint.
2. **Append-only custody ledger.** Who — agent or human — held every
   request, when, and why. Written automatically; no one has to
   remember.
3. **Cryptographically chained audit log.** Every action (human and
   AI) is hash-chained; UPDATE/DELETE are refused at the database
   level; integrity is verifiable on demand; exports are
   court-ready. When asked "prove your AI governance," the answer is
   a screen, not a project.
4. **Two hard product rules:** agents never auto-close; approval
   gates can reserve final sign-off to a named person (and refusals
   are themselves recorded).
5. **Honest AI labeling** end-to-end: every surface shows whether
   output came from the LLM or a deterministic fallback, with
   confidence — no fake certainty.

Positioning line: **"Agentic AI on the record."** Most vendors put the
human in the loop as UX. We put the human in the loop as *schema* —
and keep the evidence.

---

## 8 · Honest status (know this before presenting)

- **Live, production-grade today:** the full Intake module (all §6
  use cases 1–11), Matter Management with deep Legal Hold
  (incl. real Microsoft 365/Purview integration), admin/RBAC, the
  audit chain, SSO via Entra ID. Validated by 450+ automated tests, a
  97-case UAT plan, and CI that re-verifies the audit chain on every
  change.
- **Schema-ready, UI phased:** Contracts, Spend, Privacy, Regulatory,
  Governance, Knowledge, Insights, Entity Management exist as shared
  schema + roadmap modules — the one-brain foundation is laid; module
  surfaces ship in sequence.
- Present the suite as **vision with a shipped, demonstrable wedge**
  (intake + matters + governance) — not as eleven finished products.
  This honesty is a strength in a market bracing for a shakeout.

---

## 9 · Objection handling

**"Why not just buy Harvey + Ironclad + a ticketing tool?"**
You'll get three excellent lanes and zero correlation. The integration
program to correlate them costs more than the tools, never produces a
unified audit chain, and each vendor's AI governance remains a
questionnaire answer. The GC Suite's cross-cutting questions (§4.1)
are demos, not roadmap.

**"We already have a CLM / we like our existing tools."**
Coexist. AEGIS is the front door, the system of record, and the
governance layer; executed contracts can flow to/from an existing CLM.
The one-brain value starts at intake + matters and compounds from
there — no rip-and-replace required on day one.

**"Is this just a wrapper on a chatbot?"**
No — the AI layer is one governed package, but the product is the
workflow + data model + evidence chain. Kill the LLM key and the
platform still runs (deterministic fallbacks); that's by design.

**"How do we know the AI is behaving?"**
Per-agent scorecards in-product (acceptance rate, confidence,
degraded-mode rate), plus the ledger. You can audit any single
decision back to who approved it and what the AI said, verbatim.

**"What about our data?"**
Single-tenant deployment posture, enterprise SSO (Entra ID) with your
MFA/conditional access, RBAC with resource-scoped permissions, and an
audit trail that regulators can verify independently.

---

## 10 · Suggested deck outline (12 slides)

1. **Title** — *Agentic AI in Legal Operations: from point tools to
   one brain.*
2. **The moment** — Gartner's new category; 23→52% adoption; the 40%
   shakeout prediction. (§1)
3. **The GC's real problem** — not "no AI"; ten disconnected lanes +
   an inbox. (§3 table, condensed)
4. **The landscape** — the vendor map by lane (Harvey/Legora ·
   Ironclad/Conga · Checkbox/Tonkean · ELM · eDiscovery…). Each
   excellent; each a row. (§5)
5. **The idea** — one brain: eleven modules, one database, shared
   entities. (§2 diagram)
6. **What only correlation can do** — the four live examples:
   conflict check, intake→matter, custody-aware SLA, tier/complexity
   correlation. (§4.1)
7. **Agentic use-case catalog** — the §6 table (this is literally
   what the client asked for).
8. **Live demo spine** — Teams message → triage → one-key approve →
   matter + notification + verifiable chain. (§6 close)
9. **Governance: the 40% survival kit** — gate in schema, custody
   ledger, chained audit. *"Agentic AI on the record."* (§7)
10. **Long-run compounding** — each module multiplies queries; ten
    years = one chain-verified corpus vs. N silos. (§4.2)
11. **Where we are** — shipped wedge (intake+matters+governance),
    phased suite, pilot shape (weeks, measurable outcomes:
    days-to-completion, deflection, SLA adherence, senior-time
    reclaimed). (§8)
12. **Ask** — a scoped pilot / discovery workshop mapping their
    intake reality to the use-case catalog.

---

## 11 · Claims discipline (read before presenting)

- **Verified facts** you can cite publicly: everything in §1 (Gartner
  Sept-2025 Hype Cycle category; >40% cancellation prediction;
  ACC/Everlaw 23→52%; Forrester deferral). These survived a 3-vote
  adversarial fact-check against primary sources.
- **Vendor descriptions** (§5, §6 lanes) are their public positioning
  — say "positions itself as," not "can only."
- **Our differentiator phrasing** — use: *"evidence-grade agent
  accountability that, to our knowledge, no legal front-door vendor
  offers."* (Absence from vendor marketing ≠ proven absence of
  feature.)
- **Do NOT use** the "EU AI Act / Colorado 2026 human-oversight
  mandate tailwind" argument — that claim **failed verification** in
  our research. The governance story stands on Gartner's
  risk-controls finding alone; it doesn't need a regulatory claim.
- Don't overclaim suite completeness — §8 is the honest frame, and in
  this market honesty about what's shipped *is* the differentiator.
