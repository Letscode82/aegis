# Trademark registry integration (USPTO / EUIPO / WIPO)

The Trademark Clearance agent screens a proposed mark with a deterministic
knock-out engine (phonetic + visual + NICE-class) over the `TrademarkMark`
table. Out of the box that table is a **bootstrap of well-known registered
marks**. Wiring the live registries makes the screen query USPTO, EUIPO,
and/or WIPO for the specific mark and cache the hits.

## How it works

`screenTrademark(mark, classes)`:

1. **Live search** — for every *configured* registry, search for the
   candidate mark (`searchAllRegistries`), then upsert the hits into
   `TrademarkMark` (source-tagged: `USPTO` / `EUIPO` / `WIPO`).
2. **Screen** — run the deterministic similarity over the enriched table.
3. **Fallback** — if no registry is configured, screen the local table
   (bootstrap) only. If the table is empty or stale → `unavailable`
   (flag for review), **never** a false all-clear.

The screen result reports `sources` (registries queried live) so the
Cockpit and the audit trail show whether a live search ran.

The client layer mirrors the M365 factory: a real HTTP client per registry,
gated on credentials. **No credentials → the registry is skipped** (dev/CI
run on the bootstrap). A *partially* configured registry (some but not all
vars) throws at build/first-call in production — a half-wired credential is
a silent-failure trap.

## Configuration (env)

Set **all** vars for a registry to enable it, or none.

| Registry | Vars |
|---|---|
| **USPTO** | `USPTO_API_KEY`, `USPTO_SEARCH_URL` |
| **EUIPO** | `EUIPO_CLIENT_ID`, `EUIPO_CLIENT_SECRET`, `EUIPO_TOKEN_URL`, `EUIPO_SEARCH_URL` |
| **WIPO** | `WIPO_API_KEY`, `WIPO_SEARCH_URL` |

- **USPTO** — API key from developer.uspto.gov; `USPTO_SEARCH_URL` is the
  provisioned trademark-search JSON endpoint (the public full-text search
  surface has been in transition since TESS was retired in 2023, so the
  exact path is set per-tenant). Auth header: `USPTO-API-KEY`.
- **EUIPO** — OAuth2 client-credentials (developer portal). The client
  fetches a bearer token from `EUIPO_TOKEN_URL`, then calls the Trademark
  Search API at `EUIPO_SEARCH_URL`.
- **WIPO** — Global Brand Database / Madrid Monitor access (API key / IP
  allow-list). Bearer auth.

## Admin surface

- `GET /api/admin/trademark/registries` — which registries are configured +
  local cache health (`bySource`, `listAsOf`).
- `POST /api/admin/trademark/registries` `{ terms: [...] }` — pre-warm the
  cache by live-searching those terms across the configured registries.

Both gated on `admin:manage_users`.

## Honesty note

The client implementations target each registry's **documented API
contract** and are validated at the mapping/flow level with an injected
HTTP transport (see `tests/trademark-registries.test.ts`). Exercising the
**live** calls requires the real credentials above and outbound network
access to the registry hosts through the deployment's egress — that step is
a deployment/onboarding task, not code. Until a registry is configured, the
agent screens against the bootstrap marks (which are real public-record
registrations) and always recommends a formal registry clearance + counsel
sign-off before any naming commitment.
