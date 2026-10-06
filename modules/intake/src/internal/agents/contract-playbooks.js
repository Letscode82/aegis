// ── Contract-Type Specialist — versioned playbook catalog ───────────
//
// (GC Suite Working Architecture, Agent 11.) One configurable agent
// carrying per-type playbooks — deep type-specific review without a
// codebase per type. Each playbook is counsel-ownable prose: mandatory
// clauses, forbidden clauses, negotiable bands with standard fallbacks,
// and the type's escalation gates from the approval matrix.
//
// Selection is DETERMINISTIC (regex over type/category/description) so
// the approver's first check — "was the right playbook applied?" — is
// verifiable from the matchedOn text the agent cites. Tickets whose
// contract type matches no playbook fall through to the generalist
// Contract Review agent (doc: "unmatched types fall through to
// Agent 4"); the router order encodes that fallthrough.
//
// Versioning: every playbook carries {id, version, owner, reviewedAt}.
// The recommendation stamps the applied playbook, so every review is
// reproducible — which standard, which version. Editing a playbook's
// bands MUST bump its version. DB-backed, admin-editable playbooks are
// the planned follow-up; this catalog is the seeded starting set.

export const CONTRACT_PLAYBOOKS=[
  {
    id:"PB-CLINICAL",
    version:"v1",
    label:"Clinical Trial / Study Agreements",
    owner:"Senior Counsel — Regulatory",
    reviewedAt:"2026-07-01",
    match:/clinical (?:trial|study|research) (?:agreement|contract)|\bcta\b.{0,30}(?:clinical|trial|site|investigator)|investigator agreement|study site agreement/i,
    mandatory:[
      "Regulatory compliance clause (GCP/ICH, local drug-authority regs) with audit rights",
      "Adverse-event reporting obligations with defined timelines",
      "Subject injury / indemnification of trial subjects (sponsor-side)",
      "Publication rights with pre-review window (max 60 days) — no permanent gag",
      "Data ownership: sponsor owns study data; site retains medical records",
    ],
    forbidden:[
      "Any clause limiting the site's duty to report safety events",
      "Uncapped site indemnity for sponsor's protocol design",
      "Assignment of subjects' personal data beyond the study purpose",
    ],
    negotiable:[
      "Per-subject budget and screen-failure payment bands",
      "IP: inventions from protocol → sponsor; site background IP carve-out standard",
      "Publication review window 30–60 days (never suppression)",
    ],
    escalation:{
      always:"Any clinical-trial agreement routes to senior counsel regardless of value (approval matrix).",
      triggers:[],
    },
  },
  {
    id:"PB-LICENSING",
    version:"v1",
    label:"Licensing (IP in/out)",
    owner:"Counsel — IP & Technology",
    reviewedAt:"2026-07-01",
    match:/licens(?:e|ing) (?:agreement|deal|contract|arrangement)|(?:trademark|patent|technology|software|brand|ip) licens|royalt(?:y|ies)/i,
    mandatory:[
      "Precise grant scope: field of use, territory, exclusivity, sublicensing rights each stated expressly",
      "Quality control provisions on trademark licenses (naked licensing risk)",
      "Audit rights on royalty-bearing licenses (records + inspection window)",
      "Termination consequences: wind-down/sell-off period and IP reversion stated",
    ],
    forbidden:[
      "Perpetual exclusive license without minimum-performance or termination gates",
      "Implied licenses beyond the express grant ('all IP necessary or useful')",
      "Assignment of our background IP disguised as a license",
    ],
    negotiable:[
      "Royalty rate and minimum guarantees (band set per deal by IP counsel)",
      "Exclusivity in exchange for minimums — never exclusivity for free",
      "Improvements ownership: cross-license standard fallback",
    ],
    escalation:{
      always:null,
      triggers:[
        {pattern:/exclusiv/i,reason:"Exclusive grant — IP counsel sign-off gate (approval matrix)."},
        {pattern:/perpetual|irrevocabl/i,reason:"Perpetual/irrevocable grant — senior counsel gate."},
      ],
    },
  },
  {
    id:"PB-SUPPLY",
    version:"v1",
    label:"Supply / Purchase Agreements",
    owner:"Counsel — Commercial",
    reviewedAt:"2026-07-01",
    match:/supply (?:agreement|contract)|purchase agreement|master supply|supplier agreement|(?:raw material|component|goods).{0,20}(?:supply|purchase)/i,
    mandatory:[
      "Specifications + quality standards incorporated with change-control",
      "Delivery terms (Incoterms named) and title/risk transfer point",
      "Warranty: conformance to spec + non-infringement; remedy = repair/replace/refund",
      "Supply continuity: notice period for discontinuation; capacity commitments if sole-source",
    ],
    forbidden:[
      "Unilateral price escalation without cap or index",
      "Exclusivity or minimum-purchase commitments without matching supply commitments",
      "AS-IS supply of production materials",
    ],
    negotiable:[
      "Price adjustment: indexed (CPI/commodity) with cap, reviewed annually",
      "Liability cap: 12 months' spend; carve-outs for IP, confidentiality, recall costs",
      "Rebates/volume discounts per procurement band",
    ],
    escalation:{
      always:null,
      triggers:[
        {pattern:/sole.{0,3}source|single.{0,3}source/i,reason:"Sole-source dependency — supply-risk gate: senior counsel + procurement lead."},
        {pattern:/exclusiv/i,reason:"Exclusivity commitment — senior counsel gate."},
      ],
    },
  },
  {
    id:"PB-VENDOR-SERVICES",
    version:"v1",
    label:"Vendor / Professional Services",
    owner:"Counsel — Commercial",
    reviewedAt:"2026-07-01",
    match:/services agreement|professional services|consulting (?:agreement|contract|services)|\bmsa\b.{0,40}(?:vendor|services|consult)|statement of work|\bsow\b.{0,30}(?:review|services|vendor)/i,
    mandatory:[
      "Deliverables + acceptance criteria stated (30-day acceptance window)",
      "IP: present-tense assignment of deliverables; license-back for vendor background IP",
      "Data protection terms (DPA) when personal data is processed",
      "Insurance requirements matched to service risk (professional liability for advice work)",
    ],
    forbidden:[
      "Unlimited liability on our side; AS-IS for paid deliverables",
      "Auto-renewal with notice window over 60 days or uncapped uplift",
      "Vendor ownership of work product created for us",
    ],
    negotiable:[
      "Liability cap: 12 months' fees; uncapped carve-outs for IP infringement, confidentiality, indemnity, gross negligence",
      "Payment: Net 45 (Net 30 only with ≥2% prompt-pay discount)",
      "Rate escalation: capped at lesser of 5% or CPI",
    ],
    escalation:{
      always:null,
      triggers:[
        {pattern:/unlimited liabilit|no (?:liability )?cap/i,reason:"Uncapped-liability position described — REJECT band, counsel gate."},
      ],
    },
  },
];

/**
 * Deterministic playbook selection. Returns
 *   { playbook, matchedOn, alsoMatched } — alsoMatched non-empty means a
 * HYBRID document (doc risk 4: a single playbook may under-review the
 * secondary aspects) — the agent surfaces it as a concern.
 * Returns null when no playbook matches → router falls through to the
 * generalist Contract Review agent.
 */
export function selectPlaybook(ticket){
  const hay=[ticket.type||"",ticket.aiTriage?.category||"",ticket.desc||""].join(" \n ");
  const hits=[];
  for(const pb of CONTRACT_PLAYBOOKS){
    const m=hay.match(pb.match);
    if(m) hits.push({playbook:pb,matchedOn:m[0]});
  }
  if(hits.length===0) return null;
  return {
    playbook:hits[0].playbook,
    matchedOn:hits[0].matchedOn,
    alsoMatched:hits.slice(1).map(h=>h.playbook.label),
  };
}
