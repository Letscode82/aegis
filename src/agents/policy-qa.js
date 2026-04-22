import { buildRec } from "./build-rec";
import { matchPolicy } from "./policy-library";
import { callClaudeJSON, friendlyAIError } from "../ai/claude";

export const PolicyQAAgent={
  id:"policy-qa-agent",
  name:"Policy Q&A Agent",
  shortName:"Policy",
  icon:"◎",
  description:"Answers internal policy questions from the policy library. Defers sensitive matters (employment, harassment) to specialist teams.",

  canHandle(ticket){
    // Hand off sensitive employment to the Employment team explicitly (no agent auto-drafts)
    const cat=(ticket.aiTriage?.category||"").toLowerCase();
    if(/harassment|discriminat|retaliation/.test(cat)) return true; // handle but with low confidence → escalate
    return matchPolicy(ticket.desc)!==null;
  },

  async process(ticket){
    const name=(ticket.from||"").split(" ")[0]||"there";
    const cat=(ticket.aiTriage?.category||"").toLowerCase();

    // Sensitive employment: intentionally low confidence, escalation path
    if(/harassment|discriminat|retaliation/.test(cat)){
      return buildRec(this.id,{
        confidence:0.55,suggestedAction:"escalate",
        draftedResponse:`⚠ SENSITIVE MATTER — ATTORNEY HANDLING REQUIRED\n\nHi ${name},\n\nThis request describes a sensitive employment matter (potential retaliation / harassment pattern). I'm not drafting a substantive response — these matters require attorney-led investigation.\n\nRouting directly to Rachel Adams (Employment Lead). You'll hear back within 12 hours.\n\n— AEGIS Legal`,
        reasoning:"Sensitive employment matter. Agent confidence is INTENTIONALLY low per policy — these tickets must be attorney-handled.",
        concerns:["Do not auto-send","Third-party reports of retaliation require specialist attorney review","Consider legal hold / preservation obligations"],
        precedentLinks:[{id:"POLICY-RETAL-v2",title:"Retaliation Response Protocol"}],
        alternativeTone:null,
      });
    }

    const policy=matchPolicy(ticket.desc);
    if(!policy){
      return buildRec(this.id,{
        confidence:0.35,suggestedAction:"flag-for-review",draftedResponse:"",
        reasoning:"No policy library match on second pass.",
        concerns:["Manual triage recommended — no policy match"],
      });
    }

    try{
      const prompt=`You are the Policy Q&A Agent. Draft a response to an internal policy question.

TICKET:
- Requester: ${ticket.from} (${ticket.dept})
- Question: "${ticket.desc}"

POLICY MATCH: ${policy.policy}
POLICY ANSWER: "${policy.answer}"

Draft a warm, professional response:
1. First-name greeting (${name})
2. Cite ${policy.policy} explicitly
3. Restate the answer in context of their question (don't just paste)
4. Offer follow-up if their situation doesn't fit the standard
5. 100-160 words

Respond with ONLY this JSON:
{"draftedResponse":"...","alternativeTone":"TL;DR","confidence":0.82,"reasoning":"...","concerns":[]}`;

      const result=await callClaudeJSON(prompt,{maxTokens:500});
      return buildRec(this.id,{
        confidence:result.confidence||0.82,
        suggestedAction:"approve-and-send",
        draftedResponse:result.draftedResponse,
        reasoning:result.reasoning||`Policy match: ${policy.policy}.`,
        concerns:result.concerns||[],
        precedentLinks:[{id:`POLICY-${policy.policy.replace(/\W+/g,"-")}`,title:policy.policy}],
        alternativeTone:result.alternativeTone||null,
      });
    }catch(e){
      console.error("[agent:policy-qa] callClaudeJSON failed:",e);
      return buildRec(this.id,{
        confidence:0.78,suggestedAction:"approve-and-send",
        draftedResponse:`Hi ${name},\n\nPer ${policy.policy}: ${policy.answer}\n\nIf your specific situation doesn't fit the standard answer, reply and I'll loop in the right specialist.\n\n— AEGIS Policy Desk`,
        reasoning:`Policy match: ${policy.policy}. Claude unavailable — used policy text directly.`,
        concerns:[friendlyAIError(e),"Used raw policy text — attorney may want to personalize."],
        precedentLinks:[{id:`POLICY-${policy.policy.replace(/\W+/g,"-")}`,title:policy.policy}],
        mock:true,
      });
    }
  },
};
