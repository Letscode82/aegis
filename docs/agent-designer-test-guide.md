# AEGIS — Agent Designer + Contracts test guide

What changed since yesterday, and exactly how to test each piece. Everything
below runs against the demo seed with the approve/edit/reject human gate
intact.

## 0. One-time setup

```bash
pnpm install
docker compose up -d              # local Postgres on :5432
pnpm --filter @aegis/db prisma migrate deploy
pnpm --filter @aegis/db db:seed   # seeds 11 agents + packs + demo data
pnpm dev                          # app on http://localhost:5173
```

- Sign in as the seeded admin (Alex Nguyen) — has `admin:agents:manage`,
  `contracts:approve`, and the intake approve permissions.
- To preview through another role: set `DEV_USER_EMAIL=<seeded test user>`.
- AI: set `ANTHROPIC_API_KEY` for live Claude drafts. Without it the agents
  fall back to their deterministic/degraded path — **still testable**, the
  recommendation just says "AI unavailable".

**The one rule that never bends:** every agent recommendation lands as a
**PENDING** decision and needs the human **approve** keystroke in the
Cockpit. No Designer edit, threshold, or prompt can remove that gate.

---

## 1. Changes made since yesterday (what you're testing)

| # | Change | Where to see it |
|---|---|---|
| A | **Agent Designer (oKF)** — every aspect of all 11 agents is editable data | Agents console → **⚙ Configure** |
| B | **Clause library unified** (#233) — Contracts 📖 Playbook and the Contract Review agent read **one** store | Contracts → 📖 Playbook ↔ Designer → Knowledge |
| C | **Templates unified** (this change) — Contracts 📄 Templates and the drafting agents read **one pack per agent** | Contracts → 📄 Templates ↔ Designer → Knowledge |
| D | **Trademark agent is functional** — real knock-out screen (phonetic + visual + NICE class) + USPTO/EUIPO/WIPO integration | File a trademark ticket |
| E | **Workflows lead with the ladder** (intake form optional/collapsed) | Workflows editor |
| F | **Agent Designer stuck-on-Loading fixed** (lazy-seed) | ⚙ Configure now always opens |
| G | Kanban tab removed | Intake — no Kanban tab |

---

## 2. Agent Designer — every aspect is configurable (change A, F)

**Open:** Agents console → any agent card → **⚙ Configure**. The Designer
opens with a tab per aspect: **Identity · Routing · Model · Prompt ·
Knowledge · Output & thresholds · Risks · Governance**.

Test the live-edit loop on **Contract Review Agent**:

1. **Prompt tab** → tweak the system template (e.g. add "Pay special
   attention to data-processing terms.").
2. **Output tab** → lower "auto-send at confidence" or change the default
   action.
3. **Preview** → dry-runs the definition against a sample ticket, no save.
4. **Publish** → writes an immutable version, chain-sealed audit row.
5. **Version history → Revert** → restores the prior version.
6. **Export / Import oKF JSON** → round-trips the whole definition.

**Governance check (must hold):** after publishing *any* config, file a
contract ticket (§4) → the Cockpit rec is still **PENDING** and still needs
the approve keystroke. Try to make it auto-send by cranking thresholds — it
still gates. That's the non-negotiable harness.

---

## 3. The unifications — prove it's ONE store (changes B, C)

### 3a. Clause library (📖 Playbook)

1. Contracts repository → **📖 Playbook**. You should see **10 clauses**
   (Limitation of liability, Indemnification, … IP) — **not an empty panel**
   (that empty-panel bug is what B fixed).
2. Edit a clause — e.g. change **Payment terms** standard text — and Save.
3. Agents console → Contract Review → **⚙ Configure → Knowledge tab** →
   open the `contract-clauses` pack → the **same edit is there**. One store,
   two editors.
4. Reverse it: edit the clause in the Designer Knowledge tab → reopen 📖
   Playbook → the change shows. ✅

### 3b. Templates (📄) — one pack per agent

1. Contracts repository → **📄 Templates**. You should see **4 templates**:
   `mnda-v4.2` (NDA), `msa-v2` + `dpa-v1` (CONTRACT), `notice-nonrenewal`
   (NOTICE).
2. Each template kind is owned by the agent that drafts from it:
   - NDA → **nda-agent** (`nda-template` pack)
   - CONTRACT → **contract-review-agent** (`contract-templates` pack)
   - NOTICE → **notice-mgmt-agent** (`notice-templates` pack)
3. Edit the **MNDA-v4.2** body on the 📄 Templates screen and Save →
   version bumps (v1 → v2).
4. Agents console → NDA Agent → **⚙ Configure → Knowledge tab** → the
   `nda-template` pack shows the **same edited body**. One store.
5. **Non-regression check:** file an NDA ticket (§4) → the NDA agent's draft
   uses the full MNDA template body (your edit flows straight into what the
   agent produces).

---

## 4. Per-agent workflow tests — file a ticket, watch the agent, approve

**How to file:** Intake → **New Request** → paste the description below →
Submit. Then open **Triage Cockpit** → the agent's recommendation appears
as PENDING → review → **Approve** (or Edit / Reject).

| Agent | File a request that says… | Expect |
|---|---|---|
| **NDA** | "Need a **mutual NDA** with **Snowflake** for a data pilot." | Draft from MNDA-v4.2 **+ surfaces the executed prior NDA on file with Snowflake** (real counterparty lookup). Clean → approve-and-send. |
| **NDA (deviation)** | "NDA with Acme but **strike the non-solicit** and make confidentiality **perpetual**." | Flags playbook deviations → **flag-for-review** (not auto-send). |
| **Contract Review** | "Please **review this MSA** — attach/paste contract text with a liability + indemnity clause." | Clause-by-clause first-pass vs the 📖 Playbook, deviations with severity, **attorney sign-off required**. (Runs the oKF definition you can edit.) |
| **Contract-Type Specialist** | "Review this **DPA** / **SaaS** agreement." | Picks the matching type playbook, reviews against it. |
| **Trademark** | "**Trademark clearance** for the brand name **'Aurora'** for software." | **Real knock-out screen** — phonetic + visual + NICE-class hits against the 30 seeded marks; always says a formal USPTO/EUIPO/WIPO search is mandatory. |
| **Vendor Intake** | "Onboard **new vendor** [use a name from the seeded sanctions list]." | Sanctions/denied-party screening posture; a hit escalates. |
| **Litigation** | "We received a **demand letter / subpoena** from [counterparty]." | Cited case brief (7 sections + gap analysis); **flags the legal-hold trigger** but never places a hold; always attorney-reviewed. |
| **Notice Mgmt** | "Inbound **notice** with a **30-day cure period**." | Classifies, extracts every deadline with source quote, drafts minimal ack. |
| **Privacy** | "**DPIA** for processing biometric data, EU→US transfer." | Special-category + transfer + DPIA-threshold triage. |
| **Marketing** | "Review this **ad claim**: 'clinically proven #1'." | Flags regulated/superlative claims; fast-tracks pre-cleared ones. |
| **FAQ / Policy Q&A** | "What's our policy on…?" | Answers from the approved KB / policy corpus, or hands off. |

**Every one:** the rec is PENDING → approve keystroke required → an
`AuditLog` row is written (visible in Audit Log). That's the product.

> Note: Trademark + Contract Review are always visible. If you're on a
> production build and want the demo-only mock agents surfaced, set
> `NEXT_PUBLIC_AEGIS_DEMO_AGENTS=true`.

---

## 5. Document workflow regression (NDA + Contract) — must still work

The agent-picks-up-task-from-loaded-knowledge-and-delivers flow:

1. **NDA end-to-end:** file the NDA/Snowflake ticket (§4) → Cockpit shows
   the drafted NDA → **Approve** → response sent, audit row written.
2. **Contract review end-to-end:** file the MSA review ticket with document
   text → Cockpit shows the clause analysis drafted against the (now
   unified) 📖 Playbook → **Approve** → audit row written.
3. **Counterparty portal (CTR):** the seeded Acme NDA has a live review link
   at `/contract-review/demo-acme-nda-review-2026` — open it to walk the
   external negotiation portal.

Automated proof this still passes:
```bash
pnpm --filter @aegis/intake test     # 654 tests incl. document-workflow regression
pnpm --filter @aegis/contracts test  # 42 tests
```

---

## 6. Quick smoke (no clicking)

```bash
pnpm turbo run typecheck lint --filter=@aegis/contracts --filter=@aegis/intake
pnpm --filter @aegis/intake test
pnpm --filter @aegis/contracts test
```

All green = the Designer, both unifications, and every agent workflow are
wired correctly.
