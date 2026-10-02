---
name: regulatory-ai-governance
description: >-
  Inventories, classifies and governs AI systems: EU AI Act role and risk tier (as amended by the 2026 Digital
  Omnibus), NIST AI RMF and ISO/IEC 42001 controls, India's AI Governance Guidelines, IT Rules synthetic-content
  duties and DPDPA overlap, plus AI vendor contract terms. Use when a team wants to build, buy or deploy AI, an
  AI register is needed, or someone asks "is this high-risk" or "what does the AI Act require of us". Not for
  a privacy-only DPIA → privacy/privacy-impact-assessment; AI vendor MSA review → contracts/saas-and-cloud-review.
module: regulatory
version: 1.0.0
jurisdictions: [global, IN, EU, UK, US]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of inventory (register and classify many systems), assess (one system in depth), programme (AIMS / framework gap review) or contract (AI vendor terms).
  - name: system_description
    required: false
    description: Per system - purpose, users, affected persons, model type (own, fine-tuned, third-party GPAI/API), data, outputs, human oversight, markets.
  - name: our_role_facts
    required: false
    description: Who built it, whose name/brand it is sold under, whether we modified a third-party model or changed its intended purpose.
  - name: artefacts
    required: false
    description: Model cards, vendor documentation, evaluations, DPIA, existing AI policy, contracts.
  - name: sector
    required: false
    description: Financial services, health, HR, education, public sector - adds sector rules (e.g. RBI FREE-AI framework).
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [privacy/privacy-impact-assessment, privacy/dpdpa-compliance, privacy/gdpr-compliance, regulatory/applicability-mapper, regulatory/regulatory-change-monitor, contracts/saas-and-cloud-review, contracts/vendor-due-diligence, ip/copyright-assessment, employment/employment-policy-drafter, drafting/policy-drafter, platform/ai-work-audit-trail]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# AI Governance

Classifies each AI system by our legal role and risk tier, then states what we must do, by when, under each framework in play, and closes the gaps through policy, controls and contract. It treats the EU AI Act as the binding anchor where it applies, NIST AI RMF and ISO/IEC 42001 as the control architecture, and India's position (guidance plus existing law, not a standalone AI statute) as first-class.

## When to use / not use

- Use: AI use-case intake and approval; building the AI register; "high-risk?" questions; AI Act readiness; AI policy and AIMS (ISO/IEC 42001) programmes; buying AI tools; generative AI deployments (chatbots, content generation, coding assistants); HR, credit, insurance or biometric AI.
- Hand off: personal-data risk → `privacy/privacy-impact-assessment` (run alongside; the AI Act FRIA (Art. 27) may build on a DPIA); vendor MSA terms → `contracts/saas-and-cloud-review`; copyright in training data/outputs → `ip/copyright-assessment`; new AI rules arriving → `regulatory/regulatory-change-monitor`.

## Inputs to collect first

1. Intended purpose and who is affected by outputs (employees, customers, public, children).
2. Our role facts: did we develop it, put our name/trademark on it, substantially modify it, or change the intended purpose of a third-party system?
3. Where it is placed on the market, put into service, or where its **output is used** (EU nexus).
4. Model provenance: in-house, open-weight, API GPAI; training data sources.
5. Decision impact: does output decide or materially influence access to jobs, credit, insurance, education, essential services, or legal status?
6. Human oversight design and logging.

## Method

1. **Is it AI?** Apply EU AI Act Art. 3(1) definition (machine-based, varying autonomy, may adapt, infers from input how to generate outputs that can influence environments). Simple rules-based automation without inference → out of AI Act scope; still governed by internal policy if material.
2. **Scope** (Art. 2): EU-placed/put into service, deployer in EU, or third-country provider/deployer where output used in EU. Exclusions: military/defence, scientific R&D only, pre-market research/testing (not real-world), purely personal use; free open-source carve-outs are partial.
3. **Role** (Art. 3, 25): provider, deployer, importer, distributor, authorised representative, product manufacturer. Rule: deployer **becomes provider** of a high-risk system if it puts its name/trademark on it, makes a substantial modification, or modifies intended purpose so the system becomes high-risk (Art. 25(1)).
4. **Tier** - in this order:
   - **Prohibited** (Art. 5; EU-AIA-01): harmful manipulation/deception, exploitation of vulnerabilities, social scoring, crime-risk prediction based solely on profiling, untargeted facial-image scraping, emotion recognition in workplace/education (except medical/safety), biometric categorisation inferring sensitive traits, real-time remote biometric ID in public for law enforcement (narrow exceptions). Plus the Omnibus addition on AI generating non-consensual intimate imagery / CSAM (proposed EU-AIA-04 `[verify current]`). → S1, stop.
   - **High-risk** (Art. 6): (a) safety component of / product under Annex I legislation requiring third-party conformity assessment; or (b) Annex III area - biometrics; critical infrastructure; education/vocational training; **employment and worker management** (recruitment, selection, promotion, termination, task allocation, monitoring); **access to essential private/public services** (creditworthiness/credit scoring except fraud detection, life and health insurance risk/pricing, public benefits, emergency triage); law enforcement; migration/border; administration of justice and democratic processes. Art. 6(3) derogation: not high-risk if it performs a narrow procedural task, improves a prior human activity, detects patterns without replacing human assessment, or is preparatory - **never** where it profiles natural persons. Document the derogation and register it (Art. 49(2)).
   - **Transparency** (Art. 50): chatbot disclosure; machine-readable marking of synthetic audio/image/video/text by providers; deployers disclose deepfakes and AI-generated text published on matters of public interest; emotion recognition/biometric categorisation notice. On the Aug 2026 track, with a grace period for systems already on the market (EU-AIA-03, proposed EU-AIA-04).
   - **GPAI** (Arts. 51-55; EU-AIA-02): if we provide a general-purpose model (including substantial fine-tuning per Commission guidance `[verify current]`) - technical documentation, downstream information, copyright policy, training-content summary; systemic-risk models add evaluation, incident reporting, cybersecurity.
   - **Minimal** - AI literacy (Art. 4, as softened by the Omnibus to a duty to support literacy) and voluntary codes.
5. **Timing** - state which obligations apply now vs later: prohibitions and literacy since 2 Feb 2025 (EU-AIA-01); GPAI since 2 Aug 2025 (EU-AIA-02); Art. 50 from 2 Aug 2026; Annex III high-risk from 2 Dec 2027 and Annex I from 2 Aug 2028 under Regulation (EU) 2026/1744 (EU-AIA-03, proposed EU-AIA-04). All `[verify current]`.
6. **Obligations by role/tier**: high-risk provider - risk management (Art. 9), data governance (Art. 10), technical documentation (Art. 11), logging (Art. 12), transparency to deployers (Art. 13), human oversight (Art. 14), accuracy/robustness/cybersecurity (Art. 15), QMS (Art. 17), conformity assessment, CE marking, EU database registration, post-market monitoring and serious-incident reporting (Art. 73). High-risk deployer (Art. 26) - use per instructions, competent human oversight, input-data relevance, monitoring and log retention (≥6 months), inform workers' representatives before workplace use, inform affected persons, FRIA for public bodies/public-service providers and credit/insurance use cases (Art. 27), explanation right (Art. 86).
7. **Map to control frameworks**:
   - **NIST AI RMF 1.0** (NIST AI 100-1, Jan 2023) and Generative AI Profile (NIST AI 600-1, Jul 2024): GOVERN (policies, accountability, culture, third-party risk) → MAP (context, purpose, impacts, categorisation) → MEASURE (testing, evaluation, bias, robustness, monitoring metrics) → MANAGE (prioritise, treat, respond, decommission).
   - **ISO/IEC 42001:2023** AI management system: context and scope (cl. 4), leadership and AI policy (5), risk assessment, treatment and **AI system impact assessment** (6, 8), support (7), operation (8), performance evaluation and internal audit (9), improvement (10); Annex A controls with Statement of Applicability. Certifiable; useful as AI Act QMS evidence but not a presumption of conformity.
8. **India layer** (always when Indian entity, users or data):
   - **No AI-specific statute.** MeitY's **India AI Governance Guidelines** (released 5 Nov 2025 under the IndiaAI Mission) are non-binding: seven principles (trust, people first, innovation over restraint, fairness and equity, accountability, understandable by design, safety/resilience/sustainability); recommend graded accountability, India-specific risk frameworks, grievance mechanisms, transparency reporting, and proposed institutions (AI Governance Group; Technology & Policy Expert Committee; AI Safety Institute). Cite as guidance (proposed IN-AI-01).
   - **IT Rules 2021 as amended in Feb 2026** on synthetically generated information: intermediaries offering tools to create SGI must label it prominently and embed provenance metadata/identifiers; significant social media intermediaries obtain user declarations and verify; compressed takedown and grievance timelines; due-diligence failure risks s.79 IT Act safe harbour (proposed IN-AI-02 `[verify current]`).
   - **DPDPA**: training and inference on personal data need a ground (consent or s.7); scraped data is excluded only if made public by the principal or under law (s.3(c)(ii)); SDF algorithmic due diligence (Rule 13); rights requests against training data; children (s.9 bans tracking/behavioural monitoring/targeted ads).
   - **Sector**: RBI's FREE-AI framework (Aug 2025 committee report) for regulated entities `[verify current]`; SEBI expectations on AI/ML use by intermediaries; Consumer Protection Act 2019 (misleading claims, dark patterns); IT Act s.66D/BNS for impersonation/deepfake fraud.
9. **US/UK snapshot**: US - no federal AI statute; FTC Act s.5 (unfair/deceptive AI claims), EEOC/ECOA adverse-action and anti-discrimination rules apply to AI decisions; state laws (e.g. Colorado AI Act, NYC Local Law 144 bias audits for AEDTs, state deepfake/election laws) `[verify current]`. UK - principles-based, regulator-led; UK GDPR Art. 22 and Equality Act 2010.
10. **Score and decide**: Prohibited → S1 STOP. High-risk without plan to meet obligations by application date → S2 (S1 if live in EU after the date). Transparency gaps due within 6 months → S2. GPAI provider gaps → S2. India SGI labelling gap for an intermediary → S2. Missing inventory/policy → S2 for the programme. Decision: **APPROVE / APPROVE WITH CONDITIONS / REJECT**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| AI inventory | Every system registered with owner, purpose, role, tier, markets | S2 | Build register (inventory mode) |
| Prohibited practices screen | Documented "no" per Art. 5 item | S1 if any yes | Stop; redesign |
| High-risk classification | Annex I/III analysis + Art. 6(3) derogation recorded | S2 | Treat as high-risk until analysed |
| Role drift | Branding/modification checked under Art. 25 | S2 | Contract allocation + provider obligations |
| Human oversight | Named competent overseer, override power, training | S2 | Add human-in-the-loop for significant decisions |
| Transparency / labelling | Chatbot disclosure; synthetic content marked; India SGI labels | S2 | Implement watermark/metadata + UI notice |
| Data governance | Lawful ground for training/inference; bias testing; representativeness | S2 | DPIA + bias evaluation |
| Logging & monitoring | Logs retained ≥6 months (deployer, high-risk); drift monitoring | S3 | Configure logging |
| AI literacy | Role-based training records | S3 | Training programme |
| Incident handling | Serious incident route (Art. 73); link to breach SOP | S3 | Add to incident SOP |
| Worker consultation | Workers' reps informed before workplace high-risk AI | S2 (EU) | Consultation plan |
| Policy & AIMS | AI policy, roles, approval gate, 42001 SoA if pursuing certification | S3 | `drafting/policy-drafter` |

## AI vendor contract terms (contract mode)

| Term | Ask (buyer side) | Default severity if missing |
|---|---|---|
| No training on our data / prompts / outputs without opt-in | Express prohibition; deletion of inputs within set period | S1 for confidential or personal data |
| Regulatory cooperation | Vendor supplies AI Act Art. 13 instructions, documentation, logs, conformity evidence; notifies material model changes | S2 |
| Role allocation | Vendor is provider; we are deployer; no co-branding that makes us provider | S2 |
| IP & output | Ownership/licence of outputs; IP indemnity for training data and outputs | S2 |
| Accuracy & bias | Warranties or documented evaluation results; right to test | S3 |
| Security | Prompt-injection and data-exfiltration controls; incident notice ≤24h | S2 |
| Sub-processors / model providers | Disclosure of underlying GPAI and hosting locations | S3 |
| Audit & transparency | Access to model cards, evaluations, audit reports | S3 |
| Change control | Notice before model/version change affecting performance | S3 |
| Exit | Data return, deletion certificate, fine-tuned weights ownership | S3 |
| Liability | Super-cap for data, IP and regulatory breaches | S2 → `contracts/contract-review` |

## Output

Lead with `Decision: APPROVE | APPROVE WITH CONDITIONS | REJECT - <role, tier, key reason>`. Then the output contract. Add:

- **Classification card** (per system): AI? · scope · role · tier · Art. 6(3) reasoning · applicable dates (vol. IDs).
- **Obligation matrix**: obligation · framework/article · applies from · status · owner.
- **Framework crosswalk** (programme mode): AI Act obligation ↔ NIST AI RMF function/category ↔ ISO/IEC 42001 clause/Annex A control ↔ India guidance principle.
- Inventory mode: return the register as a table; one JSON finding per system with `category: "ai-classification"`.

## Edge cases & pitfalls

- **"It's just ChatGPT"**: a generic GPAI tool deployed for CV screening is a high-risk use; the use case, not the model, sets the tier.
- **Omnibus timing is not a holiday**: prohibitions, GPAI, literacy and most Art. 50 duties are live; design high-risk controls now because products ship before Dec 2027.
- **Guidance vs law in India**: do not present the AI Governance Guidelines as binding; do present IT Rules SGI duties, DPDPA and sector directions as binding.
- **Emotion recognition at work** is prohibited in the EU (Art. 5(1)(f)) - common in call-centre analytics tools.
- **Open-weight fine-tuning** may make us a GPAI provider for the modified model - check the Commission GPAI guidelines thresholds `[verify current]`.

## References

- Volatile facts: EU-AIA-01, EU-AIA-02, EU-AIA-03; proposed EU-AIA-04, IN-AI-01, IN-AI-02.
- Regulation (EU) 2024/1689 (AI Act) Arts. 2-6, 9-17, 25-27, 49-55, 73, 86, 99, Annexes I, III; Regulation (EU) 2026/1744 (Digital Omnibus on AI); NIST AI 100-1; NIST AI 600-1; ISO/IEC 42001:2023; ISO/IEC 23894:2023; MeitY India AI Governance Guidelines (Nov 2025); IT (Intermediary Guidelines and Digital Media Ethics Code) Amendment Rules 2026; DPDPA 2023.
