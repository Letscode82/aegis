import { buildRec, buildDegradedRec } from "./build-rec";
import { checkCounterpartyRelationship } from "./counterparty-lookup";
import { callClaudeJSON, friendlyAIError } from "@aegis/ai";

// Draft from the org's DB template (the "📄 Templates" store) so editing
// the NDA template there changes what this agent produces. Falls back to
// the built-in MNDA-v4.2 summary on any failure (unauthenticated,
// server-side relative fetch, no template) so the agent never breaks.
async function loadNdaTemplate(){
  try{
    const r=await fetch("/api/intake/template?kind=NDA");
    if(r.ok){
      const d=await r.json();
      if(d&&d.ok&&d.template&&typeof d.template.body==="string"&&d.template.body.trim()) return d.template;
    }
  }catch{/* fall through to the built-in default */}
  return { name:"MNDA-v4.2", body:"Standard Mutual NDA: 2-year term, standard carve-outs, mutual no-solicit 12 months, Delaware law." };
}

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
    // Playbook deviation detection (Working Architecture doc): terms
    // that take an NDA outside MNDA-v4.2's standard bands force
    // flag-for-review — material deviations are senior-counsel calls.
    const dLower=(ticket.desc||"").toLowerCase();
    const deviations=[];
    if(/non.{0,3}solicit/.test(dLower)&&/(remove|strike|no non.?solicit|without)/.test(dLower)) deviations.push("non-solicit modification requested");
    if(/ip.{0,3}assign|assign.{0,10}(ip|intellectual property)/.test(dLower)) deviations.push("IP-assignment language — outside NDA scope");
    if(/residual/.test(dLower)) deviations.push("residuals clause requested");
    if(/indefinite|perpetual|no.{0,5}expir/.test(dLower)) deviations.push("indefinite/perpetual confidentiality requested");
    if(/source.{0,3}code/.test(dLower)) deviations.push("source-code disclosure — heightened sensitivity");
    if(/today|by end of day|eod|asap.{0,15}sign|sign.{0,15}today/.test(dLower)) deviations.push("same-day signature pressure");
    // Extract counterparty heuristically
    const descMatch=(ticket.desc||"").match(/(?:with|for)\s+([A-Z][A-Za-z0-9& ]{2,40}?)(?:\s+(?:re\.|regarding|for|by|$|,|\.|\n))/);
    const counterparty=descMatch?descMatch[1].trim():null;
    // Real relationship lookup against the shared Counterparty entity
    // (degrades to "not found" on any failure — never blocks the agent).
    const priorNDA=await checkCounterpartyRelationship(counterparty||"");
    const name=(ticket.from||"").split(" ")[0]||"there";

    // Use Claude for the drafted response if API available, else fall back to template
    let draftedResponse=null,confidence=0.92,reasoning=null;
    const tmpl=await loadNdaTemplate();
    try{
      const prompt=`You are the NDA Agent for AEGIS Legal Mission Control. A legal intake ticket has arrived requesting a Non-Disclosure Agreement.

TICKET:
- Requester: ${ticket.from} (${ticket.dept})
- Description: "${ticket.desc}"
- Extracted counterparty: ${counterparty||"NOT FOUND — ask requester"}

COUNTERPARTY CHECK (live, from our system of record):
${priorNDA.note}

PLAYBOOK TEMPLATE (${tmpl.name}) — draft from this:
${(tmpl.body||"").slice(0,1200)}

Draft a professional, confident response (as if sent from a senior paralegal) confirming what you've done and next steps. Mention the template version, key terms, the prior-NDA check result, and say the doc is ready for DocuSign. Address the requester by first name. 130-180 words.

Also produce a one-sentence alternative tone (shorter, more casual).

Respond with ONLY this JSON:
{"draftedResponse":"full response text with line breaks using \\n","alternativeTone":"one-line shorter version","confidence":0.92,"reasoning":"one-line why this recommendation is safe","concerns":["any concerns the attorney should see, or empty array"]}`;

      const result=await callClaudeJSON(prompt,{maxTokens:700});
      draftedResponse=result.draftedResponse;
      confidence=result.confidence||0.92;
      reasoning=result.reasoning;
      // Decision tree (doc): valid NDA covers purpose → reuse; standard
      // → template; material deviation → escalate to human review.
      const action=deviations.length>0?"flag-for-review":"approve-and-send";
      return buildRec(this.id,{
        confidence:deviations.length>0?Math.min(confidence,0.6):confidence,
        suggestedAction:action,
        draftedResponse,reasoning:reasoning||`Template-fit match (MNDA-v4.2). Counterparty check: ${priorNDA.found?"existing relationship — verify NDA reuse":"new counterparty"}.`,
        concerns:[...(deviations.length?deviations.map(x=>`Playbook deviation: ${x} — senior-counsel review per NDA playbook.`):[]),...(result.concerns||[])],
        precedentLinks:[
          {id:"NDA-TEMPLATE-v4.2",title:"Standard Mutual NDA Template"},
          ...(priorNDA.priorNda?[{id:priorNDA.priorNda.documentId,title:`↩ Prior NDA on file: ${priorNDA.priorNda.name}`}]:[]),
          ...(priorNDA.found&&priorNDA.counterpartyId?[{id:priorNDA.counterpartyId,title:`Existing relationship: ${priorNDA.counterpartyName||counterparty} (${priorNDA.priorMatterCount} matter${priorNDA.priorMatterCount===1?"":"s"})`}]:[]),
        ],
        alternativeTone:result.alternativeTone||null,
      });
    }catch(e){
      console.error("[agent:nda] callClaudeJSON failed:",e);
      // Fallback: template response
      const fallback=`Hi ${name},\n\nI've drafted a Standard Mutual NDA${counterparty?` with ${counterparty}`:""} using our approved template (MNDA-v4.2):\n\n• 2-year confidentiality, standard carve-outs\n• Mutual no-solicit (12 months)\n• Delaware law, standard venue\n\n${priorNDA.note}\n\nReady for DocuSign. Reply if you need edits.\n\n— AEGIS Legal (auto-drafted)`;
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
