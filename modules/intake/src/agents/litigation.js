import { buildRec, buildDegradedRec } from "./build-rec";
import { callClaudeJSON, friendlyAIError } from "@aegis/ai";

// Litigation Intake Agent (Phase 1). Triages NON-COURT-FACING disputes /
// demands / subpoenas: extracts the adverse party, claim type,
// jurisdiction, and response deadline, and recommends a handling tier.
//
// Scope note: this phase is intake TRACKING only — the agent does NOT
// place a legal hold. Preservation is handled by a separate process; the
// agent's concerns explicitly say so. Litigation intake is ALWAYS
// attorney-reviewed (flag-for-review), never auto-final.
export const LitigationAgent={
  id:"litigation-agent",
  name:"Litigation Intake Agent",
  shortName:"Litigation",
  icon:"§",
  description:"Triages non-court-facing disputes / demands / subpoenas: extracts adverse party, claim type, jurisdiction, and response deadline, and recommends a handling tier. Does not place a legal hold (preservation handled separately).",
  productionReady:true,

  canHandle(ticket){
    const cat=(ticket.aiTriage?.category||"").toLowerCase();
    const type=(ticket.type||"").toLowerCase();
    const d=(ticket.desc||"").toLowerCase();
    if(/litigation/.test(cat)||/litigation|dispute/.test(type)) return true;
    return /lawsuit|subpoena|summons|deposition|demand letter|cease.{0,3}and.{0,3}desist|served with|notice of (claim|dispute)|threaten(ed|ing)?.{0,10}(sue|legal action|litigation)/.test(d);
  },

  async process(ticket){
    const name=(ticket.from||"").split(" ")[0]||"there";
    const HOLD_NOTE="No legal hold has been placed by this triage — confirm preservation separately.";
    try{
      const prompt=`You are the Litigation Intake Agent for AEGIS Legal. Triage an inbound NON-COURT-FACING litigation/dispute matter (demand letter, subpoena, pre-litigation dispute, notice of claim). You do NOT initiate a legal hold — preservation is handled by a separate process; never claim to have placed one.

Your brief MUST end with an explicit GAP ANALYSIS section: state plainly what the record does NOT contain (parties you could not identify, dates missing, documents not referenced). "Nothing found" must never read as "nothing exists" — the gap section is as important as the brief.

TICKET:
- Requester: ${ticket.from} (${ticket.dept})
- Description: "${ticket.desc}"

Extract and assess:
1. Adverse party / counterparty (name if stated).
2. Nature of the claim (contract, IP, employment, regulatory, other).
3. Jurisdiction / forum if stated.
4. Any deadline (response/answer date, statutory deadline) — flag if time-sensitive.
5. Apparent severity (routine / elevated / critical).
6. Recommended handling tier: junior review, or escalate to senior litigation counsel.

Draft a short intake acknowledgment + internal triage summary. Litigation intake is ALWAYS attorney-reviewed — never auto-final.

Respond with ONLY this JSON:
{"draftedResponse":"triage summary (adverse party, claim, jurisdiction, deadline, recommended tier) with \\n line breaks, 150-220 words","alternativeTone":"one-line summary","confidence":0.0-1.0,"reasoning":"one-line basis for the recommendation","concerns":["${HOLD_NOTE}","Confirm the response deadline.","Run a conflicts check against existing matters/counterparties."]}`;

      const result=await callClaudeJSON(prompt,{maxTokens:700});
      const concerns=Array.isArray(result.concerns)?result.concerns.slice():[];
      if(!concerns.some(c=>/legal hold|preservation/i.test(String(c)))) concerns.unshift(HOLD_NOTE);
      return buildRec(this.id,{
        // Litigation intake is always human-reviewed: never auto-send.
        confidence:typeof result.confidence==="number"?result.confidence:0.6,
        suggestedAction:"flag-for-review",
        draftedResponse:result.draftedResponse||"",
        reasoning:result.reasoning||"Litigation intake triaged — attorney review required.",
        concerns,
        alternativeTone:result.alternativeTone||null,
      });
    }catch(e){
      console.error("[agent:litigation] callClaudeJSON failed:",e);
      return buildDegradedRec(this.id,{
        draftedResponse:`Hi ${name},\n\nWe've received your litigation/dispute intake and logged it for attorney review. A member of the litigation team will follow up shortly. In the meantime, please preserve any related documents and communications.\n\n— AEGIS Legal Intake`,
        reasoning:"Litigation intake received; Claude unavailable — routed to manual attorney triage.",
        concerns:[friendlyAIError(e),HOLD_NOTE,"Manual attorney triage required."],
      });
    }
  },
};
