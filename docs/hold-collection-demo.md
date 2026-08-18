# Legal Hold → Collection → AI Review demo (live M365 data)

This runbook makes the **Hold → Collection → Review-set → Run AI review →
Produce** flow work end-to-end on real tenant mail, the same way the DSAR
demo runs on Priya's seeded mailbox.

## Why it needed a fix

The hold collection used to call Microsoft's unified `POST /search/query`,
which **does not return mail or chat results with application (app-only)
permissions** — so every collection came back with **0 hits**. The DSAR flow
never had this problem because it pulls each subject's mail from the
**per-user** endpoint (`/users/{id}/messages`), which *does* honor app-only
`Mail.Read`.

The hold collection now uses that same per-custodian path. Each custodian's
own mailbox / OneDrive is the collection surface — which is exactly right for
a legal hold — and the reviewer console + AI review cull it down.

## Fastest path: seed the whole demo suite once

`scripts/seed-demo-suite.ps1` drops **several distinct matters** into the real
tenant mailboxes in one run, so every demo (hold / culling / AI review) has
varied material and you never re-seed. Each scenario has its own category tag,
so it's independently idempotent.

```
$env:AEGIS_M365_CLIENT_SECRET = "<client secret VALUE>"
.\scripts\seed-demo-suite.ps1 -Tenant 6bs6wq.onmicrosoft.com
```

| Scenario | Custodians | Category |
|---|---|---|
| MSA / IP dispute (Snowflake · vendorx §8.2) | priya, marcus, rebecca, samira, carlos | `AEGIS-DEMO-MSAIP` |
| HR internal investigation (conduct complaint) | daniel.brooks, lena.perez, alex.kim | `AEGIS-DEMO-HR` |
| Trade-secret / departing employee (exfiltration) | sarah.watson, samira, thomas.berger | `AEGIS-DEMO-TRADESECRET` |

`-Only msaip,hr` seeds a subset; `-Clear` removes a scenario's messages. DSAR
is seeded separately (`seed-priya-dsar-mailbox.ps1`, Priya). Then in AEGIS,
open or create a hold, **+ Add custodians → M365 directory search** to pull the
right people, and run Collection → Preview → Commit → Run AI review.

The step-by-step below covers the seeded **MSA hold (LH-2026-0001)** specifically.

## One-time setup (per tenant)

Everything runs locally against your `.env` (Neon `DATABASE_URL` +
`AEGIS_M365_CLIENT_SECRET`). Nothing here is committed.

### 1. Point the demo hold's custodians at real mailboxes

The base seed gives the three custodians non-routable `@aegis-demo.example`
addresses. Two of them (`priya.kulkarni`, `marcus.reid`) already match real
tenant users, so this just swaps the domain:

```
# from the repo root — the ../../ is because --filter runs inside packages/db
pnpm --filter @aegis/db exec tsx ../../scripts/point-hold-custodians-to-tenant.ts --tenant 6bs6wq.onmicrosoft.com
```

- Preview first by appending `--verify-only`.
- Rhea Malhotra has no matching tenant user — either leave her (she'll return
  0 hits, which is a fine "not connected" state) or map her to a real user:
  `--map "rhea.malhotra=lena.perez"`.
- Idempotent — safe to re-run.

### 2. Seed investigation-flavored mail into those mailboxes

One coherent matter (the Snowflake MSA / vendorx IP §8.2 dispute), but each
custodian gets a **distinct, role-appropriate slice** so culling + AI routing
look real instead of cloned. The profile is inferred from the mailbox
local-part (override with `-Profile`):

| Profile | Personas | Skews toward |
|---|---|---|
| `counsel` | marcus.reid, thomas.berger, lena.perez | Privileged (outside-counsel memos, legal strategy) |
| `engineer` | samira.iqbal, rebecca.sato | Responsive-technical (IP §8.2, model weights, pipelines) |
| `finance` | carlos.mendez | Invoice / spend / committed-use responsive |
| `departed` | sarah.watson | Sparse, older (handover + a 2025 thread) |
| `mixed` | priya.kulkarni / everyone else | Balanced |

A richer 5-custodian sweep:

```
$env:AEGIS_M365_CLIENT_SECRET = "<app registration client secret VALUE>"
.\scripts\seed-investigation-mailbox.ps1 -Mailboxes "priya.kulkarni@6bs6wq.onmicrosoft.com,marcus.reid@6bs6wq.onmicrosoft.com,samira.iqbal@6bs6wq.onmicrosoft.com,rebecca.sato@6bs6wq.onmicrosoft.com,carlos.mendez@6bs6wq.onmicrosoft.com"
```

Every set carries routing signal — **Responsive** → Reviewer, **Privileged**
(marked *attorney-client*) → **Attorney**, **PII** (home address + mobile) →
Reviewer, **Noise** (all-hands / backup / lunch) → Auto-cull.

Idempotent (tagged `AEGIS-INVESTIGATION-DEMO`; re-run deletes + re-creates).
`-Clear` removes them.

> To use more than the seeded three hold custodians, add Samira / Rebecca /
> Carlos to LH-2026-0001 in-app (**+ Add custodians → M365 directory search**)
> — collection now pulls each one's mailbox per-user.

## Run the demo

1. **Matter** → open **Snowflake MSA — Renewal & Re-papering**.
2. **Legal Hold** tab → open **LH-2026-0001**.
3. Right rail → **Collection** card → expand it.
   - Pick sources (Mailbox on), click **Preview collection** → you now see hit
     counts by source instead of 0.
   - Click **Commit N to review set →**.
4. Under **Review sets**, click the new set → the **reviewer console** opens.
5. Click **Run AI review** → each item gets a **verdict + confidence**, a
   **route badge** (Attorney / Reviewer / Auto-cull), and a rationale line.
   The privileged outside-counsel memo routes to **Attorney**; the backup /
   lunch noise routes to **Auto-cull**.
6. Code items (**R / N / P / X**), **Freeze**, then **Produce** → Bates-numbered
   production + privilege log.

## Notes

- The AI review runs the shared engine's **deterministic screen** (no Claude
  call) because the Matter/Legal-Hold AI freeze (4d) is still in effect. When
  4d unfreezes, a model pass drops in behind the same interface — no change to
  this flow.
- Same mechanism works for internal investigations and DSAR: one collection →
  one review engine → culling or production.
