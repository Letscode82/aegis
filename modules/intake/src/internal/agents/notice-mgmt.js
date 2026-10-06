import { buildRec, buildDegradedRec } from "./build-rec";
import { extractDeadlines, classifyNotice, slaHoursForDeadlines } from "./notice-dates";
import { callClaudeJSON, friendlyAIError } from "@aegis/ai";

// ── Agent 9 · Notice Management (GC Suite Working Architecture) ─────
//
// Classifies inbound legal notices, extracts EVERY deadline with the
// source text cited beside it, sizes the SLA to the shortest extracted
// deadline, and drafts a deliberately minimal acknowledgment (a loose
// receipt confirmation can waive rights — the draft never goes beyond
// confirming receipt).
//
// Division of labour: deadline extraction and taxonomy are
// DETERMINISTIC (./notice-dates) — a missed or mis-computed deadline
// is the platform's highest-severity failure, so it is never left to
// the LLM. Claude writes the one-paragraph situation brief around the
// deterministic facts. The degraded path (Claude down) still ships
// every extracted deadline.
//
// Escalation (doc): all regulatory and statutory notices, any deadline
// under 7 days (or already lapsed), and any breach/termination notice
// → suggestedAction "escalate". Everything else flag-for-review; a
// notice acknowledgment is never auto-sent.
export const NoticeMgmtAgent={
  id:"notice-mgmt-agent",
  name:"Notice Management Agent",
  shortName:"Notice",
  icon:"⚑",
  description:"Classifies inbound legal notices, extracts every deadline with its source text cited, sizes the SLA to the shortest deadline, and drafts a minimal acknowledgment. Regulatory/statutory/breach notices and <7-day deadlines escalate.",
  productionReady:true,

  canHandle(ticket){
    const cat=(ticket.aiTriage?.category||"").toLowerCase();
    const type=(ticket.type||"").toLowerCase();
    const d=(ticket.desc||"").toLowerCase();
    // Court-facing paper (lawsuit/subpoena/summons/demand letter) is the
    // Litigation agent's lane — it runs earlier in the router order.
    if(/lawsuit|subpoena|summons|deposition|demand letter|served with/.test(d)) return false;
    if(/notice/.test(type)&&!/litigation/.test(type)) return true;
    if(/notice/.test(cat)&&!/litigation/.test(cat)) return true;
    return /(?:received|got|forwarding|attached).{0,40}(?:a |an |the )?(?:legal |formal |breach |default |termination |cure |regulatory )?notice\b|notice of (?:breach|default|termination|non.?renewal|claim|violation)|show.{0,3}cause|cure period|regulatory (?:notice|inquiry)/.test(d);
  },

  async process(ticket){
    const receivedTs=ticket.submittedTs||Date.now();
    const text=ticket.desc||"";
    const deadlines=extractDeadlines(text,receivedTs);
    const taxonomy=classifyNotice(text);
    const proposedSlaHours=slaHoursForDeadlines(deadlines,receivedTs,ticket.slaHours||24);

    // Deterministic deadline citations — the approver verifies each
    // extracted date against the exact source text, one glance each.
    const fmt=(ts)=>new Date(ts).toISOString().slice(0,10);
    const deadlineConcerns=deadlines.map(dl=>
      `Deadline ${fmt(dl.deadlineTs)}${dl.lapsed?" (ALREADY LAPSED)":""}${dl.kind==="computed"?` (computed: ${dl.days}${dl.business?" business":""} days from receipt)`:""}${dl.ambiguous?" (DD/MM vs MM/DD ambiguous — verify)":""} — source: "${dl.sourceText}"`);

    const soonestDays=deadlines.length?Math.floor((deadlines[0].deadlineTs-receivedTs)/(24*60*60*1000)):null;
    const mustEscalate=
      taxonomy.category==="regulatory"||
      taxonomy.category==="statutory"||
      taxonomy.category==="breach_termination"||
      (soonestDays!==null&&soonestDays<7);
    const suggestedAction=mustEscalate?"escalate":"flag-for-review";

    const baseConcerns=[
      `Notice classified: ${taxonomy.label} (urgency rank ${taxonomy.urgency}/5).`,
      ...deadlineConcerns,
      deadlines.length===0
        ?"No deadline could be extracted — a notice without a visible deadline still may carry one; counsel must read the full document."
        :`SLA proposed from the shortest deadline: ${proposedSlaHours}h. Verify each extracted date against its cited source text.`,
      "Acknowledgment draft is deliberately minimal — even a receipt confirmation can waive rights if worded loosely; do not expand it.",
    ];

    const minimalAck=`We acknowledge receipt of your notice dated as referenced, which is under review. This acknowledgment is not an admission of any statement or claim made therein, and all rights and remedies are expressly reserved.\n\n— ${ticket.dept?ticket.dept+" — ":""}Legal Department`;

    try{
      const prompt=`You are the Notice Management Agent for AEGIS Legal. An inbound legal notice needs a one-paragraph SITUATION BRIEF for the assigned counsel. The deadlines and classification below were extracted DETERMINISTICALLY by the platform — do not invent, change, or re-compute any date; reference them as given.

NOTICE (as described/pasted by the mailroom or requester):
"${text.slice(0,2500)}"

DETERMINISTIC EXTRACTION (authoritative — do not alter):
- Classification: ${taxonomy.label}
- Deadlines: ${deadlines.length?deadlines.map(dl=>`${fmt(dl.deadlineTs)}${dl.kind==="computed"?` (computed ${dl.days}d)`:""}`).join("; "):"none extracted"}
- Proposed SLA: ${proposedSlaHours}h

Write:
1. A one-paragraph situation brief (sender, what the notice asserts, what it demands, why the classification fits) — 80-140 words.
2. Nothing else about dates beyond what was extracted.

Respond with ONLY this JSON:
{"draftedResponse":"SITUATION BRIEF:\\n<brief>\\n\\nPROPOSED ACKNOWLEDGMENT (minimal, rights-reserving):\\n${minimalAck.replace(/\n/g,"\\n")}","alternativeTone":"one-line summary of the notice","confidence":0.0-1.0,"reasoning":"one line on classification + deadline posture"}`;

      const result=await callClaudeJSON(prompt,{maxTokens:700});
      return buildRec(this.id,{
        confidence:Math.min(typeof result.confidence==="number"?result.confidence:0.7,mustEscalate?0.75:0.85),
        suggestedAction,
        draftedResponse:result.draftedResponse||`SITUATION BRIEF:\n${taxonomy.label} notice received.\n\nPROPOSED ACKNOWLEDGMENT (minimal, rights-reserving):\n${minimalAck}`,
        reasoning:result.reasoning||`${taxonomy.label} notice; ${deadlines.length} deadline(s) extracted; SLA sized to shortest.`,
        concerns:baseConcerns,
        precedentLinks:[{id:"NOTICE-TAXONOMY-v1",title:"Notice classification & urgency taxonomy"}],
        alternativeTone:result.alternativeTone||null,
        proposedSlaHours,
      });
    }catch(e){
      console.error("[agent:notice-mgmt] callClaudeJSON failed:",e);
      // Degraded path still ships every deterministic fact — the
      // deadlines are the value; the prose was only garnish.
      return buildDegradedRec(this.id,{
        draftedResponse:`SITUATION BRIEF (auto-extract only — AI brief unavailable):\n${taxonomy.label} notice. ${deadlines.length?`${deadlines.length} deadline(s) extracted — see concerns for each with its source text.`:"No deadline extracted — counsel must read the full document."}\n\nPROPOSED ACKNOWLEDGMENT (minimal, rights-reserving):\n${minimalAck}`,
        reasoning:`${taxonomy.label} notice; deterministic extraction completed; AI brief unavailable.`,
        concerns:[friendlyAIError(e),...baseConcerns],
        precedentLinks:[{id:"NOTICE-TAXONOMY-v1",title:"Notice classification & urgency taxonomy"}],
        proposedSlaHours,
      });
    }
  },
};
