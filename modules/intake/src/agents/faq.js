import { buildRec } from "./build-rec";
import { matchAgentKB } from "./kb";
import { callClaudeJSON, friendlyAIError } from "@aegis/ai";

export const FAQAgent={
  id:"faq-agent",
  name:"FAQ Agent",
  shortName:"FAQ",
  icon:"◈",
  description:"Answers common legal questions directly from the knowledge base. High-deflection, high-confidence lookups.",

  canHandle(ticket){
    if(!matchAgentKB(ticket.desc)) return false;
    // Don't handle if another specialist agent should take it (NDA request with counterparty specified, etc.)
    const d=(ticket.desc||"").toLowerCase();
    if(/draft|prepare|create|need.{0,10}nda.{0,10}for|with.{1,30}(inc|corp|ltd|llc|gmbh)/.test(d)) return false;
    return true;
  },

  async process(ticket){
    const kb=matchAgentKB(ticket.desc);
    const name=(ticket.from||"").split(" ")[0]||"there";
    if(!kb){
      return buildRec(this.id,{
        confidence:0.30,suggestedAction:"flag-for-review",draftedResponse:"",
        reasoning:"No KB match on second pass. Route to manual triage.",
        concerns:["FAQ agent fired but no KB match — unusual. Recommend manual triage."],
      });
    }

    try{
      const prompt=`You are the FAQ Agent for AEGIS Legal. A requester has asked a question that maps to a knowledge-base entry.

TICKET:
- Requester: ${ticket.from} (${ticket.dept})
- Question: "${ticket.desc}"

KB ANSWER (verbatim from ${kb.source}):
"${kb.answer}"

Draft a warm, professional response that:
1. Addresses ${name} by first name
2. Directly answers the question using the KB entry (paraphrase cleanly, don't just copy)
3. Cites the source (${kb.source})
4. Offers follow-up if they have a specific situation
5. Under 120 words

Respond with ONLY this JSON:
{"draftedResponse":"full response with \\n line breaks","alternativeTone":"one-line TL;DR version","confidence":0.95,"reasoning":"why this answer is correct","concerns":[]}`;

      const result=await callClaudeJSON(prompt,{maxTokens:500});
      return buildRec(this.id,{
        confidence:result.confidence||0.95,
        suggestedAction:"approve-and-send",
        draftedResponse:result.draftedResponse,
        reasoning:result.reasoning||`Direct KB match. Source: ${kb.source}.`,
        concerns:result.concerns||[],
        precedentLinks:[{id:`KB-${kb.source.replace(/\W+/g,"-")}`,title:kb.source}],
        alternativeTone:result.alternativeTone||null,
      });
    }catch(e){
      console.error("[agent:faq] callClaudeJSON failed:",e);
      const fallback=`Hi ${name},\n\n${kb.answer}\n\nSource: ${kb.source}.\n\nReply if you have a specific situation that doesn't fit the standard answer.\n\n— AEGIS Legal Knowledge Graph`;
      return buildRec(this.id,{
        confidence:0.88,suggestedAction:"approve-and-send",draftedResponse:fallback,
        reasoning:`Direct KB match. Source: ${kb.source}. Claude API unavailable — used KB entry directly.`,
        concerns:[friendlyAIError(e),"Used raw KB answer — attorney may want to personalize."],
        precedentLinks:[{id:`KB-${kb.source.replace(/\W+/g,"-")}`,title:kb.source}],
        mock:true,
      });
    }
  },
};
