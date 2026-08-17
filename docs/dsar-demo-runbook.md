# DSAR end-to-end demo runbook (client meeting)

Shows a **new DSAR handled entirely inside AEGIS against your live E5 tenant**:
pick a real data subject, auto-discover their data sources, collect from
Microsoft 365, AI-review for relevance behind a human gate, validate, and
deliver — every step chain-sealed.

Two modes:
- **Live tenant** — with M365 connected at `/admin/m365`, discovery + search hit
  your real (seeded) data. Marcus Reid (`marcus.reid@…onmicrosoft.com`) and the
  seeded mailbox/OneDrive/Teams content show up.
- **Simulated** — with no tenant, every M365 step returns representative data and
  is labelled "simulated", so the flow still demos anywhere.

## 0 · Prerequisites (once)

- **M365 connected** at `/admin/m365` (app-only credentials). Verify shows a
  green "Connected · tenant …".
- **App-registration permissions (critical for pulling documents).** DSAR
  collection reads the subject's own mailbox + OneDrive via the per-user Graph
  endpoints (`/users/{id}/messages`, `/users/{id}/drive/root/children`), which
  need these **Application** permissions with **admin consent** granted:
  - `Mail.Read` — mailbox content
  - `Files.Read.All` — OneDrive / SharePoint files
  - `User.Read.All` — resolve email/UPN → user
  Note: the unified Microsoft Search (`/search/query`) does **not** return
  mail/chat app-only, which is why AEGIS reads the per-user endpoints instead.
  If a source returns 0 while "Connected", the server log names the missing
  scope; grant it + admin-consent and retry.
- Data subject exists in the tenant with content (you've seeded Marcus Reid).
- Optional for real email delivery: `RESEND_API_KEY` (or `SENDGRID_API_KEY`) +
  `MAIL_FROM` + `APP_BASE_URL` set on the deployment.
- Sign in as a user with `privacy:dsar:read` + `privacy:dsar:fulfill` (admin/gc/
  legal_ops).

## 1 · File the request from a real tenant user  (Gather)

1. Left nav → **Privacy · DSAR** → **+ New request**.
2. In **🔍 Search your Microsoft 365 directory**, type `Marcus` → pick
   **Marcus Reid**. Name + email auto-fill from Entra.
3. Type = **Access**, Jurisdiction = **EU**. (Criteria pre-fills; edit if you
   like.) → **Create request** → the workspace opens.

*Talking point: the subject is a real tenant identity, not free text — the same
directory lookup legal hold uses for custodians.*

## 2 · Verify identity  (Authenticate)

**Identity** tab → set a method (e.g. "verified employee") → **Mark verified**.
The stepper advances past Identity; collection is now unlocked (a request can't
leave Identity until VERIFIED — governance).

## 3 · Map the data sources  (Collect — inventory)

**Data inventory** tab:
- **⚡ Discover from Microsoft 365** → enumerates Marcus's *real* data sources
  (Exchange Online, OneDrive, Teams, SharePoint) and adds them to the checklist.
- **⤵ Seed from ROPA** → adds the Article-30 systems you declared you process
  data in (DataStream AI, Zendesk, …) — the "one brain" join between your ROPA
  and the live request.
- Mark **Found / Retrieve** per row as you gather.

*Talking point: the checklist is the live personal-data inventory for this
subject, populated from the tenant AND your processing records.*

## 4 · Collect the records  (Collect — content)

**Review** tab → **⚡ Search Microsoft 365 (E5 / Purview)**:
- Toggle sources (Mailbox / OneDrive / Teams / SharePoint).
- **Preview** → per-source hit counts (new vs. already in queue) — the
  collect-&-cull gate.
- **Search & collect** → the hits land in the review queue.
- (Optional) **▸ Advanced (KQL)** → type a plain-language ask → **Draft** →
  editable KeyQL → collect a scoped set.

## 5 · AI relevance review, human-gated  (Review)

- **✨ Run AI relevance review** → each record is scored RELEVANT / NOT / UNCLEAR
  with a one-line rationale (degrades to a deterministic screen if the AI key
  isn't set — still explainable).
- For each item: **Confirm** the AI, or **Mark relevant / Exclude** (override),
  and **Redact** where needed. *The AI never finalises — a human decides every
  item before it can enter the response package.*
- The **Review validation** strip shows recall / precision (95% CI) + overturn
  of the AI vs your decisions.

## 6 · Deliver  (Deliver)

**Delivery** tab:
- **Assemble & deliver** → builds the package from confirmed, relevant items
  (redacted where flagged), mints a **login-less portal link**, and emails the
  subject (or logs it if no mailer configured). Status → **Fulfilled**.
- **⬇ Defensibility export** → self-contained JSON: the case, the AI-vs-human
  review provenance, the validation metrics, the package, and the **verbatim
  chain-sealed audit trail**.
- Public tracker: open **`/dsar-portal/<token>`** to show the subject's view.

## 7 · (Optional) Erasure → the "one brain" moment

File a second request as **Erasure** for a subject who is a **legal-hold
custodian**. On **Delivery**, the **legal-hold conflict guard** blocks
fulfilment ("N active holds preserve this data") until a privacy officer records
an explicit **override reason** — AEGIS won't let a DSAR spoliate preserved
evidence. No incumbent does this cross-check.

## What to emphasise to the client

- **Automated collection** straight from their M365/Purview tenant — no export/
  re-index, data stays in Purview under RBAC.
- **AI review with explainability + a hard human gate** — recall/precision and
  overturn numbers prove the AI was checked, not trusted.
- **Defensibility** — every action chain-sealed; one-click court-ready export.
- **One brain** — ROPA, legal holds, and DSAR share entities and cross-check
  each other.

## Reset between runs

Re-run any request; discovery/collection are idempotent (dedupe by system /
source+title). To start clean, file a fresh request from step 1.
