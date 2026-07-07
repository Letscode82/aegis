import { buildRec, buildDegradedRec } from "./build-rec";
import {
  detectDataCategories, detectTransfer, detectNovelTech, detectHighVolume,
  regimeTriggers, gapsList, assessPrivacyRisk,
} from "./privacy-signals";
import { callClaudeJSON, friendlyAIError } from "@aegis/ai";

// ── Agent 7 · Data-Privacy Assessment (GC Suite Working Architecture)
//
// Triage for privacy / DPIA requests: identifies data categories and
// processing purpose, flags cross-border transfers, applies the
// configured regime triggers (DPDP Act, GDPR, CCPA), and drafts a
// preliminary assessment with a risk rating — plus, critically, the
// GAPS LIST: what the requester's description did not cover.
//
// Division of labour: category taxonomy, transfer/novel-tech flags,
// the risk rating, and the gaps list are DETERMINISTIC
// (./privacy-signals) with the matched text cited. Claude writes the
// assessment prose around those facts. HIGH never stays with the
// agent; sensitive categories, children's data, cross-border
// transfers, and AI/profiling escalate ALWAYS.
export const PrivacyAssessmentAgent={
  id:"privacy-assessment-agent",
  name:"Privacy Assessment Agent",
  shortName:"Privacy",
  icon:"◉",
  description:"Triage for privacy/DPIA requests: detects data categories, cross-border transfers, and novel tech; applies regime triggers (DPDP/GDPR/CCPA); rates risk deterministically and lists the gaps the requester's description didn't cover. Sensitive categories, children's data, transfers, and AI/profiling always escalate.",
  productionReady:true,

  canHandle(ticket){
    const cat=(ticket.aiTriage?.category||"").toLowerCase();
    const type=(ticket.type||"").toLowerCase();
    const d=(ticket.desc||"").toLowerCase();
    // Plain policy QUESTIONS stay with the FAQ / Policy agents — this
    // agent assesses processing initiatives, it doesn't answer queries.
    if(/^\s*(what|how|does|can|is|are|when|who|where|why)\b/.test(d)) return false;
    if(/privacy|dpia|data protection/.test(type)||/privacy|dpia/.test(cat)) return true;
    return /\bdpia\b|privacy (?:assessment|review|impact)|data protection (?:assessment|review|impact)|(?:new|launching|rolling out|implementing|deploying|onboarding).{0,80}(?:personal|customer|employee|user) data|process(?:ing|es)? personal data|cross.?border transfer/.test(d);
  },

  async process(ticket){
    const text=ticket.desc||"";
    const categories=detectDataCategories(text);
    const transfer=detectTransfer(text);
    const novelTech=detectNovelTech(text);
    const highVolume=detectHighVolume(text);
    const regimes=regimeTriggers(text);
    const gaps=gapsList(text);
    const risk=assessPrivacyRisk({categories,transfer,novelTech,highVolume});

    // Deterministic evidence — every flag cites the text it matched.
    const evidenceConcerns=[
      `Risk rating: ${risk.rating} (deterministic: category × volume × transfer × novelty).`,
      ...categories.map(c=>`Data category — ${c.label}: matched "${c.matched}".`),
      ...(transfer.flag?[`Cross-border transfer signal: matched "${transfer.matched}".`]:[]),
      ...(novelTech.flag?[`Novel technology signal: matched "${novelTech.matched}".`]:[]),
      ...(highVolume.flag?[`Large-scale processing signal: matched "${highVolume.matched}".`]:[]),
      `Regime triggers: ${regimes.map(r=>r.regime+(r.certain?"":" (verify applicability)")).join("; ")}.`,
      ...risk.escalationReasons.map(r=>`Escalation gate: ${r}`),
      ...(gaps.length
        ?[`GAPS — the description did NOT cover: ${gaps.join(" ")}`]
        :[]),
      "Assessment covers the STATED purpose only — downstream reuse is a new assessment (purpose creep).",
      "Descriptions are not data flows: high-impact processing needs verification against the actual system.",
    ];

    const factsBlock=
`- Data categories: ${categories.length?categories.map(c=>c.label).join("; "):"none detected — verify"}
- Cross-border transfer: ${transfer.flag?"YES":"not detected"}
- Novel tech (AI/profiling): ${novelTech.flag?"YES":"not detected"}
- Large-scale: ${highVolume.flag?"YES":"not detected"}
- Regime triggers: ${regimes.map(r=>r.regime).join("; ")}
- Risk rating: ${risk.rating}
- Gaps: ${gaps.length?gaps.join(" "):"none"}`;

    try{
      const prompt=`You are the Privacy Assessment Agent for AEGIS Legal. Draft a PRELIMINARY privacy assessment for the initiative described below. The flags and rating were detected DETERMINISTICALLY by the platform — do not change the rating or invent categories; write the assessment around them.

INITIATIVE (requester's description):
"${text.slice(0,2500)}"

DETERMINISTIC DETECTION (authoritative — do not alter):
${factsBlock}

Write:
1. A preliminary assessment (100-160 words): processing purpose as stated, data categories, lawful-basis CANDIDATES per regime (candidates, not conclusions), transfer posture, and what the ${risk.rating} rating means for next steps${risk.mustEscalate?" (this is escalating to senior counsel / DPO)":""}.
2. If gaps exist, end with the questions the requester must answer.

Respond with ONLY this JSON:
{"draftedResponse":"assessment text with \\n line breaks","alternativeTone":"one-line summary","confidence":0.0-1.0,"reasoning":"one line on rating + posture"}`;

      const result=await callClaudeJSON(prompt,{maxTokens:800});
      return buildRec(this.id,{
        confidence:Math.min(typeof result.confidence==="number"?result.confidence:0.7,risk.mustEscalate?0.75:0.85),
        suggestedAction:risk.mustEscalate?"escalate":"flag-for-review",
        draftedResponse:result.draftedResponse||`PRELIMINARY PRIVACY ASSESSMENT (${risk.rating})\n${factsBlock}`,
        reasoning:result.reasoning||`${risk.rating} rating; ${categories.length} data categor${categories.length===1?"y":"ies"} detected; ${gaps.length} gap(s).`,
        concerns:evidenceConcerns,
        precedentLinks:[{id:"PRIVACY-TRIAGE-v1",title:"Privacy triage playbook (DPDP / GDPR / CCPA triggers)"}],
        alternativeTone:result.alternativeTone||null,
      });
    }catch(e){
      console.error("[agent:privacy-assessment] callClaudeJSON failed:",e);
      // Degraded path keeps everything that matters: rating, flags,
      // regime triggers, and the gaps list are all deterministic.
      return buildDegradedRec(this.id,{
        draftedResponse:`PRELIMINARY PRIVACY ASSESSMENT (auto-detect only — AI narrative unavailable)\n\n${factsBlock}\n\n${gaps.length?"Questions for the requester:\n"+gaps.map(g=>"• "+g).join("\n"):""}`,
        reasoning:`${risk.rating} rating from deterministic detection; AI narrative unavailable.`,
        concerns:[friendlyAIError(e),...evidenceConcerns],
        precedentLinks:[{id:"PRIVACY-TRIAGE-v1",title:"Privacy triage playbook (DPDP / GDPR / CCPA triggers)"}],
      });
    }
  },
};
