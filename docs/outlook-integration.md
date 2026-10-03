# AEGIS Outlook integration (C-2)

Email triage into AEGIS intake, two ways, both on the shared `@aegis/connectors`
framework and its encrypted `DbTokenStore` (PR #507). Reuses the same Microsoft
OAuth plumbing and connector routes as the C-1 Word add-in.

## Two surfaces

1. **Outlook add-in (manual triage).** Reading an email in Outlook, counsel
   clicks **File to AEGIS Intake** in the task pane. The add-in reads the open
   message and posts it to `POST /api/office/outlook/triage`, which runs it
   through the same `ingestInboundEmail` pipeline as the webhook — classified,
   routed, chain-sealed into an `IntakeTicket`. Gated `intake:create_ticket`.
   - `apps/web/public/office/outlook/{manifest.xml,taskpane.html,taskpane.js}`

2. **Connector-backed mailbox poll (headless triage).** Once the org connects
   Outlook through the shared OAuth routes (token stored in
   `OrgConnectorCredential` via `DbTokenStore`), `POST /api/connectors/outlook/poll`
   reads the shared mailbox with that connector token — refreshed on demand via
   `getValidAccessToken` — and ingests each new message through the SAME
   `pollMailboxForIntake` path (watermark-idempotent). This is the
   connector-framework-native alternative to the matter module's
   `OrganizationM365Credential`-backed poller. Gated `admin:m365:manage`.
   - `apps/web/lib/connectors/outlook-graph.ts` (`connectorOutlookPoller`, `mapGraphMessages`)

## Connector / OAuth

The Outlook connector descriptor (`outlookDescriptor`, `OUTLOOK_SCOPES` with
`Mail.Read` / `Mail.Send`) and the connect / callback / disconnect / list routes
are the same ones C-1 introduced — C-2 just wires `outlook` into
`WIRED_CONNECTOR_IDS` so those routes serve it. Connect Outlook at
`GET /api/connectors/outlook/connect`; the callback persists the token through
`DbTokenStore`.

### Environment

Same as the Word add-in (see `docs/word-addin.md`): `M365_CLIENT_ID`,
`M365_TENANT_ID`, `M365_CLIENT_SECRET`, `AEGIS_ENCRYPTION_KEY`,
`AEGIS_PUBLIC_BASE_URL`. Register `…/api/connectors/outlook/callback` as a
redirect URI on the Azure AD app, with the `Mail.Read` (and `Mail.Send` for the
existing auto-ack) delegated scopes consented.

## Sideloading (development)

1. Run `pnpm --filter @aegis/web dev` (serves on `:5173`).
2. Sideload `apps/web/public/office/outlook/manifest.xml` in Outlook
   (Get Add-ins → My add-ins → Custom add-ins → Add from file).
3. For any non-dev host, replace `https://localhost:5173` in the manifest with
   the AEGIS base URL (all URLs must be https).

## Follow-ups

- Schedule the connector poll on the pg-boss worker runtime (today it's an
  admin/cron HTTP trigger, same pattern as the existing mailbox poll).
- Outbound auto-ack via the connector token (today the auto-ack path uses the
  matter module's `sendDelegatedMail`).
