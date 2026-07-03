import { useState, useEffect, useMemo, useCallback } from "react";
import { useCurrentUser } from "@aegis/auth/react";
import { ensureSeeded, loadTickets, migrateTicketV72, saveTicketsDelta } from "../storage/tickets";
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
    setTickets(prev=>[migrated,...prev]);
    // W4-2 — delta save: only the new ticket rides the wire.
    await saveTicketsDelta([migrated]);
    return migrated;
  },[]);

  const updateTicket=useCallback(async(id,patch)=>{
    const target=tickets.find(t=>t.id===id);
    if(!target) return null;
    const changed={...target,...patch};
    setTickets(prev=>prev.map(t=>t.id===id?changed:t));
    // W4-2 — delta save: one changed ticket, not the whole array.
    // P2b — the server may return { spawnedMatters }; pass it through
    // so callers (recordTriageAction) can surface a toast.
    const result=await saveTicketsDelta([changed]);
    return (result&&typeof result==="object")?result:null;
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
  //
  // The patch in step 3 also syncs `status` and `workflow` so the
  // ticket detail page agrees with the Kanban — without this, the
  // detail-view workflow strip stays "Agent Analysis active" forever
  // because nothing else updates that array post-creation. The same
  // mapping the Kanban's drag-drop handler uses for stage→status
  // (`statusMap` in `KanbanTab`) is mirrored here so both code paths
  // produce identical state.
  const addTicketAndRunAgent=useCallback(async(ticket)=>{
    const created=await addTicket(ticket);
    // Step 2 — optimistic "triage" flash. Functional setState avoids
    // a stale-closure miss on the just-added ticket.
    setTickets(prev=>prev.map(t=>t.id===created.id?{...t,stage:"triage"}:t));
    // Step 3 — real agent call (1–3s for Claude; instant for the
    // fallback templates).
    const {agent,recommendation}=await processTicketWithAgent(created,agentSettings);
    // Workflow strip: Submitted ✓ → Agent Analysis ✓ → Attorney Review
    // (active) → Close. Index 2 is "Attorney Review" in the canonical
    // 4-step shape produced by NewRequestV8.submit + the copilot path.
    // We rebuild defensively in case the source ticket carried a
    // shorter/customised workflow.
    const sourceWorkflow=Array.isArray(created.workflow)&&created.workflow.length>=4
      ?created.workflow
      :[{label:"Submitted"},{label:"Agent Analysis"},{label:"Attorney Review"},{label:"Close"}];
    const nextWorkflow=sourceWorkflow.map((s,i)=>({
      ...s,
      done:i<2,
      active:i===2,
    }));
    const patch={
      stage:"assigned",
      status:"Assigned",
      workflow:nextWorkflow,
      agentRecommendation:recommendation,
      agentProcessedAt:Date.now(),
      // P2b — explicit outcome so the server can record an
      // `intake.ticket.agent_no_match` audit row when no agent claimed
      // the ticket (ops can see which intake patterns are uncovered).
      agentOutcome:agent?"matched":"no-match",
      assigned:agent?`${agent.shortName} Agent · Cockpit Queue`:"Cockpit Queue · Manual",
    };
    // Persist once with the final state. Same closure-stale workaround
    // as the v8 demo's original path: build the canonical array from
    // (a) the patched created ticket, plus (b) all OTHER tickets.
    const finalTicketState={...created,...patch};
    setTickets(prev=>prev.map(t=>t.id===created.id?finalTicketState:t));
    // W4-2 — delta save: only the just-processed ticket.
    await saveTicketsDelta([finalTicketState]);
    // P2a — re-fetch the server-canonical array. Routing rules run
    // inside the save chokepoint and may have changed priority / SLA /
    // assignee and stamped firedRules; without this round-trip the UI
    // keeps showing the pre-routing optimistic values until reload.
    const canonical=await loadTickets();
    if(canonical&&canonical.length>0) setTickets(canonical);
    const finalTicket=(canonical||[]).find(t=>t.id===created.id)||finalTicketState;
    return {ticket:finalTicket,agent,recommendation};
  },[agentSettings,addTicket]);

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
    const saveResult=await updateTicket(id,patch);
    await appendAgentLog({
      type:`attorney-${action}`,ticketId:id,attorney,
      confidence:extra.confidence,
      ...(extra.reason?{reason:extra.reason}:{}),
    });
    // P2b — refresh from server-canonical state so the matterId FK
    // set by the spawn helper appears on the ticket. Without this the
    // client list still shows matterId:null until the next reload.
    if(saveResult&&saveResult.spawnedMatters?.length){
      try{
        const fresh=await loadTickets();
        if(fresh&&fresh.length>0) setTickets(fresh);
      }catch{/* swallow — toast still fires */}
    }
    return saveResult;
  },[tickets,updateTicket,currentUserName]);

  const bulkApprove=useCallback(async(ids,attorney)=>{
    const changed=[];
    const next=tickets.map(t=>{
      if(!ids.includes(t.id)) return t;
      const c={...t,
        triagedBy:attorney,triagedAt:Date.now(),triagedAction:"approved",
        stage:"complete",status:"Completed",
        workflow:t.workflow?t.workflow.map(s=>({...s,done:true,active:false})):[],
      };
      changed.push(c);
      return c;
    });
    setTickets(next);
    // W4-2 — delta save: only the approved subset.
    await saveTicketsDelta(changed);
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

  // Re-pull the server-canonical array. Server-side mutations that
  // bypass the client (routing rules, SLA breach scans) become
  // visible without a full page reload.
  const refresh=useCallback(async()=>{
    const fresh=await loadTickets();
    if(fresh&&fresh.length>0) setTickets(fresh);
  },[]);

  return{tickets:live,loading,addTicket,updateTicket,addTicketAndRunAgent,recordTriageAction,bulkApprove,resetToSeed,refresh};
}
