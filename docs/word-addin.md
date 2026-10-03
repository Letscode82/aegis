# AEGIS Word add-in (C-1)

AI clause redlining inside Microsoft Word, applied as **real Word tracked
changes** and governed by AEGIS. Built on the shared `@aegis/connectors` OAuth
framework (F-8) and the `DbTokenStore` encrypted token persistence (PR #507).

## What it does

- **Redline a clause.** Select a clause in Word, describe the change in plain
  language ("cap our liability at fees paid", "shorten the term to one year"),
  and AEGIS rewrites it on our standard. The change is applied **in-document as
  a tracked revision** — the author accepts or rejects it. Human acceptance is
  the governance gate; the add-in never silently edits.
- **Download the redline.** The same redline can be downloaded as a
  tracked-changes `.docx` (`<w:ins>` / `<w:del>` revisions attributed to
  "AEGIS Redline") for the offline / email-to-counterparty path.

## Pieces

| Layer | Location |
|---|---|
| AI redline service | `@aegis/contracts` → `redlineClause()` (`modules/contracts/src/internal/redline.ts`) |
| Track-changes `.docx` renderer | `@aegis/documents` → `renderRedlineDocx()` (`packages/documents/src/redline-docx.ts`) |
| Word-level diff (track-changes segments) | `@aegis/contracts` → `diffWords()` (CTR-16) |
| API — redline (JSON) | `POST /api/office/word/redline` (gated `contracts:create`) |
| API — redline (`.docx`) | `POST /api/office/word/redline-docx` (gated `contracts:create`) |
| Task pane (Office.js) | `apps/web/public/office/word/{manifest.xml,taskpane.html,taskpane.js}` |

## Connector / OAuth (shared with C-2 Outlook)

The Microsoft 365 connector descriptors and OAuth plumbing live on the shared
framework so every surface (Word, Outlook, future DMS/e-sign) reuses one OAuth
implementation and one encrypted token store:

- Descriptors: `@aegis/connectors` → `officeWordDescriptor()` / `outlookDescriptor()`.
- Token persistence: `DbTokenStore` over `OrgConnectorCredential`, encrypted via
  `@aegis/db` crypto, wired in `apps/web/lib/connectors/runtime.ts`.
- Admin OAuth routes (gated `admin:m365:manage`):
  - `GET /api/connectors` — list connectors + this org's status.
  - `GET|POST /api/connectors/[connectorId]/connect` — begin consent.
  - `GET /api/connectors/[connectorId]/callback` — code→token exchange + persist.
  - `POST /api/connectors/[connectorId]/disconnect` — clear tokens.

### Environment

| Var | Purpose |
|---|---|
| `M365_CLIENT_ID` | Azure AD app (client) id |
| `M365_TENANT_ID` | Tenant id (default `organizations`) |
| `M365_CLIENT_SECRET` | Confidential web-app secret (required to run the flow) |
| `AEGIS_ENCRYPTION_KEY` | Token encryption key (required in production) |
| `AEGIS_PUBLIC_BASE_URL` | Overrides the derived base URL for OAuth redirects |

Register the callback `…/api/connectors/office-word/callback` as a redirect URI
on the Azure AD app. Without credentials the flow is a clear 503 and the demo
still runs (the redline service degrades to a no-op when Claude is offline).

## Sideloading (development)

1. Run `pnpm --filter @aegis/web dev` (serves on `:5173`).
2. Sideload `apps/web/public/office/word/manifest.xml` in Word
   (Insert → My Add-ins → Upload My Add-in).
3. For any non-dev host, replace `https://localhost:5173` in the manifest with
   the AEGIS base URL the add-in is served from (all URLs must be https).

## Follow-ups

- PKCE public-client path for a dev flow without a client secret.
- Signed/stateful OAuth `state` store (today: an httpOnly SameSite=Lax cookie).
- Add-in command ribbon button + icons.
