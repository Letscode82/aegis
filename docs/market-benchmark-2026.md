# Market benchmark — AEGIS Intake vs. the field (July 2026)

Source: deep-research run (58 agents, multi-source, adversarially
verified). Two evidence tiers below: **[verified]** = survived 3-vote
adversarial fact-check against primary sources; **[directional]» =
vendor marketing / product pages surfaced in research but not
independently verified — treat as "what vendors claim," good enough for
positioning awareness, not for public competitive claims.

## The market moment [verified]

- Gartner formally created **"agentic AI for legal"** as a named
  category in its **September 2025 Hype Cycle** for Legal, Risk,
  Compliance and Audit Technologies — positioned **pre-mainstream**.
  The thing AEGIS does now has an analyst-sanctioned name, and no
  vendor is at mainstream adoption: early-mover window is open.
  (Checkbox and Tonkean are named Sample Vendors in the same cycle.)
- Buying climate is **pragmatic, not hype-driven**: Gartner tells
  leaders to demand "measurable outcomes and sustainable adoption."
- The shakeout is predicted: Gartner — **>40% of agentic-AI projects
  canceled by end-2027** (costs, unclear value, **inadequate risk
  controls**); Forrester — 25% of planned AI spend deferred to 2027.
  → Sell **provable workflow outcomes + risk controls**, not AI magic.
- In-house legal is the **fastest-adopting buyer**: GenAI use 23%→52%
  in one year (ACC/Everlaw, Oct 2025); 64% expect less reliance on
  outside counsel.
- ⚠ Do **not** use the "EU AI Act / Colorado 2026 human-oversight
  mandate tailwind" line in positioning — that claim failed
  verification (0–3 refuted).

## Who does what [directional — vendor-claimed]

| Vendor | What they ship |
|---|---|
| **Checkbox** (Gartner Sample Vendor) | AI agent at the front door: qualifying questions → auto-created matter → workflow; attorneys review/correct agent output in a dashboard; routing "by matter type, lawyer expertise, **capacity** and business unit" (closest public claim to load-aware routing; **no explicit seniority-tier pools**). |
| **Tonkean LegalWorks** | Most "agentic" intake player: AI Front Door in Slack/Teams/email **autonomously resolves simple requests** (NDAs, SOWs), routes complex to a person/practice group; explicit human-in-the-loop posture; real-time per-matter dashboards for attorneys **and** requesters ("eliminate the where-are-we emails"). |
| **ServiceNow Legal Service Delivery** | The most mature **role-based UX**: "Legal Counsel Center" = personal work inbox (assigned matters, tasks, SLA); employee portal = requester **"my requests"** status view; Now Assist agent predicts category and initiates transfers **only after confirmation from the legal fulfiller** — a horizontal-platform human approval gate. |
| **Xakia** | Intake forms + automated routing + priority triage + **Internal Client Portal** (requesters submit, track, self-serve answers); publishes per-user pricing; markets "73% drop in days-to-completion." |
| **Harvey (Workflow Agents)** | Human-in-the-loop **checkpoints** as a core design: agent surfaces decisions, flags confirmation moments, delivers structured output for lawyer review; huge production scale. Firm-side, not an intake platform. |
| **Robin AI vs Luminance** | The philosophical split of the wave: Robin auto-redlines within a playbook and **escalates to humans**; Luminance ships "Autonomous Negotiation" with **no human by default**. |
| **Streamline AI** | The "Jira for lawyers" argument: purpose-built beats JSM on legal-native request types + stage workflows; tiered pricing by workflow count. |

## Verdict on AEGIS features: table stakes vs. differentiated

**Commodity / table stakes (leaders already ship it — we build for
parity, not glory):**
- Requester **"My Requests" portal** — Xakia, ServiceNow, Tonkean all
  have it. Its absence is a visible gap.
- Personal **"My Work" inbox** — ServiceNow's Legal Counsel Center is
  the reference pattern.
- Multi-channel intake incl. **Slack/Teams** — Checkbox/Tonkean lead;
  we have form/copilot/email/upload but **no Slack/Teams channel**.
- No-code request types + stage workflows, dashboards, basic SLA,
  AI triage/auto-routing — commodity; AEGIS has these ✅.
- A per-ticket **activity record** — claimed widely at basic level.

**Differentiated (nothing comparable surfaced in the research):**
1. **Schema-enforced agent approval gate** — `AgentDecision` where a
   PENDING recommendation *cannot* mutate state (governance in the
   database, not the prompt). Others gate in UX; we gate in schema.
2. **Agent↔human baton-pass ledger** — first-class, append-only
   chain-of-custody of who (agent or human) held each request and why.
   No vendor material showed an equivalent.
3. **Cryptographically chained audit log** — tamper-evident,
   court-exportable. Directly answers the #1 predicted failure cause
   of agentic projects ("inadequate risk controls").
4. **Explicit tier pools with least-loaded/round-robin + overflow** —
   Checkbox claims capacity-aware routing; nobody showed seniority
   pools with load-balancing and overflow chains as config.
5. *(Conditional)* the **unified per-ticket timeline** is table stakes
   at the basic level — it becomes differentiated **if** it renders
   agent actions and human actions as one verifiable chain (ours can,
   because the ledger exists).

**Caveat:** "differentiated" here means *not surfaced in any vendor's
public material* — absence of marketing ≠ absence of feature. Safe
phrasing for client decks: "evidence-grade agent accountability that,
to our knowledge, no legal front-door vendor offers."

## What this changes in the build order

Nothing — it **confirms** it. The One-Stop UX loop (My Work → My
Requests → unified timeline → role-shaped nav → stage advancement) is
exactly the table-stakes parity work the leaders already ship, and the
differentiators (gate, ledger, chain) are already built — they need the
timeline surface to become *visible*. Additions to backlog from this
research:
- **Slack/Teams intake channel** (table stakes among leaders).
- Positioning language: lead with measurable outcomes (days-to-
  completion, SLA adherence) + risk controls; avoid the refuted
  regulatory-tailwind claim.
