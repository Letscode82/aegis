import { NDAAgent } from "./nda";
import { FAQAgent } from "./faq";
import { VendorIntakeAgent } from "./vendor-intake";
import { ContractReviewAgent } from "./contract-review";
import { TrademarkAgent } from "./trademark";
import { LitigationAgent } from "./litigation";
import { PolicyQAAgent } from "./policy-qa";
import { NoticeMgmtAgent } from "./notice-mgmt";
import { ContractSpecialistAgent } from "./contract-specialist";
import { PrivacyAssessmentAgent } from "./privacy-assessment";
import { MarketingReviewAgent } from "./marketing-review";
import { buildRec, buildDegradedRec } from "./build-rec";
import { callClaude, callClaudeJSON, friendlyAIError } from "@aegis/ai";
import { appendAgentLog } from "../storage/agent-log";
import { descriptionLead } from "../intake/ticket-desc.js";
import { runDefinition } from "./okf/runtime";

export { NDAAgent, FAQAgent, VendorIntakeAgent, ContractReviewAgent, TrademarkAgent, LitigationAgent, PolicyQAAgent, NoticeMgmtAgent, ContractSpecialistAgent, PrivacyAssessmentAgent, MarketingReviewAgent };
export { buildRec } from "./build-rec";

// ══════════════════════════════════════════════════
// AGENT REGISTRY + ROUTER
// ══════════════════════════════════════════════════
//
// Production gate: agents flagged `productionReady:false` are
// deterministic mocks awaiting real backends (Trademark → USPTO/EUIPO/
// WIPO APIs; Contract Review → Contract Intelligence module). They are
// HIDDEN from production deployments so a customer never sees fabricated
// analysis, and tickets of those types fall through to honest manual
// triage. Set NEXT_PUBLIC_AEGIS_DEMO_AGENTS=true to surface them for
// sales demos.

// Full registry — every agent that exists, in display order.
const REGISTERED=[NDAAgent,FAQAgent,VendorIntakeAgent,ContractSpecialistAgent,ContractReviewAgent,TrademarkAgent,LitigationAgent,NoticeMgmtAgent,PrivacyAssessmentAgent,MarketingReviewAgent,PolicyQAAgent];

// Build-time flag (NEXT_PUBLIC_ so it reaches the client bundle).
export function demoAgentsEnabled(){
  return typeof process!=="undefined"
    && !!process.env
    && process.env.NEXT_PUBLIC_AEGIS_DEMO_AGENTS==="true";
}

// Pure, testable: which agents are active given the demo flag.
// Production-ready agents are always active; mock agents only when demo
// mode is on.
export function filterActiveAgents(agents,demoEnabled){
  return agents.filter(a=>a.productionReady!==false||demoEnabled);
}

// AGENTS_BY_ID always contains EVERY agent so the UI can resolve metadata
// (name, icon) for a historical recommendation even from a now-hidden
// agent — e.g. a Trademark rec stored before the flag was turned off.
export const AGENTS_BY_ID=Object.fromEntries(REGISTERED.map(a=>[a.id,a]));

// ALL_AGENTS is the ACTIVE set — what the Agents settings panel renders
// and what routing considers. Filtered by the build-time demo flag.
export const ALL_AGENTS=filterActiveAgents(REGISTERED,demoAgentsEnabled());

// Route a ticket to the best-fit agent. Order matters: more specific
// agents first. Hidden (non-active) agents are skipped, so a production
// ticket of a mock-agent type returns null → honest manual triage.
export function routeToAgent(ticket,enabledSettings,preferredAgentId){
  const active=new Set(ALL_AGENTS);
  // Program #5 — an explicit per-request-type binding wins over the
  // canHandle router, as long as that agent is registered, active, and
  // not toggled off. Otherwise fall through to deterministic routing.
  if(preferredAgentId){
    const bound=AGENTS_BY_ID[preferredAgentId];
    const settingOff=enabledSettings&&enabledSettings[preferredAgentId]&&enabledSettings[preferredAgentId].enabled===false;
    if(bound&&active.has(bound)&&!settingOff) return bound;
  }
  // ContractSpecialist runs immediately before the generalist
  // ContractReview so unmatched contract types FALL THROUGH to Agent 4
  // (doc Agent 11 fallthrough contract).
  // Privacy + Marketing run after the contract lanes but before the
  // generalist Q&A agents, so an assessment/review request never
  // degrades into a KB answer.
  const order=[NDAAgent,VendorIntakeAgent,TrademarkAgent,LitigationAgent,NoticeMgmtAgent,ContractSpecialistAgent,ContractReviewAgent,PrivacyAssessmentAgent,MarketingReviewAgent,FAQAgent,PolicyQAAgent];
  for(const a of order){
    if(!active.has(a)) continue; // hidden in production (productionReady:false)
    if(enabledSettings&&enabledSettings[a.id]&&enabledSettings[a.id].enabled===false) continue;
    if(a.canHandle(ticket)) return a;
  }
  return null;
}

// Fetch the agent's published oKF definition and, if it opts into "okf"
// execution, run it through the generic runtime. Returns the recommendation,
// or null to signal "not an okf agent / unavailable → use process()".
// Client-side only (relative fetch needs a page origin); server-created
// tickets run process() directly, which is behaviourally equivalent.
async function tryOkfExecution(agent,ticket){
  let doc=null;
  try{
    const r=await fetch(`/api/intake/agent-def/${agent.id}`);
    if(!r.ok) return null;
    const d=await r.json();
    doc=d&&d.ok?d.document:null;
  }catch{ return null; }
  if(!doc||!doc.agent||doc.agent.executionMode!=="okf") return null;
  return runDefinition(ticket,doc,doc.knowledge,{callClaude,callClaudeJSON,buildRec,buildDegradedRec,friendlyAIError});
}

// Run the router against a ticket and log the result.
// ROUTING keys on the human-authored request LEAD only — an attached
// document's incidental wording (e.g. a contract full of "notice of
// termination" language) must not pull the ticket to the wrong agent.
// The agent's process() still receives the FULL ticket so it can read
// the document body for its analysis.
export async function processTicketWithAgent(ticket,settings,preferredAgentId){
  const routingTicket={
    ...ticket,
    desc:descriptionLead(ticket&&ticket.desc),
    // Routing keys on the lead, which strips the attached-doc body — but
    // some agents (contract review) need to know a document IS attached
    // to claim the ticket. Surface that as a flag computed from the full
    // description before it was stripped.
    hasDocument:/---\s*attached document:/i.test((ticket&&ticket.desc)||""),
  };
  const agent=routeToAgent(routingTicket,settings,preferredAgentId);
  if(!agent){
    await appendAgentLog({type:"no-agent-match",ticketId:ticket.id,desc:(ticket.desc||"").slice(0,80)});
    return {agent:null,recommendation:null};
  }
  // oKF execution flip: if the agent's PUBLISHED definition opts into "okf"
  // execution, run the generic runtime from that definition so the Agent
  // Designer's edits (prompt / thresholds / knowledge) drive live output.
  // Only pure-prompt agents publish executionMode:"okf"; tool-augmented
  // agents (counterparty / sanctions / deadline work) stay on process().
  // Any failure — fetch, unpublished def, runtime error — falls through to
  // the hardcoded process() so the demo never breaks.
  try{
    const okfRec=await tryOkfExecution(agent,ticket);
    if(okfRec){
      await appendAgentLog({type:"recommendation-generated",ticketId:ticket.id,agentId:agent.id,confidence:okfRec.confidence,action:okfRec.suggestedAction,engine:"okf"});
      return {agent,recommendation:okfRec};
    }
  }catch(e){
    console.error(`[agent:${agent.id}] oKF execution failed, falling back to process():`,e);
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

// Auto-run handler for workflow AGENT steps (exposed via @aegis/intake/agents).
export { intakeWorkflowAgentHandler } from "./workflow-handler.js";
