// Helper for building recommendations uniformly
export function buildRec(agentId,{confidence,suggestedAction,draftedResponse,reasoning,concerns=[],precedentLinks=[],alternativeTone=null,mock=false}){
  return {
    agentId,confidence,suggestedAction,draftedResponse,reasoning,
    concerns,precedentLinks,alternativeTone,
    generatedAt:Date.now(),mock,
  };
}
