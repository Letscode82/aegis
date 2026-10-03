---
name: ip-ip-ownership-audit
description: >-
  Confirms the chain of title to IP: that rights created by employees, contractors, founders and acquisitions have
  actually vested in or been assigned to the company — present assignments vs agreements-to-assign, contractor gaps,
  pre-incorporation and founder IP, open-source/third-party encumbrances, and the registrations/recordals that perfect
  title. Use for a title audit (diligence, financing, pre-deal) or to fix a gap. Not for whether a single work is
  protectable → ip/copyright-assessment; not for open-source code compliance → ip/open-source-review.
module: ip
version: 1.0.0
jurisdictions: [global, IN, US]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of audit (assess chain of title across the IP), gap-fix (remediate specific title defects) or deal-readiness (confirm title for a financing/M&A/licensing deal).
  - name: ip
    required: false
    description: The IP in scope (code, patents, trademarks, designs, content, data) and how it arose — employees, contractors, founders, acquisitions, collaborations.
  - name: documents
    required: false
    description: Employment/IP-assignment agreements, contractor SOWs, founder assignments, acquisition/transfer docs, and any registration/recordal records.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [ip/copyright-assessment, ip/open-source-review, ip/trademark-clearance, corporate/ma-due-diligence, contracts/amendment-assignment-novation]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# IP Ownership & Assignment Audit

Takes a company's IP and confirms it actually owns what it thinks it owns: that every creator's rights have vested or been assigned, that contractor and founder gaps are closed, and that title is perfected by the right registrations/recordals. The deliverable is a chain-of-title assessment with the specific gaps and fixes, not a general "IP looks fine".

## When to use / not use

- Use: an IP title audit for diligence, financing, or a pre-deal check; confirming employee/contractor/founder IP has vested; finding and fixing assignment gaps; verifying registrations and recordals perfect title.
- Hand off: whether a particular work is protectable at all → `ip/copyright-assessment`; open-source-licence obligations/encumbrances in code → `ip/open-source-review`; trademark availability/clearance → `ip/trademark-clearance`; the broader acquisition diligence around the IP → `corporate/ma-due-diligence`; drafting the assignment/novation instrument to fix a gap → `contracts/amendment-assignment-novation`.

## Inputs to collect first

1. The **IP in scope** by type (code, patents, trademarks, designs, copyright works, data) and the key assets.
2. **How each arose** — employees, contractors/agencies, founders, acquisitions, collaborations, grants.
3. The **documents**: employment/IP-assignment agreements, contractor SOWs, founder assignments, acquisition/transfer deeds, and registration/recordal records.
4. The **purpose** (routine audit vs a specific deal) and the governing law(s).

## Method

1. **Map every source of IP to a title basis.** For each material asset, identify who created it and the document that vests/assigns it to the company. The audit is a reconciliation: creator → assignment → company → registration.
2. **Employees: present assignment vs statutory default.** Confirm employment agreements contain a **present assignment** ("hereby assigns") of IP created in the course of employment, not a mere agreement to assign later; check the jurisdiction's default (some vest employee works in the employer, some don't) and any employee-invention compensation rules `[verify current]`.
3. **Contractors/agencies — the classic gap.** Work by contractors, agencies, and freelancers generally stays with **them** absent a **written assignment**; a "work for hire" label doesn't transfer title in many jurisdictions. Flag every contractor-created asset without a present assignment — this is the most common and dangerous defect.
4. **Founders and pre-incorporation IP.** Check founder and pre-incorporation IP (built before the company existed, or on the side) was assigned **in** to the company — unassigned founder IP is a standard financing blocker.
5. **Acquisitions and collaborations.** Verify acquired IP came with a valid chain of assignments (not just a bill of sale), and that joint-development/collaboration IP ownership and licence-back terms are clear.
6. **Agreement-to-assign vs present assignment.** Distinguish a binding present assignment from a mere promise to assign (which may need a further act, can fail on insolvency, or be unenforceable) — convert agreements-to-assign into executed assignments.
7. **Perfect title with registrations/recordals.** Confirm registered rights (patents, trademarks, designs) are recorded in the **company's** name and that assignments are **recorded** with the registry where required to be enforceable against third parties; watch stamping where applicable (India) `[verify current]`.
8. **Screen for encumbrances.** Security interests/liens, exclusive licences out, open-source obligations, and third-party/background IP that limit clean ownership → `ip/open-source-review`.
9. **Score against the Checks table** and set a determination: **CLEAN TITLE / GAPS TO FIX / TITLE DEFECTIVE**, with each gap's fix.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Contractor IP without a written assignment | Present assignment from every contractor | S1 | Obtain assignments; close the gap |
| Employee agreement lacks a present assignment | "Hereby assigns" clause + statutory default checked | S1 | Add/execute present assignments `[verify current]` |
| Founder / pre-incorporation IP not assigned in | Founder IP assigned to the company | S1 | Execute founder assignments |
| Agreement-to-assign treated as transfer | Present assignment, not a promise | S2 | Convert to an executed assignment |
| Acquired IP chain of title broken | Full assignment chain verified | S1 | Trace/repair the chain |
| Registrations not in the company's name | Registered rights + recordals in company name | S2 | Record the assignments `[verify current]` |
| Assignment not recorded/stamped where required | Registry recordal + stamping complete | S2 | File the recordal; stamp |
| Encumbrances (liens, exclusive licences, OSS) missed | Security/licences/OSS screened | S2 | Flag and quantify the encumbrance |
| Joint/collaboration IP ownership unclear | Ownership + licence-back terms confirmed | S2 | Clarify the collaboration terms |

## Output

Lead with `Title: CLEAN | GAPS TO FIX | DEFECTIVE — <IP/entity> — <top defect>`. Then the output contract. Add:

- **Chain-of-title map**: asset · creator/source · assignment basis · registration status.
- **Gaps**: contractor/employee/founder/acquisition defects, each with the fix.
- **Perfection**: registrations/recordals/stamping outstanding.
- **Encumbrances**: liens, exclusive licences, OSS, background IP.
- One JSON finding per gap with `category: "ip-ownership"`.

## Edge cases & pitfalls

- **Contractor "work for hire" myth**: the label does not transfer copyright in many jurisdictions — without a written assignment, the contractor owns the deliverable the company paid for.
- **Agreement-to-assign ≠ assignment**: a promise to assign can fail to pass legal title (and fail on insolvency) — only an executed present assignment is safe.
- **Unassigned founder IP**: IP founders built before or outside the company is a recurring financing/M&A blocker — assign it in early.
- **Registry name mismatch**: patents/trademarks registered in a founder's or old entity's name, or assignments never recorded, leave title unenforceable against third parties.
- **Hidden encumbrances**: an exclusive licence-out or a copyleft obligation can hollow out "ownership" the balance sheet assumes — screen for them.

## References

- Volatile facts: cite `[verify current]` where an employee-invention default, recordal requirement, or stamping rule is load-bearing; `IN-STAMP-01` where Indian stamping applies to an assignment.
- The governing IP statutes on employee/contractor ownership and assignment formalities; registry recordal rules (patents/trademarks/designs); and the company's assignment and acquisition documents.
