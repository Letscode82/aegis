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

## One-time setup (per tenant)

Everything runs locally against your `.env` (Neon `DATABASE_URL` +
`AEGIS_M365_CLIENT_SECRET`). Nothing here is committed.

### 1. Point the demo hold's custodians at real mailboxes

The base seed gives the three custodians non-routable `@aegis-demo.example`
addresses. Two of them (`priya.kulkarni`, `marcus.reid`) already match real
tenant users, so this just swaps the domain:

```
pnpm --filter @aegis/db exec tsx scripts/point-hold-custodians-to-tenant.ts --tenant 6bs6wq.onmicrosoft.com
```

- Preview first with `--verify-only`.
- Rhea Malhotra has no matching tenant user — either leave her (she'll return
  0 hits, which is a fine "not connected" state) or map her to a real user:
  `--map "rhea.malhotra=lena.perez"`.
- Idempotent — safe to re-run.

### 2. Seed investigation-flavored mail into those mailboxes

```
$env:AEGIS_M365_CLIENT_SECRET = "<app registration client secret VALUE>"
.\scripts\seed-investigation-mailbox.ps1 -Mailboxes "priya.kulkarni@6bs6wq.onmicrosoft.com,marcus.reid@6bs6wq.onmicrosoft.com"
```

Each mailbox gets a **deliberately mixed** set so the AI review has real
routing signal:

| Kind | Example | Where the engine routes it |
|---|---|---|
| **Responsive** | Snowflake MSA renewal, vendorx pricing, IP §8.2 | Reviewer |
| **Privileged** | outside-counsel memo marked *attorney-client privileged* | **Attorney** |
| **PII** | HR record with home address + mobile | Reviewer (PII tag) |
| **Noise** | all-hands, nightly backup, lunch menu | Auto-cull |

Idempotent (tagged `AEGIS-INVESTIGATION-DEMO`; re-run deletes + re-creates).
`-Clear` removes them.

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
