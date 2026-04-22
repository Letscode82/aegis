import { NDAAgent } from "./nda";
import { FAQAgent } from "./faq";
import { VendorIntakeAgent } from "./vendor-intake";
import { ContractReviewAgent } from "./contract-review";
import { TrademarkAgent } from "./trademark";
import { PolicyQAAgent } from "./policy-qa";
import { buildRec } from "./build-rec";
import { friendlyAIError } from "../ai/claude";
import { appendAgentLog } from "../storage/agent-log";

export { NDAAgent, FAQAgent, VendorIntakeAgent, ContractReviewAgent, TrademarkAgent, PolicyQAAgent };
export { buildRec } from "./build-rec";

// ══════════════════════════════════════════════════
// AGENT REGISTRY + ROUTER
// ══════════════════════════════════════════════════
export const ALL_AGENTS=[NDAAgent,FAQAgent,VendorIntakeAgent,ContractReviewAgent,TrademarkAgent,PolicyQAAgent];
export const AGENTS_BY_ID=Object.fromEntries(ALL_AGENTS.map(a=>[a.id,a]));

// Route a ticket to the best-fit agent. Order matters: more specific agents first.
// Returns the agent or null.
export function routeToAgent(ticket,enabledSettings){
  const order=[NDAAgent,VendorIntakeAgent,TrademarkAgent,ContractReviewAgent,FAQAgent,PolicyQAAgent];
  for(const a of order){
    if(enabledSettings&&enabledSettings[a.id]&&enabledSettings[a.id].enabled===false) continue;
    if(a.canHandle(ticket)) return a;
  }
  return null;
}

// Run the router against a ticket and log the result
export async function processTicketWithAgent(ticket,settings){
  const agent=routeToAgent(ticket,settings);
  if(!agent){
    await appendAgentLog({type:"no-agent-match",ticketId:ticket.id,desc:(ticket.desc||"").slice(0,80)});
    return {agent:null,recommendation:null};
  }
  try{
    const rec=await agent.process(ticket);
    await appendAgentLog({type:"recommendation-generated",ticketId:ticket.id,agentId:agent.id,confidence:rec.confidence,action:rec.suggestedAction});
    return {agent,recommendation:rec};
  }catch(e){
    console.error(`[agent:${agent.id}] process failed:`,e);
    await appendAgentLog({type:"agent-error",ticketId:ticket.id,agentId:agent.id,status:e&&e.status,error:String(e).slice(0,200)});
    // Produce a visible low-confidence recommendation so the ticket doesn't silently fail
    return {agent,recommendation:buildRec(agent.id,{
      confidence:0.25,suggestedAction:"flag-for-review",draftedResponse:"",
      reasoning:`Agent ${agent.name} encountered an error. Manual triage recommended.`,
      concerns:[friendlyAIError(e)],
    })};
  }
}
