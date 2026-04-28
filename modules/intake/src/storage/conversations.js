import { K } from "./keys";
import { storeGet, storeSet } from "./store";

// ── Conversations (Copilot transcripts) ──
export async function loadConversations(){ return await storeGet(K.CONVERSATIONS,{}); }
export async function saveConversation(ticketId,transcript){
  const all=await loadConversations();
  all[ticketId]={updatedAt:Date.now(),transcript};
  return storeSet(K.CONVERSATIONS,all);
}
