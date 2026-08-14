# Contracts CLM — end-to-end smoke test

A click-through that exercises the whole contract lifecycle after the
gap-closing program (PRs #270–#277). Run it on the deployed app. The
🧭 **Steps to execute** guide at the top of each contract tells you where
you are and what to do next at every point.

Test material: `docs/test-fixtures/contracts/msa-full-brightwave.txt` — a
full Master Services Agreement with real clauses, including three the
assessment should flag (uncapped Provider liability §9.2, one-sided
indemnity §8.1, evergreen auto-renewal §4.2).

---

## A. Our-paper journey (draft → sign → active)

1. **Draft with AI.** Contracts → **✨ Draft with AI**. Title "Acme MSA",
   type MSA, a counterparty, a value/term, and a brief (e.g. "Managed
   analytics, monthly billing, our standard liability cap and mutual NDA,
   90-day termination"). Submit → opens the new DRAFT.
   - _Guide shows:_ step 1 **current** — "Draft & finalize terms".
   - Confirm clauses were extracted (Clause analysis) and the **Review
     assessment** panel renders a verdict.
2. **Review assessment.** Open the **Review assessment** panel → run
   **🔍 Deep AI review**. Confirm it lists clauses with Accept/Negotiate/
   Reject + our position.
3. **Collaborate.** In **Collaboration**, post an **Internal** comment
   (business ↔ legal), then a **Shared** one. Confirm visibility chips.
4. **Submit for approval.** Use the approval wizard / "Submit for
   approval". Status → IN_REVIEW.
   - _Guide:_ step 2 **current** — "Internal approval", shows the ladder's
     current step.
5. **Walk the ladder.** Approve the AI Risk Review step, then Legal, then
   GC. Status → APPROVED.
6. **Request e-signature.** In **E-signature requests**, request a
   signature for each party (INTERNAL + COUNTERPARTY). Copy each one-time
   link, open `/sign/<token>` in a new tab, type the name + consent +
   **Sign**.
   - _Guide:_ step 3 **current** — "Signatures".
   - When both sign, status auto-advances to **EXECUTED**.
7. **Activate.** Lifecycle → **Active**. _Guide:_ 100% — "Active".
8. **Word doc.** Header **⬇ WORD** → a real `.docx` downloads.
9. **Integrity.** Contracts → **🛡 Integrity** tab → the contract is
   **Sealed**. (Now try to edit its value via ✎ EDIT — it's **locked**.)
10. **Obligations / renewals / key dates.** Confirm the contract's dates
    appear under **▦ Key Dates**; if auto-renew, it shows under
    **⟳ Renewals**.

## B. Third-party paper journey (their template → review → sign)

1. **Upload their paper.** Contracts → **⇤ Review 3rd-party** → **upload**
   `msa-full-brightwave.txt` (no copy-paste). Submit.
   - Creates a **3rd-party paper** contract, extracts clauses, starts the
     review ladder.
2. **Assessment = "what we're not comfortable with".** Open the **Review
   assessment** → **🔍 Deep AI review**. Confirm it flags the **uncapped
   liability**, **one-sided indemnity**, and **evergreen auto-renewal** as
   **Negotiate/Reject** with our positions.
3. **Redline.** Edit a flagged clause (Clause remediation / edit) → save →
   open **Version history** diff → confirm **word-level track changes**
   (green insert / red strikethrough) inline.
4. **Negotiate with the counterparty.** Mint a review link (Counterparty
   review), open it, post a comment as the counterparty, confirm it lands
   in the **shared** thread internally.
5. **Approve → sign → active** as in A4–A7.

## C. Renewals / integrity edge cases

- **Renewal trap.** On the seeded Snowflake MSA (auto-renew, 60-day
  notice), open **⟳ Renewals** → confirm it appears with an **Act by**
  date; record a **Renew** decision → expiry rolls forward.
- **Tamper detection.** On an executed, sealed contract, an admin edit to a
  material term is **blocked** (locked). To change terms, use **Amend**
  (Integrity drill-in) → the amendment reopens it for editing.

---

## Adding the test MSA as a template (optional)

To have the full MSA in the **template library** (not just for upload):
Templates → **+ New**, paste `msa-full-brightwave.txt`, kind = CONTRACT,
save. It's then selectable in **✎ New contract**.

## What "green" looks like

Every step's guide checklist reaches 100% and the contract ends **ACTIVE**,
**Sealed** in Integrity, with obligations/renewals tracked — all actions
chain-sealed in the audit log.
