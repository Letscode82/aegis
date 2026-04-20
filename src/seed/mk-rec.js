// ── Agent recommendation helper (used to pre-compute demo recs) ──
export const mkRec=(agentId,conf,action,response,reasoning,concerns=[],precedents=[],altTone)=>({
  agentId,confidence:conf,suggestedAction:action,draftedResponse:response,reasoning,
  concerns,precedentLinks:precedents,alternativeTone:altTone||null,
  generatedAt:Date.now(),mock:true,
});
