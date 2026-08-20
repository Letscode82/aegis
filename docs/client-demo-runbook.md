# AEGIS — Client Demo & Test Runbook

A single walkthrough that (a) demos the platform end-to-end for a client and
(b) doubles as a QA checklist. Each scene lists **what to click**, **what to
say**, and **what you should see** (the pass criterion). The spine is the
"investigation journey": an allegation letter becomes a legal hold, a
collection, an AI-validated review, and a defensible production — all on one
brain, every AI action gated by a human and sealed on the audit chain.

Estimated time: **20–25 min** for the full spine; **8 min** for the short
version (scenes 1, 4, 6, 9).

---

## 0. Setup (once)

```bash
# 1. Bring up Postgres (local) or point DATABASE_URL at Neon
docker compose up -d           # local; or set DATABASE_URL to Neon

# 2. Apply all migrations (includes review profiles, validation runs, investigations)
pnpm --filter @aegis/db exec prisma migrate deploy

# 3. Seed the demo dataset (idempotent)
pnpm --filter @aegis/db run db:seed

# 4. Run the app
pnpm dev                       # apps/web on http://localhost:5173
```

**Login.** With no `AUTH0_*` env set, the app runs as the seeded admin
(zero-config). To demo a non-admin lens, set `DEV_USER_EMAIL=<one of the
seeded role users>`.

**AI mode.** Set `ANTHROPIC_API_KEY` to light up live Claude calls in the
intake classifier. Everything eDiscovery/review/investigation-side runs the
**deterministic** engine by design (the 4d AI freeze), so the demo is fully
reproducible **without** an API key. Where you see "✨ Draft with AI" or "Run
AI review", it is the deterministic engine today; the Claude path is wired
behind the same interface.

**M365.** Collection, custodian discovery, and the Purview estimate use the
**mock** M365 client unless a tenant is connected at `/admin/m365`. The mock
returns representative, stable data so the demo works with no tenant. With a
real tenant connected, the same buttons hit Microsoft Graph.

> Pass criterion for setup: the left nav shows **Investigations**,
> **eDiscovery**, **Matter Management**, **Privacy · DSAR**, and **Legal
> Intake**. The seeded investigation *Project Falcon* and the *Snowflake MSA*
> matter both exist.

---

## Scene 1 — Investigations: allegation → plan → matter  (INV-1)

**Click.** Left nav → **Investigations**. You'll see the seeded *Project
Falcon — Trade-Secret Misappropriation*. Click **+ New investigation**.

- Title: `Project Atlas — Kickback Allegation`
- Source: paste an allegation, e.g. *"Anonymous tip alleges a procurement
  manager steered contracts to a vendor in exchange for payments, and
  discussed pricing and invoices over email and Teams before the last two
  renewals."*
- Click **✨ Extract issues & draft plan**.

**Say.** "From the raw letter, AEGIS extracts the issue codes, drafts the
six-step investigation plan, suggests which custodians matter and why, and
proposes a collection scope — before anyone has opened a matter."

**See (pass):** issue chips (e.g. *Contract / commercial*, *Regulatory /
compliance*, *Financial*), a numbered plan, custodian hints with rationales,
and a scope sentence. Click **Open investigation →**.

**See (pass):** a success card with a real matter number (`M-INV-2026-####`).
Click **Custodians** on the row to show suggested custodians (mock roster or,
if connected, live Graph directory).

---

## Scene 2 — Preservation: issue a legal hold  (4b/4c)

**Click.** From the investigation success card → **Go to matter →** (or nav →
**Matter Management** → open the investigation matter) → **Legal Hold** tab →
**+ New hold** (or **+ New hold (guided)** for the 5-step wizard).

**Say.** "One click preserves. AEGIS records the trigger, issues the hold,
notifies custodians, and — every step — writes a cryptographically chained
audit row. The defensibility scorecard scores the hold on six dimensions in
real time."

**See (pass):** the hold workspace — header strip with a **defensibility
score**, custodians panel, right-rail Defensibility / Timeline / Notices.
Issuing requires a recorded trigger (the pre-flight confirmation blocks
otherwise) — that's the conservative-governance guardrail, on purpose.

---

## Scene 3 — Collection & the eDiscovery hub  (eDiscovery / CW-1 / CW-2)

**Click.** Nav → **eDiscovery**. This is the cross-source Collect & Review
dashboard — every collection (holds, DSARs, investigations) in one place with
lifecycle stage + review progress.

**Click.** **+ New collection** → enter custodian emails (one per line).
- **Estimate scale (Purview)** → shows tenant-wide **item count / data volume
  / mailboxes / sites** *before* pulling (CW-2). With no tenant it's a
  representative `SIMULATED` estimate.
- **Collect →** pulls per-user mail + files. CW-1 means the **full email body
  and text-based attachment content** are pulled — searchable and
  highlightable, not just filenames.

**Say.** "Two collection modes: per-user pull for investigations and DSARs, and
a Purview tenant-scale estimate for large document matters — same interface,
routed behind the M365 client."

**See (pass):** the new collection lands in the hub with a stage badge and
opens the unified stage workspace: **Cull → Review → Validate → Batches →
Produce**.

---

## Scene 4 — Review instructions & profiles  (AIR-2)

**Click.** Open the collection → **Review** stage → the setup panel (gear /
"criteria").

- Pick a **Review profile** from the dropdown (versioned instructions), **or**
- Click **✨ Draft with AI**, describe the matter, and it drafts the
  responsiveness criteria + issue codes for you to edit.
- Click **Save as profile** to freeze a reusable, versioned instruction set.

**Say.** "Review instructions aren't retyped every matter. They're a
versioned, auditable asset — every edit freezes an immutable version, so you
can always prove exactly which instructions an AI review ran under."

**See (pass):** criteria + issue chips populate; saving creates a profile that
appears in the dropdown with a version number.

---

## Scene 5 — Run the AI review (multi-dimension, routed)  (AIR-1/3)

**Click.** In the Review stage → **Run AI review**.

**Say.** "The engine tags every document across five dimensions — responsive,
privileged, PII, key-document, redaction — each with a confidence and a
**citation** (the supporting passage). It then routes: auto-cull, reviewer, or
attorney. Low-confidence or **uncited-high-confidence** items are forced to a
human — the AI never gets to be confidently wrong without a citation."

**See (pass):** a toast summarizing scored counts + route breakdown
(attorney / reviewer / auto-cull). Documents now show route pills, confidence,
and citations. Code a few with the keyboard (r = responsive, p = privileged).

---

## Scene 6 — Validate before you trust it  (AIR-4)  ⭐ the differentiator

**Click.** Review stage → code ~10–15 sampled docs first, then go to the
**Validate** stage → set a sample size → **Start validation pilot**.

1. It draws a **stratified sample** across route × confidence band and marks
   them. Code those sampled documents in **Review** (they're the ground truth).
2. Back in **Validate** → **Compute metrics**.
3. Read **recall / precision (with 95% confidence intervals) / F1 / overturn**
   + the confusion matrix — the AI measured against human judgment.
4. If the numbers hold → **Apply at scale →**.

**Say.** "This is the piece that makes AI review defensible in front of a
court or regulator. We don't ask you to trust the AI — we measure it against a
human-coded sample, show you recall and precision with confidence intervals,
and only then apply its decisions to the rest. And when we apply at scale, the
**confident, cited** documents get the AI's call, while uncited, low-confidence,
and privileged documents **fail closed** to a human. A person clicks the
button — the batch approval is the human gate."

**See (pass):** metric stat cards, confusion matrix, and after Apply-at-scale:
`Applied N · M failed closed to human review`. Every step is on the audit
chain (`reviewset.validation.*`).

---

## Scene 7 — Cull, batch, produce  (ECA / batching / production)

**Click.** **Cull** stage → apply thread + near-duplicate suppression (see the
exclusion log). **Batches** → assign a batch to a reviewer, run QC. **Produce**
→ set a Bates prefix → produce; the privilege log + production manifest build
from the coding.

**See (pass):** exclusions logged with reasons; a batch flows DRAFT → …→
COMPLETE; production stamps Bates and lists a privilege log.

---

## Scene 8 — DSAR (same engine, privacy lens)  (PRIV-1)

**Click.** Nav → **Privacy · DSAR** → open the seeded DSAR (Priya) → **Review**
workflow. Same Collect → Review → **Validate** → Produce stages, same profiles,
same validation loop — proving "one brain" across investigations and privacy.

**See (pass):** the DSAR review workspace shows the identical stage stepper
including **Validate**, driven by the shared `@aegis/review` engine.

---

## Scene 9 — Defensibility: the audit chain  (D11)

**Click.** Nav → **Admin → Audit Log** → **Verify chain**. Optionally **Export**
the defensibility report.

**Say.** "Every state change across every module — hold issuance, each AI
review run, each validation step, each coding decision — is a
cryptographically chained, append-only audit row. Tampering is detectable even
by a database superuser, because verification recomputes the hashes. This is
the same evidentiary spine under intake, matters, holds, contracts, DSARs, and
eDiscovery."

**See (pass):** chain verification reports intact; the export produces a JSON +
PDF with per-row canonical content.

---

## QA checklist (regression pass)

| # | Area | Action | Expected |
|---|------|--------|----------|
| 1 | Investigations | Preview a source letter | Issues + plan + custodian hints render; deterministic (same input → same output) |
| 2 | Investigations | Open investigation | Matter created (type INVESTIGATION, OPEN, numbered); `investigation.created` audit row |
| 3 | Investigations | Suggest custodians | Roster returns (mock) or Graph users (connected) |
| 4 | Legal Hold | Issue without trigger | Blocked with pre-flight warning |
| 5 | Legal Hold | Issue with trigger | Hold ISSUED→ACTIVE; defensibility score renders; chain rows written |
| 6 | eDiscovery | Purview estimate | Item/size/mailbox/site totals; `SIMULATED` badge with no tenant |
| 7 | eDiscovery | Collect | Items land with full body + attachment text; families/threads assigned |
| 8 | Review | Draft with AI | Criteria + issue codes populate |
| 9 | Review | Save as profile / apply profile | Profile appears with version; applying seeds criteria+issues |
| 10 | Review | Run AI review | Routes summary; citations + confidence on items |
| 11 | Validate | Start pilot | Stratified sample marked; status AWAITING_CODING |
| 12 | Validate | Compute metrics | recall/precision/F1/overturn + CIs + confusion matrix |
| 13 | Validate | Apply at scale | applied vs fail-closed counts; uncited/low-conf/privileged stay pending |
| 14 | Cull | Thread/near-dup cull | Exclusions logged with reasons |
| 15 | Produce | Bates production | Bates prefix stamped; privilege log built |
| 16 | DSAR | Review workflow | Same stages incl. Validate; shared engine |
| 17 | Audit | Verify chain | Intact; export produces JSON+PDF |
| 18 | Permissions | Log in as `viewer` | Read-only; mutation buttons hidden/403 |

---

## Talking points (why it's different)

- **One brain.** The same collection → review → validate → produce engine
  serves investigations, legal holds, and DSARs. Not three bolt-on products —
  one shared `@aegis/review` engine and one `@aegis/db`.
- **Defensible AI, not black-box AI.** Every AI tag carries a citation and
  confidence; the validation loop measures recall/precision against a human
  sample; apply-at-scale fails closed. A human approves every state change and
  it's on a tamper-evident chain.
- **Deterministic floor.** With no API key and no tenant, the whole thing
  still runs — the AI degrades to an explainable deterministic engine and M365
  to a mock. Demos never break; production swaps the implementation behind the
  same interface.
