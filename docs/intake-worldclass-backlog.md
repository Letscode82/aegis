# Intake — world-class backlog (the market-beater plan)

Synthesis of the 2026 market benchmark (`market-benchmark-2026.md`),
the DRL requirements (`Enhancements-to-Intake-DRL.md`), and the
One-Stop-UX review. Goal: an intake platform that (a) matches every
table-stakes feature the leaders ship, (b) makes our verified
differentiators — schema-enforced agent gate, agent↔human ledger,
chained audit — *visible on screen*, and (c) feels instant and obvious
for a high-user-count deployment.

**UX principles for every PR below** (many users, low training):
1. **One screen per persona** — requester, legal staff, manager, admin
   each land where their work is. Nobody sees machinery they don't use.
2. **Instant feel** — skeleton loaders on every fetch, optimistic
   updates on every mutation, sub-200ms perceived interactions, no
   full-page spinners.
3. **Zero-training defaults** — plain language, empty states that teach
   ("No requests yet — file your first one →"), no jargon on
   requester-facing surfaces.
4. **Keyboard-first for staff, thumb-first for requesters** — cockpit
   stays shortcut-driven; requester surfaces work on a phone.
5. **Consistent atoms** — every new surface uses the Aurora components
   (`@aegis/ui`), the shared Toast, and the same list/card idioms.

Loop rules (same as Phase 1): one PR per item, tests + CI green before
merge, tick the box + append one line to
`docs/intake-phase1-progress.md`, demo works at every checkpoint.

---

## Wave 1 — The Daily Experience *(table-stakes parity; ends the
"impressive machinery, unclear daily home" gap)*

- [ ] **W1-1 · My Work** — personal work inbox: my assigned tickets, my
  open tasks, hand-offs passed to me, agent recommendations awaiting my
  review — one screen, SLA-aware ordering, deep links into the cockpit.
  Default landing tab for legal staff. *(M — composes existing data;
  ServiceNow's "Legal Counsel Center" is the reference pattern)*
- [ ] **W1-2 · My Requests** — requester portal: everything I filed,
  live status + stage + SLA, latest activity line, "nudge" button.
  Filing confirmation deep-links here. Kills the where-is-it email.
  *(S — permission `intake:read_own_tickets` exists unused; Xakia/
  ServiceNow/Tonkean all ship this)*
- [ ] **W1-3 · Ticket Timeline** — unified per-ticket activity feed
  from the chain-sealed AuditLog: filed → classified → rule fired →
  agent drafted → handed to <name> → task done → stage moved → sent →
  closed. Agent and human actions as ONE verifiable chain with resolved
  actor names + "verify integrity" affordance. *(S–M — read-only over
  existing ledger; this is where the differentiator becomes visible)*
- [ ] **W1-4 · Role-shaped navigation** — group 10 tabs into
  Work (My Work / Inbox / Cockpit / Kanban) · Insights (SLA) ·
  Admin (Smart Routing / Teams / Request Types); role-based default
  tab; requester profile sees only New Request / My Requests /
  Self-Service. Mobile-safe tab bar. *(S)*
- [ ] **W1-5 · Stage advancement** — move a ticket through its
  configured stages from cockpit + detail, server-enforced transitions,
  audited (`intake.ticket.stage_advanced`), per-stage timestamps
  captured (feeds TAT + multi-leg SLA later). Stage chips on Kanban.
  *(M — makes request types operational, not cosmetic)*

**Wave-1 exit demo:** a requester files on their phone and watches
status in My Requests; an attorney lands on My Work, opens the ticket,
advances the stage; the timeline shows the whole story, agent steps
included, verifiable.

## Wave 2 — Routing intelligence & agent accountability *(the
differentiators, end-to-end)*

- [ ] **W2-1 · Complexity signal + `matchComplexity`** — classifier/
  agent emit a complexity band (simple/standard/complex from risk,
  confidence, est. hours); routing rules gain a matchComplexity
  condition. Demo: demand letter → complex → senior pool; template NDA
  → simple → Tier-1. *(S–M — completes DRL marquee #1)*
- [ ] **W2-2 · Auto baton-pass** — the agent pipeline writes the
  hand-off ledger automatically: rec generated → `agent→human`;
  approve/reject → pass back. Holder badge on cockpit rows. The
  chain-of-custody populates itself. *(S)*
- [ ] **W2-3 · Pool ops dashboard** — live utilization per member and
  pool, overflow events, throughput per tier, complexity mix. The
  "senior counsel freed for strategic work" slide. *(M)*
- [ ] **W2-4 · Multi-leg SLA** — separate clocks per leg (triage → GCC
  work → senior counsel), leg boundaries from stage/hand-off events; a
  hand-off can no longer hide a breach. *(M–L — DRL marquee #2)*
- [ ] **W2-5 · Escalation rule actions** — `escalateTo` +
  `requireApprovalFrom` on routing rules. *(S–M)*

## Wave 3 — Channels & requester delight *(adoption at scale)*

- [ ] **W3-1 · Teams/Slack intake channel** — file + track from
  Microsoft Teams (DRL is an M365 shop; Slack second). Same P4a ingest
  path. *(M — table stakes per benchmark: Checkbox/Tonkean lead here)*
- [ ] **W3-2 · Notifications** — outbound email on assignment, stage
  change, breach, closure (P4b sendMail path exists); per-user digest
  toggle. *(M)*
- [ ] **W3-3 · Dynamic request-type fields** — render each type's
  configured `IntakeRequestField`s on New Request; persist
  `requestFieldValuesJson`; show on detail + timeline. Makes DRL's 10
  contract subtypes / DPIA / notices pure config. *(S–M)*
- [ ] **W3-4 · Conflict check** — one click from Parties: every ticket
  AND matter involving this counterparty/person. The one-brain pitch
  made tangible. *(S)*
- [ ] **W3-5 · Effort capture** — minutes-per-task quick entry; feeds
  throughput-per-tier in the pool dashboard. *(S)*

## Wave 4 — Smooth-at-scale hardening *(lots of people, no jank)*

- [ ] **W4-1 · Instant-feel pass** — skeleton loaders + optimistic
  updates + shared-Toast standardization + designed empty/error states
  across every intake surface; error boundaries so one failed panel
  never blanks a page. *(M)*
- [ ] **W4-2 · Sync performance** — retire the whole-array polyfill
  save for hot paths: per-ticket mutation endpoints + inbox pagination/
  virtualized lists. The single biggest many-users scale risk. *(L)*
- [ ] **W4-3 · Mobile pass** — requester surfaces (New Request, My
  Requests, Self-Service) fully phone-usable; staff surfaces tablet-
  usable. *(M)*
- [ ] **W4-4 · Accessibility pass** — focus order, aria labels,
  contrast, reduced-motion on the daily surfaces. *(S–M)*
- [ ] **W4-5 · Observability** — Sentry + structured request logs +
  slow-query flagging (DRL bucket A; also the "risk controls" the
  analyst shakeout finding rewards). *(S–M)*
- [ ] **W4-6 · Upload at scale** — blob storage + presigned direct
  upload (removes the 3 MB cap, retains original bytes) + pdf.js
  extraction upgrade. *(M)*
- [ ] **W4-7 · SSO federation (Entra ID)** — the DRL pilot blocker;
  NextAuth/OIDC swap is pre-planned in `@aegis/auth`. *(M — config +
  light build; schedule against client onboarding)*

## Explicitly NOT in this backlog
- Workshop-gated DRL config (tier matrix values, per-leg SLA numbers,
  workstream field sets) — data entry once workshops land.
- External tool integrations (CLM/DMS/ITSM/e-sign) — per-connector
  estimates after discovery.
- Positioning note from the benchmark: lead with measurable outcomes +
  risk controls; do NOT use the refuted EU-AI-Act-tailwind claim.
