# Overnight build queue — eDiscovery / review deepening

Autonomous loop. Rule: **migration-free items auto-merge** (build → typecheck →
lint → test → commit → PR → merge → resync). **Migration-bearing items get an
unmerged PR** with an apply note, never merged while the user is away.

Legend: ☐ pending · ▶ in progress · ✅ merged · ⏸ built, awaiting user migration.

## Queue (migration-free — auto-merge)

1. ☐ **Cull & ECA dashboard.** Turn `EcaPanel` into a real funnel dashboard:
   visual bar funnel (collected → deduped → threaded → in-scope → reviewed →
   responsive → produced), per-source & per-custodian breakdown, cost-model
   tuner (min/doc + rate), junk-domain summary. Read aggregation only.
2. ☐ **Collection filters.** Date-range + keyword + source (mailbox/onedrive/
   teams) options on collection start (ad-hoc + investigation picker), threaded
   into the query builder / `searchForDataSubject`.
3. ☐ **Cull options++.** Beyond thread/near-dup: date-window cull, sender-domain
   / junk-domain cull, each reversible + logged with a distinct exclusion
   reason. New controls in `CullPanel`.
4. ☐ **Review console redesign (Relativity One-like).** List + viewer + coding
   pane, keyboard coding shortcuts, issue tags, prev/next, filter/search,
   progress + "next uncoded".
5. ☐ **AI view upgrade.** Per-doc AI tags (responsive/priv/PII/key) with
   confidence + citation surfaced; filter by AI route/confidence; CAP-4-governed
   bulk-accept of confident cited calls.
6. ☐ **Relativity export.** Concordance load-file (`.dat`/`.opt` + extracted-text
   manifest) from Produce, stub-first — the "cull → export to Relativity for
   detailed review" story.
7. ☐ **AI Validation dashboard (AIR-6 read half).** recall/precision/F1/overturn
   per profile + drift over existing validation runs.
8. ☐ **Collection workspace stepper.** Swap the flow indicator for the crisp
   `Stepper` across ECA → Cull → Review → Copilot → Validate → Batches → Produce.

## Deferred (need a migration — build, open PR, DO NOT merge)

- ☐ **Person-dedup.** Unique index on `(org, lower(email))` + cleanup pass —
  collapses the duplicate custodian rows at the source.
- ☐ **ECA-2 concept clustering** (if it needs cluster storage).
- ☐ **AIR-6 batch runner** (resumable batches) if it needs schema.

## Log
- (start) Queue created. Beginning item 1.
