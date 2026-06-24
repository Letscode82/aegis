import { buildRec, buildDegradedRec } from "./build-rec";
import { mockPriorNDACheck } from "./mocks";
import { callClaudeJSON, friendlyAIError } from "@aegis/ai";

export const NDAAgent={
  id:"nda-agent",
  name:"NDA Agent",
  shortName:"NDA",
  icon:"◉",
  description:"Drafts standard mutual & one-way NDAs from playbook templates. Checks for prior NDAs with counterparty. Recommends template reuse when possible.",
  productionReady:true,

  canHandle(ticket){
    const cat=(ticket.aiTriage?.category||"").toLowerCase();
    const type=(ticket.type||"").toLowerCase();
    const d=(ticket.desc||"").toLowerCase();
    return /nda/.test(cat)||/nda/.test(type)||(/\bnda\b|non.{0,3}disclosure|mutual.{0,5}confidentiality/.test(d)&&!/breach|violat/.test(d));
  },

  async process(ticket){
    // Extract counterparty heuristically
    const descMatch=(ticket.desc||"").match(/(?:with|for)\s+([A-Z][A-Za-z0-9& ]{2,40}?)(?:\s+(?:re\.|regarding|for|by|$|,|\.|\n))/);
    const counterparty=descMatch?descMatch[1].trim():null;
    const priorNDA=mockPriorNDACheck(counterparty||"");
    const name=(ticket.from||"").split(" ")[0]||"there";

    // Use Claude for the drafted response if API available, else fall back to template
    let draftedResponse=null,confidence=0.92,reasoning=null;
    try{
      const prompt=`You are the NDA Agent for AEGIS Legal Mission Control. A legal intake ticket has arrived requesting a Non-Disclosure Agreement.

TICKET:
- Requester: ${ticket.from} (${ticket.dept})
- Description: "${ticket.desc}"
- Extracted counterparty: ${counterparty||"NOT FOUND — ask requester"}

PRIOR NDA CHECK:
${priorNDA.found?`FOUND — ${priorNDA.note}`:`NOT FOUND — draft new from template MNDA-v4.2`}

PLAYBOOK TEMPLATE: MNDA-v4.2 (2-year term, standard carve-outs, mutual no-solicit 12 months, Delaware law).

Draft a professional, confident response (as if sent from a senior paralegal) confirming what you've done and next steps. Mention the template version, key terms, the prior-NDA check result, and say the doc is ready for DocuSign. Address the requester by first name. 130-180 words.

Also produce a one-sentence alternative tone (shorter, more casual).

Respond with ONLY this JSON:
{"draftedResponse":"full response text with line breaks using \\n","alternativeTone":"one-line shorter version","confidence":0.92,"reasoning":"one-line why this recommendation is safe","concerns":["any concerns the attorney should see, or empty array"]}`;

      const result=await callClaudeJSON(prompt,{maxTokens:700});
      draftedResponse=result.draftedResponse;
      confidence=result.confidence||0.92;
      reasoning=result.reasoning;
      return buildRec(this.id,{
        confidence,suggestedAction:"approve-and-send",
        draftedResponse,reasoning:reasoning||`Template-fit match (MNDA-v4.2). Prior NDA check: ${priorNDA.found?"reuse existing":"new draft"}.`,
        concerns:result.concerns||[],
        precedentLinks:[{id:"NDA-TEMPLATE-v4.2",title:"Standard Mutual NDA Template"},...(priorNDA.found?[{id:priorNDA.ndaId,title:`Prior NDA with ${counterparty||"counterparty"} (active)`}]:[])],
        alternativeTone:result.alternativeTone||null,
      });
    }catch(e){
      console.error("[agent:nda] callClaudeJSON failed:",e);
      // Fallback: template response
      const fallback=`Hi ${name},\n\nI've drafted a Standard Mutual NDA${counterparty?` with ${counterparty}`:""} using our approved template (MNDA-v4.2):\n\n• 2-year confidentiality, standard carve-outs\n• Mutual no-solicit (12 months)\n• Delaware law, standard venue\n\n${priorNDA.found?`Note: ${priorNDA.note}`:"No prior NDA on file — this is a fresh draft."}\n\nReady for DocuSign. Reply if you need edits.\n\n— AEGIS Legal (auto-drafted)`;
      return buildDegradedRec(this.id,{
        draftedResponse:fallback,
        reasoning:`Template-fit match. Claude API unavailable — surfaced playbook template for attorney review (not auto-send).`,
        concerns:[friendlyAIError(e),"Using template text — attorney must review and personalize before sending."],
        precedentLinks:[{id:"NDA-TEMPLATE-v4.2",title:"Standard Mutual NDA Template"}],
        alternativeTone:counterparty?`Hi ${name} — NDA ready, ${counterparty}, 2-yr mutual. DocuSign attached.`:null,
      });
    }
  },
};
