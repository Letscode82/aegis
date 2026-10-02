---
name: disputes-litigation-hold
description: >-
  Decides whether and when a duty to preserve has arisen, scopes custodians, systems and date range, drafts
  the hold notice and IT preservation instructions, and runs acknowledgment, refresh and release. Use when a
  claim, notice, regulator inquiry, investigation or credible threat appears, or someone asks "do we need a
  legal hold", "stop deleting", or "an employee involved is leaving". Not for deciding what to produce in
  disclosure → disputes/document-disclosure; not for regulator response strategy → disputes/regulatory-investigation.
module: disputes
version: 1.0.0
jurisdictions: [IN, US, UK, EU, global]
risk_tier: review-required
inputs:
  - name: trigger
    required: true
    description: The event (notice, claim, complaint, regulator letter, internal report, whistleblower, audit finding) with date received and who knew.
  - name: matter_summary
    required: true
    description: Parties, subject matter, relevant period and likely issues.
  - name: people
    required: false
    description: Known actors, their managers, assistants, IT/admin owners; leavers and joiners in the period.
  - name: systems_map
    required: false
    description: Data map or IT inventory — M365/Google, Slack/Teams, ERP/CRM, file shares, devices, messaging apps, backups, retention settings.
  - name: forum
    required: false
    description: Likely forum(s) and governing procedural rules; drives the legal standard.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md]
related: [disputes/early-case-assessment, disputes/document-disclosure, disputes/regulatory-investigation, disputes/chronology-builder, employment/workplace-investigation, employment/termination-risk, privacy/data-subject-requests]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Litigation Hold

Losing evidence after the duty to preserve arises is one of the few ways a defensible case becomes indefensible. This skill fixes the trigger date, scopes the hold proportionately, gets the notice out and IT deletion suspended within 24–48 hours, and keeps an auditable record through to release. The outcome is a hold that a court or regulator would regard as reasonable, with evidence of each step.

## When to use / not use

- Use whenever litigation, arbitration, a regulator investigation, or a government inquiry is pending or reasonably anticipated — including internal investigations that are likely to end in dismissal litigation or regulator reporting.
- Hand off: what to collect, review and produce → `disputes/document-disclosure`; regulator dawn raid or notice → `disputes/regulatory-investigation` (hold runs in parallel); employee departures during a hold → coordinate with `employment/termination-risk`.

## Inputs to collect first

1. **Trigger and date first known** — by whom. The duty usually runs from when the organisation (not only Legal) knew.
2. **Subject matter and period** — defines the content scope.
3. **Key people** — actors, decision-makers, and anyone who left or is leaving.
4. **Where data lives** and current auto-deletion settings.
5. **Cross-border data** — personal data in EU/UK or India affects how preserved data is handled, not whether.

## Method

1. **Decide whether the duty has arisen.** Apply the forum's test (Checks table). Default rule: if a reasonable person in our position would anticipate litigation or an official investigation on these facts, the duty has arisen. Triggers that almost always qualify: legal notice or demand; receipt of plaint, request for arbitration or s.21 notice; regulator notice or summons; written complaint alleging legal wrongdoing (incl. POSH complaint or whistleblower report); our own decision to sue; a credible threat in writing. If borderline, issue a narrow hold — the cost of over-preserving is small; the cost of spoliation is not.
2. **Record the trigger date** and reasoning in the matter file. If the trigger date is in the past (we learn late), state the gap and check what has already been lost — that is a finding.
3. **Scope** proportionately:
   - *Custodians*: tier 1 (key actors), tier 2 (supporting staff, assistants, managers), tier 3 (system owners). Include departed employees whose accounts or devices still exist.
   - *Date range*: from the earliest relevant event (look to the chronology) to ongoing.
   - *Data sources*: email, chat (Teams/Slack/WhatsApp), shared drives, ERP/CRM records, voice recordings, CCTV, phone and laptop images, paper files, third-party-held data (vendors, outside counsel, auditors).
4. **Suspend deletion at source within 24 hours** — instruct IT (system-level preservation does not depend on custodians obeying):
   - M365: place mailboxes, OneDrive and Teams on retention/eDiscovery hold for named custodians; suspend retention policies that would purge; do not disable departed users' accounts before the hold is applied.
   - Google Workspace: Vault matter and holds on accounts/shared drives.
   - Slack/enterprise chat: check plan-level retention and export capability; set retention override for relevant channels/DMs.
   - Devices: stop re-imaging/recycling of custodian laptops and phones; collect forensically for tier 1 leavers.
   - Backups: suspend rotation only where the backup is the sole source of relevant data (proportionality).
   - WhatsApp / personal devices used for business: instruct custodians to preserve; consider forensic imaging with consent where central for tier 1.
5. **Issue the notice** to custodians (template below) within 48 hours; require written acknowledgment within 3 business days. Non-acknowledgment after reminder → escalate to manager and HR.
6. **Interview tier 1 custodians** (short, documented) about where they keep data, including personal accounts and devices.
7. **Third parties**: send preservation letters to vendors/processors holding relevant data and to the opposing party where appropriate.
8. **Track**: hold register in AEGIS (custodians, issue date, acknowledgment, systems on hold, IT confirmation, refreshes). Refresh every 6 months or on material change (new claims, new custodians).
9. **Joiners/leavers control**: HR exit process checks the hold register before account deletion or device recycling; any custodian departure → preserve mailbox, drives and device first.
10. **Release** only when the matter and appeal/challenge periods have ended and no related matter needs the data; record approval and notify custodians and IT; return to normal retention.

## Checks / issue list

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Trigger not acted on | Hold issued within 48 h of reasonable anticipation | S1 if data being lost now | Same-day IT preservation; document delay |
| Auto-delete running on custodian data | Retention policies suspended for custodians; IT written confirmation | S1 | Immediate IT ticket at P1 |
| Departed custodian account deprovisioned | Accounts converted to inactive/held before licence removal | S2 (S1 if key actor) | Restore from backup/tenant recovery if possible; document |
| Messaging apps / personal devices | Custodians instructed; tier-1 imaged where central | S2 | Written instruction + collection plan |
| No acknowledgment tracking | Every custodian acknowledged or escalated | S3 | Reminder cadence |
| Over-broad hold | Scope tied to issues and period | S4 | Narrow on refresh |
| Hold notice discloses privileged strategy | Neutral factual description of subject matter only | S3 | Redraft |
| Personal data conflict | Retention justified for legal claims; access restricted | S3 | Document basis (below) |
| Release never done | Release on closure with record | S4 | Close-out checklist |
| Opposing party preservation | Preservation demand sent where their data is critical | S3 | `disputes/legal-notice-drafter` |

## Legal standards by jurisdiction

**India**
- No codified civil "litigation hold" rule; the duty is practical and evidential. Courts may draw an adverse inference where a party withholds evidence it could produce — Bharatiya Sakshya Adhiniyam 2023 (BSA) s.119 illustration (g) (successor to Evidence Act s.114(g)) [verify current numbering].
- Destroying or concealing a document or electronic record to prevent its production as evidence is an offence — Bharatiya Nyaya Sanhita 2023 s.241; causing disappearance of evidence of an offence — BNS s.238. Destruction after a criminal complaint, FIR or regulator summons is therefore S1.
- **Electronic records**: to prove them as secondary evidence, BSA s.63 requires a certificate in the prescribed Schedule form (Part A by the person in charge of the device/system; Part B by an expert) identifying the record, the device and the hash. Preserve in a way that lets you certify later: record device details, collection method and hash values at collection. The requirement for a certificate under the predecessor s.65B was confirmed as mandatory in *Arjun Panditrao Khotkar v Kailash Kushanrao Gorantyal* (2020) 7 SCC 1 [verify applicability to s.63].
- Regulators (SEBI, CCI, ED, RBI, tax) may issue summons and directions to produce; non-compliance carries separate penalties — treat any summons as an immediate hold trigger.
- **DPDP Act 2023**: erasure duty when purpose is served (s.8(7)) does not override retention necessary for compliance with law; record the legal-claims basis for retention and restrict access [verify current; `IN-DPDP-03` for commencement].

**United States (federal)**
- Duty arises when litigation is reasonably anticipated [general principle — verify circuit authority].
- FRCP 37(e): if ESI that should have been preserved is lost because a party failed to take reasonable steps and cannot be restored or replaced, the court may order measures no greater than necessary to cure prejudice; adverse-inference instructions, dismissal or default require a finding of **intent to deprive** (37(e)(2)).
- Proportionality governs scope (FRCP 26(b)(1)). Consider 18 U.S.C. §1519 for destruction in contemplation of a federal investigation (criminal).

**England & Wales**
- Business and Property Courts: PD 57AD imposes preservation duties once a party knows it is or may become party to proceedings — suspend deletion, notify relevant employees and former employees in writing, and the legal representative must confirm steps taken (para 3–4) [verify paragraph numbers].
- Elsewhere: CPR Part 31 disclosure duties and the court's power to draw inferences.

**EU / UK GDPR**
- Retention for the establishment, exercise or defence of legal claims is a recognised basis: Art. 17(3)(e) (erasure exception), Art. 9(2)(f) (special category). Limit access; record in the RoPA.

## Hold notice template

```
PRIVILEGED & CONFIDENTIAL — LEGAL HOLD NOTICE
To: [custodian]          Matter: [code name]          Date: [ ]
Legal has determined that documents relating to [neutral subject, e.g. "the supply arrangement with
Party X from Jan 2023"] must be preserved because of [a legal matter / an inquiry]. Effective immediately:
1. Do not delete, alter, discard or overwrite any document or data relating to this subject, in any
   form — email, chat (Teams, Slack, WhatsApp, SMS), files, notes, voice messages, paper — including on
   personal devices or accounts used for work.
2. This overrides any retention schedule or clean-up routine.
3. Do not create new documents commenting on the matter except at Legal's request.
4. Tell Legal if you know of other people or places holding relevant information.
5. This notice continues until Legal releases it in writing, even if you change role or leave.
Acknowledge within 3 business days by [link/reply]. Questions: [named counsel].
Failure to comply may harm the organisation's legal position and may lead to disciplinary action.
```

## Output

Follow `_shared/output-contract.md`. Lead with `Hold: ISSUE NOW | ISSUE NARROW | NOT YET REQUIRED — <trigger + date>`. Add:

1. **Trigger record** — event, date, who knew, reasoning, test applied.
2. **Scope** — custodian table (tier, role, status: active/leaver/departed, systems), date range, data sources.
3. **IT preservation instructions** — per system, with owner and due time.
4. **Notice** — completed template.
5. **Tracking plan** — acknowledgment deadline, refresh date, joiners/leavers control, release criteria.

JSON actions: IT preservation (blocking, due within 24 h), notice issue, acknowledgments, third-party letters.

## Edge cases & pitfalls

- **Instruction ≠ preservation**: notices without system holds rely on human compliance; always do both.
- **Ephemeral messaging** (disappearing messages): instruct custodians to switch off and preserve; record that the setting existed.
- **Whistleblower / POSH**: protect identity in the notice; do not name the complainant to custodians.
- **Employee exits** during a hold: no device wipe, no mailbox deletion, no "clean handover" deletion; exit interview reminds of continuing obligation.
- **Privilege**: route the notice through counsel; do not describe strategy or merits.
- **Do not over-collect**: preservation is not collection; collect only when disclosure scope is known, except at-risk sources (leavers, personal devices).
- **Cross-border**: preserving in place is generally lawful; transferring to another country for review is a separate transfer question → `privacy/cross-border-transfer`.
