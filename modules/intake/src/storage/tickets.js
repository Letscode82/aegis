import { K } from "./keys";
import { storeGet, storeSet } from "./store";
import { V8_SEED } from "../seed";

// ── v7.2 → v8 migration ──
// v7 tickets have: id, from, dept, type, priority, submitted, submittedTs, sla, slaHours,
//   slaStatus, desc, assigned, status, stage, seeded, workflow, aiTriage.
// v8 adds: _source, conversation, agentRecommendation, triagedBy, triagedAt, agentProcessedAt.
export function migrateTicketV72(t){
  if(!t) return t;
  return {
    _source:t._source||"form",        // "form" | "copilot" | "seed"
    conversation:t.conversation||null, // array of {role, content, ts, fieldsExtracted?}
    agentRecommendation:t.agentRecommendation||null,
    triagedBy:t.triagedBy||null,       // attorney id/name once reviewed in Cockpit
    triagedAt:t.triagedAt||null,
    triagedAction:t.triagedAction||null, // "approved" | "rejected" | "reassigned" | "manual-close" | "snoozed"
    agentProcessedAt:t.agentProcessedAt||null,
    ...t,                              // original fields win over defaults if present
  };
}

export async function loadTickets(){
  const raw=await storeGet(K.TICKETS,null);
  if(!raw||!Array.isArray(raw)) return null;
  // migrate on read so v7.2 data displays cleanly in v8
  return raw.map(migrateTicketV72);
}
export async function saveTickets(tickets){ return storeSet(K.TICKETS,tickets); }

// W4-2 — delta save: send ONLY the changed tickets. The server
// chokepoint (saveTicketsV8) upserts what it receives and never
// deletes absent rows, so a subset payload is the same code path the
// integration tests exercise — with O(changed) DB work instead of
// O(all tickets) per mutation. Full-array saves remain for seeding.
export async function saveTicketsDelta(changed){
  if(!changed||changed.length===0) return null;
  return storeSet(K.TICKETS,changed);
}

export async function ensureSeeded(){
  const existing=await loadTickets();
  if(existing&&existing.length>0) return existing;
  const now=Date.now();
  const fresh=V8_SEED.map(s=>({...s,submittedTs:now-(s._ageHours||1)*3600*1000}));
  await saveTickets(fresh);
  return fresh;
}
