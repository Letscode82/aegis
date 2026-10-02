---
name: regulatory-regulatory-change-monitor
description: >-
  Converts a new or amended law, rule, regulator circular, direction, consultation or guidance into an impact
  assessment: what changed, whether and how it applies to us, deadlines, affected policies/contracts/systems,
  owners and a tracked action plan. Use when someone forwards a gazette notification, RBI/SEBI/IRDAI circular,
  EU act, consultation paper or regulator FAQ, or asks "what does this new rule mean for us". Not for mapping
  all regimes for a product → regulatory/applicability-mapper; statute interpretation → research/statute-analysis.
module: regulatory
version: 1.0.0
jurisdictions: [global, IN, EU, UK, US]
risk_tier: review-required
inputs:
  - name: instrument
    required: true
    description: The new instrument (text, PDF or link) or a precise citation; drafts and consultations accepted.
  - name: org_profile
    required: false
    description: Entities, licences, sectors, products, geographies - from AEGIS Regulatory module if available.
  - name: obligations_register
    required: false
    description: Existing obligations/controls register and policy library to map changes against.
  - name: prior_version
    required: false
    description: The superseded text, to produce a delta rather than a fresh read.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [regulatory/applicability-mapper, research/statute-analysis, research/india-legal-research, drafting/policy-drafter, contracts/obligation-extraction, contracts/tabular-review, corporate/board-pack, matters/stakeholder-comms, regulatory/ai-governance, privacy/dpdpa-compliance]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Regulatory Change Monitor

Takes one regulatory development and produces the decision-ready impact note a GC needs: is it binding, does it apply to us, by when, what must change, who owns it, and what we should say to the regulator if a consultation is open. It also proposes updates to the volatile-facts register so the rest of AEGIS stays current.

## When to use / not use

- Use: gazette notifications (India Acts, Rules, commencement notifications, amendments); RBI master directions/circulars; SEBI circulars/master circulars and regulations; IRDAI regulations; MeitY/CERT-In directions and advisories; EU regulations, delegated/implementing acts and guidelines; UK SIs and regulator policy statements; US federal rules and state laws; court rulings that change compliance practice; consultation papers.
- Hand off: whole-product regime map → `regulatory/applicability-mapper`; close reading of a hard provision → `research/statute-analysis`; Indian source tracing → `research/india-legal-research`; rewriting the affected policy → `drafting/policy-drafter`; finding affected contracts at scale → `contracts/tabular-review`; board reporting → `corporate/board-pack`.

## Inputs to collect first

1. The **official text** - not a press summary. If only a summary is available, analyse it but flag `confidence: low` and request the gazette/EUR-Lex/regulator PDF.
2. The **org profile**: which entities hold which licences, products, markets.
3. Whether a **prior version** exists (amendment vs new).

## Method

1. **Authenticate and classify the instrument**:
   - Source and citation (Gazette G.S.R./S.O. number; RBI/SEBI circular number and date; OJ L reference; Federal Register citation).
   - Type and bindingness: Act / subordinate legislation / direction / circular / guidance / FAQ / consultation / draft / press release. Rule: press releases, speeches and media reports are **not** the instrument - never set deadlines from them alone.
   - Status: draft, notified-not-in-force, in force, partially commenced. Identify the commencement mechanism (date in text, separate commencement notification, "from date of publication", phased).
2. **Extract the change** (delta): new obligations, removed obligations, changed thresholds/deadlines, definitions, transition/grandfathering, penalties. Quote ≤25 words per pinpoint.
3. **Applicability test**: apply the instrument's scope (entity type, activity, threshold, territory) to each group entity. Output: applies / does not apply (reason) / conditional (deciding fact).
4. **Impact mapping** - for each obligation that applies, map to: policy/procedure, system/process, contracts (vendor or customer clauses that must change), reporting/filings, training, board/committee approval. Size each: Low (doc update), Medium (process change), High (system build or business model change).
5. **Deadlines** - compute: commencement date; transition end; first filing/report date; consultation deadline. Treat dates from the instrument as firm; computed dates ("18 months after publication") must show the computation and base date. Cite or propose volatile-fact IDs.
6. **Score**:
   - S1 - applies and deadline < 90 days with High impact, or prohibited activity we currently carry on, or a licence condition we already breach.
   - S2 - applies, High/Medium impact, deadline < 12 months.
   - S3 - applies, longer horizon or Low impact.
   - S4/Info - does not apply, or draft/consultation only (but see step 7).
7. **Consultations** - if open, recommend whether to respond (material impact + realistic chance of change), via industry body or directly, and key asks with evidence needed.
8. **Plan** - actions with owners, due dates set ahead of the legal deadline (default: 30 days buffer, 60 for system builds), and dependencies.
9. **Register update** - propose new/changed rows for `_shared/volatile-facts.md` (ID | Fact | Status | Source). Do not edit the register; return the proposal for the content owner.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Authentic source | Official text located and cited | S2 if relying on secondary only | Fetch official text before acting |
| Bindingness | Instrument type stated; guidance distinguished from law | S3 | Label clearly |
| Commencement | Exact date or mechanism; partial commencement mapped section by section | S2 | Compute with base date; `[verify current]` |
| Applicability per entity | Each entity tested | S2 | Ask for org profile |
| Transition / grandfathering | Existing contracts/customers treatment identified | S3 | Check transitional provisions |
| Contract impact | Affected clause types listed; repapering approach | S2 for regulated outsourcing | `contracts/tabular-review` sweep |
| Conflict with other law | Interaction noted (e.g. sector rule vs DPDPA s.16(2)) | S3 | Escalate if genuine conflict |
| Penalty exposure | Sanction stated with authority | Info | - |
| Board / committee | Approval or reporting needed? | S3 | `corporate/board-pack` |
| Consultation | Response decision recorded before deadline | S3 | Industry body route |

## India-specific checks

- **Gazette first**: Acts and Rules take effect per the Gazette notification; MeitY/ministry web pages and PIB releases are secondary. Commencement of an Act is often by separate S.O. notification - check for it before saying "in force".
- **RBI**: distinguish Master Directions (consolidated, binding), circulars (binding, may amend MDs), notifications under specific statutes, FAQs (interpretive). RBI periodically issues consolidated Directions that repeal older circulars - check the repeal schedule.
- **SEBI**: master circulars consolidate and supersede; check the circular's applicability date and any later extensions (SEBI frequently extends timelines).
- **IRDAI**: regulations (gazetted) vs master circulars vs guidelines.
- **State law**: labour, stamp duty, shops & establishments and some IT/data matters vary by state - identify which states the org operates in.
- **Courts**: Supreme Court and High Court rulings can change compliance (e.g. reading down a rule); treat as a change event and run `research/citation-verification` before relying on a summary.

## EU / UK / US notes

- **EU**: regulation vs directive (transposition dates and national variation); delegated/implementing acts; "date of application" vs "entry into force"; corrigenda; Omnibus-style amending regulations (e.g. the AI Act amendments under Regulation (EU) 2026/1744 - see EU-AIA-03).
- **UK**: Act commencement regulations; regulator policy statements (FCA PS) with effective dates.
- **US**: Federal Register effective date vs compliance date; agency guidance is not binding but drives enforcement; state laws with staggered effective dates and AG rulemaking.

## Output

Lead with `Change: <instrument> - <applies / conditional / does not apply> - <first deadline>`. Then the output contract. Add between Findings and Actions:

1. **Instrument card** - citation · issuer · type · bindingness · status · commencement · source link.
2. **What changed** - table: provision · before · after · pinpoint.
3. **Impact map** - obligation · entity · policy/process/system/contract · size · owner · internal due date · legal deadline.
4. **Proposed volatile-facts rows** (ID | Fact | Status | Source).

JSON: one finding per applicable obligation (`category: "reg-change"`), actions with ISO `due`.

## Edge cases & pitfalls

- **Drafts treated as law**: a draft rule or consultation creates no obligation; plan, do not implement irreversible changes.
- **Reported changes without an instrument**: e.g. press reports of compressed timelines; record as "reported - no amending instrument located" and keep the existing date.
- **Date arithmetic**: "18 months after publication" - state the base date and whether the computed date is inclusive; sources diverge by a day.
- **Extensions**: regulators often extend after industry representations; set a reminder to recheck 30 days before each deadline.
- **Over-scoping**: a circular addressed to banks does not bind an NBFC unless it says so - check the addressee list.

## References

- All volatile-fact IDs as relevant; propose new rows in the output.
- Sources: egazette.gov.in; rbi.org.in; sebi.gov.in; irdai.gov.in; meity.gov.in; cert-in.org.in; eur-lex.europa.eu; legislation.gov.uk; federalregister.gov.
