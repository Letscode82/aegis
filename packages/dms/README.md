# @aegis/dms — Document Management System sync (C-3)

Connects AEGIS to the external DMS a legal department already runs as its
system of record — **iManage Work**, **NetDocuments**, **Microsoft
SharePoint** — through the shared F-8 OAuth framework
([`@aegis/connectors`](../connectors)) and reconciles its documents against the
shared `Document` entity so the "one brain" sees the firm's real paper.

## Three layers

| Layer | File | What it owns |
|---|---|---|
| **Provider seam** | `types.ts` | `DmsProvider` — the one interface every caller uses |
| | `http-provider.ts` | `HttpDmsProvider` + per-provider `DmsDialect`s (real REST over F-8 tokens, `fetch`-only, zero SDK) |
| | `mock-provider.ts` | `MockDmsProvider` — in-memory, deterministic, zero-infra dev / CI |
| **Reconciliation** | `sync.ts` | `planSync()` — pure, deterministic diff of remote listing vs. AEGIS's sync record; flags two-sided edits as **conflicts** instead of clobbering |
| **Registration** | `descriptors.ts` | `ConnectorDescriptor` + OAuth config per provider; `registerDmsConnectors()` |

## Design posture (same as `@aegis/email`)

- **Dependency-light and DB-free.** The package decides *what* to sync and
  *how* to talk to a provider; the caller applies the plan (writing `Document`
  rows) and chain-seals each action on the `AuditLog` ledger. No `@aegis/db`
  import, no prisma, no raw SQL.
- **Degrade-to-mock.** With no DMS credentials the app wires `MockDmsProvider`
  so the demo walks end-to-end.
- **Token handling is not re-implemented.** `HttpDmsProvider` asks for a
  resolved bearer token via an injected `getAccessToken`; the app wires it to
  `@aegis/connectors.getValidAccessToken` over the production
  `DbTokenStore` (F-8 / #507). Refresh lives in one place.

## Wiring sketch (app composition root)

```ts
import { DbTokenStore, getValidAccessToken, connectorRegistry, needsRefresh, refreshAccessToken } from "@aegis/connectors";
import { HttpDmsProvider, sharePointDialect, registerDmsConnectors } from "@aegis/dms";
import { prisma, encryptSecret, decryptSecret } from "@aegis/db";

const store = new DbTokenStore(prisma, { encryptSecret, decryptSecret });
registerDmsConnectors(connectorRegistry, resolveDmsOAuthForOrg);

const provider = new HttpDmsProvider({
  dialect: sharePointDialect(driveId),
  getAccessToken: async () => {
    const descriptor = connectorRegistry.get("sharepoint")!;
    const token = await getValidAccessToken({
      organizationId, connectorId: "sharepoint", store,
      needsRefresh, refresh: (rt) => refreshAccessToken(descriptor.oauth, rt, fetchHttp),
    });
    if (!token) throw new Error("SharePoint not connected");
    return token;
  },
});
```

## Tests

`pnpm --filter @aegis/dms test` — pure planner coverage (every action type +
determinism), the mock provider round-trip, the HTTP provider mapping one
provider dialect over a fake `fetch`, and descriptor/registry behaviour. All
CI-safe (no network).
