// ── GC Suite agent profiles (Working Architecture doc, July 2026) ────
//
// Per-agent constants from the agent architecture document: the
// "Risks to weigh before approving / using the response" checklist and
// the playbook/standard the agent applies. buildRec() attaches these
// to every recommendation by agentId, so the Cockpit can render the
// approver-facing risk panel and the playbook stamp without each
// call site repeating them. Editing this file IS editing the product's
// approval guidance — keep it aligned with the architecture doc.

export const AGENT_PROFILES={
  "nda-agent":{
    playbook:{id:"NDA-PLAYBOOK",version:"MNDA-v4.2"},
    risks:[
      "Entity-resolution: a fuzzy match may hit the wrong legal entity (affiliate vs parent) — verify the exact legal name before relying on a prior-NDA result.",
      "Stale precedent: a found NDA may be expired, superseded, or scoped to a different purpose — check term and purpose before reuse.",
      "Playbook currency: the agent applies the playbook as written; recent policy changes may not be reflected.",
      "Purpose mismatch: the agent sees the stated purpose, not what will actually be disclosed — confirm scope on anything sensitive.",
    ],
  },
  "vendor-intake-agent":{
    playbook:{id:"SANCTIONS-SCREEN",version:"RULE-8"},
    risks:[
      "Transliteration false negatives: name variants can slip fuzzy matching — a 'clear' is a screening result, not a guarantee.",
      "Ownership blindness (50% rule): majority-owned entities of sanctioned parties may not be listed themselves — high-risk geographies need ownership diligence.",
      "List scope: configured lists only — regimes not wired (e.g. additional national lists) must be checked manually.",
      "Point-in-time result: lists change daily — rely on the re-screen cadence, not the onboarding clear.",
    ],
  },
  "trademark-agent":{
    playbook:{id:"TM-CLEARANCE",version:"prelim-v1"},
    risks:[
      "NOT a registry search: identical or confusingly-similar registered marks can exist that the agent cannot see — the formal USPTO/EUIPO/WIPO search is mandatory.",
      "Common-law marks are invisible: unregistered marks with market presence won't appear — major launches need a full search vendor.",
      "Similarity judgment limits: phonetic/visual/conceptual similarity is a jurisdiction-specific legal judgment; treat this as a first pass.",
      "Class-mapping errors: wrong NICE classes mean searching the wrong space — verify before the formal search.",
    ],
  },
  "contract-review-agent":{
    playbook:{id:"RISK-TERM-CHECKLIST",version:"v1"},
    risks:[
      "Missing commercial context: the agent doesn't know deal value or leverage — a 'reject-level' issue may be commercially acceptable, and vice versa.",
      "Cross-document dependencies: MSAs, SOWs, and side letters interact; controlling terms may live outside the reviewed text.",
      "Defined-term traps: definitions can re-weaponise innocuous clauses — verify flagged clauses against the definitions section.",
      "Jurisdictional nuance: enforceability of caps and penalties varies by governing law — positions are starting points outside the playbook's home law.",
    ],
  },
  "faq-agent":{
    playbook:{id:"APPROVED-KB",version:"curated"},
    risks:[
      "Stale knowledge base: the answer is only as current as the last KB review — check the entry's review date on anything time-sensitive.",
      "Routine-looking, unusual facts: a standard question can hide non-standard circumstances — err toward handoff on any wrinkle.",
      "Perceived clearance: business users treat answers from legal's system as approval — the guidance framing must survive copy-paste.",
    ],
  },
  "policy-qa-agent":{
    playbook:{id:"POLICY-CORPUS",version:"current"},
    risks:[
      "Superseded versions: if old versions remain marked current, the agent cites dead policy — single-current-version hygiene is a prerequisite.",
      "Policy-vs-practice gaps: answers are correct-to-the-document, which is not always correct-to-the-organisation.",
      "Cross-policy conflicts: overlapping policies can contradict — the agent flags, but resolution is a policy-owner decision.",
    ],
  },
  "litigation-agent":{
    playbook:{id:"CASE-BRIEF",version:"non-court-facing-v1"},
    risks:[
      "Privilege exposure of the brief itself: it is a sensitive litigation document — confirm access scope before circulating beyond the matter team.",
      "The record is not the world: a thin result does not mean low exposure — 'no documents found' must never be read as 'no documents exist'.",
      "Characterisation drift: the brief's narrative can anchor counsel's framing prematurely — treat it as an evidence index, not a theory of the case.",
    ],
  },
};

export function profileFor(agentId){
  return AGENT_PROFILES[agentId]||null;
}
