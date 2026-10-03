# @aegis/esignature — e-signature (C-5)

Connects AEGIS to the signing provider a legal department uses to execute
contracts — **DocuSign** and **Adobe Acrobat Sign** — through the shared F-8
OAuth framework ([`@aegis/connectors`](../connectors)). The Contracts module
drives it to move a `Contract` from `APPROVED → EXECUTED`, chain-sealing each
step.

## Three layers

| Layer | File | What it owns |
|---|---|---|
| **Provider seam** | `types.ts` | `ESignatureProvider` — the one interface the execution path uses |
| | `http-provider.ts` | `HttpESignatureProvider` + `docusignDialect` (eSignature REST v2.1) / `adobeSignDialect` (REST v6), `fetch`-only, zero SDK |
| | `mock-provider.ts` | `MockESignatureProvider` — in-memory lifecycle with webhook-shaped drivers (`signRecipient`, `markCompleted`, …) |
| **Lifecycle** | `envelope.ts` | normalized state machine (`canTransition`, `isCompleted`), per-provider `normalizeStatus`, `validateCreateRequest`, `summarizeEnvelope` |
| **Registration** | `descriptors.ts` | `ConnectorDescriptor` + OAuth config per provider (sandbox-aware); `registerESignatureConnectors()` |

## Design posture (same as `@aegis/email`)

- **Dependency-light and DB-free.** The package decides how to talk to a
  provider and what the normalized lifecycle is; the Contracts module /
  composition root records the envelope outcome on `AuditLog`
  (`contract.signature.*`) and flips the `Contract` state. No `@aegis/db`
  import, no prisma, no raw SQL — module-isolation and audit discipline stay
  intact.
- **Degrade-to-mock.** With no signing credentials the app wires
  `MockESignatureProvider` so the demo executes a contract end-to-end. Its
  `advanceToDelivered` / `signRecipient` / `markCompleted` drivers stand in for
  the provider webhooks that advance a real envelope.
- **Token handling is not re-implemented.** `HttpESignatureProvider` asks for a
  resolved bearer token via an injected `getAccessToken`; the app wires it to
  `@aegis/connectors.getValidAccessToken` over the production `DbTokenStore`
  (F-8 / #507).

## The execution gate

The normalized lifecycle is load-bearing: the Contracts module gates
`APPROVED → EXECUTED` on `isCompleted(status)`, and `assertTransition` refuses
an illegal move (e.g. re-sending a voided envelope). Provider vocabularies
(DocuSign `completed`/`voided`, Adobe `SIGNED`/`CANCELLED`) are normalized once,
in `normalizeStatus`, so no caller branches on a provider string.

## Tests

`pnpm --filter @aegis/esignature test` — the pure state machine (every
transition, both providers' status maps, request validation, summary), the mock
full lifecycle (create → sign → complete → download, draft→send, void), and both
HTTP dialects mapped over a fake `fetch`. All CI-safe (no network).
