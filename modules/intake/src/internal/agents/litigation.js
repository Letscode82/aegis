import { buildRec, buildDegradedRec } from "./build-rec";
import { checkCounterpartyRelationship } from "./counterparty-lookup";
import { callClaudeJSON, friendlyAIError } from "@aegis/ai";

// ── Agent 10 · Litigation Support (non-court-facing) — GC Suite doc ──
//
// Intake for litigation-adjacent matters: assembles everything the
// RECORD knows into a cited case brief, flags legal-hold triggers, and
// recommends a handling tier — so counsel starts from a complete
// picture rather than a blank page.
//
// Record pull (the doc's "brain read", intake-scale): the adverse
// party is extracted deterministically and resolved against the shared
// Counterparty entity via the same dual-mode lookup the NDA agent uses
// (server-injected resolver in the agent worker; API fetch in the
// browser). Prior-matter counts and prior agreements are CITED as
// record facts the LLM is told not to invent or extend. The full
// k-hop graph pull is the Phase C ontology surface; the seam is here.
//
// Hold-trigger logic is OVER-INCLUSIVE by design (doc): every
// litigation intake surfaces a preservation flag with a proposed
// initial scope. The agent never places a hold — counsel does.
//
// The brief MUST end with a GAP ANALYSIS: "no documents found" must
// never be read as "no documents exist".
export const LitigationAgent={
  id:"litigation-agent",
  name:"Litigation Intake Agent",
  shortName:"Litigation",
  icon:"§",
  description:"Assembles a cited case brief for non-court-facing disputes / demands / subpoenas: extracts the adverse party, pulls the record (prior matters, prior agreements) via the shared Counterparty entity, flags the legal-hold trigger with a proposed scope, and recommends a handling tier. Never places a hold; always attorney-reviewed.",
  productionReady:true,

  canHandle(ticket){
    const cat=(ticket.aiTriage?.category||"").toLowerCase();
    const type=(ticket.type||"").toLowerCase();
    const d=(ticket.desc||"").toLowerCase();
    if(/litigation/.test(cat)||/litigation|dispute/.test(type)) return true;
    return /lawsuit|subpoena|summons|deposition|demand letter|cease.{0,3}and.{0,3}desist|served with|notice of (claim|dispute)|threaten(ed|ing)?.{0,10}(sue|legal action|litigation)/.test(d);
  },

  // Deterministic adverse-party extraction — the record-pull key.
  extractAdverseParty(desc){
    const d=String(desc||"");
    const m=
      // Trigger words tolerate sentence-initial capitals; the captured
      // NAME stays case-sensitive (must look like a proper noun).
      d.match(/(?:[Dd]emand letter|[Cc]ease.{0,3}and.{0,3}desist|[Ss]ubpoena|[Ss]ummons|[Nn]otice of (?:claim|dispute)|[Ll]awsuit|[Cc]omplaint)\s+(?:from|by|filed by)\s+([A-Z][A-Za-z0-9&. -]{2,50}?)(?:\s+(?:regarding|about|concerning|alleging|over|for|in)\b|[,.\n]|$)/)
      ||d.match(/\b(?:against|versus|vs\.?)\s+([A-Z][A-Za-z0-9&. -]{2,50}?)(?:[,.\n]|\s+(?:regarding|about|concerning|over|for|in)\b|$)/)
      ||d.match(/([A-Z][A-Za-z0-9&.-]*(?:\s+[A-Z][A-Za-z0-9&.-]*){0,4})\s+(?:has |have |is |are )?threaten(?:ed|ing|s)?\b/)
      ||d.match(/(?:dispute|claim)\s+(?:with|from)\s+([A-Z][A-Za-z0-9&. -]{2,50}?)(?:[,.\n]|$)/);
    return m?m[1].trim():null;
  },

  async process(ticket){
    const name=(ticket.from||"").split(" ")[0]||"there";
    const HOLD_NOTE="No legal hold has been placed by this triage — confirm preservation separately.";

    // ── Record pull (deterministic, cited) ──────────────────────────
    const adverseParty=this.extractAdverseParty(ticket.desc);
    const record=await checkCounterpartyRelationship(adverseParty||"");
    const recordFacts=record.found
      ?`Adverse party "${record.counterpartyName}" IS on the record: ${record.priorMatterCount} prior matter${record.priorMatterCount===1?"":"s"} on file${record.priorNda?`; prior agreement "${record.priorNda.name}" recorded ${String(record.priorNda.uploadedAt).slice(0,10)}`:""}.`
      :adverseParty
        ?`Adverse party "${adverseParty}" has NO record in the platform — the record is not the world; absence of documents must not be read as absence of exposure.`
        :"Adverse party could not be extracted from the description — record pull skipped; identify the counterparty before the conflicts check.";

    // Over-inclusive hold-trigger flag (doc) — proposed scope, never a
    // placed hold.
    const holdTrigger=`Legal-hold trigger flagged (over-inclusive by design): evaluate preservation NOW. Proposed initial scope — requester ${ticket.from||"(unknown)"} (${ticket.dept||"dept unknown"}) mailbox + shared drives${adverseParty?`; all correspondence and agreements with ${adverseParty}`:""}. ${HOLD_NOTE}`;

    const baseConcerns=[
      `Record pull: ${recordFacts}`,
      holdTrigger,
      "Run a conflicts check against existing matters/counterparties before staffing.",
      "Confirm the response deadline.",
    ];

    try{
      const prompt=`You are the Litigation Support Agent for AEGIS Legal. Assemble a CITED CASE BRIEF for an inbound NON-COURT-FACING litigation/dispute matter (demand letter, subpoena, pre-litigation dispute, notice of claim). You do NOT initiate a legal hold — preservation is handled by a separate process; never claim to have placed one.

RECORD PULL (authoritative — cite as given, do NOT invent or extend record contents):
- ${recordFacts}

Structure the brief with these sections (doc-standard):
1. PARTIES — adverse party${adverseParty?` (extracted: ${adverseParty})`:" (not identified — say so)"}, our entity, requester.
2. CONTRACT LANDSCAPE — only what the record pull states; anything else is a gap.
3. CHRONOLOGY — dates/events from the description, in order.
4. EXPOSURE — nature of claim (contract, IP, employment, regulatory, other), apparent severity (routine / elevated / critical).
5. RELATED MATTERS — only from the record pull.
6. OPEN OBLIGATIONS — deadlines, response dates; flag if time-sensitive.
7. GAP ANALYSIS — mandatory final section: what the record does NOT contain (parties not identified, dates missing, documents not referenced). "Nothing found" must never read as "nothing exists".

Also recommend a handling tier: junior review, or escalate to senior litigation counsel.

TICKET:
- Requester: ${ticket.from} (${ticket.dept})
- Description: "${(ticket.desc||"").slice(0,2500)}"

This brief is an EVIDENCE INDEX, not a theory of the case. Litigation intake is ALWAYS attorney-reviewed — never auto-final.

Respond with ONLY this JSON:
{"draftedResponse":"the case brief with the 7 numbered sections, \\n line breaks, 200-300 words","alternativeTone":"one-line summary","confidence":0.0-1.0,"reasoning":"one-line basis for the tier recommendation","concerns":["...items the attorney must confirm"]}`;

      const result=await callClaudeJSON(prompt,{maxTokens:900});
      const concerns=[...baseConcerns,...(Array.isArray(result.concerns)?result.concerns:[])];
      return buildRec(this.id,{
        // Litigation intake is always human-reviewed: never auto-send.
        confidence:typeof result.confidence==="number"?result.confidence:0.6,
        suggestedAction:"flag-for-review",
        draftedResponse:result.draftedResponse||"",
        reasoning:result.reasoning||"Case brief assembled from description + record pull — attorney review required.",
        concerns,
        precedentLinks:record.found&&record.priorNda
          ?[{id:record.priorNda.documentId,title:record.priorNda.name}]
          :[],
        alternativeTone:result.alternativeTone||null,
      });
    }catch(e){
      console.error("[agent:litigation] callClaudeJSON failed:",e);
      // Degraded path keeps the deterministic value: the record pull
      // and the hold-trigger flag never depended on Claude.
      return buildDegradedRec(this.id,{
        draftedResponse:`Hi ${name},\n\nWe've received your litigation/dispute intake and logged it for attorney review. A member of the litigation team will follow up shortly. In the meantime, please preserve any related documents and communications.\n\n— AEGIS Legal Intake`,
        reasoning:"Litigation intake received; Claude unavailable — record pull + hold-trigger flag completed deterministically; manual attorney triage required.",
        concerns:[friendlyAIError(e),...baseConcerns,"Manual attorney triage required."],
      });
    }
  },
};
