import { buildRec, buildDegradedRec } from "./build-rec";
import { selectPlaybook } from "./contract-playbooks";
import { callClaude, callClaudeJSON, friendlyAIError } from "@aegis/ai";

// Cap the embedded document so a large upload can't truncate the JSON or
// exceed the timeout (see contract-review.js for the same failure mode).
const MAX_DOC_CHARS = 9000;

// ── Agent 11 · Contract-Type Specialist (GC Suite Working Architecture)
//
// One configurable agent carrying per-type playbooks (clinical,
// licensing, supply, vendor/services — see ./contract-playbooks),
// selected deterministically by the router — deep type-specific review
// without a codebase per type. The requester experience is identical to
// the generalist Contract Review agent; the difference is depth, and
// the recommendation NAMES the playbook + version applied so the
// approver's first check is the playbook selection itself.
//
// Fallthrough (doc): tickets whose contract type matches no playbook
// never reach this agent — canHandle returns false and the router's
// order hands them to the generalist Contract Review agent.
export const ContractSpecialistAgent={
  id:"contract-specialist-agent",
  name:"Contract-Type Specialist",
  shortName:"Specialist",
  icon:"◈",
  description:"Type-specific contract review against the matching versioned playbook (clinical, licensing, supply, vendor/services): mandatory clauses, forbidden clauses, negotiable bands, and the type's escalation gates. Names the playbook + version applied on every recommendation. Unmatched types fall through to the generalist Contract Review agent.",
  productionReady:true,

  canHandle(ticket){
    const d=(ticket.desc||"").toLowerCase();
    if(/\bnda\b|non.?disclosure/.test(d)) return false; // NDA Agent's lane
    return selectPlaybook(ticket)!==null;
  },

  async process(ticket){
    const sel=selectPlaybook(ticket);
    if(!sel){
      // canHandle gates on selection; direct calls without a match get an
      // honest refusal rather than a generic review under no standard.
      return buildDegradedRec(this.id,{
        draftedResponse:"",
        reasoning:"No contract-type playbook matched — route to the generalist Contract Review agent.",
        concerns:["No playbook matched this contract type — generalist first-pass review required."],
        playbook:null,
      });
    }
    const {playbook:pb,matchedOn,alsoMatched}=sel;
    const stamp={id:pb.id,version:pb.version};

    // Deterministic escalation gates from the type's approval matrix —
    // decided in code, before (and regardless of) the Claude call.
    const gateReasons=[];
    if(pb.escalation.always) gateReasons.push(pb.escalation.always);
    for(const t of pb.escalation.triggers){
      if(t.pattern.test(ticket.desc||"")) gateReasons.push(t.reason);
    }
    const mustEscalate=gateReasons.length>0;

    // Approver-facing selection evidence (doc risk 1: wrong-playbook
    // selection makes a misclassified contract look cleaner than it is).
    const selectionConcerns=[
      `Playbook applied: ${pb.label} ${pb.version} (owner: ${pb.owner}, reviewed ${pb.reviewedAt}) — matched on "${matchedOn}". Sanity-check the selection before anything else.`,
      ...(alsoMatched.length
        ?[`HYBRID document: also matched ${alsoMatched.join(", ")} — a single playbook may under-review the secondary aspects; consider combined review.`]
        :[]),
      ...gateReasons.map(r=>`Escalation gate: ${r}`),
    ];

    const playbookText=
`${pb.label} — playbook ${pb.id} ${pb.version}
MANDATORY (missing = HIGH severity):
${pb.mandatory.map(x=>"- "+x).join("\n")}
FORBIDDEN (present = REJECT band):
${pb.forbidden.map(x=>"- "+x).join("\n")}
NEGOTIABLE BANDS (deviation = NEGOTIATE with the stated fallback):
${pb.negotiable.map(x=>"- "+x).join("\n")}`;

    try{
      const prompt=`You are the Contract-Type Specialist agent for AEGIS Legal. Review the contract described below against the SPECIFIC playbook for its type. You are reviewing the DESCRIPTION (not the full document unless pasted) — call out what needs the full text.

${playbookText}

For EVERY issue, assign a band: ACCEPT (within playbook), NEGOTIATE (deviation with the stated fallback), or REJECT (forbidden clause / outside bands — do not sign as-is). Order worst first. Reference the playbook line each issue is benchmarked against.

TICKET:
- Requester: ${ticket.from} (${ticket.dept})
- Description / document:
"""
${(ticket.desc||"").slice(0,MAX_DOC_CHARS)}
"""

Produce:
1. Which mandatory clauses are addressed / missing / unassessable without the full text.
2. Any forbidden-clause signals.
3. Deviations from the negotiable bands with the standard fallback to propose.
4. A recommendation naming the playbook applied.

This is type-specific first-pass review — attorney sign-off is always required before execution.

Respond with ONLY this JSON (keep draftedResponse to 160-240 words; use \\n for line breaks; do NOT use double-quotes inside the string):
{"draftedResponse":"review summary to the requester, bulleted issue list with ACCEPT/NEGOTIATE/REJECT bands","alternativeTone":"one-line summary","confidence":0.0-1.0,"reasoning":"one line naming the playbook + overall posture","concerns":["...issues the attorney must confirm, worst first"]}`;

      const result=await callClaudeJSON(prompt,{maxTokens:1800,timeout:45000});
      const confidence=Math.min(typeof result.confidence==="number"?result.confidence:0.6,mustEscalate?0.75:0.9);
      const concerns=[...selectionConcerns,...(Array.isArray(result.concerns)?result.concerns:[])];
      if(!concerns.some(c=>/sign.?off|attorney/i.test(c))){
        concerns.push("Attorney sign-off required before execution — this is a first-pass review.");
      }
      return buildRec(this.id,{
        confidence,
        suggestedAction:mustEscalate?"escalate":"flag-for-review",
        draftedResponse:result.draftedResponse,
        reasoning:result.reasoning||`Type-specific review against ${pb.label} ${pb.version}.`,
        concerns,
        precedentLinks:[{id:pb.id,title:`${pb.label} playbook ${pb.version}`}],
        alternativeTone:result.alternativeTone||null,
        playbook:stamp,
      });
    }catch(e){
      console.error("[agent:contract-specialist] JSON path failed, retrying as plain text:",e);
      // Plain-text retry — same type-specific review, no fragile JSON.
      try{
        const textPrompt=`You are the Contract-Type Specialist agent for AEGIS Legal. Review the contract below against this SPECIFIC playbook, then write a concise review (180-240 words) addressed to ${(ticket.from||"").split(" ")[0]||"there"} that: lists mandatory clauses addressed/missing, any forbidden-clause signals, deviations from the negotiable bands (with the standard fallback), and a recommendation — each issue tagged ACCEPT/NEGOTIATE/REJECT, worst first. End by stating attorney sign-off is required before execution. Plain text only — no preamble, no JSON.

${playbookText}

TICKET — ${ticket.from} (${ticket.dept}):
"""
${(ticket.desc||"").slice(0,MAX_DOC_CHARS)}
"""`;
        const prose=await callClaude(textPrompt,{maxTokens:1400,timeout:45000});
        const clean=(prose||"").trim();
        if(!clean) throw new Error("Empty plain-text review");
        return buildRec(this.id,{
          confidence:mustEscalate?0.5:0.55,
          suggestedAction:mustEscalate?"escalate":"flag-for-review",
          draftedResponse:clean,
          reasoning:`Type-specific review against ${pb.label} ${pb.version} (produced as plain text — structured extraction unavailable).`,
          concerns:[...selectionConcerns,"Attorney sign-off required before execution — this is a first-pass review."],
          precedentLinks:[{id:pb.id,title:`${pb.label} playbook ${pb.version}`}],
          playbook:stamp,
        });
      }catch(e2){
      console.error("[agent:contract-specialist] plain-text fallback also failed:",e2);
      // Degraded path keeps the deterministic value: the selected
      // playbook (stamped + cited) and the escalation-gate results.
      return buildDegradedRec(this.id,{
        draftedResponse:`Hi ${(ticket.from||"").split(" ")[0]||"there"},\n\nI've logged your ${pb.label.toLowerCase()} review request. Our AI assistant is temporarily unavailable, so the clause-by-clause analysis will be run by a reviewer against playbook ${pb.id} ${pb.version} (mandatory clauses, forbidden clauses, negotiable bands) before attorney sign-off.\n\n— AEGIS Contract Review`,
        reasoning:`Playbook ${pb.id} ${pb.version} selected deterministically; AI review unavailable — manual review against the same standard required.`,
        concerns:[friendlyAIError(e2),...selectionConcerns,"No AI review produced — manual playbook review + attorney sign-off required."],
        precedentLinks:[{id:pb.id,title:`${pb.label} playbook ${pb.version}`}],
        playbook:stamp,
      });
      }
    }
  },
};
