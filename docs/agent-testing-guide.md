# AEGIS Intake — How to test each agent

> A focused, hands-on guide to exercising all 11 intake agents on the
> demo site: what to file, what the agent should catch, and how to
> read the result. Sample documents to upload live in
> [`docs/agent-test-fixtures/`](./agent-test-fixtures/) — download a
> `.txt`, attach it in **New Request**, and the agent reads the
> extracted text. For the broader end-to-end walkthrough see
> [`intake-demo-script.md`](./intake-demo-script.md).

## How the agent layer works (30-second model)

1. You file a ticket in **New Request** (type it, or attach a
   document — `.txt` / `.docx` / `.pdf`).
2. A deterministic router picks exactly **one** agent by reading the
   type + description (`canHandle`).
3. That agent produces a recommendation: **confidence · suggested
   action · drafted response · concerns · ⚖ risks checklist · playbook
   stamp**.
4. Nothing is sent. A human approves/edits/rejects in the **Triage
   Cockpit** — the only path from PENDING to APPROVED, and every choice
   is a chain-sealed audit row.

**Where to look:** file from **New Request**, then open the ticket in
**Triage Cockpit**. The right-hand **Agent Recommendation** panel is
what you're testing.

**Two live-vs-degraded notes:**
- With `ANTHROPIC_API_KEY` set, drafts are Claude-written and
  confidence varies. Without it, every agent shows an amber "AI review
  unavailable" banner at **0.4 / flag-for-review** but still ships its
  **deterministic** findings (deadlines, sanctions result, playbook
  selection, risk rating). That degraded floor is itself a feature to
  demonstrate.
- The deterministic parts (deadline extraction, sanctions screen,
  playbook selection, privacy rating, claim scan) do **not** depend on
  Claude — they're the parts that must never be wrong.

---

## The 11 agents — test recipe for each

Legend: **Type** = pick this in New Request (or "Other" and let the
router read the text). **Attach** = optional sample document.
**Expect** = what proves the agent works.

### 1. NDA Agent ◉  — template review + deviation detection
- **Type:** NDA Request
- **Attach:** `nda-deviation-mutual-cda.txt`
- **Or type:** `Need a mutual NDA with Acme Robotics for the pilot`
- **Expect (clean text version):** *approve & send*, high confidence,
  a prior-relationship check against the Counterparty table.
- **Expect (the deviation fixture):** downgraded to
  **flag-for-review** with concerns naming the deviations — perpetual
  confidentiality (no expiry), Indian/Hyderabad jurisdiction vs the
  Delaware playbook, residuals clause, same-day signature. Playbook
  chip: **NDA-PLAYBOOK · MNDA-v4.2**. *This is the exact case in your
  screenshot — the agent is catching that the attached CDA deviates
  from standard.*

### 2. Vendor Intake Agent ⬡  — sanctions screening
- **Type:** Vendor Due Diligence
- **Type text:** `Vendor: Globex Corp in Germany, new supplier onboarding`
- **Expect:** the concerns show the sanctions screen (OFAC SDN / EU /
  UK). A **hit → escalate** (can never auto-approve); an **unavailable
  list → flag-for-review** (never claims "clear"). Try a loaded name
  like `Vendor: Rosoboronexport in Russia` to force a hit.

### 3. Trademark Agent ⚖  — preliminary clearance
- **Type:** Trademark Check
- **Type text:** `Trademark clearance for "Zephyrion" in US and EU`
- **Expect:** a first-pass opinion whose risks say what it is **not** —
  not a registry search, common-law marks invisible, formal
  USPTO/EUIPO search still mandatory.

### 4. Contract Review Agent ◐  — generalist first-pass
- **Type:** Contract Review
- **Attach:** `contract-msa-uncapped.txt`
- **Expect:** issues ordered by **ACCEPT / NEGOTIATE / REJECT** bands.
  The uncapped-liability and first-party-indemnity clauses hit
  **REJECT**; the 15% renewal uplift and Net-30 hit NEGOTIATE. Always
  ends "attorney sign-off required before execution".

### 5. FAQ Agent ◎  — curated knowledge + hard handoff
- **Type:** Legal Question — General
- **Type text:** `What is our data retention period for customer data?`
- **Expect:** a KB answer ending with the "general guidance, not advice
  for your specific facts" line.
- **Negative test:** `What is our data retention period — we are in a
  lawsuit and got a subpoena` → the FAQ agent **refuses** (dispute /
  subpoena wording) and the ticket routes onward. Proves the guardrail.

### 6. Policy Q&A Agent ▤  — policy corpus
- **Type:** Legal Question — General
- **Type text:** `What does our travel policy say about business class?`
- **Expect:** an answer citing the policy corpus (distinct from the FAQ
  KB).

### 7. Privacy Assessment Agent ◉  *(new)* — DPIA triage
- **Type:** Other (or a "Privacy Review" type if you configured one)
- **Type text A:** `Need a DPIA for the new analytics tool processing customer data`
  → flag-for-review; regime triggers listed as "verify applicability";
  a **GAPS** list of what you didn't say (retention, volume,
  processors, lawful basis).
- **Type text B:** `Launching a wellness portal storing employee health records`
  → **HIGH rating → escalate** (sensitive-category data always goes to
  the senior counsel / DPO path). The rating is deterministic
  (category × volume × transfer × novelty).

### 8. Marketing Review Agent ◭  *(new)* — claims review
- **Type:** Other (or a "Marketing Review" type)
- **Type text A:** `Please review the promotional material for the spring campaign`
  → **fast-track** route, no claim signals (still human-approved).
- **Type text B:** `Ad copy: our device prevents infections, FDA-approved`
  → **escalate** — regulated/therapeutic claims are **never**
  agent-cleared; the matched wording is cited.
- **Type text C:** `Social media campaign: the best platform, #1 in the market`
  → **revise** — superlatives flagged for substantiation.

### 9. Notice Management Agent ⚑  *(new)* — deadline extraction
- **Type:** Legal Notice (or Other)
- **Attach:** `breach-notice.txt`
- **Or type:** `Notice of breach received — cure within 30 days of receipt.`
- **Expect:** each **deadline extracted deterministically** (never by
  the LLM) with the **exact source text cited** beside it; the ticket
  **SLA auto-tightens** to the shortest deadline (watch the SLA change)
  with an `intake.ticket.sla_tightened` audit row; breach/regulatory →
  **escalate**. The acknowledgment draft is deliberately minimal and
  rights-reserving. Try `Show cause notice from the regulator — respond
  within 14 days` for the regulatory path.

### 10. Litigation Agent §  *(upgraded)* — cited case brief
- **Type:** Litigation (or Other)
- **Type text:** `We received a demand letter from Meridian Corp regarding the supply contract, 20-day deadline`
- **Expect:** a **cited case brief** — the adverse party is resolved
  against the shared Counterparty entity (prior matters / prior
  agreements cited as record facts); an **over-inclusive legal-hold
  trigger** with a proposed scope (the agent never places the hold);
  and a mandatory **GAP ANALYSIS** ("no documents found ≠ no documents
  exist"). If the party has no record, the brief says so out loud.

### 11. Contract-Type Specialist ◈  *(new)* — per-type playbooks
- **Type:** Contract Review
- **Attach:** `licensing-exclusive.txt`
- **Or type:** `Exclusive licensing agreement for the EU territory, 5-year term`
- **Expect:** the first concern **names the playbook applied**
  (Licensing v1, its owner, review date, and the text it matched on) —
  the approver's first check is the playbook selection itself. The
  **exclusive** grant fires an **escalate** gate from the approval
  matrix, decided in code before the LLM runs. Try
  `Clinical trial agreement for study AX-201` → clinical **always**
  escalates. Type a bespoke contract with no matching playbook
  (`bespoke barter arrangement`) → it **falls through** to the
  generalist Contract Review agent (agent 4).

---

## Reading the recommendation panel (what each part tells you)

| Panel element | What it proves |
|---|---|
| **Confidence %** | The model's self-rated certainty (0.4 = degraded/no-AI). |
| **Recommends …** | approve-and-send / flag-for-review / escalate — the agent's suggested action, never auto-executed. |
| **Concerns (N)** | The deterministic + reasoned issues the approver must confirm. For the new agents these carry the cited evidence (deadline source text, matched claim, playbook selection). |
| **⚖ Risks to weigh before approving** | The doc-mandated per-agent risk checklist — what this class of agent can systematically miss. |
| **Playbook chip** | Which standard + version was applied — every review is reproducible. |
| **Sources & precedents** | The KB entries / templates / prior documents the agent relied on. |

## Turning the whole loop into governance evidence

After you approve or reject a few, open **Audit Log**
(`/audit-log`, admin nav): every agent recommendation and every
approval keystroke is a **cryptographically chained** row. Run the
verify action — nothing you did in the test can be silently rewritten.
That chain is the "conservative AI governance" claim made concrete.

## Attaching documents — note

When you attach a document, the New Request form extracts its text and
the agent reads the **full** text (it must, to review the contract).
In the Cockpit the attached-document text is now **collapsed behind a
"▸ view text" toggle** so the reviewer sees your typed request first,
not a wall of contract text — click the toggle to read the full
extracted document.
