# CLM & Contract-Analytics Competitive Comparison — AEGIS Contracts

> Prepared 2026-09-26. Competitors current to 2026. AEGIS capabilities are
> verified against `modules/contracts/api.ts` and `packages/review/src` — every
> AEGIS function named below is a real export. Companion to
> [`docs/one-legal-cowork-roadmap.md`](./one-legal-cowork-roadmap.md).
>
> Competitor feature claims are sourced to the URLs at the end; third-party
> accuracy figures (e.g. Luminance ~87%/72%, Kira 1,000+ provision types) come
> from those reviews, not vendor-verified benchmarks — treat as directional.

## Executive summary

AEGIS's Contracts module is at **rough functional parity** with the enterprise
CLM leaders across the legal-operations spine — authoring from templates +
clause library/playbooks, AI drafting, clause/obligation extraction,
deterministic risk scoring, an approval ladder, native e-signature, versioning
with word-level redline, obligation & renewal management with key-date/ICS
export, a counterparty review portal, and a repository/overview. It is
**ahead** of every competitor on *governance architecture* — a cryptographically
chain-sealed `AuditLog`, an in-schema `AgentDecision` human-approval gate that
no prompt or config can bypass, degrade-to-deterministic AI, and the "one
brain" shared-entity model (a contract's obligation, counterparty, and person
are the *same* rows Matter, Legal Hold, Privacy, and Spend use). It is
**behind** the pure-play incumbents on three things buyers notice: (1) true
Microsoft **Word/DOCX redline round-trip** (Ironclad/Icertis edit in Word;
AEGIS diffs its own rendered text and only *generates* .docx), (2) **breadth
of native integrations** (Salesforce/CRM, ERP, DMS like iManage/NetDocuments,
DocuSign — AEGIS has none today), and (3) the **UX maturity of tabular/grid
bulk review** that Legora, Kira, and Luminance have productized over years
(AEGIS has the engine in `@aegis/review` + a `contract-review-cockpit`, but not
a battle-tested many-doc grid). Net: AEGIS competes as the *governed,
integrated legal-ops platform* rather than a best-of-breed point tool, and wins
where auditability, cross-module data unity, and self-hosting matter more than
Word-native negotiation and marketplace integrations.

## Feature-by-feature comparison

Legend: ✅ has · 🟡 partial · ❌ missing. "Contract-analytics leaders" =
Luminance, Kira/Litera, Legora, Harvey (AI-review/analytics point tools; not
full CLM).

| Dimension | Icertis (ICI) | Ironclad | Contract-analytics leaders | **AEGIS Contracts (exact functions)** |
|---|---|---|---|---|
| **Authoring & templates** (clause library, playbooks, fallback language) | ✅ Robust clause library w/ fallback & dependent clauses, versioning, localization | ✅ Template + playbook authoring; Redlining Agent applies playbook positions | 🟡 Drafting/Q&A (Harvey, Legora, Spellbook), not a governed CLM repository | ✅ `listClauseLibrary`, `getContractPlaybookText`, `upsertClauseLibraryEntry`; templates via `listTemplates`, `getDefaultTemplateForKind`, `authorContractFromTemplate`, `renderTemplateBody` |
| **AI drafting** | ✅ Copilot (Azure OpenAI) | ✅ AI drafting agents | ✅ Core strength (Harvey/Legora/Spellbook) | ✅ `draftContractWithAI` — degrades to a deterministic skeleton offline |
| **Negotiation & redlining** (Word round-trip, version compare, counterparty portal) | ✅ Full negotiation; Word integration | ✅ **Best-in-class**: real-time MS Word redlining, track changes, redline reconciliation | 🟡 Analysis/redline suggestions; in-app, not a full CLM negotiation loop | 🟡 Turn-based `getNegotiationState`/`applyCounterpartyTurn`; version compare `snapshotContractVersion`/`diffContractVersions`; **word-level** `diffWords`; portal `mintContractReviewToken`/`submitReviewResponse`. **Gap: no true Word/DOCX edit round-trip** — `generateContractDocx` is output-only |
| **AI contract analytics** (clause extraction, risk scoring, deviation, obligation extraction, bulk/tabular review) | ✅ Copilot extracts clauses/obligations/risk into structured data | ✅ AI extraction + review agents; conversational search | ✅ **Category leaders**: Luminance auto-review deviation flags; Kira 1,000+ provision types + Grid Chat; Legora **Tabular Review** grid; Harvey Vault | ✅ `extractContractKnowledge`, `reExtractContractClauses`; risk `scoreContractClauses`/`bandForScore` + `assessContractWithAI`; deviation-fix `suggestClauseRemediation`; **bulk/tabular via `@aegis/review`** (`persistReviewSet`, `runAiReviewOnReviewSet`, clustering/near-dup) + `contract-review-cockpit.jsx`. 🟡 grid UX less mature |
| **Obligation & renewal** (key dates, alerts, auto-renew) | ✅ Obligation fulfillment + compliance monitoring | ✅ Repository obligation/renewal tracking & alerts | ❌ Not a lifecycle/renewal system of record | ✅ `createObligation`, state machine, breach sweep `evaluateObligationBreaches`; renewals `getRenewalPipeline`/`ensureRenewalNoticeObligations`; key dates `getKeyDates`/`buildKeyDatesICS`; `getContractAlerts`, `getContractDigest` |
| **Approvals & workflow** (ladders, e-sign, integrations) | ✅ Configurable approvals; integrated e-sign | ✅ No-code Workflow Builder; e-sign + DocuSign | 🟡 Some workflow agents; not enterprise ladders | ✅ `submitContractForApproval`/`actOnContractApproval` (shared `@aegis/workflow` `clm_contract_approval` ladder); **native e-sign** `requestSignature`/`submitSignature` (content-hash-bound). 🟡 no 3rd-party e-sign/workflow marketplace |
| **Repository, search, reporting** | ✅ Searchable repo + analytics/dashboards | ✅ Searchable repo, auto metadata, BI export | 🟡 Structured findings/grids, not a governed repo | ✅ `getContractsOverview`, `getContractDetail`, `listObligations`; digest/alerts dashboards. 🟡 structured reads, not corpus-wide semantic search |
| **Integrations** (DMS, CRM, ERP, Word, Salesforce) | ✅ Deep ERP/CRM (SAP, Salesforce, MS) | ✅ **Deepest** — #1 Salesforce, Snowflake, Office | 🟡 Varies; per-vendor connectors | ❌ **None shipped** — no Salesforce/CRM, ERP, DMS (iManage/NetDocuments), DocuSign, or Word add-in |
| **Governance / audit** | ✅ Audit trails, compliance controls | ✅ Audit trails, access controls | 🟡 Limited enterprise audit ledger | ✅ **Best-in-class**: every mutation chain-sealed via `@aegis/db.logAudit` (SHA-256 chain, append-only triggers, `verifyAuditChain`); AI gated by `AgentDecision` (PENDING→APPROVED); tamper-evidence `sealContractTerms`/`checkContractIntegrity` |
| **Security posture** | ✅ Enterprise SaaS (SOC2/ISO) | ✅ Enterprise SaaS (SOC2/ISO) | ✅ Enterprise SaaS; Luminance offers on-prem | 🟡 **Self-hostable** (own Neon/Vercel tenant), Auth0+RBAC (`canUserDo`), key-never-leaves-server AI proxy. No published SOC2/ISO yet |

## Where AEGIS wins

- **Governance-in-schema, not governance-by-policy.** The `AgentDecision`
  PENDING→APPROVED gate and the cryptographically chained, append-only
  `AuditLog` are enforced by the persistence layer and Postgres triggers — no
  prompt edit, config toggle, or agent can bypass them (`verifyAuditChain`,
  `sealContractTerms`, `checkContractIntegrity`). Incumbents log audit trails;
  AEGIS makes tampering *detectable* and AI action *ungateable*.
- **One brain across legal ops.** A contract's `Obligation`, `Counterparty`,
  and `Person` are the *same shared rows* Matter, Legal Hold, Privacy, and
  Spend read — genuine cross-module answers with no data duplication. Point
  tools and even CLM suites keep contracts in a silo.
- **Degrade-to-deterministic AI.** `draftContractWithAI`, `assessContractWithAI`,
  `runAiReviewOnReviewSet` all fall back to deterministic baselines when
  offline/unkeyed — the workflow never stalls and every result is explainable.
- **Self-hosted / low lock-in.** Runs on the customer's own Neon + Vercel
  tenant, Anthropic key never leaving the server, Auth0 swappable by design.
- **Native, content-hash-bound e-signature** with no DocuSign license or
  per-envelope cost.

## Gaps to close

| Gap | Effort | Note |
|---|---|---|
| True MS **Word/DOCX redline round-trip** | **Large** | `generateContractDocx` only emits .docx; `diffWords` diffs our own text. Needs DOCX ingest + track-changes parsing + a Word add-in. |
| **Salesforce / CRM** integration | **Large** | Ironclad's #1 Salesforce integration launches contracts from opportunity records; AEGIS has zero CRM connectors. |
| **DMS + e-sign + ERP** connectors (iManage, NetDocuments, SharePoint, DocuSign, SAP) | Medium–Large | No connector layer exists; each is its own effort. |
| **Tabular/grid bulk-review UX** maturity | Medium | Engine exists (`@aegis/review`); needs the polished row=doc / col=prompt / cell→source grid + grid-chat-with-citations. |
| **Full-text / semantic search** across the corpus | Medium | Current reads are structured queries, not corpus-wide NL search. |
| Enterprise **security certifications** (SOC 2 Type II, ISO 27001) | Medium | Architecture is sound; no published attestation yet. |
| Clause-extraction **accuracy benchmarking** | Small–Medium | Benchmark `extractContractKnowledge` and publish comparable numbers. |
| **Localization** / multi-language clause libraries | Small | Library is single-locale today. |

## Sources

- Icertis — [CLM product](https://www.icertis.com/products/operate/contract-lifecycle-management/) · [ICI review 2026](https://www.business-software.com/blog/icertis-exclusive-product-review/) · [Gartner Peer Insights: ICI](https://www.gartner.com/reviews/product/icertis-contract-intelligence-ici)
- Ironclad — [AI capabilities (IntuitionLabs, 2026)](https://intuitionlabs.ai/articles/ironclad-ai-contract-management-capabilities) · [AI-based contract management](https://ironcladapp.com/product/ai-based-contract-management) · [CLM in 2026 (Vaquill)](https://www.vaquill.ai/blog/clm-2026-ironclad-docusign-contractworks)
- Luminance — [AI contract review](https://www.luminance.com/m-ai-contract-review-software/) · [Review 2026 (Vaquill)](https://www.vaquill.ai/blog/luminance-review-honest-assessment)
- Kira / Litera — [Kira AI research](https://www.litera.com/kira-ai-research) · [Best AI tools for due diligence (Spellbook)](https://spellbook.com/learn/best-ai-tools-for-contract-due-diligence)
- Legora / Harvey — [Harvey vs Legora 2026 (Layer3Labs)](https://www.layer3labs.io/comparisons/harvey-vs-legora) · [Legora vs Harvey (Spellbook)](https://spellbook.com/briefs/legora-vs-harvey)
