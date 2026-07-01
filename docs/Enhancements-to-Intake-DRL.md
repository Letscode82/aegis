# Enhancements to Intake — Dr. Reddy's (DRL) GCC

Work assessment: the delta from the current GC Suite intake module to a
deployment that meets Dr. Reddy's Global Capability Centre (GCC)
requirements. Sizing is engineering rough-order-of-magnitude for one
team: **S** ≤ ~3 days, **M** ~1–2 weeks, **L** ~2–4 weeks, **XL** 4+
weeks. Integration effort cannot be sized until the discovery workshop.

## Framing
The **capture → triage → route → SLA → audit** spine, the 6 specialist
agents, legal-hold, matter auto-spawn, and the client-deployment
readiness items (production seed, secrets-at-rest, webhook hardening,
Intake-only profile) are **already built**. The new work clusters into
five buckets. The two marquee items are **seniority-tier routing** (an
extension of the existing Smart Routing module — see below) and a
**delivery/work-tracking layer**.

---

## A. Platform / deployment foundation (hostable for a real client)
| Item | Type | Size | Blocks pilot? |
|---|---|---|---|
| Auth0 **SSO federation to their IdP** (likely Entra ID) | Config + light build | **M** | **Yes** |
| Observability (error tracking + structured logs) | Build | **S–M** | Recommended |
| Data-residency / access model for **India-origin requests served from HYD** | Discovery + config | **S** | Confirm early |
| Secrets/KMS, production seed, rate-limit, Intake-only profile | — | **DONE** | — |
| Multi-tenant row-isolation | Build | **L** | **No** — a single dedicated deployment covers the pilot |

---

## B. Request-type coverage (the workstreams they listed)
They named more than three: 10 contract types, NDAs, **data-privacy
assessments**, **marketing-material review**, **trademarks**,
**non-court-facing litigation**, and **notice management**.
| Item | Type | Size | Notes |
|---|---|---|---|
| Per-workstream **request types + structured forms + stage workflows** (`IntakeRequestType`, mirrors `MatterTypeConfig`) | Build | **M–L** | The framework for *all* types; foundational |
| **Litigation (non-court-facing) intake agent** + deadline/party extraction + **legal-hold auto-trigger** | Build | **L** | Differentiator; reuses the built legal-hold lifecycle |
| **Trademark** enhancement — NICE-class tagging, conflict-vs-own-marks (base agent already live) | Build | **M** | Optional: live USPTO/EUIPO/WIPO later (same pattern as our live OFAC feed) |
| **Notice management** type + workflow | Build | **M** | |
| **Data-privacy assessment (DPIA)** intake type (privacy category exists) | Build | **M** | |
| **Marketing-material review** type (+ light agent or human route) | Build | **S–M** | |
| **10 contract subtypes** on the Contract type/agent | Config | **S–M** | |

---

## C. Routing & team model *(marquee gap #1 — an extension of Smart Routing)*

**Can seniority/competency tiering be handled with the built Smart
Routing module? Yes — for the practical version, and the rest is a small
extension of the same module, not a new system.**

**Works by config today (no build):** the rule engine routes by **type /
priority / department / keyword → assignee or team**, evaluated in order,
audited, with an admin UI. So tier rules are configurable now — e.g.
"standard NDA → Tier-1 queue," "Critical or Litigation → senior counsel."
A rule-based tier demo is possible immediately.

**The only real build (extends the same module):**
1. Assign to a **pool/band** instead of one named person.
2. **Complexity signal** to drive the tier (from the classifier/agent) +
   a `matchComplexity` condition.
3. **Load-balancing within a band** (round-robin / least-loaded) + basic
   capacity/availability data.
4. **Overflow to senior counsel** based on capacity.
5. *(Optional)* a skills/practice-area competency model for fit-based
   routing beyond seniority.

| Item | Type | Size | Blocks pilot? |
|---|---|---|---|
| **Tiering layer on Smart Routing** — pool assignment + complexity signal + load-balancing + overflow | Build (extension) | **M–L** | **Yes** — config preview available now; pool/load-balancing/overflow is the build |
| **Agent ↔ human hand-off model** — explicit, audited baton-pass (agent drafts → human reviews → back), ticket never leaves the platform | Build | **M–L** | **Yes** |
| **No-bureaucracy** direct-to-GCC routing policy (GC head visible, not a bottleneck) | Config | **S** | Yes (easy) |

> Reframe for the client: *"Tiered routing isn't a new system — it's a
> layer on our existing smart-routing engine. Rule-based tier assignment
> works today; we add pooled assignment, a complexity signal, and
> load-balancing/overflow so requests flow to the right seniority band
> automatically and rebalance under load."*

---

## D. Delivery tracking & SLA *(marquee gap #2)*
| Item | Type | Size | Notes |
|---|---|---|---|
| **Delivery / work-in-progress layer** under the request — sub-tasks, in-matter assignments, effort/time capture, throughput per tier ("*how delivery is happening*") | Build | **L** | New surface beneath request-status |
| **Multi-leg SLAs** — separate clocks for triage / GCC work / senior-counsel legs, so a hand-off can't hide a breach | Build | **M–L** | Extends the existing SLA engine |
| **Manager / tier ops analytics** — utilization by seniority band, backlog, turnaround (proves strategic capacity freed up) | Build | **M–L** | Extends the existing dashboards |

---

## E. Integrations (workshop-gated — not estimable yet)
| Item | Type | Size | Notes |
|---|---|---|---|
| Connector map for **their stack** (CLM/DMS, ITSM/ticketing, M365, e-sign, DLP/privacy) | Discovery → build per connector | **XL / TBD** | **Cannot size until the workshop** reveals the tools; each connector is a separate estimate |

---

## Recommended phasing
**Phase 0 — Foundation (near-done):** Auth0 SSO + observability +
residency confirm → hostable for the client.

**Phase 1 — Pilot (3 workstreams, end-to-end):** request-type framework +
**Litigation agent** + Trademark enhancement + **tiering layer on Smart
Routing** + **agent↔human hand-off** + **multi-leg SLA** + **manager
dashboard v1**. Rough order: **~1.5–2.5 months**, one team, excluding
integrations.

**Phase 2 — Scale toward GC Suite:** remaining request types (notices,
marketing, DPIA, 10 contract subtypes), deeper delivery/WIP + analytics,
and **integrations** (post-discovery).

---

## What the workshop must resolve before estimates firm up
1. **Their tool stack** (integration scope — the biggest unknown).
2. **Exact tiering / competency matrix** and overflow rules to senior counsel.
3. **SLA definitions** per request type and per leg.
4. **Volumes** per workstream (capacity / load-balancing sizing).
5. **Data residency / access** rules for India-origin requests.

---

## One-line summary
The intake spine and deployment foundation are ready. Pilot build =
**request-type framework + Litigation agent + a tiering layer on the
existing Smart Routing module + agent↔human hand-off + multi-leg SLA + a
delivery-tracking layer with manager analytics** (~1.5–2.5 months, one
team). Integrations are workshop-gated and sized after discovery.
