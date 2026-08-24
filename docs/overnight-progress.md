# Overnight build queue — eDiscovery / review deepening

Autonomous loop. Rule: **migration-free items auto-merge** (build → typecheck →
lint → test → commit → PR → merge → resync). **Migration-bearing items get an
unmerged PR** with an apply note, never merged while the user is away.

Legend: ☐ pending · ▶ in progress · ✅ merged · ⏸ built, awaiting user migration.

## Queue (migration-free — auto-merge)

1. ✅ **Cull & ECA dashboard.** Turn `EcaPanel` into a real funnel dashboard:
   visual bar funnel (collected → deduped → threaded → in-scope → reviewed →
   responsive → produced), per-source & per-custodian breakdown, cost-model
   tuner (min/doc + rate), junk-domain summary. Read aggregation only.
2. ✅ **Collection filters.** Date-range + keyword + source (mailbox/onedrive/
   teams) options on collection start (ad-hoc + investigation picker), threaded
   into the query builder / `searchForDataSubject`.
3. ✅ **Cull options++.** Keyword/junk-pattern cull + source-type cull (both
   migration-free, reversible, chain-sealed with distinct reasons). NOTE:
   date-window + sender-domain cull need `sentAt`/`fromAddress` columns on
   ReviewSetItem → moved to Deferred (migration).
4. ✅ **Review console redesign (Relativity One-like).** The 3-pane console
   already had list+viewer+coding, j/k/r/n/p/x shortcuts, route filters, bulk
   coding, families. Added: coding-status filter chips (Uncoded/Coded/
   Responsive/Privileged), "Next uncoded" jump (button + `u` key), a doc
   position + uncoded-remaining indicator, and a keyboard-shortcut legend.
5. ☐ **AI view upgrade.** Per-doc AI tags (responsive/priv/PII/key) with
   confidence + citation surfaced; filter by AI route/confidence; CAP-4-governed
   bulk-accept of confident cited calls.
6. ☐ **Relativity export + RelativityOne connector.** (a) Concordance load-file
   (`.dat`/`.opt` + extracted-text manifest) download from Produce. (b) "Connect
   to a RelativityOne instance" (instance URL + workspace id + credential ref)
   and a **Push to workspace** action that packages the load-file and POSTs it to
   the configured RelativityOne import endpoint — stub-first (documented seam;
   real Import API behind it). Keep migration-free (config via env / admin field,
   no new table); if per-org persistence needs a column, split that into a
   deferred (unmerged) PR.
7. ☐ **AI Validation dashboard (AIR-6 read half).** recall/precision/F1/overturn
   per profile + drift over existing validation runs.
8. ☐ **Collection workspace stepper.** Swap the flow indicator for the crisp
   `Stepper` across ECA → Cull → Review → Copilot → Validate → Batches → Produce.
9. ☐ **Theme toggle — Blue (dark) ↔ Facebook Lite.** Runtime palette swap: keep
   the `${C.x}44` alpha-append idiom working by mutating the `C` token object
   in place to the chosen palette and remounting the app subtree (keyed by
   theme) + persisting to localStorage; a Facebook-style light palette (bg
   #F0F2F5, card #fff, primary #1877F2, text #050505/#65676B, border #CED0D4).
   Toggle in the app shell; body background follows the theme. Migration-free
   but larger — verify with a full `pnpm build`, not just tsc.
10. ☐ **Steppers everywhere + UI/UX polish.** Adopt the crisp `Stepper` across
    every workflow screen that has stages (intake, workflows, DSAR, matter
    closeout, etc.) and a general cool-factor pass where it helps.

## Deferred (need a migration — build, open PR, DO NOT merge)

- ☐ **Person-dedup.** Unique index on `(org, lower(email))` + cleanup pass —
  collapses the duplicate custodian rows at the source.
- ☐ **ECA-2 concept clustering** (if it needs cluster storage).
- ☐ **AIR-6 batch runner** (resumable batches) if it needs schema.
- ☐ **Date-window + sender-domain cull** — needs `sentAt` + `fromAddress`/
  `senderDomain` columns persisted on ReviewSetItem (collection captures `sentAt`
  on hits but doesn't store it as a column today). Migration + backfill.

## Log
- (start) Queue created. Beginning item 1.
- item 1 ✅ merged PR #341 — ECA/cull dashboard upgrade + cost-model NaN fix (25 review tests).
- item 2 ✅ merged PR #342 — collection filters (date-range + keyword) via pure filterHits (8 matter tests).
- (user add) extended item 6 with a RelativityOne connector (push-to-workspace, stub-first); added item 9 (theme toggle: Blue dark ↔ Facebook Lite) and item 10 (steppers everywhere + UI polish).
- item 3 ✅ merged PR #343 — keyword/junk cull + source-type cull (5 tests, suite 30). Date-window/sender-domain cull deferred.
- item 4 ✅ — review console: coding-status filters + Next-uncoded (u) + position indicator + shortcut legend (UI-only). PR next.
