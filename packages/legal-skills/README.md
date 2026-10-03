# AEGIS Legal Skills

Original, platform-ready legal AI skills for **AEGIS**, organised around AEGIS's own modules. Every skill shares one set of standards, one severity scale and one JSON output contract, so findings from a contract review, a DPIA and a breach assessment can be compared, routed to Tasks and rolled up on the Risk Graph.

- **106 catalogued scenarios** across 13 modules, **30 fully built**, the rest specified and ready to author.
- **India as a first-class jurisdiction** alongside EU, UK and US: DPDP Rules 2025, CERT-In, labour codes, stamp duty, FEMA, SEBI/RBI.
- **Volatile law in one place** — dates and thresholds live in [`_shared/volatile-facts.md`](_shared/volatile-facts.md) with an `as_of` date, never hard-coded in skills.
- **Clean-room and Apache-2.0** — see [PROVENANCE.md](PROVENANCE.md). Max verbatim overlap with the reference repo: 1.0%, all statutory text.
- **Runtime included** — zero-dependency Node module to route requests and assemble prompts.

## Repository layout

```
_shared/                 House rules every skill inherits
  STANDARDS.md             grounding, verification, escalation, documents-as-data
  severity-scale.md        S1–S4 + likelihood matrix
  output-contract.md       Markdown order + JSON schema AEGIS renders
  volatile-facts.md        dated register of law that changes
catalog/catalog.json     Source of truth: modules + every skill (built / planned)
skills/<module>/<name>/  SKILL.md (+ optional references/)
templates/               SKILL.template.md for new skills
runtime/                 index.mjs (loadRegistry, route, buildSystemPrompt) + tests
scripts/
  validate.py              front matter, catalog, related ids, injection patterns, staleness
  build.py                 → dist/registry.json + README catalog below
  overlap_check.py         clean-room shingle comparison against any corpus
dist/registry.json       Built bundle the platform loads
```

## Using it in AEGIS

```js
import { loadRegistry, route, buildSystemPrompt, wrapDocuments } from "@aegis/legal-skills";

const reg = loadRegistry();
const [best] = route(reg, "Can we sign this vendor NDA?", { jurisdiction: "IN" });
// → { id: "contracts/nda-triage", ... }

const system = buildSystemPrompt(reg, [best.id], { matter: { id: "MAT-2026-0142", privileged: false } });
const user = wrapDocuments([{ name: "Vendor_NDA.docx", text: extractedText }]) +
  "\n\nReturn format: json";
// send { system, messages: [{ role: "user", content: user }] } to your model
```

Treat skills with `risk_tier: review-required` as drafts until a lawyer signs off; the output contract carries `review.status` for that gate.

## Working on skills

```bash
pip install pyyaml
npm run check            # validate --strict → build → tests
```

To add a skill: copy `templates/SKILL.template.md` to `skills/<module>/<name>/SKILL.md`, set its catalog entry to `"status": "built"`, run `npm run check`. Planned entries in the catalog already carry the title, jurisdictions and one-line scope.

To update law: edit the row in `_shared/volatile-facts.md`, bump `as_of`. The validator warns when the register is more than 45 days old and when a skill cites an ID that isn't registered.

## Catalog

✅ built · 🗺️ planned

<!-- CATALOG:START -->
### Legal Intake & Triage — 5/5 built

_Front door: classify, route and answer inbound legal requests_

| Skill | Status | Jurisdictions | What it does |
|---|---|---|---|
| [Legal request triage](skills/intake/request-triage/SKILL.md) | ✅ built | global | Classify an inbound request by type, urgency and risk; route to self-serve, a skill, or a named lawyer; capture missing facts. |
| [Self-service answer & escalation](skills/intake/self-service-responder/SKILL.md) | ✅ built | global | Answer routine questions from approved positions, and recognise the signals that require a lawyer instead. |
| [Legal meeting brief](skills/intake/meeting-brief/SKILL.md) | ✅ built | global | Prepare a one-page brief for a negotiation, regulator, board or counterparty meeting from matter materials. |
| [Matter scoping](skills/intake/matter-scoping/SKILL.md) | ✅ built | global | Turn a triaged request into a defined scope, assumptions, exclusions and an effort estimate. |
| [Conflict check preparation](skills/intake/conflict-check-prep/SKILL.md) | ✅ built | global | Extract parties, affiliates and adverse interests to run a conflict search before opening a matter. |

### Contracts — 16/16 built

_Review, drafting, negotiation and post-signature obligations_

| Skill | Status | Jurisdictions | What it does |
|---|---|---|---|
| [Playbook contract review](skills/contracts/contract-review/SKILL.md) | ✅ built | global | Clause-by-clause review against the organisation's playbook with deviation scoring and fallback language. |
| [NDA triage](skills/contracts/nda-triage/SKILL.md) | ✅ built | global | Sort incoming NDAs into sign / negotiate / escalate with the specific edits needed. |
| [Obligation & key-date extraction](skills/contracts/obligation-extraction/SKILL.md) | ✅ built | global | Pull obligations, deadlines, renewals, notice periods and owners from executed agreements into a tracker. |
| [Multi-document tabular review](skills/contracts/tabular-review/SKILL.md) | ✅ built | global | Answer the same set of questions across many documents and return a sourced grid. |
| [Indian commercial contract check](skills/contracts/india-commercial-contract/SKILL.md) | ✅ built | IN | Enforceability check under Indian law: Contract Act, stamp duty, execution formalities, arbitration and governing-law choices. |
| [Vendor & third-party due diligence](skills/contracts/vendor-due-diligence/SKILL.md) | ✅ built | global | Risk-tier a supplier and run proportionate legal, privacy, security, sanctions and financial checks. |
| [Redline generator](skills/contracts/redline-generator/SKILL.md) | ✅ built | global | Turn review findings into tracked-change edits and a counterparty-facing issues list. |
| [Clause drafter from library](skills/contracts/clause-drafter/SKILL.md) | ✅ built | global | Draft or adapt clauses from the approved clause library with variant selection and rationale. |
| [SaaS & cloud agreement review](skills/contracts/saas-and-cloud-review/SKILL.md) | ✅ built | global | Customer- or vendor-side review of SaaS/cloud terms: SLAs, data, security, lock-in, liability. |
| [Dispute resolution clause design](skills/contracts/dispute-resolution-clause/SKILL.md) | ✅ built | global | Design arbitration/jurisdiction clauses: seat, institution, rules, tiers, enforceability. |
| [Negotiation preparation](skills/contracts/negotiation-prep/SKILL.md) | ✅ built | global | Map interests, walk-away points, trade-offs and concession sequence before a negotiation. |
| [Renewal & termination advisor](skills/contracts/renewal-termination-advisor/SKILL.md) | ✅ built | global | Decide renew/renegotiate/exit ahead of a notice deadline, with exit mechanics. |
| [Amendments, assignment & novation](skills/contracts/amendment-assignment-novation/SKILL.md) | ✅ built | global | Check change-of-control, assignment and amendment mechanics and draft the instrument. |
| [Online terms & consumer-terms audit](skills/contracts/terms-of-service-audit/SKILL.md) | ✅ built | global | Audit customer-facing terms for unfair terms, consumer-law and platform-rule issues. |
| [Sustainability & ESG clauses](skills/contracts/sustainability-clauses/SKILL.md) | ✅ built | global | Add proportionate climate, human-rights and supply-chain clauses to commercial contracts. |
| [Contract template builder](skills/contracts/contract-template-builder/SKILL.md) | ✅ built | global | Build a new standard template with guidance notes and a negotiation playbook. |

### Privacy & Data Protection — 11/12 built

_Personal-data compliance across DPDPA, GDPR, US state laws and beyond_

| Skill | Status | Jurisdictions | What it does |
|---|---|---|---|
| [DPDPA compliance](skills/privacy/dpdpa-compliance/SKILL.md) | ✅ built | IN | Gap assessment and implementation guidance under India's DPDP Act 2023 and DPDP Rules 2025. |
| [Privacy impact assessment (DPIA)](skills/privacy/privacy-impact-assessment/SKILL.md) | ✅ built | global | Regime-agnostic DPIA/PIA: necessity, risk to individuals, mitigations and residual risk sign-off. |
| [Data processing agreement review](skills/privacy/dpa-review/SKILL.md) | ✅ built | global | Review or draft a DPA against GDPR Art. 28, DPDPA processor duties and the organisation's minimums. |
| [Personal-data & cyber incident notification](skills/privacy/breach-response/SKILL.md) | ✅ built | global | Decide who must be notified, by when, across DPDPA, CERT-In, GDPR, US state and sector regimes. |
| [GDPR compliance programme](skills/privacy/gdpr-compliance/SKILL.md) | ✅ built | EU, UK | Lawful basis, records of processing, rights handling and accountability under (UK) GDPR. |
| [Privacy & consent notice drafter](skills/privacy/privacy-notice-drafter/SKILL.md) | ✅ built | global | Draft layered privacy notices and DPDPA itemised consent notices from a data inventory. |
| [Cross-border transfer assessment](skills/privacy/cross-border-transfer/SKILL.md) | ✅ built | global | Transfer mechanism selection and transfer impact assessment. |
| [Data principal / subject request handling](skills/privacy/data-subject-requests/SKILL.md) | ✅ built | global | Verify, scope, answer or refuse access, correction, erasure and portability requests. |
| [US state privacy laws](skills/privacy/us-state-privacy/SKILL.md) | ✅ built | US | CCPA/CPRA and other state comprehensive privacy laws: applicability and obligations. |
| [Cookies, SDKs & tracking](skills/privacy/cookie-and-tracking/SKILL.md) | ✅ built | global | Consent and disclosure requirements for cookies, pixels and mobile SDKs. |
| [Legitimate interest assessment](skills/privacy/legitimate-interest-assessment/SKILL.md) | ✅ built | EU, UK | Three-part purpose/necessity/balancing test with documented outcome. |
| Regional privacy pack | 🗺️ planned | BR, SG, VN, AE, SA | LGPD, PDPA, PDPL and Gulf regimes as jurisdiction modules on one engine. |

### Regulatory & Compliance — 12/14 built

_Applicability, change monitoring, AI governance, trade, anti-corruption, sector regimes_

| Skill | Status | Jurisdictions | What it does |
|---|---|---|---|
| [Regulatory applicability mapper](skills/regulatory/applicability-mapper/SKILL.md) | ✅ built | global | Given a product, activity or deal, identify every regime that applies, how they interact, and what each demands. |
| [Regulatory change impact](skills/regulatory/regulatory-change-monitor/SKILL.md) | ✅ built | global | Convert a new law, rule, circular or guidance into impact, owners, deadlines and actions. |
| [AI system governance](skills/regulatory/ai-governance/SKILL.md) | ✅ built | global | Classify and govern AI systems across the EU AI Act, NIST AI RMF, ISO/IEC 42001 and Indian guidance. |
| [Sanctions screening & alert adjudication](skills/regulatory/sanctions-screening/SKILL.md) | ✅ built | global | Adjudicate screening hits and assess sanctions exposure in a transaction. |
| [Export controls classification](skills/regulatory/export-controls/SKILL.md) | ✅ built | US, EU, IN | Classify items and technology; licence determination under EAR, EU dual-use and SCOMET. |
| [Anti-bribery & corruption](skills/regulatory/anti-bribery/SKILL.md) | ✅ built | global | FCPA, UK Bribery Act and Prevention of Corruption Act risk review of payments and intermediaries. |
| [Competition & merger control](skills/regulatory/competition-merger-control/SKILL.md) | ✅ built | global | Merger filing thresholds (incl. CCI deal-value test) and conduct-risk screening. |
| [Indian financial services regulation](skills/regulatory/financial-services-india/SKILL.md) | ✅ built | IN | RBI, SEBI and IRDAI requirements for fintech, lending, payments and outsourcing. |
| [Security framework mapping](skills/regulatory/security-frameworks/SKILL.md) | ✅ built | global | Map controls across ISO 27001, SOC 2, NIST CSF and CERT-In directions; evidence gaps. |
| [Operational resilience (DORA/NIS2)](skills/regulatory/operational-resilience/SKILL.md) | ✅ built | EU | ICT risk, third-party register and incident obligations for EU entities. |
| ESG & sustainability reporting | 🗺️ planned | global | BRSR Core, CSRD/ESRS and ISSB disclosure readiness. |
| [Whistleblower programme](skills/regulatory/whistleblower-programme/SKILL.md) | ✅ built | global | Design or audit speak-up channels, protections and investigation workflow. |
| Digital accessibility | 🗺️ planned | global | WCAG, Section 508, EAA and RPwD Act obligations for digital products. |
| [Product cybersecurity obligations](skills/regulatory/product-cyber-obligations/SKILL.md) | ✅ built | EU, US | Cyber Resilience Act and similar secure-by-design and vulnerability-handling duties. |

### Corporate, Governance & Board — 8/8 built

_Board work, entity compliance, M&A and securities_

| Skill | Status | Jurisdictions | What it does |
|---|---|---|---|
| [Board & committee pack](skills/corporate/board-pack/SKILL.md) | ✅ built | global | Assemble the legal section of a board pack: key matters, risk movements, decisions sought, and resolutions. |
| [M&A legal due diligence](skills/corporate/ma-due-diligence/SKILL.md) | ✅ built | global | Run a scoped legal DD, from request list to red-flag report with deal-protection recommendations. |
| [Minutes & resolutions drafter](skills/corporate/board-minutes-resolutions/SKILL.md) | ✅ built | IN, global | Draft board/shareholder resolutions and minutes meeting Companies Act 2013 and SS-1/SS-2. |
| [Entity compliance calendar](skills/corporate/entity-compliance-calendar/SKILL.md) | ✅ built | IN, global | Statutory filings and registers by entity: MCA, ROC, FEMA returns, and foreign equivalents. |
| [FDI & FEMA assessment](skills/corporate/fdi-fema-assessment/SKILL.md) | ✅ built | IN | Route, sectoral caps, Press Note 3 and reporting for inbound investment. |
| [Listed company disclosure](skills/corporate/listed-company-disclosure/SKILL.md) | ✅ built | IN | SEBI LODR materiality, disclosure timelines and insider-trading (PIT) controls. |
| [Shareholders' & founders' agreements](skills/corporate/shareholder-agreement/SKILL.md) | ✅ built | global | Draft or review SHA/founders' terms: control, transfer, exit, vesting. |
| [Governance health check](skills/corporate/corporate-governance-review/SKILL.md) | ✅ built | global | Board composition, committee charters and delegation-of-authority review. |

### Litigation & Disputes — 10/10 built

_Early case assessment, holds, chronology, strategy and settlement_

| Skill | Status | Jurisdictions | What it does |
|---|---|---|---|
| [Early case assessment](skills/disputes/early-case-assessment/SKILL.md) | ✅ built | global | Merits, exposure range, cost-to-resolve and recommended strategy for a new dispute. |
| [Litigation hold](skills/disputes/litigation-hold/SKILL.md) | ✅ built | global | Decide when a duty to preserve arises, scope custodians and data, and issue and track the hold. |
| [Case chronology builder](skills/disputes/chronology-builder/SKILL.md) | ✅ built | global | Build a sourced, dated chronology from a document set, flagging gaps and conflicts. |
| [Adversarial stress test](skills/disputes/adversarial-stress-test/SKILL.md) | ✅ built | global | Attack your own argument, contract position or settlement offer as opposing counsel would. |
| [Pre-action letters & legal notices](skills/disputes/legal-notice-drafter/SKILL.md) | ✅ built | IN, UK, US | Demand letters and statutory notices (e.g. s.80 CPC, s.138 NI Act, PAP letters). |
| [Procedural deadline calendar](skills/disputes/deadline-calendar/SKILL.md) | ✅ built | global | Compute limitation and procedural deadlines with verification flags. |
| [Disclosure & production review](skills/disputes/document-disclosure/SKILL.md) | ✅ built | global | Relevance, privilege and production strategy for document disclosure. |
| [Settlement agreement](skills/disputes/settlement-agreement/SKILL.md) | ✅ built | global | Draft or review settlement terms: release scope, confidentiality, tax and enforcement. |
| [Arbitration strategy](skills/disputes/arbitration-strategy/SKILL.md) | ✅ built | global | Tribunal selection, interim relief and enforcement planning for arbitration. |
| [Regulatory investigation response](skills/disputes/regulatory-investigation/SKILL.md) | ✅ built | global | Respond to regulator notices, dawn raids and information requests. |

### Employment & People — 6/6 built

_Exits, investigations, restrictive covenants and workplace compliance_

| Skill | Status | Jurisdictions | What it does |
|---|---|---|---|
| [Termination risk review](skills/employment/termination-risk/SKILL.md) | ✅ built | global | Assess a proposed exit for legal risk and process defects, and produce a compliant exit plan. |
| [Workplace investigation](skills/employment/workplace-investigation/SKILL.md) | ✅ built | global | Plan and run a fair investigation; draft the findings report. |
| [POSH compliance & inquiry](skills/employment/posh-compliance/SKILL.md) | ✅ built | IN | Internal Committee constitution, inquiry procedure and annual reporting under the POSH Act. |
| [Restrictive covenants](skills/employment/restrictive-covenants/SKILL.md) | ✅ built | global | Non-compete, non-solicit and confidentiality enforceability by jurisdiction. |
| [Indian labour codes](skills/employment/india-labour-codes/SKILL.md) | ✅ built | IN | Wages, social security, IR and OSH code obligations and transition issues. |
| [Employment policy drafter](skills/employment/employment-policy-drafter/SKILL.md) | ✅ built | global | Draft handbooks and policies aligned to local law and company practice. |

### Intellectual Property — 5/5 built

_Clearance, open source, ownership and enforcement_

| Skill | Status | Jurisdictions | What it does |
|---|---|---|---|
| [Open-source licence review](skills/ip/open-source-review/SKILL.md) | ✅ built | global | Classify dependencies by licence obligation and decide what can ship, under what conditions. |
| [Trademark clearance](skills/ip/trademark-clearance/SKILL.md) | ✅ built | global | Knockout and full-search analysis for a proposed mark across target classes. |
| [IP ownership & assignment audit](skills/ip/ip-ownership-audit/SKILL.md) | ✅ built | global | Confirm chain of title from employees, contractors and acquisitions. |
| [Copyright & originality assessment](skills/ip/copyright-assessment/SKILL.md) | ✅ built | global | Protectability, ownership and permitted-use analysis, including AI-generated content. |
| [Infringement & takedown](skills/ip/infringement-takedown/SKILL.md) | ✅ built | global | Assess infringement and draft notices or responses (incl. IT Rules intermediaries). |

### Outside Counsel & Spend — 7/7 built

_Panels, engagement terms, invoices, budgets and performance_

| Skill | Status | Jurisdictions | What it does |
|---|---|---|---|
| [Outside counsel invoice review](skills/outside-counsel/invoice-review/SKILL.md) | ✅ built | global | Review invoices against billing guidelines and budget; produce adjustments and a firm-ready dispute note. |
| [Engagement terms & billing guidelines](skills/outside-counsel/billing-guidelines/SKILL.md) | ✅ built | global | Draft and maintain outside counsel guidelines and engagement letters. |
| [Panel design & RFP](skills/outside-counsel/panel-rfp/SKILL.md) | ✅ built | global | Structure a panel, run an RFP and score proposals. |
| [Alternative fee arrangements](skills/outside-counsel/fee-arrangements/SKILL.md) | ✅ built | global | Design fixed, capped, phased or success fees matched to scope and risk. |
| [Matter budget & forecast](skills/outside-counsel/matter-budget/SKILL.md) | ✅ built | global | Build a phase budget and track burn against it. |
| [Firm performance scorecard](skills/outside-counsel/performance-scorecard/SKILL.md) | ✅ built | global | Post-matter feedback and quarterly firm reviews. |
| [Local counsel coordination](skills/outside-counsel/local-counsel-management/SKILL.md) | ✅ built | global | Instruct and coordinate counsel across multiple jurisdictions. |

### Matter Management & Legal Ops — 6/6 built

_Plans, RAID logs, reporting and continuous improvement_

| Skill | Status | Jurisdictions | What it does |
|---|---|---|---|
| [Matter status report](skills/matters/status-report/SKILL.md) | ✅ built | global | Turn emails, notes and trackers into a decision-oriented status report for a chosen audience. |
| [Matter plan & critical path](skills/matters/matter-plan/SKILL.md) | ✅ built | global | Phases, workstreams, dependencies and milestones from agreed scope. |
| [RAID log](skills/matters/raid-log/SKILL.md) | ✅ built | global | Risks, assumptions, issues and decisions captured from correspondence. |
| [Stakeholder communication plan](skills/matters/stakeholder-comms/SKILL.md) | ✅ built | global | Who needs what, when, and through which channel. |
| [Lessons learned](skills/matters/lessons-learned/SKILL.md) | ✅ built | global | Capture and reuse lessons across matters. |
| [Legal KPI pack](skills/matters/legal-kpi-dashboard/SKILL.md) | ✅ built | global | Define and compute legal department KPIs from AEGIS data. |

### Research & Verification — 6/6 built

_Grounded research and the verification layer every other skill relies on_

| Skill | Status | Jurisdictions | What it does |
|---|---|---|---|
| [Legal research memo](skills/research/legal-research-memo/SKILL.md) | ✅ built | global | Answer a legal question with a sourced, verified memo that separates law, application and uncertainty. |
| [Citation & proposition verification](skills/research/citation-verification/SKILL.md) | ✅ built | global | Verify that every cited authority exists, says what it is cited for, and is still good law. |
| [Statute & regulation analysis](skills/research/statute-analysis/SKILL.md) | ✅ built | global | Structured reading of a provision: scope, definitions, conditions, exceptions, consequences. |
| [Multi-jurisdiction survey](skills/research/multi-jurisdiction-survey/SKILL.md) | ✅ built | global | Same question across many jurisdictions in a comparable grid. |
| [Source-locked answering](skills/research/source-locked-answering/SKILL.md) | ✅ built | global | Answer strictly from supplied documents with pinpoint support. |
| [Indian legal research](skills/research/india-legal-research/SKILL.md) | ✅ built | IN | Research workflow for Indian statutes, rules, notifications and SC/HC judgments. |

### Writing & Communication — 5/6 built

_Plain-language, persuasive, translated and policy writing_

| Skill | Status | Jurisdictions | What it does |
|---|---|---|---|
| [Plain-language explainer](skills/drafting/plain-language-explainer/SKILL.md) | ✅ built | global | Translate legal analysis into a clear, accurate explanation for a business reader. |
| [Persuasive legal writing](skills/drafting/persuasive-writing/SKILL.md) | ✅ built | global | Structure and edit briefs, submissions and advocacy letters. |
| [Legal translation](skills/drafting/legal-translation/SKILL.md) | ✅ built | global | Translate legal documents preserving legal effect, with term notes. |
| [Corporate policy drafter](skills/drafting/policy-drafter/SKILL.md) | ✅ built | global | Draft internal policies with scope, roles, controls and review cycle. |
| [Legal design review](skills/drafting/legal-design-review/SKILL.md) | ✅ built | global | Score and improve a document's readability and usability. |
| Response template library | 🗺️ planned | global | Build and maintain approved responses for recurring queries. |

### Platform & Skill Governance — 3/5 built

_Safety and auditability of AI-assisted legal work inside AEGIS_

| Skill | Status | Jurisdictions | What it does |
|---|---|---|---|
| [Skill security audit](skills/platform/skill-security-audit/SKILL.md) | ✅ built | global | Audit a third-party or internal skill for injection, exfiltration, unsafe tools and licence issues before enabling it in AEGIS. |
| [AI-assisted work audit trail](skills/platform/ai-work-audit-trail/SKILL.md) | ✅ built | global | Record inputs, sources, model and human sign-off for AI-assisted legal work. |
| [Prompt-injection guard](skills/platform/prompt-injection-guard/SKILL.md) | ✅ built | global | Treat document content as data; detect and neutralise embedded instructions. |
| Skill authoring | 🗺️ planned | global | Turn a lawyer's expertise into a new AEGIS skill that passes validation. |
| AI-use time & billing record | 🗺️ planned | global | Record and disclose AI assistance in time entries per firm/bar guidance. |
<!-- CATALOG:END -->

## Disclaimer

These skills support qualified legal professionals. They are not legal advice, and outputs must be reviewed before being relied on. Rows in the volatile-facts register marked `[unverified]` need checking against the primary source.

## Licence

Apache-2.0 © 2026 AEGIS Legal. See [LICENSE](LICENSE) and [NOTICE](NOTICE). If AEGIS prefers to keep the skills proprietary, replace `LICENSE` and the `license:` field in each skill; no third-party terms restrict that choice.
