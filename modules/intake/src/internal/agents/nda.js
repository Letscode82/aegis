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

// Deterministic Mutual NDA instrument — the real document, not a summary.
// Used as the degraded-path deliverable when Claude is unavailable so the
// attorney always gets an actual NDA to review/edit, never a 3-bullet note.
// Kept intentionally standard (MNDA-v4.2 bands) so it reads as the org's
// baseline paper the reviewer edits, not AI-authored prose.
function buildStandardMutualNda({ counterparty, requesterName, governingLaw }){
  const cp=counterparty||"[COUNTERPARTY]";
  const law=governingLaw||"the State of Delaware";
  return [
    "MUTUAL NON-DISCLOSURE AGREEMENT",
    "",
    `This Mutual Non-Disclosure Agreement (the "Agreement") is entered into as of the date of last signature below (the "Effective Date") by and between the Company and ${cp} (each a "Party" and together the "Parties").`,
    "",
    "1. PURPOSE. The Parties wish to explore a potential business relationship and, in connection with it, may disclose to each other certain confidential and proprietary information.",
    "",
    "2. CONFIDENTIAL INFORMATION. \"Confidential Information\" means any non-public information disclosed by one Party (the \"Disclosing Party\") to the other (the \"Receiving Party\"), whether orally, in writing, or in any other form, that is designated as confidential or that reasonably should be understood to be confidential given its nature and the circumstances of disclosure.",
    "",
    "3. EXCLUSIONS. Confidential Information does not include information that: (a) is or becomes publicly available through no breach of this Agreement; (b) was rightfully known to the Receiving Party without restriction before disclosure; (c) is rightfully received from a third party without a duty of confidentiality; or (d) is independently developed without use of the Confidential Information.",
    "",
    "4. OBLIGATIONS. The Receiving Party shall (a) use the Confidential Information solely to evaluate and pursue the Purpose; (b) protect it with at least the degree of care it uses for its own confidential information, and no less than a reasonable degree of care; and (c) not disclose it to any third party except to its employees, advisors, and agents who have a need to know and are bound by confidentiality obligations no less protective than these.",
    "",
    "5. TERM. This Agreement governs disclosures made during the two (2) years following the Effective Date, and the Receiving Party's confidentiality obligations survive for two (2) years after each disclosure.",
    "",
    "6. NON-SOLICITATION. For twelve (12) months after the Effective Date, neither Party will knowingly solicit for employment any employee of the other Party with whom it had contact in connection with the Purpose; general solicitations not targeted at such employees are not a breach.",
    "",
    "7. NO LICENSE. All Confidential Information remains the property of the Disclosing Party. No license or other right is granted except the limited right to use the Confidential Information for the Purpose.",
    "",
    "8. RETURN OR DESTRUCTION. Upon the Disclosing Party's written request, the Receiving Party will promptly return or destroy all Confidential Information in its possession, retaining no copies except as required by law or routine backup.",
    "",
    "9. NO WARRANTY. All Confidential Information is provided \"AS IS,\" without warranty of any kind.",
    "",
    `10. GOVERNING LAW. This Agreement is governed by the laws of ${law}, without regard to its conflict-of-laws rules.`,
    "",
    "11. REMEDIES. The Parties agree that a breach may cause irreparable harm for which monetary damages are inadequate, and that the non-breaching Party may seek injunctive relief in addition to any other remedy.",
    "",
    "12. ENTIRE AGREEMENT. This Agreement is the entire agreement between the Parties concerning its subject matter and supersedes all prior understandings. It may be amended only in a writing signed by both Parties.",
    "",
    "IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.",
    "",
    "COMPANY                                " + cp.toUpperCase(),
    "",
    "By: ______________________             By: ______________________",
    `Name: ${requesterName||"______________________"}`.padEnd(40)+"Name: ______________________",
    "Title: ______________________          Title: ______________________",
  ].join("\n");
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

    // Draft the ACTUAL NDA instrument (not a paralegal cover note). The
    // drafted document becomes the ticket's `draftedResponse` so it renders
    // in the Cockpit for review/edit AND flows into the .docx deliverable —
    // the reviewer gets a real, editable NDA, which is what "draft the NDA"
    // means. Claude writes it from the playbook template when available; the
    // deterministic Mutual NDA is the degrade-safe fallback.
    let draftedResponse=null,confidence=0.92,reasoning=null;
    const tmpl=await loadNdaTemplate();
    const govLaw=/delaware/i.test(ticket.desc||"")?"the State of Delaware":null;
    try{
      const prompt=`You are the NDA Agent for OneLegal Legal Mission Control. A legal intake ticket requests a Non-Disclosure Agreement. DRAFT THE ACTUAL NDA DOCUMENT the attorney will review and send — a complete, ready-to-edit legal instrument, not a status message.

TICKET:
- Requester: ${ticket.from} (${ticket.dept})
- Description: "${ticket.desc}"
- Extracted counterparty: ${counterparty||"NOT FOUND — use the placeholder [COUNTERPARTY]"}

COUNTERPARTY CHECK (live, from our system of record):
${priorNDA.note}

PLAYBOOK STANDARD (${tmpl.name}) — draft ON OUR PAPER, protective and balanced, to these bands:
${(tmpl.body||"").slice(0,1200)}

Write a COMPLETE Mutual NDA with a title and numbered sections (Purpose, Confidential Information, Exclusions, Obligations, Term, Non-Solicitation, No License, Return/Destruction, No Warranty, Governing Law, Remedies, Entire Agreement) and a signature block. Use the counterparty's name where known, else the placeholder [COUNTERPARTY]. Reflect any special terms in the description. Keep it standard unless the description clearly asks otherwise. Do NOT include a cover note or commentary inside the document — just the instrument.

Respond with ONLY this JSON:
{"draftedDocument":"the full NDA text with \\n line breaks","summary":"one line: what you drafted + the prior-NDA check result","confidence":0.92,"concerns":["anything the attorney should weigh, or empty array"]}`;

      const result=await callClaudeJSON(prompt,{maxTokens:3000});
      draftedResponse=(result.draftedDocument||result.draftedResponse||"").trim();
      if(!draftedResponse||draftedResponse.length<200) throw new Error("model returned no usable NDA document");
      confidence=result.confidence||0.92;
      reasoning=result.summary||result.reasoning;
      // Decision tree (doc): valid NDA covers purpose → reuse; standard
      // → template; material deviation → escalate to human review.
      const action=deviations.length>0?"flag-for-review":"approve-and-send";
      return buildRec(this.id,{
        confidence:deviations.length>0?Math.min(confidence,0.6):confidence,
        suggestedAction:action,
        draftedResponse,
        reasoning:reasoning||`Drafted a Mutual NDA (MNDA-v4.2)${counterparty?` with ${counterparty}`:""}. Counterparty check: ${priorNDA.found?"existing relationship — verify NDA reuse":"new counterparty"}. Review and send.`,
        concerns:[...(deviations.length?deviations.map(x=>`Playbook deviation: ${x} — senior-counsel review per NDA playbook.`):[]),...(result.concerns||[])],
        precedentLinks:[
          {id:"NDA-TEMPLATE-v4.2",title:"Standard Mutual NDA Template"},
          ...(priorNDA.priorNda?[{id:priorNDA.priorNda.documentId,title:`↩ Prior NDA on file: ${priorNDA.priorNda.name}`}]:[]),
          ...(priorNDA.found&&priorNDA.counterpartyId?[{id:priorNDA.counterpartyId,title:`Existing relationship: ${priorNDA.counterpartyName||counterparty} (${priorNDA.priorMatterCount} matter${priorNDA.priorMatterCount===1?"":"s"})`}]:[]),
        ],
        alternativeTone:null,
      });
    }catch(e){
      console.error("[agent:nda] callClaudeJSON failed:",e);
      // Degrade-safe: still deliver a REAL, complete NDA instrument from the
      // deterministic template so the reviewer has an actual document to edit
      // — never a 3-bullet summary. Flagged for human review (never auto-send).
      const fallbackDoc=buildStandardMutualNda({counterparty,requesterName:ticket.from,governingLaw:govLaw});
      return buildDegradedRec(this.id,{
        draftedResponse:fallbackDoc,
        reasoning:`Drafted a Standard Mutual NDA${counterparty?` with ${counterparty}`:""} from the MNDA-v4.2 template (AI unavailable). ${priorNDA.note} Attorney review required before sending.`,
        concerns:[friendlyAIError(e),"Deterministic template draft — attorney must review and personalize the NDA before sending."],
        precedentLinks:[{id:"NDA-TEMPLATE-v4.2",title:"Standard Mutual NDA Template"}],
        alternativeTone:null,
      });
    }
  },
};
