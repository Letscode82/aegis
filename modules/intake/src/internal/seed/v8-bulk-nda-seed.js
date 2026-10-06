import { mkRec } from "./mk-rec";

// ── 5 NDA bulk-demo tickets — all ready for bulk approval ──
export const V8_BULK_NDA_SEED=(() => {
  const counterparties=["Globex Industries","Initech Solutions","Umbrella Corp","Soylent Group","Wayne Enterprises"];
  const requesters=[
    {from:"Alex Kim",dept:"Sales — Enterprise"},
    {from:"Maya Chen",dept:"Partnerships"},
    {from:"Ryan O'Brien",dept:"Corp Dev"},
    {from:"Sofia Ramirez",dept:"BD"},
    {from:"Nathan Webb",dept:"Strategy"},
  ];
  return counterparties.map((cp,i)=>({
    id:"REQ-"+(3601+i),_source:"form",_ageHours:0.3+i*.15,
    from:requesters[i].from,dept:requesters[i].dept,type:"NDA Request",priority:"Low",
    submitted:"2026-04-17 11:4"+i,sla:"8 hrs",slaHours:8,slaStatus:"On Track",
    desc:`Standard mutual NDA for early-stage discussions with ${cp}. 2-year term, mutual, Delaware law. Target signature this week.`,
    assigned:"Cockpit Queue",status:"Awaiting Triage",stage:"new",seeded:false,
    workflow:[{label:"Submitted",done:true},{label:"Agent Analysis",done:true},{label:"Attorney Review",active:true},{label:"Close"}],
    aiTriage:{category:"NDA — Standard Mutual",riskFlag:"None — 100% template match",suggestedAssignee:"NDA Agent",estimatedHours:0,similarMatters:142,confidence:96,routingRule:"RULE-0",source:"regex"},
    agentRecommendation:mkRec("nda-agent",0.95,"approve-and-send",
      `Hi ${requesters[i].from.split(" ")[0]},\n\nStandard Mutual NDA with ${cp} drafted from template MNDA-v4.2:\n• 2-year confidentiality, standard carve-outs\n• Mutual no-solicit 12 months\n• Delaware law\n\nNo prior NDA on file with ${cp}. Ready for DocuSign.\n\n— AEGIS Legal (auto-drafted)`,
      `Template-fit 100%. No prior NDA with ${cp} in registry. RULE-0 match.`,
      [],
      [{id:"NDA-TEMPLATE-v4.2",title:"Standard Mutual NDA Template"}],
      `Hi ${requesters[i].from.split(" ")[0]} — NDA ready, ${cp}, 2-yr mutual. DocuSign link attached.`),
  }));
})();
