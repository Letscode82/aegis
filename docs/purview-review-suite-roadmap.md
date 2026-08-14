# Purview review suite — eDiscovery · Legal Hold · DSAR (roadmap)

Concept review of "Docket — agentic review suite on Microsoft Purview" and how
its pipeline maps onto AEGIS's existing architecture. **Priority: DSAR.** The
three workflows are one pipeline with different entry points and end states —
we build the shared collection/review spine once and let each surface reuse it.

## The concept, in one line

> One sequential flow from first signal to defensible output: **Intake → Hold &
> Preserve → Collect & Cull → Agentic first pass → Human review → Validate →
> Produce/Deliver**, where *AI proposes and humans dispose* at every gate, data
> stays inside Purview, and the AI layer reads the review set under RBAC and
> writes only tags + drafts.

That is exactly AEGIS's posture already: chain-sealed audit, the PENDING
`AgentDecision` human gate, "AI degrades to deterministic," and M365 as an
auditable/replaceable/degradable integration.

## The shared spine (what all three reuse)

| Pipeline stage | Shared AEGIS capability | Status |
|---|---|---|
| Connect to tenant (E5/Purview) | `getM365ClientForOrg` factory + `/admin/m365` (app-only + delegated Device Code) | **shipped** (4c / 4c.1) |
| Collect (identity/scope search) | `M365Client.searchForDataSubject` (Microsoft Search), custodian data-source enumeration | **DSAR search shipped here**; eDiscovery KQL search = next |
| Hold & preserve | Legal Hold (`applyPreservation`, custodians incl. Agent 365) | **shipped** (4b/4c) |
| Agentic first pass (tag + cite) | `@aegis/ai` scoring that degrades to deterministic; per-item rationale | **DSAR relevance review shipped** (PRIV-1) |
| Human review gate | reviewer confirm/override + redaction; `AgentDecision` PENDING gate | **DSAR shipped**; eDiscovery console = future |
| Validate | stratified sample, recall/precision, overturn tracking | future (shared service) |
| Produce / Deliver | DSAR delivery package + portal; eDiscovery load-file export | **DSAR shipped**; production export = future |
| Defensibility | chain-sealed audit trail + JSON export | **shipped across the board** |

The insight: **DSAR is the "single-subject" instance of the same eDiscovery
pipeline.** A DSAR is an eDiscovery matter scoped to one data subject, with
"relevance" = "this person's personal data" and "produce" = "deliver to the
subject." Building DSAR first exercises the whole spine on the simplest scope.

## What shipped in this PR (DSAR ← M365, priority)

The DSAR **Collect** stage now connects to the org's E5/Purview tenant exactly
like Legal Hold does:

- New `M365Client.searchForDataSubject(input)` — a Microsoft Search
  (`POST /search/query`) sweep across mailboxes, OneDrive/SharePoint, and Teams
  for the subject's identifiers. Mock (no tenant) returns representative hits;
  the real client runs Graph. Every call is `withGraphAudit`-sealed. Routed
  through the same per-org factory (app-only — Microsoft Search honors
  application permissions).
- Exposed on Matter's public surface as `searchM365ForDataSubject(orgId, input)`
  (never internals). Privacy calls it from `collectFromM365`, which dedupes hits
  into the DSAR review queue so the existing **AI relevance review + human
  validation + delivery** flow takes over.
- DSAR workspace **Review** tab gains a **"⚡ Search Microsoft 365 (E5 /
  Purview)"** panel showing connection status (Connected / simulated) and a
  one-click **Search & collect** — mirroring the legal-hold M365 status UX.

## Next phases (proposed order)

1. **DSAR polish (near-term).** Per-source scoping in the collect panel
   (mailbox/OneDrive/Teams toggles), collection statistics preview before
   commit, and "retrieve full item" from a hit's `graphId`/`webUrl`.
2. **Legal Hold ↔ eDiscovery bridge.** Promote a hold's custodians into a
   Purview eDiscovery (Premium) case + collection; reuse `searchForDataSubject`
   generalized to `searchCollection(scope, kql)` (NL→KQL draft via `@aegis/ai`,
   attorney-edited before it fires — the concept's "collection" gate).
3. **Shared validation service.** Stratified sampling + recall/precision +
   overturn tracking as a package both DSAR review and eDiscovery review call —
   the "meet-and-confer binder" / DSAR defensibility pack from one code path.
4. **eDiscovery review console + production.** The keyboard-first reviewer
   console and load-file/Bates production — the Investigations/Matter surface,
   built on the same review-item + AgentDecision spine.

Every phase keeps the non-negotiables: attorney gates (`AgentDecision`),
chain-sealed audit, AI-degrades-to-deterministic, and data staying in Purview
under RBAC with AEGIS writing only tags + drafts.
