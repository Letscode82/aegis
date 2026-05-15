import { useState, useEffect, useMemo, useCallback } from "react";
import { useCurrentUser } from "@aegis/auth/react";
import { ensureSeeded, migrateTicketV72, saveTickets } from "../storage/tickets";
import { storeDel } from "../storage/store";
import { appendAgentLog } from "../storage/agent-log";
import { K } from "../storage/keys";
import { processTicketWithAgent } from "../agents";

export function useTicketStore(agentSettings){
  // Session-resolved attribution. Replaces the demo-era hardcoded
  // "You (Alex Nguyen)" fallback. The server-side path is the
  // authoritative source of truth (saveTicketsV8 overwrites
  // triagedBy from the Auth0 session on every triage transition);
  // this client-side value is for optimistic display only.
  const{user:currentUser}=useCurrentUser();
  const currentUserName=currentUser?.name||null;
  const[tickets,setTickets]=useState([]);
  const[loading,setLoading]=useState(true);
  const[tick,setTick]=useState(0); // drives SLA recompute

  useEffect(()=>{
    let mounted=true;
    ensureSeeded().then(t=>{ if(mounted){ setTickets(t); setLoading(false); } });
    const timer=setInterval(()=>setTick(x=>x+1),30000);
    return()=>{ mounted=false; clearInterval(timer); };
  },[]);

  const live=useMemo(()=>tickets.map(t=>{
    const elapsed=(Date.now()-t.submittedTs)/3600000;
    const slaPct=Math.round((elapsed/t.slaHours)*100);
    let slaStatus="On Track";
    if(slaPct>=100) slaStatus="Overdue";
    else if(slaPct>=70) slaStatus="At Risk";
    if(t.stage==="complete"||t.status==="Auto-Completed"||t.status==="Completed") slaStatus="On Track";
    const h=Math.floor(elapsed), m=Math.floor((elapsed-h)*60);
    const age=h>0?`${h}h ${m}m`:`${m}m`;
    return{...t,slaPct,slaStatus,age};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }),[tickets,tick]);

  const addTicket=useCallback(async(ticket)=>{
    const migrated=migrateTicketV72(ticket);
    const next=[migrated,...tickets];
    setTickets(next);
    await saveTickets(next);
    return migrated;
  },[tickets]);

  const updateTicket=useCallback(async(id,patch)=>{
    const next=tickets.map(t=>t.id===id?{...t,...patch}:t);
    setTickets(next);
    await saveTickets(next);
  },[tickets]);

  // Add ticket + run agent + save recommendation (the copilot/form
  // submit end-to-end path).
  //
  // Phase 1b — visible stage progression on the Kanban:
  //   1. `addTicket` lands the row at stage="new" (NEW column).
  //   2. Optimistic local flip to stage="triage" → ticket animates
  //      to the AI TRIAGE column while the agent call is in flight.
  //      Not persisted yet — purely a visual frame.
  //   3. After the agent returns, patch stage="assigned" together
  //      with the recommendation, persist once. Server emits an
  //      `intake.ticket.stage_advanced` audit row on the new→assigned
  //      transition.
  // Net effect: the user files a ticket and watches it walk across
  // the board within a few seconds, ending in ASSIGNED for attorney
  // review.
  const addTicketAndRunAgent=useCallback(async(ticket)=>{
    const created=await addTicket(ticket);
    // Step 2 — optimistic "triage" flash. Functional setState avoids
    // a stale-closure miss on the just-added ticket.
    setTickets(prev=>prev.map(t=>t.id===created.id?{...t,stage:"triage"}:t));
    // Step 3 — real agent call (1–3s for Claude; instant for the
    // fallback templates).
    const {agent,recommendation}=await processTicketWithAgent(created,agentSettings);
    const patch={
      stage:"assigned",
      agentRecommendation:recommendation,
      agentProcessedAt:Date.now(),
      assigned:agent?`${agent.shortName} Agent · Cockpit Queue`:"Cockpit Queue · Manual",
    };
    // Persist once with the final state. Same closure-stale workaround
    // as the v8 demo's original path: build the canonical array from
    // (a) the patched created ticket, plus (b) all OTHER tickets.
    const finalArr=[{...created,...patch},...tickets.filter(t=>t.id!==created.id)];
    setTickets(finalArr);
    await saveTickets(finalArr);
    return {ticket:{...created,...patch},agent,recommendation};
  },[tickets,agentSettings,addTicket]);

  // Attorney triage action — always attorney-initiated. The
  // server-side saveTicketsV8 overwrites `triagedBy` with the
  // Auth0-resolved User.name on every newly-firing triage
  // transition, so the value passed here is purely for optimistic
  // UI; never trusted as identity.
  const recordTriageAction=useCallback(async(id,action,extra={})=>{
    const attorney=extra.attorney||currentUserName||"Unknown user";
    const patch={
      triagedBy:attorney,
      triagedAt:Date.now(),
      triagedAction:action, // "approved" | "rejected" | "reassigned" | "manual-close" | "snoozed" | "edited-approved"
      ...(action==="approved"||action==="edited-approved"||action==="manual-close"?{stage:"complete",status:"Completed"}:{}),
      ...(action==="rejected"?{status:"Triage — Rejected by Attorney",stage:"triage"}:{}),
      ...(action==="snoozed"?{status:"Snoozed",stage:"new"}:{}),
      ...extra.patch,
    };
    // Append completion step to workflow
    if(action==="approved"||action==="edited-approved"||action==="manual-close"){
      const t=tickets.find(x=>x.id===id);
      if(t&&t.workflow){
        patch.workflow=t.workflow.map(s=>({...s,done:true,active:false}));
      }
    }
    await updateTicket(id,patch);
    await appendAgentLog({
      type:`attorney-${action}`,ticketId:id,attorney,
      confidence:extra.confidence,
      ...(extra.reason?{reason:extra.reason}:{}),
    });
  },[tickets,updateTicket,currentUserName]);

  const bulkApprove=useCallback(async(ids,attorney)=>{
    const next=tickets.map(t=>{
      if(!ids.includes(t.id)) return t;
      return {...t,
        triagedBy:attorney,triagedAt:Date.now(),triagedAction:"approved",
        stage:"complete",status:"Completed",
        workflow:t.workflow?t.workflow.map(s=>({...s,done:true,active:false})):[],
      };
    });
    setTickets(next);
    await saveTickets(next);
    await appendAgentLog({type:"attorney-bulk-approve",ticketIds:ids,attorney,count:ids.length});
  },[tickets]);

  const resetToSeed=useCallback(async()=>{
    await storeDel(K.TICKETS);
    await storeDel(K.CONVERSATIONS);
    await storeDel(K.AGENT_LOG);
    await storeDel(K.COCKPIT_STATE);
    const fresh=await ensureSeeded();
    setTickets(fresh);
  },[]);

  return{tickets:live,loading,addTicket,updateTicket,addTicketAndRunAgent,recordTriageAction,bulkApprove,resetToSeed};
}
