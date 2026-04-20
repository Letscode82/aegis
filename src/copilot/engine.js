import { callClaudeJSON } from "../ai/claude";
import { classifyIntakeRegex } from "../ai/classify-regex";

// Initial state template — fields Copilot tries to extract
export const COPILOT_INITIAL_STATE=()=>({
  requestType:null,         // "NDA Request" | "Contract Review" | etc.
  counterparty:null,        // "Acme Corp"
  value:null,               // "$2M" | "€450M"
  jurisdiction:null,        // "Germany" | "Delaware"
  urgency:null,             // "Standard" | "Urgent" | "Emergency"
  documentType:null,        // "MSA" | "NDA" | "DPA"
  keyTerms:null,            // freeform
  requesterRole:null,       // role of requester if given
  sensitiveFlags:[],        // e.g. ["retaliation","harassment"] — gates auto-drafting
  isReportingForSelf:null,
  anonymityRequested:null,
  concernType:null,
  protectedActivity:null,
  respondentLevel:null,
  timelineWeeks:null,
  topicSwitchDetected:false,
});

// Topic-type mapping — used when deciding if Copilot thinks topic has switched
export const TOPIC_TYPES=["NDA Request","Contract Review","IP Question","Employment Issue","Privacy Question","Regulatory","Vendor Due Diligence","Litigation / Dispute","Policy Question","Other"];

// Seed message shown when chat opens — varies by initial type pick
export function initialAssistantMessage(type){
  const byType={
    "Employment Issue":"Hi — sorry you're dealing with something. Tell me what's going on, I'll keep it confidential and route it to the right person. No judgment.",
    "Regulatory":"Hi — a regulatory or compliance question. Tell me what's happening and I'll help structure the right intake. Include the jurisdiction and deadline if you know them.",
    "Litigation / Dispute":"Hi — a potential dispute or litigation matter. Give me the shape of what's happening. I'll keep the intake tight and route it quickly.",
    "Vendor Due Diligence":"Hi — a vendor onboarding or diligence question. Tell me who the vendor is, the scope, and any jurisdictional context you have.",
    "Other":"Hi — tell me what's going on and I'll figure out where it needs to go. Be as detailed or brief as you like.",
    "I'm not sure":"Hi — no worries, we can figure it out together. Tell me what's on your mind and I'll help shape this into the right intake.",
  };
  return byType[type]||byType["Other"];
}

// ── Copilot turn (Pattern A) ──
export async function copilotTurn({history,state,ticketType,requester}){
  const unknownFields=Object.entries(state).filter(([k,v])=>v===null||(Array.isArray(v)&&v.length===0)).map(([k])=>k).filter(k=>!["topicSwitchDetected","isReportingForSelf","anonymityRequested","concernType","protectedActivity","respondentLevel","timelineWeeks","sensitiveFlags"].includes(k));

  const histBlock=history.map(m=>`${m.role==="user"?"USER":"AGENT"}: ${m.content}`).join("\n");

  const prompt=`You are the AEGIS Intake Copilot — a warm, intelligent legal intake agent for a Fortune 50 General Counsel's office. You're talking to an employee (requester) who has a legal need.

Your job across the conversation:
1. Understand what they need
2. Extract structured fields as they come up
3. Know when you have enough to file a ticket
4. Be concise, human, and professional

CURRENT REQUEST TYPE (as selected at start): ${ticketType||"not specified"}
REQUESTER: ${requester||"(name not provided)"}

CURRENT STRUCTURED STATE (what's already extracted):
${JSON.stringify(state,null,2)}

FIELDS STILL UNKNOWN (if any are critical for this request type, ask about them):
${unknownFields.length?unknownFields.join(", "):"(none — consider ready)"}

CONVERSATION SO FAR:
${histBlock||"(this is the first turn)"}

GUIDELINES:
- For SIMPLE requests (NDA, standard vendor question, FAQ lookup), you only need: requestType, counterparty (if applicable), urgency. Don't over-ask.
- For COMPLEX requests (employment, regulatory, disputes), tread gently. Open-ended questions first. Don't interrogate.
- For SENSITIVE topics (harassment, retaliation, discrimination): acknowledge, don't promise outcomes, do not give legal advice, do not draft substantive responses — your job is intake only.
- DETECT TOPIC SWITCHES: if the user starts on NDA but pivots to e.g. an employment concern, set topicSwitchDetected:true and ask a single clarifying question like "That sounds like a separate concern — want me to file this as a new ticket about [new topic] instead?" — do NOT silently continue.
- When you have enough (request type + core who/what/urgency for the request type), set ready:true. Don't be greedy.
- One or two follow-up questions per turn, not four.

Respond with ONLY this JSON (no markdown, no prose, no backticks):
{
  "message": "your natural-language response (shown in chat)",
  "fieldsExtracted": { "field1": "value", ... },
  "ready": false,
  "readyReason": "one sentence — what's still missing, or 'have enough to file'",
  "topicSwitchDetected": false,
  "topicSwitchTo": null
}

Only include fieldsExtracted keys where you're pulling in a NEW or UPDATED value. Omit fields you don't have. "message" must be friendly and under 70 words.`;

  try{
    const result=await callClaudeJSON(prompt,{maxTokens:700});
    return {
      message:result.message||"(no response)",
      fieldsExtracted:result.fieldsExtracted||{},
      ready:!!result.ready,
      readyReason:result.readyReason||"",
      topicSwitchDetected:!!result.topicSwitchDetected,
      topicSwitchTo:result.topicSwitchTo||null,
      _error:null,
    };
  }catch(e){
    return {
      message:"Sorry — the Copilot hit a snag. Can you try rephrasing, or switch to the structured form using the toggle above?",
      fieldsExtracted:{},ready:false,readyReason:"copilot error",
      topicSwitchDetected:false,topicSwitchTo:null,
      _error:e.message,
    };
  }
}

// Merge a fieldsExtracted patch into state
export function mergeState(state,patch){
  const next={...state};
  for(const[k,v]of Object.entries(patch||{})){
    if(v==null||v===""||(Array.isArray(v)&&v.length===0)) continue;
    if(Array.isArray(state[k])){
      // Merge arrays uniquely
      const seen=new Set(state[k]);
      v.forEach(x=>seen.add(x));
      next[k]=Array.from(seen);
    } else {
      next[k]=v;
    }
  }
  return next;
}

// Create a v8 ticket from a completed Copilot conversation
export function createCopilotTicket({state,transcript,type,requester,dept,priority}){
  const now=new Date();
  const id="REQ-"+(4000+Math.floor(Math.random()*999));
  const desc=transcript.filter(m=>m.role==="user").map(m=>m.content).join(" ").slice(0,500);
  // Build a synthetic aiTriage from the conversation state
  const regex=classifyIntakeRegex(desc,dept||"");
  const triage=regex||{
    cat:state.requestType||type||"General Inquiry",
    priority:priority||"Medium",team:"Triage Queue",sla:"24 hrs",slaHours:24,
    rule:"RULE-default",conf:70,risk:"Medium",note:"Copilot-generated intake",hrs:2,source:"copilot",
  };
  const priFinal=priority||triage.priority||"Medium";

  return {
    id,
    _source:"copilot",
    from:requester||"(via Copilot)",
    dept:dept||"Unspecified",
    type:state.requestType||type||"Other",
    priority:priFinal,
    submitted:now.toISOString().slice(0,16).replace("T"," "),
    submittedTs:now.getTime(),
    sla:triage.sla,slaHours:triage.slaHours,slaStatus:"On Track",
    desc,
    assigned:"Cockpit Queue",
    status:"Awaiting Triage",stage:"new",seeded:false,
    workflow:[
      {label:"Submitted (Copilot)",done:true},
      {label:"Agent Analysis",active:true},
      {label:"Attorney Review"},
      {label:"Close"},
    ],
    aiTriage:{
      category:triage.cat,
      riskFlag:`${triage.risk} — ${triage.note}`,
      suggestedAssignee:triage.team,
      estimatedHours:triage.hrs,
      similarMatters:Math.floor(Math.random()*40)+5,
      confidence:triage.conf,
      routingRule:`${triage.rule}: ${triage.cat}`,
      source:triage.source||"copilot",
    },
    conversation:transcript,
    conversationState:state,
    agentRecommendation:null, // will be populated by agent layer
    triagedBy:null,triagedAt:null,triagedAction:null,agentProcessedAt:null,
  };
}
