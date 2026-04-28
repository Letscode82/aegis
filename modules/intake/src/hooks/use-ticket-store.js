import { useState, useEffect, useMemo, useCallback } from "react";
import { ensureSeeded, migrateTicketV72, saveTickets } from "../storage/tickets";
import { storeDel } from "../storage/store";
import { appendAgentLog } from "../storage/agent-log";
import { K } from "../storage/keys";
import { processTicketWithAgent } from "../agents";

export function useTicketStore(agentSettings){
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

  // Add ticket + run agent + save recommendation (the copilot/form submit end-to-end path)
  const addTicketAndRunAgent=useCallback(async(ticket)=>{
    const created=await addTicket(ticket);
    const {agent,recommendation}=await processTicketWithAgent(created,agentSettings);
    const patch={
      agentRecommendation:recommendation,
      agentProcessedAt:Date.now(),
      assigned:agent?`${agent.shortName} Agent · Cockpit Queue`:"Cockpit Queue · Manual",
    };
    const next=tickets.map(t=>t.id===created.id?{...t,...patch}:t);
    // also patch the just-added version (it's at index 0 of freshly updated array)
    const finalArr=[{...created,...patch},...next.filter(t=>t.id!==created.id)];
    setTickets(finalArr);
    await saveTickets(finalArr);
    return {ticket:{...created,...patch},agent,recommendation};
  },[tickets,agentSettings,addTicket]);

  // Attorney triage action — always attorney-initiated
  const recordTriageAction=useCallback(async(id,action,extra={})=>{
    const attorney=extra.attorney||"You (Alex Nguyen)";
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
  },[tickets,updateTicket]);

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
