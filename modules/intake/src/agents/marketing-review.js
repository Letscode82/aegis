import { buildRec, buildDegradedRec } from "./build-rec";
import { scanClaims, matchLibraryClaims, routeMarketingReview } from "./claims-signals";
import { callClaudeJSON, friendlyAIError } from "@aegis/ai";

// ── Agent 8 · Marketing-Material Review (GC Suite Working Architecture)
//
// Reviews marketing / promotional content against the approved-claims
// library and brand/legal guidelines, with regulated-industry
// conservatism: it NEVER clears a product or therapeutic claim on its
// own — those and anything HCP-/conference-facing get mandatory human
// review, no exceptions.
//
// Division of labour: the claim taxonomy scan (regulated /
// superlative / absolute / comparative / HCP), the library-verbatim
// check, and the route decision are DETERMINISTIC (./claims-signals)
// with the matched text cited. Claude tags the copy claim-by-claim
// and suggests compliant wording around those facts.
export const MarketingReviewAgent={
  id:"marketing-review-agent",
  name:"Marketing Review Agent",
  shortName:"Marketing",
  icon:"◭",
  description:"Reviews marketing/promotional copy against the approved-claims library: tags each claim (approved-verbatim / modified / new), flags regulated and unsubstantiated claims with the matched text cited, and routes fast-track / revise / full review. Regulated claims and HCP-facing material always get human review.",
  productionReady:true,

  canHandle(ticket){
    const cat=(ticket.aiTriage?.category||"").toLowerCase();
    const type=(ticket.type||"").toLowerCase();
    const d=(ticket.desc||"").toLowerCase();
    // Trademark clearance is the Trademark agent's lane (earlier in
    // router order); this agent reviews the CONTENT of the material.
    if(/trademark|\btm\b clearance/.test(d)) return false;
    if(/marketing|advertis/.test(type)||/marketing|advertis/.test(cat)) return true;
    return /marketing (?:material|copy|campaign|review)|ad copy|advertis(?:ing|ement)|promotional (?:material|content|copy|campaign)|press release|brochure|social media (?:post|campaign|copy)|packaging (?:copy|claims?)|landing page copy|billboard|product claims?/.test(d);
  },

  async process(ticket){
    const text=ticket.desc||"";
    const signals=scanClaims(text);
    const libraryHits=matchLibraryClaims(text);
    const {route,action}=routeMarketingReview(signals);

    const evidenceConcerns=[
      `Route: ${route.toUpperCase()} (deterministic claim scan).`,
      ...signals.map(s=>`${s.label}: matched "${s.matched}"${s.kind==="regulated"?" — MANDATORY human review, the agent never clears this":""}${s.kind==="hcp"?" — mandatory human (and where configured, medical/regulatory-affairs) review":""}.`),
      ...(libraryHits.length
        ?[`Approved-library verbatim matches: ${libraryHits.map(c=>`${c.id} ("${c.text}", substantiation: ${c.substantiation}, expires ${c.expires})`).join("; ")}.`]
        :["No approved-library verbatim matches — any claims in the copy are NEW claims pending library governance."]),
      "Implied and visual claims: imagery, testimonials, and juxtaposition create claims the text doesn't — the scan under-weights what it cannot parse.",
      "Placement matters: accurate content reaching the wrong audience is a risk this review cannot see — consider placement before release.",
    ];

    const factsBlock=
`- Claim signals: ${signals.length?signals.map(s=>`${s.label} ("${s.matched}")`).join("; "):"none detected"}
- Library-verbatim matches: ${libraryHits.length?libraryHits.map(c=>c.id).join(", "):"none"}
- Route: ${route}`;

    try{
      const prompt=`You are the Marketing Review Agent for AEGIS Legal. Review the marketing copy / campaign described below against legal guidelines. The claim signals and route were detected DETERMINISTICALLY — do not clear a regulated claim or change the route; work within it.

MATERIAL (as described/pasted):
"${text.slice(0,2500)}"

DETERMINISTIC SCAN (authoritative — do not alter):
${factsBlock}

Write a review that:
1. Tags each claim you can identify: approved-verbatim / modified-from-library / new.
2. For each flagged claim, proposes compliant alternative wording (softened, substantiated, or qualified).
3. States the route and what the requester must do next${route==="full-review"?" (this is escalating for mandatory human review)":""}.
160-220 words.

Respond with ONLY this JSON:
{"draftedResponse":"review text with \\n line breaks and a claim-by-claim list","alternativeTone":"one-line summary","confidence":0.0-1.0,"reasoning":"one line on the route + claim posture"}`;

      const result=await callClaudeJSON(prompt,{maxTokens:900});
      return buildRec(this.id,{
        confidence:Math.min(typeof result.confidence==="number"?result.confidence:0.7,route==="fast-track"?0.85:0.75),
        suggestedAction:action,
        draftedResponse:result.draftedResponse||`MARKETING REVIEW (${route})\n${factsBlock}`,
        reasoning:result.reasoning||`Route ${route}: ${signals.length} claim signal(s), ${libraryHits.length} library match(es).`,
        concerns:evidenceConcerns,
        precedentLinks:[{id:"CLAIMS-LIBRARY",title:"Approved-claims library (seeded set)"}],
        alternativeTone:result.alternativeTone||null,
      });
    }catch(e){
      console.error("[agent:marketing-review] callClaudeJSON failed:",e);
      // Degraded path keeps the deterministic scan + route — the
      // regulated-claim and HCP gates never depended on Claude.
      return buildDegradedRec(this.id,{
        draftedResponse:`MARKETING REVIEW (auto-scan only — AI markup unavailable)\n\n${factsBlock}\n\n${signals.length?"Flagged claims (see concerns for each with its matched text) require legal review before release.":"No claim signals detected — reviewer to confirm and release."}`,
        reasoning:`Route ${route} from deterministic scan; AI markup unavailable.`,
        concerns:[friendlyAIError(e),...evidenceConcerns],
        precedentLinks:[{id:"CLAIMS-LIBRARY",title:"Approved-claims library (seeded set)"}],
      });
    }
  },
};
