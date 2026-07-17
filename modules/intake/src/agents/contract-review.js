import { buildRec, buildDegradedRec } from "./build-rec";
import { callClaude, callClaudeJSON, friendlyAIError } from "@aegis/ai";

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

// A real uploaded contract can be several thousand chars. Cap the text we
// send so a large document can't blow the token budget or push the JSON
// call past its timeout — the exact failure mode that degraded real MSAs
// to "Claude unavailable" while smaller NDAs succeeded.
const MAX_DOC_CHARS = 9000;

// Prefer the org's DB-configured playbook (the "📖 Playbook" / clause
// library) so editing a clause there changes what this agent flags — the
// live-playbook loop. Falls back to the built-in default on any failure
// (unauthenticated, server-side relative fetch, empty library) so the
// agent never breaks.
async function loadPlaybook(){
  try{
    const r=await fetch("/api/intake/contract-playbook");
    if(r.ok){
      const d=await r.json();
      if(d&&d.ok&&typeof d.playbookText==="string"&&d.playbookText.trim()) return d.playbookText;
    }
  }catch{/* fall through to the built-in default */}
  return CONTRACT_PLAYBOOK;
}

// Real AI-assisted first-pass contract review. Claude extracts the key
// commercial clauses, compares them to our playbook, flags deviations
// with severity, and drafts a redline summary + recommendation. Genuine
// analysis (same class as NDA/FAQ/Vendor) — NOT a routing stub.
//
// Reliability: the structured (JSON) path is tried first; if it truncates
// or times out on a big document, we retry as PLAIN TEXT (the same reason
// the AI Summary never fails — prose can't truncate into an unparseable
// object) and surface that real review. Only if BOTH calls fail do we
// degrade to the playbook template.
export const ContractReviewAgent={
  id:"contract-review-agent",
  name:"Contract Review Agent",
  shortName:"Contract",
  icon:"◐",
  description:"AI-assisted first-pass contract review: extracts key clauses, compares them to our playbook, flags deviations with severity, and drafts a redline summary. Recommends attorney sign-off before execution.",
  productionReady:true,

  canHandle(ticket){
    const cat=(ticket.aiTriage?.category||"").toLowerCase();
    const type=(ticket.type||"").toLowerCase();
    const d=(ticket.desc||"").toLowerCase();
    // Contract Review type/category always. A "Contract Question" only
    // routes here when a document is actually attached (a contract to
    // review) — a plain contract question with no doc stays with the FAQ
    // agent. The Contract-Type Specialist runs earlier and grabs types
    // with a matching playbook; the rest fall through to this first-pass
    // review instead of "no matching agent". NDAs go to the NDA agent.
    return (
      /contract.{0,5}review|\bmsa\b|\bsow\b|redline/.test(cat)
      || /contract.{0,5}review/.test(type)
      || (/\bcontract\b/.test(type) && ticket.hasDocument === true)
    ) && !/\bnda\b/.test(d);
  },

  async process(ticket){
    const name=(ticket.from||"").split(" ")[0]||"there";
    const desc=(ticket.desc||"").slice(0,MAX_DOC_CHARS);
    const playbook=await loadPlaybook();
    const context=`TICKET:
- Requester: ${ticket.from} (${ticket.dept})
- Description / document:
"""
${desc}
"""`;

    try{
      const prompt=`You are the Contract Review Agent for AEGIS Legal. Do a FIRST-PASS review of the contract below, comparing its terms against our playbook. If the full document text is included, review it clause by clause; otherwise review what the requester described and call out what still needs the full text.

${playbook}

For EVERY issue you flag, assign a severity: BLOCKER / HIGH / MEDIUM / LOW, worst first.

${context}

Produce a first-pass review that (1) identifies the key clauses and how they compare to the playbook, (2) flags each deviation with a severity, (3) notes what still needs the full document, and (4) gives a recommendation. Always requires attorney sign-off before execution. Set confidence to reflect how much you could assess.

Respond with ONLY this JSON (keep draftedResponse to 160-240 words; use \\n for line breaks; do NOT use double-quotes inside the string):
{"draftedResponse":"review summary to the requester with a bulleted deviations list","alternativeTone":"one-line summary","confidence":0.0-1.0,"reasoning":"one-line basis","concerns":["attorney sign-off required before execution","...key deviations the attorney must confirm"]}`;

      const result=await callClaudeJSON(prompt,{maxTokens:1800,timeout:45000});
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
      console.error("[agent:contract-review] JSON path failed, retrying as plain text:",e);
      // Plain-text retry — same review, no fragile JSON. This is what makes
      // the AI Summary reliable on the very same document.
      try{
        const textPrompt=`You are the Contract Review Agent for AEGIS Legal. Do a FIRST-PASS review of the contract below against this playbook, then write a concise review (180-240 words) addressed to ${name} that: names the key clauses, flags each deviation with a severity (BLOCKER/HIGH/MEDIUM/LOW, worst first) as a bulleted list, notes what still needs the full document, and gives a recommendation. End by stating attorney sign-off is required before execution. Plain text only — no preamble, no JSON.

${playbook}

${context}`;
        const prose=await callClaude(textPrompt,{maxTokens:1400,timeout:45000});
        const clean=(prose||"").trim();
        if(!clean) throw new Error("Empty plain-text review");
        return buildRec(this.id,{
          confidence:0.55,
          suggestedAction:"flag-for-review",
          draftedResponse:clean,
          reasoning:"AI first-pass review (structured extraction was unavailable — produced as plain text).",
          concerns:["Attorney sign-off required before execution — this is a first-pass review.","Deviations above are AI-identified — confirm against the full document."],
          precedentLinks:[{id:"PLAYBOOK-MSA-v2",title:"MSA / Contract Playbook"}],
        });
      }catch(e2){
        console.error("[agent:contract-review] plain-text fallback also failed:",e2);
        const fallback=`Hi ${name},\n\nI've logged your contract review request. Our AI assistant is temporarily unavailable, so I can't produce the first-pass clause analysis right now.\n\nNext step: a reviewer will run the first-pass review against our playbook (liability cap, indemnity, governing law, termination, payment terms) and route to the responsible attorney for sign-off before execution.\n\n— AEGIS Contract Review`;
        return buildDegradedRec(this.id,{
          draftedResponse:fallback,
          reasoning:"Claude unavailable — surfaced a holding response for attorney review (not auto-send).",
          concerns:[friendlyAIError(e2),"No AI review produced — manual first-pass review + attorney sign-off required."],
          precedentLinks:[{id:"PLAYBOOK-MSA-v2",title:"MSA / Contract Playbook"}],
        });
      }
    }
  },
};
