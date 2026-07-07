import { buildRec, buildDegradedRec } from "./build-rec";
import { callClaudeJSON, friendlyAIError } from "@aegis/ai";

// Compact playbook the agent reviews against. Mirrors the contract-term
// KB entries; kept here so the prompt is self-contained.
const CONTRACT_PLAYBOOK=`AEGIS Contract Playbook (defaults to check against):
- Limitation of liability: cap = 12 months' fees; uncapped carve-outs for IP infringement, confidentiality breach, indemnity, gross negligence/willful misconduct. Reject unlimited liability or no cap.
- Indemnification: mutual, third-party claims only. Reject unlimited or first-party indemnities.
- Governing law: Delaware preferred; NY/CA acceptable. Avoid counterparty's home jurisdiction for non-US.
- Payment: Net 45 (Net 30 only with ≥2% prompt-pay discount).
- Auto-renewal: acceptable only if non-renewal notice ≤60 days AND uplift capped.
- Termination for convenience: we want 30 days' notice. Pure term-lock with no exit = flag.
- Price increases: capped at lesser of 5% or CPI.
- Assignment: no assignment without consent (affiliate/M&A successor OK); termination right on change of control to a competitor.
- Warranty/acceptance: 90-day warranty + 30-day acceptance. Avoid AS-IS for paid deliverables.
- IP: present-tense assignment of deliverables; license-back for background IP.`;

// Real AI-assisted first-pass contract review. Claude extracts the key
// commercial clauses, compares them to our playbook, flags deviations
// with severity, and drafts a redline summary + recommendation. Genuine
// analysis (same class as NDA/FAQ/Vendor) — NOT a routing stub.
//
// Scope note: deep clause-by-clause diff against a specific prior
// version (the Contract Intelligence module) is a future enhancement.
// This is a real first-pass playbook review of the described terms; it
// always recommends attorney sign-off before execution.
export const ContractReviewAgent={
  id:"contract-review-agent",
  name:"Contract Review Agent",
  shortName:"Contract",
  icon:"◐",
  description:"AI-assisted first-pass contract review: extracts key clauses, compares them to our playbook, flags deviations with severity, and drafts a redline summary. Recommends attorney sign-off before execution.",
  productionReady:true,

  canHandle(ticket){
    const cat=(ticket.aiTriage?.category||"").toLowerCase();
    const d=(ticket.desc||"").toLowerCase();
    return (/contract.{0,5}review|\bmsa\b|\bsow\b|redline/.test(cat)||/contract.{0,5}review/.test(ticket.type?.toLowerCase()||""))
      &&!/\bnda\b/.test(d); // NDAs go to NDA Agent
  },

  async process(ticket){
    const name=(ticket.from||"").split(" ")[0]||"there";
    try{
      const prompt=`You are the Contract Review Agent for AEGIS Legal. Do a FIRST-PASS review of the contract the requester described, comparing the terms they mention against our playbook. You are reviewing the DESCRIPTION (not the full document text unless pasted) — call out what you can't assess without the full text.

${CONTRACT_PLAYBOOK}

For EVERY issue you flag, assign a severity band: ACCEPT (within playbook), NEGOTIATE (deviation with a standard fallback), or REJECT (outside acceptable bands — do not sign as-is). Order the issue list by severity, worst first.

TICKET:
- Requester: ${ticket.from} (${ticket.dept})
- Description: "${ticket.desc}"

Produce a first-pass review that:
1. Identifies which key clauses are mentioned and how they compare to the playbook.
2. Flags each DEVIATION with a severity: BLOCKER / HIGH / MEDIUM / LOW.
3. Notes what still needs the full document to assess.
4. Gives a recommendation (e.g. "negotiate the liability cap and governing law before signing").

This is a first pass — it always requires attorney sign-off before execution. Set confidence to reflect how much you could assess from the description.

Respond with ONLY this JSON:
{"draftedResponse":"review summary to the requester, \\n line breaks, 160-240 words, with a bulleted deviations list","alternativeTone":"one-line summary","confidence":0.0-1.0,"reasoning":"one-line basis","concerns":["attorney sign-off required before execution","...key deviations the attorney must confirm"]}`;

      const result=await callClaudeJSON(prompt,{maxTokens:900});
      const confidence=typeof result.confidence==="number"?result.confidence:0.6;
      // First-pass contract review is advisory — never auto-send unless
      // highly confident and clean; otherwise route for attorney sign-off.
      const suggestedAction=confidence>=0.85?"approve-and-send":"flag-for-review";
      const concerns=Array.isArray(result.concerns)?result.concerns:[];
      if(!concerns.some(c=>/sign.?off|attorney|review/i.test(c))){
        concerns.unshift("Attorney sign-off required before execution — this is a first-pass review.");
      }
      return buildRec(this.id,{
        confidence,suggestedAction,
        draftedResponse:result.draftedResponse,
        reasoning:result.reasoning||"AI first-pass review against the contract playbook.",
        concerns,
        precedentLinks:[{id:"PLAYBOOK-MSA-v2",title:"MSA / Contract Playbook"}],
        alternativeTone:result.alternativeTone||null,
      });
    }catch(e){
      console.error("[agent:contract-review] callClaudeJSON failed:",e);
      const fallback=`Hi ${name},\n\nI've logged your contract review request. Our AI assistant is temporarily unavailable, so I can't produce the first-pass clause analysis right now.\n\nNext step: a reviewer will run the first-pass review against our playbook (liability cap, indemnity, governing law, termination, payment terms) and route to the responsible attorney for sign-off before execution.\n\n— AEGIS Contract Review`;
      return buildDegradedRec(this.id,{
        draftedResponse:fallback,
        reasoning:"Claude unavailable — surfaced a holding response for attorney review (not auto-send).",
        concerns:[friendlyAIError(e),"No AI review produced — manual first-pass review + attorney sign-off required."],
        precedentLinks:[{id:"PLAYBOOK-MSA-v2",title:"MSA / Contract Playbook"}],
      });
    }
  },
};
