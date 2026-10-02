---
name: intake-meeting-brief
description: >-
  Prepares a one-page brief for a negotiation, regulator, board, counterparty, opposing-counsel or internal
  stakeholder meeting from matter materials: objective, position, asks, red lines, likely questions with answers,
  and what not to say. Use when someone says "brief me for tomorrow's call", "prep for the meeting with X", or a
  meeting is calendared on a matter. Not for full negotiation strategy → contracts/negotiation-prep; board pack
  section → corporate/board-pack; regulator response strategy → disputes/regulatory-investigation.
module: intake
version: 1.0.0
jurisdictions: [global]
risk_tier: internal
inputs:
  - name: meeting
    required: true
    description: Type, date/time, attendees (both sides, roles), agenda, format (in-person, video), recorded or not.
  - name: matter_materials
    required: true
    description: Matter record, key documents, latest correspondence, prior meeting notes, issues list.
  - name: objective
    required: false
    description: What our side wants from this meeting. Inferred from the matter if not given, and stated as an assumption.
  - name: audience
    required: false
    description: Who reads the brief (GC, business executive, outside counsel). Sets depth and tone.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md]
related: [contracts/negotiation-prep, contracts/contract-review, corporate/board-pack, disputes/regulatory-investigation, disputes/settlement-agreement, disputes/adversarial-stress-test, matters/status-report, matters/stakeholder-comms, intake/conflict-check-prep, research/citation-verification]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Meeting Brief

A good brief lets a busy person walk into a room knowing what they want, what they will give, what they must not say, and what the other side will ask. This skill compresses matter materials into one page (two at most for regulator meetings), with every factual claim sourced to the file so the reader can trust it under pressure.

## When to use / not use

- Use: negotiation calls, counterparty escalations, regulator meetings, opposing-counsel without-prejudice discussions, board or committee pre-briefs, business-stakeholder updates, outside-counsel kick-offs.
- Hand off: concession sequencing and BATNA analysis → `contracts/negotiation-prep`; regulator engagement strategy and privilege protocol → `disputes/regulatory-investigation`; board paper → `corporate/board-pack`; stress-testing our argument → `disputes/adversarial-stress-test`.

## Inputs to collect first

1. **Meeting type and attendees** — attendees decide what can be said (e.g. a regulator, a counterparty with its lawyer present, an employee who is also a witness).
2. **Our objective** in one sentence, and the minimum acceptable outcome. If the user cannot state it, propose one from the matter and label it an assumption.
3. **Latest position** — the most recent correspondence; briefs built on stale positions are dangerous. Ask "is there anything since <date of latest document>?".
4. **Status of discussions** — open, without prejudice / settlement privilege, or regulator on-record.

## Method

1. **Build the fact base.** Extract a short dated chronology (≤ 8 entries) of what matters for this meeting, each with source pinpoint. Conflicts between documents → note them; do not resolve by guessing.
2. **State objective and outcomes.** Objective; ideal outcome; acceptable outcome; walk-away (the point at which we end the meeting and escalate). For a regulator meeting, the objective is usually information exchange and credibility, not "winning".
3. **Map the other side.** Attendees, role, decision power, their likely objectives and pressure points (from correspondence, not speculation). Mark anything inferred `[inferred]`.
4. **Positions and asks.** For each open issue: our position, basis (contract clause or authority), what we can offer, what we need in return. Pull from the issues list or `contracts/contract-review` output where it exists; do not invent new concessions — offers must be pre-approved or marked `requires approval from <role>`.
5. **Anticipate questions.** 5–8 likely questions with short, accurate answers. Include the hardest question honestly. Where the answer is unknown or sensitive, the scripted answer is "we'll come back to you on that" — never a guess.
6. **Do-not-say list.** Admissions of liability, speculation about causes, statements about privileged advice, commitments on timelines not agreed internally, price or market information to competitors, disparagement, anything inconsistent with a filed position or disclosure.
7. **Logistics and protocol.** Who leads, who takes notes, whether the meeting is "without prejudice" (state it at the start where applicable), whether recording is permitted, follow-up owner.
8. **Risk check.** Score any risk the meeting itself creates (`_shared/severity-scale.md`): e.g. waiving privilege by sharing advice (S2), competition-law exposure in a competitor meeting (S1), making a regulator statement that is inaccurate (S1). Each risk gets a mitigation in the brief.

## Checks by meeting type

| Meeting type | Must include | Default risk if missing | Mitigation |
|---|---|---|---|
| Commercial negotiation | Issues ranked must-have / trade-able; approved concessions; signing authority in room | S3 | Pre-approve concessions; `contracts/negotiation-prep` |
| Settlement discussion | Without-prejudice label; settlement range approved; authority; no admissions | S2 | Confirm WP basis in writing first |
| Regulator / authority | Accurate facts only, checked by subject-matter owner; counsel present; record of what was provided; no speculation; privilege protocol | S1 if inaccurate statements possible | Fact-check sheet; single spokesperson |
| Opposing counsel | Current procedural posture and deadlines; what we will and will not disclose | S2 | — |
| Competitor (JV, industry body, standards) | Agenda reviewed by Legal; no discussion of prices, capacity, customers, bids; counsel attends; minutes | S1 | Competition guardrails script → `regulatory/competition-merger-control` |
| Board / committee | Decision sought, options, recommendation, risk movement, resolution wording | S3 | `corporate/board-pack` |
| Employee / witness | Purpose, confidentiality, no retaliation, right to representation where applicable | S2 | `employment/workplace-investigation` |
| Government official (India or elsewhere) | Anti-bribery guardrails: no gifts/hospitality outside policy; no intermediaries; record of meeting | S2 | `regulatory/anti-bribery` |

## Jurisdiction notes

- **India**: settlement communications are protected in mediation under the Mediation Act 2023 and in conciliation under the A&C Act 1996 s.81; outside formal processes, "without prejudice" protection is less settled than in England `[general principle — verify]` — keep offers conditional and in writing. In meetings with listed-company implications, unpublished price-sensitive information is governed by SEBI (PIT) Regulations 2015 — maintain the structured digital database of recipients.
- **England & Wales**: without-prejudice rule protects genuine settlement attempts; label alone is not decisive.
- **US**: FRE 408 limits use of settlement communications to prove liability, but not for all purposes `[general principle — verify]`.
- **EU/UK competition**: information exchange with competitors can be an infringement by itself (TFEU Art. 101; Competition Act 1998 Ch. I); India — Competition Act 2002 s.3.

## Output

One page. Line one: `Meeting: <type> with <party>, <date/time> — Objective: <one sentence>`. Sections in order:

1. **Objective & outcomes** — ideal / acceptable / walk-away.
2. **Context in 5 bullets** — sourced.
3. **Who's in the room** — names, roles, likely stance.
4. **Our positions & asks** — table: issue · our position · basis · can offer · need in return.
5. **Likely questions & answers** — 5–8.
6. **Do not say** — bullet list.
7. **Risks & guardrails** — findings array (severity per scale) with mitigations.
8. **Follow-up** — owner, what, by when.

Positions table example:

| Issue | Our position | Basis | Can offer | Need in return |
|---|---|---|---|---|
| Liability cap | 200% of annual fees | Playbook LOL-CAP-01; cl. 15.1 draft | 150% (rung 1, business-owner approval) | Data super-cap retained at 3× |
| Payment term | 60 days | Treasury policy | 45 days | Early-payment discount 1% |
| Termination for convenience | 60 days' notice | cl. 19.2 | Fee tapering over year 1 | Exit assistance at current rates |

Then `Assumptions & gaps` and `Sources` per `_shared/output-contract.md`. Mark `Privileged & Confidential — prepared at the direction of counsel` where the matter is privileged; warn that sharing the brief outside Legal may waive privilege.

## Edge cases & pitfalls

- **The brief will be forwarded.** Write it so that if the other side saw it, nothing in it would be an admission — keep candid risk assessment in a separate privileged annex.
- **Stale facts** are the main failure: date-stamp the brief and the latest document relied on.
- **Over-length**: if it does not fit one page, cut context, not the do-not-say list or the questions.
- **Cited law**: any case or rule cited for use in the meeting must go through `research/citation-verification` first; reading out a wrong citation to a regulator or opposing counsel is costly.
- **Unapproved concessions**: if the materials do not show an approved fallback, the brief says "no authority to concede — escalate to <role>" rather than proposing one.
