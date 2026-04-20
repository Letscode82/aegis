import { buildRec } from "./build-rec";

export const ContractReviewAgent={
  id:"contract-review-agent",
  name:"Contract Review Agent",
  shortName:"Contract",
  icon:"◐",
  description:"First-pass clause analysis on incoming contract redlines. Full deep analysis handoff to Contract Intelligence module (v8.1).",

  canHandle(ticket){
    const cat=(ticket.aiTriage?.category||"").toLowerCase();
    const d=(ticket.desc||"").toLowerCase();
    return (/contract.{0,5}review|\bmsa\b|sow|redline/.test(cat)||/contract.{0,5}review/.test(ticket.type?.toLowerCase()||""))
      &&!/\bnda\b/.test(d); // NDAs go to NDA Agent
  },

  async process(ticket){
    const name=(ticket.from||"").split(" ")[0]||"there";
    // v8.1 handoff placeholder — still produces a recommendation
    return buildRec(this.id,{
      confidence:0.62,suggestedAction:"flag-for-review",
      draftedResponse:`Hi ${name},\n\nI've done a first-pass surface scan of the contract. Initial observations:\n\n• Standard clauses present (payment, liability, termination)\n• Items flagged for deeper review: payment terms vs playbook, IP/derivative-works language\n• Full line-by-line redline analysis requires the Contract Intelligence module (shipping v8.1)\n\nRouting to Maria Chen (Commercial Contracts) for detailed review. Expected turnaround: 4 hours.\n\n— AEGIS Contract Review (v8.0 first-pass)`,
      reasoning:`Contract Intelligence module (deep clause diff, playbook-to-current comparison) not yet wired in v8.0. Current recommendation is triage + routing, not closure.`,
      concerns:["Deep clause-level analysis not available — Contract Intelligence module handoff pending in v8.1","Recommendation is routing only, not substantive review"],
      precedentLinks:[{id:"PLAYBOOK-MSA-v2",title:"MSA Playbook"}],
      alternativeTone:null,
      mock:true,
    });
  },
};
