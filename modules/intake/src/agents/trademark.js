import { buildRec, buildDegradedRec } from "./build-rec";
import { callClaudeJSON, friendlyAIError } from "@aegis/ai";

// Real AI-assisted preliminary trademark clearance. Claude assesses the
// proposed mark for distinctiveness, likely NICE classes, conflict risk,
// and per-jurisdiction considerations, and drafts a clearance memo with
// a recommendation. This is a genuine analysis (same class as the NDA /
// FAQ / Vendor agents) — NOT a deterministic mock.
//
// Scope note: this does not yet hit live USPTO / EUIPO / WIPO registries
// (that integration is a future enhancement). It is an AI preliminary
// assessment and ALWAYS recommends a formal registry search + counsel
// sign-off before any naming commitment — clearance is never auto-final.
export const TrademarkAgent={
  id:"trademark-agent",
  name:"Trademark Clearance Agent",
  shortName:"Trademark",
  icon:"◇",
  description:"AI-assisted preliminary trademark clearance: distinctiveness, conflict-risk, and jurisdiction analysis with a clearance memo. Recommends a formal registry search before any naming commitment.",
  productionReady:true,

  canHandle(ticket){
    const cat=(ticket.aiTriage?.category||"").toLowerCase();
    const type=(ticket.type||"").toLowerCase();
    const d=(ticket.desc||"").toLowerCase();
    return /trademark/.test(cat)||/trademark/.test(type)||/trademark.{0,5}(clear|check|search)/.test(d);
  },

  async process(ticket){
    const name=(ticket.from||"").split(" ")[0]||"there";
    const nameMatch=(ticket.desc||"").match(/['"]([^'"]{2,40})['"]/);
    const proposedName=nameMatch?nameMatch[1]:null;
    // Jurisdictions mentioned (best-effort).
    const jurs=(ticket.desc||"").match(/\b(US|USA|United States|EU|Europe|UK|China|Japan|Canada|Australia|India|Global|worldwide)\b/gi)||[];

    try{
      const prompt=`You are the Trademark Clearance Agent for AEGIS Legal. Perform a PRELIMINARY, AI-assisted clearance assessment of a proposed mark. You do NOT have access to live trademark registries — be explicit that a formal USPTO/EUIPO/WIPO search by counsel is still required before any commitment.

TICKET:
- Requester: ${ticket.from} (${ticket.dept})
- Description: "${ticket.desc}"
- Proposed mark: ${proposedName||"[not clearly quoted — ask the requester to quote the exact mark]"}
- Jurisdictions mentioned: ${jurs.length?[...new Set(jurs.map(j=>j.toUpperCase()))].join(", "):"[not stated]"}

Assess:
1. Distinctiveness on the spectrum (fanciful/arbitrary/suggestive/descriptive/generic) — descriptive or generic marks are weak/unregistrable.
2. Likely NICE classes for the apparent goods/services.
3. Conflict-risk reasoning: does the mark resemble well-known marks or common terms? (reason qualitatively; you cannot search registries)
4. Per-jurisdiction notes for the jurisdictions mentioned.
5. A clear recommendation: PROCEED-TO-FORMAL-SEARCH (low apparent risk) or HIGH-RISK / RECONSIDER.

Set confidence to reflect how clear the assessment is. Trademark launch decisions must not be algorithm-final — your concerns MUST include that a formal registry clearance search and counsel sign-off are required before adoption.

Respond with ONLY this JSON:
{"draftedResponse":"clearance memo to the requester, with \\n line breaks, 150-220 words","alternativeTone":"one-line summary","confidence":0.0-1.0,"reasoning":"one-line basis for the recommendation","concerns":["formal registry search + counsel sign-off required", "...other risks"]}`;

      const result=await callClaudeJSON(prompt,{maxTokens:700});
      const confidence=typeof result.confidence==="number"?result.confidence:0.6;
      // Clamp: never auto-send a clearance unless clearly distinctive +
      // confident. Otherwise it stays a flag-for-review memo.
      const suggestedAction=confidence>=0.8?"approve-and-send":"flag-for-review";
      const concerns=Array.isArray(result.concerns)?result.concerns:[];
      if(!concerns.some(c=>/formal|registry|counsel|search/i.test(c))){
        concerns.unshift("Formal USPTO/EUIPO/WIPO registry search + counsel sign-off required before any naming commitment.");
      }
      return buildRec(this.id,{
        confidence,suggestedAction,
        draftedResponse:result.draftedResponse,
        reasoning:result.reasoning||"AI-assisted preliminary clearance assessment.",
        concerns,
        precedentLinks:[{id:"TM-CLEARANCE-PLAYBOOK",title:"Trademark Clearance Playbook"}],
        alternativeTone:result.alternativeTone||null,
      });
    }catch(e){
      console.error("[agent:trademark] callClaudeJSON failed:",e);
      const fallback=`Hi ${name},\n\nI've logged your trademark clearance request${proposedName?` for "${proposedName}"`:""}. Our AI assistant is temporarily unavailable, so I can't produce the preliminary assessment right now.\n\nNext step: a paralegal will run the preliminary distinctiveness/conflict review and route to IP counsel for a formal USPTO/EUIPO/WIPO clearance search before any naming commitment.\n\n— AEGIS Trademark Clearance`;
      return buildDegradedRec(this.id,{
        draftedResponse:fallback,
        reasoning:"Claude unavailable — surfaced a holding response for attorney review (not auto-send).",
        concerns:[friendlyAIError(e),"No AI assessment produced — manual preliminary review + formal clearance search required."],
        precedentLinks:[{id:"TM-CLEARANCE-PLAYBOOK",title:"Trademark Clearance Playbook"}],
      });
    }
  },
};
