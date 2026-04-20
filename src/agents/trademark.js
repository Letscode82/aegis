import { buildRec } from "./build-rec";

export const TrademarkAgent={
  id:"trademark-agent",
  name:"Trademark Clearance Agent",
  shortName:"Trademark",
  icon:"◇",
  description:"Runs USPTO / EUIPO / WIPO / JPO trademark searches. Produces clearance memo with conflict ranking.",

  canHandle(ticket){
    const cat=(ticket.aiTriage?.category||"").toLowerCase();
    const type=(ticket.type||"").toLowerCase();
    const d=(ticket.desc||"").toLowerCase();
    return /trademark/.test(cat)||/trademark/.test(type)||/trademark.{0,5}(clear|check|search)/.test(d);
  },

  async process(ticket){
    const name=(ticket.from||"").split(" ")[0]||"there";
    const nameMatch=(ticket.desc||"").match(/['"]([^'"]{3,30})['"]/);
    const proposedName=nameMatch?nameMatch[1]:"the proposed name";
    // Mock: randomly generate some conflicts for demo feel
    const hasConflicts=((ticket.desc||"").length%3)!==0; // deterministic-per-ticket
    if(hasConflicts){
      return buildRec(this.id,{
        confidence:0.66,suggestedAction:"flag-for-review",
        draftedResponse:`Hi ${name},\n\nTrademark clearance search on '${proposedName}' complete. ⚠ Conflicts found:\n\n• USPTO — 2 live registrations in related NICE classes\n• EUIPO — 1 live EU mark in Class 9\n• WIPO Madrid — 1 international mark overlapping scope\n\nRecommend engaging external TM counsel for full clearance opinion before naming commitment.\n\n— AEGIS Trademark Clearance (memo attached)`,
        reasoning:`Mock scan returned conflicts across USPTO / EUIPO / WIPO. Confidence intentionally below 0.70 to force attorney review — trademark decisions should not be algorithm-driven.`,
        concerns:["Trademark clearance below 70% confidence threshold","External TM counsel recommended for any multi-jurisdiction conflict","Do not advise launch without formal clearance opinion"],
        precedentLinks:[{id:"TM-SCAN-SUMMARY",title:"Multi-Jurisdiction TM Scan Report"}],
        alternativeTone:null,
        mock:true,
      });
    }
    return buildRec(this.id,{
      confidence:0.86,suggestedAction:"approve-and-send",
      draftedResponse:`Hi ${name},\n\nTrademark clearance search on '${proposedName}' complete. Result: CLEAR across USPTO / EUIPO / WIPO / JPO in targeted NICE classes.\n\n• No live registrations that pose immediate conflict\n• Recommend proceeding with filing in US + EU + key markets\n• External TM counsel can draft filings once product class is finalized\n\n— AEGIS Trademark Clearance`,
      reasoning:`Multi-jurisdiction scan returned clean. No conflicts in relevant NICE classes.`,
      concerns:["Clearance is preliminary — formal filing requires TM counsel sign-off"],
      precedentLinks:[{id:"TM-SCAN-CLEAN",title:"Clearance Scan Report"}],
      alternativeTone:null,
      mock:true,
    });
  },
};
