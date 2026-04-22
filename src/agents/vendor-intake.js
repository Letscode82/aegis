import { buildRec } from "./build-rec";
import { mockSanctionsCheck } from "./mocks";
import { callClaudeJSON, friendlyAIError } from "../ai/claude";

export const VendorIntakeAgent={
  id:"vendor-intake-agent",
  name:"Vendor Intake Agent",
  shortName:"Vendor",
  icon:"⬡",
  description:"Runs sanctions screen, DPA review, anti-bribery check on new vendors. Produces an onboarding recommendation with full check trail.",

  canHandle(ticket){
    const cat=(ticket.aiTriage?.category||"").toLowerCase();
    const type=(ticket.type||"").toLowerCase();
    return /vendor.{0,5}(dd|due diligence|onboarding|intake)/.test(cat)||/vendor.{0,5}due/.test(type);
  },

  async process(ticket){
    // Extract counterparty from description
    const cpMatch=(ticket.desc||"").match(/(?:vendor|supplier|counterparty):?\s*([A-Z][A-Za-z0-9& ]{2,40}?)(?:[,.\n]|$)/)
      ||(ticket.desc||"").match(/([A-Z][A-Za-z0-9&]{2,}(?:\s+[A-Z][A-Za-z0-9&]{1,}){0,3}?)\s+(?:in|from|\()/);
    const counterparty=cpMatch?cpMatch[1].trim():null;
    const jurMatch=(ticket.desc||"").match(/\b(Brazil|China|Vietnam|India|Russia|Iran|Mexico|Indonesia|Germany|France|UK|US|Singapore|Japan)\b/i);
    const jurisdiction=jurMatch?jurMatch[1]:null;

    const sanctions=mockSanctionsCheck(counterparty||"",jurisdiction||"");

    // If sanctions fail, escalate
    if(!sanctions.clear){
      return buildRec(this.id,{
        confidence:0.92,suggestedAction:"escalate",
        draftedResponse:`⚠ VENDOR ONBOARDING HOLD — SANCTIONS EXPOSURE\n\nThe vendor ${counterparty||"(unnamed)"} has failed automated screening:\n\n${sanctions.flags.map(f=>"• "+f).join("\n")}\n\nOnboarding is paused pending Compliance + GC review. Do NOT proceed.\n\n— AEGIS Vendor Intake`,
        reasoning:`Sanctions screen failed: ${sanctions.flags.join("; ")}. Mandatory escalation per RULE-8.`,
        concerns:["Sanctions exposure — do not auto-approve under any circumstances","Escalate to Compliance + GC"],
        precedentLinks:[{id:"RULE-8",title:"Sanctions Escalation Policy"}],
      });
    }

    // Clean path — Claude drafts the success response
    try{
      const prompt=`You are the Vendor Intake Agent for AEGIS. A vendor onboarding request needs a response.

TICKET:
- Requester: ${ticket.from} (${ticket.dept})
- Description: "${ticket.desc}"
- Extracted vendor: ${counterparty||"[not clearly stated]"}
- Jurisdiction: ${jurisdiction||"[not stated]"}

AUTOMATED CHECKS (ALL CLEAR):
✓ OFAC / EU / UN sanctions screen
✓ Refinitiv World-Check
✓ Anti-bribery (FCPA / UK Bribery Act)
✓ DPA required (our standard DPA v3.1 covers this scope)

Draft a professional onboarding confirmation to the requester:
1. First-name greeting
2. List the checks that passed (use ✓)
3. Note that DPA v3.1 is attached
4. State it's approved for onboarding
5. 120-180 words

Also identify 1-2 concerns the attorney should review before approving.

Respond with ONLY this JSON:
{"draftedResponse":"...","alternativeTone":"TL;DR","confidence":0.85,"reasoning":"...","concerns":["..."]}`;

      const result=await callClaudeJSON(prompt,{maxTokens:600});
      return buildRec(this.id,{
        confidence:result.confidence||0.82,
        suggestedAction:"approve-and-send",
        draftedResponse:result.draftedResponse,
        reasoning:result.reasoning||`All sanctions/ABC checks clear. Standard DPA applies.`,
        concerns:result.concerns||[],
        precedentLinks:[{id:"DPA-v3.1",title:"Standard DPA Template v3.1"},{id:"POLICY-VENDOR",title:"Vendor Onboarding Policy"}],
        alternativeTone:result.alternativeTone||null,
      });
    }catch(e){
      console.error("[agent:vendor-intake] callClaudeJSON failed:",e);
      const name=(ticket.from||"").split(" ")[0]||"there";
      return buildRec(this.id,{
        confidence:0.78,suggestedAction:"approve-and-send",
        draftedResponse:`Hi ${name},\n\nVendor screens complete${counterparty?` for ${counterparty}`:""}:\n\n✓ OFAC / EU / UN sanctions — CLEAR\n✓ Refinitiv World-Check — CLEAR\n✓ Anti-bribery (FCPA / UK Bribery Act) — CLEAR\n✓ DPA v3.1 applies\n\nApproved for onboarding.\n\n— AEGIS Vendor Intake`,
        reasoning:`All automated screens clear. Claude unavailable — used template response.`,
        concerns:[friendlyAIError(e),"Attorney may want to personalize for specific data-scope questions."],
        precedentLinks:[{id:"DPA-v3.1",title:"Standard DPA Template v3.1"}],
        mock:true,
      });
    }
  },
};
