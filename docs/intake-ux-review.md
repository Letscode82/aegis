# AEGIS Intake — UX Review (Triage Cockpit & flow)

> In-depth review requested after live testing. Focus: the Triage
> Cockpit (the attorney's primary workspace), with cross-notes on the
> Inbox, New Request, and navigation. Method: heuristic evaluation
> (Nielsen's 10 + information-density / progressive-disclosure
> principles) against the actual rendered surfaces and the code.
> Severity: **P0** (hurts the core task now) · **P1** (notable
> friction) · **P2** (polish).

---

## 1. The core finding

The Cockpit's job is small and repetitive: for each ticket the
attorney must **understand it → decide → act** (approve / edit /
reject / escalate). But the screen presents **~12 co-equal panels**
competing for attention at the same visual weight:

> Ticket header · Description · Requester/SLA row · Triage box ·
> Routing-rules box · Request Workflow steps · SLA Custody Legs ·
> Timeline (13 rows) · Copilot transcript · AI Triage Analysis ·
> Agent Recommendation · Similar Matters · Delivery & Work · Parties ·
> Your Capacity · (Governance ladder) · (Litigation card)

Every one of these is individually well-built. The problem is
**altitude**: nothing tells the eye *this is the decision, everything
else is supporting evidence you can pull when you need it.* A
first-time GC looking at the screenshot cannot answer "what do I do
here?" in under ~10 seconds, and that is the whole product promise.

**One sentence:** the Cockpit is information-complete but
decision-poor — it shows everything at once instead of leading with
the decision and letting the reviewer *drill* for the rest.

---

## 2. Heuristic findings

### P0 — Visual hierarchy: everything is the same weight
Panels share the same card chrome, border, and type scale, so the
**Agent Recommendation** (the thing you act on) does not stand out
from **Your Capacity** (ambient context). *Nielsen: aesthetic &
minimalist design; recognition over recall.*
→ The decision panel should be visually dominant; supporting panels
should recede (smaller, collapsed, or moved to a secondary tab).

### P0 — No progressive disclosure
Timeline shows all 13 events; SLA custody legs, routing-rules, and the
Copilot transcript are all expanded by default. The reviewer pays the
scanning cost of data they need only occasionally.
→ Collapse-by-default everything that isn't the decision or the
one-line "what is this."

### P1 — The primary action is not where the eye lands
Approve / Edit / Reject / Escalate live at the *bottom* of the
right-hand Agent Recommendation panel, below the drafted response,
reasoning, concerns, sources, and risks. On a tall panel the action
buttons scroll off. The keyboard shortcuts (A/E/R/S) exist and are
excellent — but they're invisible unless you open the cheatsheet.
→ Pin the action bar; surface the shortcut hints inline.

### P1 — Two SLA representations side by side
The **SLA** field in the header ("On Track · 12 hrs"), the **SLA
Custody Legs** panel, and the **SLA %** bar all describe the same
clock in three visual languages. A viewer has to reconcile them.
→ One canonical SLA affordance; the legs are a drill-in, not a
peer panel.

### P1 — Triage shown twice
"AI Triage Analysis" (category / est-hours / similar / confidence)
and the smaller "TRIAGE · REGEX" box duplicate the same classification
in two places on the same screen.
→ Merge into one triage summary line.

### P2 — Timeline density
13 timeline rows (request filed, 4× routing-rule-fired, stage
advanced, notifications, hand-off…) at full height push the decision
below the fold. Most are system chatter the attorney rarely reads.
→ Collapse to "last event + N more" with a click to expand; group
system events.

### P2 — Label density / abbreviations
`GOLD`, `VIA CREATED`, `RULE-3`, chain-sealed hashes, `SR-…` — lots of
internal jargon shown at the same weight as content. Impressive for a
technical audience; noisy for a GC.
→ De-emphasise (smaller, muted) or move behind a "details" toggle.

### P2 — Similar Matters trust
Showing a "30% match" invites distrust (now fixed to suppress weak
matches). A match under a confidence floor should read "no strong
prior matches" rather than a low percentage.

---

## 3. Recommended target: a two-tier Cockpit

The fix is not "remove features" — it's **tiering** them. Everything
stays; the reviewer just isn't forced to see it all at once.

**Tier 1 — always visible (the decision surface), ~60% of the screen:**
1. **What is this** — one line: `REQ-3327 · Employment — Sensitive ·
   Critical · SLA 12h On-Track`. The header pills, collapsed.
2. **The request** — the human-authored description (documents already
   collapse, ✓).
3. **The Agent Recommendation** — dominant card: recommended action +
   confidence up top, drafted response, then the **pinned action bar**
   (Approve `A` · Edit `E` · Reject `R` · Escalate · with visible
   shortcut keys). Concerns / risks / sources collapsed under a
   "why" toggle.

**Tier 2 — one row of collapsed drill-ins (chips or an accordion):**
`▸ Timeline (13)` · `▸ SLA legs` · `▸ Routing (3 rules)` ·
`▸ Similar matters` · `▸ Parties` · `▸ Work & effort` ·
`▸ Governance ladder` · `▸ Copilot transcript`

Each opens in place or in a side drawer. The reviewer pulls evidence
on demand instead of paying for it up front.

**Tier 3 — ambient, move out of the ticket view:**
`Your Capacity` belongs in the queue header or My Work, not per-ticket.

### Before / after (schematic)

```
BEFORE (one screen, ~12 stacked panels)      AFTER (tiered)
┌───────────────┬───────────────┐            ┌───────────────┬──────────────┐
│ header        │ AGENT REC     │            │ REQ · type · SLA (1 line)    │
│ description   │  draft        │            ├──────────────────────────────┤
│ requester/SLA │  reasoning    │            │ The request (2–4 lines)      │
│ triage box    │  concerns     │            ├──────────────────────────────┤
│ routing rules │  sources      │            │ ▎AGENT RECOMMENDATION        │
│ workflow steps│  risks        │            │ ▎ action + confidence        │
│ SLA legs      │  ACTIONS ↓    │            │ ▎ drafted response           │
│ timeline (13) │ similar       │            │ ▎ [A]pprove [E]dit [R]eject  │  ← pinned
│ copilot       │ work & effort │            │ ▎ ▸ why (concerns/risks)     │
│ AI triage     │ parties       │            ├──────────────────────────────┤
│               │ capacity      │            │ ▸timeline ▸SLA ▸rules ▸parties│  ← drill row
└───────────────┴───────────────┘            └──────────────────────────────┘
```

---

## 4. Prioritised backlog (if you want it built)

| # | Change | Sev | Rough size |
|---|---|---|---|
| U1 | Collapse-by-default: Timeline, SLA legs, Routing-rules, Copilot transcript → drill chips/accordion | P0 | ~1 day |
| U2 | Make the Agent Recommendation the visually dominant card; pin the action bar with visible shortcut keys | P0 | ~1 day |
| U3 | Merge the two triage representations into one summary line | P1 | ~0.5 day |
| U4 | Move `Your Capacity` out of the ticket view into the queue header | P1 | ~0.5 day |
| U5 | One canonical SLA affordance; legs become a drill-in | P1 | ~0.5 day |
| U6 | De-emphasise internal jargon (GOLD, RULE-3, hashes) to muted/secondary | P2 | ~0.5 day |
| U7 | Similar-matters: below a confidence floor render "no strong prior matches" | P2 | done (#167) |

Sequence U1+U2 first — they deliver ~80% of the "it feels simpler"
win. They're pure UI (no schema, no API), demo-safe at every step,
and reversible behind a layout flag if you want to A/B them.

---

## 5. Cross-screen notes

- **Inbox → ticket:** good. The list is scannable. Keep the one-line
  descriptions (they now show the lead, not document bodies).
- **New Request:** the simple/complex type split is good. Two small
  wins: (a) show which types carry a governance ladder (a small
  chip), and (b) the "attach a document" affordance is strong — keep
  the "N chars extracted" confirmation.
- **Governance ladder discoverability:** the ladder now offers a
  "Put this ticket on a ladder…" starter when none is running (#167),
  which closes the "where is the ladder" gap you hit. Longer term,
  binding a ladder to a request **type** (Request Types admin) is the
  scalable path; the per-ticket starter is the ad-hoc escape hatch.
- **Navigation:** the top tab bar carries 12 entries. Consider
  grouping into **Work** (My Work, Inbox, Cockpit, Kanban), **Intake**
  (New Request, My Requests, Self-Service), and **Ops** (SLA, Pool
  Ops, Routing, Teams, Request Types) — matches how the three personas
  (attorney, requester, ops-admin) actually use it.

---

## 6. What's working — don't touch

- **The agent recommendation content** is genuinely strong: action +
  confidence + concerns + the ⚖ risks checklist + playbook stamp is
  exactly the right evidence for an approver. The *packaging* needs
  hierarchy; the *substance* is right.
- **Keyboard-first triage** (A/E/R/S) is a power-user feature most
  legal tools lack. Surface it more; don't remove it.
- **The chain-sealed audit trail** and the twin-recording are the
  differentiator — keep them, just don't render the raw hashes at
  content weight.
- **Aurora visual language** (type, colour, spacing) is coherent and
  premium. The issue is density and hierarchy, not the design system.

---

## 7. Summary

The Cockpit is a **strong information system wearing the layout of a
dashboard** when it needs the layout of a **decision tool**. The
single highest-leverage change is tiering: lead with the request + the
agent's recommendation + a pinned action bar, and demote everything
else to on-demand drill-ins. No feature has to be removed — only
re-weighted. U1+U2 alone will make it feel like a different, calmer
product, and they're low-risk pure-UI changes.
