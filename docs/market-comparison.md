# AEGIS vs. the market

An honest positioning of AEGIS against the tools a Fortune-50 General Counsel
actually evaluates. Written to be usable in a sales conversation **and** as an
internal gap list — where we lead, where we're at parity, and where incumbents
are genuinely ahead today.

## The one-sentence positioning

> Incumbents are **point tools** — an eDiscovery platform, a privacy tool, a
> matter/spend system — that a GC has to integrate. **AEGIS is one platform
> with one brain**: intake, matters, legal holds, eDiscovery/review, contracts,
> spend, privacy/DSAR, and governance on a single Postgres schema and a single
> cryptographically-chained audit ledger, with conservative AI governance
> (every AI action gated by a human and sealed on the chain) as a hard
> architectural rule rather than a feature toggle.

## Who we're compared to

| Category | Incumbents | AEGIS overlap |
|---|---|---|
| eDiscovery + AI review | **RelativityOne / Relativity aiR**, **Everlaw**, **DISCO (Cecilia)** | eDiscovery hub, collect → cull → review → validate → produce, review profiles, validation loop |
| Cloud-native eDiscovery/hold | **Microsoft Purview eDiscovery (Premium)** | Purview-based preservation (delegated) + tenant-scale estimate; per-user collection |
| Privacy / DSAR | **OneTrust**, **Relativity (privacy)**, **Exterro** | DSAR case handling, relevance review, erasure↔hold conflict guard |
| Legal ops (matter/spend/intake) | **SimpleLegal**, **Brightflag**, **Legal Tracker**, **Onit** | Intake, matters, legal holds, spend, contracts, governance |
| Investigations | **Relativity/Everlaw investigations**, forensic suites | Investigations module (allegation → plan → hold → collect → review) |

## Feature comparison — eDiscovery / AI review

Legend: ● strong · ◐ partial / early · ○ not yet · — n/a

| Capability | RelativityOne / aiR | Everlaw | Microsoft Purview | **AEGIS** |
|---|---|---|---|---|
| Legal hold + custodian notices + defensibility | ◐ (add-on) | ◐ | ● | ● chain-sealed, 6-factor scorecard |
| Preservation in M365 (in-place) | ◐ via connectors | ◐ | ● native | ● via Purview eDiscovery (delegated) |
| Collection (mail/files) | ● | ● | ● | ● per-user Graph + Purview tenant-scale estimate |
| Full-text + attachment extraction | ● (OCR, 4000+ types) | ● | ● | ◐ text-based types today; PDF/DOCX/OCR deferred |
| Dedup / email threading / near-dup | ● | ● | ● | ● threading + near-dup + families |
| Multi-dimension AI tagging w/ **citations** | ● (aiR) | ● | ◐ | ● responsive/priv/PII/key/redact + confidence + citation |
| Confidence-based routing | ● | ● | ○ | ● auto-cull / reviewer / attorney |
| **Pilot → validate → scale (recall/precision)** | ● (aiR) | ● | ○ | ● recall/precision + 95% CIs + overturn + **fail-closed** |
| Versioned, auditable review instructions | ◐ | ◐ | ○ | ● immutable `ReviewProfileVersion` |
| Batching + QC workflow | ● | ● | ◐ | ● batches + second-level QC |
| Bates production + privilege log | ● | ● | ◐ | ● Bates + manifest + privilege log |
| Redaction (burn-in) | ● | ● | ● | ○ deferred |
| Concept clustering / active learning | ● | ● | ◐ | ○ deterministic engine today (AI path gated by freeze) |
| Forensic / mobile / Slack native ingestion | ● | ● | ◐ | ○ not yet |
| Scale (TB-class hosted review) | ● proven | ● proven | ● | ◐ unproven at that scale |

## Where AEGIS genuinely leads

1. **One brain across legal operations.** The exact same review engine
   (`@aegis/review`) serves investigations, legal holds, and DSARs. The DSAR's
   erasure request checks live legal holds through the same Matter surface —
   a cross-module join no point tool can do without integration work. This is
   the structural moat: incumbents integrate; AEGIS shares a schema.

2. **Defensible-by-construction AI governance.** Every AI recommendation is a
   PENDING record that a human must approve; apply-at-scale **fails closed** on
   uncited-high-confidence, low-confidence, and privileged documents; and every
   step is written to a **cryptographically chained, append-only** audit ledger
   whose integrity is verifiable even against a database superuser. Incumbents
   log; AEGIS seals.

3. **Validation as a first-class, visible step.** The pilot → validate → scale
   loop with recall/precision **and 95% confidence intervals** and overturn
   rate is presented to the reviewer as a gate, not buried in an analytics tab.
   This is the artifact a court or regulator wants, produced by the workflow.

4. **Versioned review instructions.** Review profiles freeze an immutable
   version on every edit, so "which instructions did the AI run under on this
   date" is answerable — a provenance guarantee most review tools don't expose.

5. **Deterministic floor / demo-proof.** With no API key and no M365 tenant,
   the entire pipeline still runs on an explainable deterministic engine and a
   mock M365 — so pilots and demos never stall, and production swaps the
   implementation behind the same interface.

6. **Total cost of ownership.** One platform, one data model, one audit spine,
   one login vs. an eDiscovery platform + a privacy tool + a matter/spend
   system + the integration tax between them.

## Where incumbents lead today (our honest gap list)

1. **Processing depth & scale.** RelativityOne/Everlaw handle OCR, thousands of
   file types, forensic images, mobile, and Slack/Teams native ingestion at
   TB scale. AEGIS extracts **text-based** attachments today (PDF/DOCX/OCR
   deferred) and hasn't proven TB-class hosted review.

2. **The AI model itself.** Our AI review/validation/drafting **run
   deterministically today** (the 4d governance freeze) with the Claude path
   wired behind the same interface. Relativity aiR and Everlaw ship live
   GenAI now. Our differentiator is the *governance and validation harness*
   around the model, not model quality — and lifting the freeze is an
   implementation swap, not a rebuild.

3. **Advanced analytics.** Concept clustering, communication analysis,
   continuous active learning, and story/chronology builders are mature in
   Everlaw/Relativity; ours are early or planned (ECA-2/INV-3).

4. **Redaction burn-in** and native production redaction are shipped by
   incumbents; deferred for us (needs document rendering).

5. **Ecosystem & proof.** Incumbents have years of case law, certifications,
   scale references, and third-party connectors. AEGIS is new.

## The honest sales narrative

- **Don't sell AEGIS as a Relativity replacement for a 50-TB litigation.** For
  the mega-matter, an incumbent's processing scale wins today.
- **Do sell AEGIS as the GC's operating system** where investigations, holds,
  DSARs, contracts, spend, and matters live together, and where the eDiscovery
  it needs for the *common* case (internal investigation, DSAR, mid-size
  matter) is native, governed, validated, and on one audit chain — with no
  integration tax and no black-box AI risk.
- The wedge is **conservative AI governance + one brain**. That is precisely
  what a Fortune-50 GC's risk-and-compliance posture rewards, and precisely
  what a bag of point tools cannot assemble.

## Closing the gaps (roadmap alignment)

| Gap | Roadmap item |
|---|---|
| PDF/DOCX/OCR extraction | CW-1 follow-up (parser dep + Next externals) |
| Concept clustering / theme analysis | ECA-2 |
| ECA volume funnel + cost estimate | ECA-3 (next) |
| Live GenAI review + active learning | 4d freeze lift (AI path already wired) |
| Chronology / story builder | INV-3 |
| Real hold-notice + DSAR delivery | HOLD-N1 / email wiring |
