import React,{useCallback,useEffect,useState} from "react";
import { C, M } from "@aegis/ui";

// ── W-C · Workflow ladder card ───────────────────────────────────────
//
// Renders the ticket's approval-ladder instance (if its request type
// binds one): RAG dots per step, the current step's name + assigned
// role, and act buttons (Approve / Send back / Reject). Reads
// GET /api/workflows/instances?entityType=intake_ticket&entityId=…;
// actions POST to /act with the optimistic version so stale
// double-approvals 409 (surfaced inline, refresh re-syncs).
//
// Tickets without a ladder render nothing — zero footprint on the
// existing demo flows.

const RAG_COLORS={green:C.gn,amber:C.am,red:C.rd,grey:C.br,skipped:C.t3};

export function WorkflowLadderCard({ticket}){
  const[instance,setInstance]=useState(null);
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState(null);
  const[sendBackTo,setSendBackTo]=useState("");

  const load=useCallback(async()=>{
    if(!ticket?.id) return;
    try{
      const resp=await fetch(`/api/workflows/instances?entityType=intake_ticket&entityId=${encodeURIComponent(ticket.id)}`);
      if(!resp.ok) return;
      const data=await resp.json();
      setInstance((data.instances&&data.instances[0])||null);
    }catch{/* card is best-effort — no ladder, no noise */}
  },[ticket?.id]);

  useEffect(()=>{setInstance(null);setError(null);setSendBackTo("");load();},[load]);

  if(!instance) return null;
  const rag=instance.rag||[];
  const currentStep=rag.find(r=>r.stepOrder===instance.currentStepOrder);
  const stepMeta=(instance.definition?.steps||[]).find(s=>s.stepOrder===instance.currentStepOrder);
  const done=instance.status!=="IN_PROGRESS";
  const previousSteps=rag.filter(r=>r.stepOrder<instance.currentStepOrder&&r.color!=="skipped");

  const act=async(action,extra={})=>{
    setBusy(true);setError(null);
    try{
      const resp=await fetch(`/api/workflows/instances/${instance.id}/act`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action,expectedVersion:instance.version,...extra}),
      });
      const data=await resp.json();
      if(!resp.ok){setError(data.error||`${resp.status}`);}
      await load();
    }catch(e){setError(String(e));}
    finally{setBusy(false);}
  };

  const btn=(label,color,onClick,disabled)=><div onClick={disabled?undefined:onClick} style={{padding:"4px 9px",border:`1px solid ${color}`,color:disabled?C.t3:color,borderRadius:3,cursor:disabled?"default":"pointer",fontSize:9,fontFamily:M,letterSpacing:1,textTransform:"uppercase",fontWeight:700,opacity:disabled?.5:1}}>{label}</div>;

  return <div style={{padding:"12px 14px",marginBottom:10,background:C.s1,border:`1px solid ${C.br}`,borderRadius:4}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
      <div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600}}>
        Governance ladder · {instance.definition?.name||instance.definitionId}
      </div>
      <div style={{fontSize:9,fontFamily:M,letterSpacing:1,textTransform:"uppercase",color:done?(instance.status==="COMPLETED"?C.gn:C.t3):C.am}}>
        {done?instance.status:`Step ${instance.currentStepOrder} · ${currentStep?.name||""}`}
      </div>
    </div>

    {/* RAG strip */}
    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:done?0:10}}>
      {rag.map(r=><div key={r.stepOrder} title={`${r.stepOrder}. ${r.name}${r.overdue?" — SLA breached":""}${r.color==="skipped"?" — skipped":""}`} style={{display:"flex",alignItems:"center",gap:4}}>
        <span style={{width:9,height:9,borderRadius:"50%",display:"inline-block",background:r.color==="skipped"?"transparent":RAG_COLORS[r.color],border:`1.5px solid ${RAG_COLORS[r.color]||C.br}`}}/>
        <span style={{fontSize:9.5,fontFamily:M,color:r.stepOrder===instance.currentStepOrder&&!done?C.t1:C.t3}}>{r.name}{r.kind==="AGENT"?" ◉":""}</span>
        {r.stepOrder<rag.length&&<span style={{color:C.br,fontSize:9}}>—</span>}
      </div>)}
    </div>

    {!done&&<div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
      {btn("✓ Approve step",C.gn,()=>act("approve"),busy)}
      {previousSteps.length>0&&<>
        <select value={sendBackTo} onChange={e=>setSendBackTo(e.target.value)} style={{background:C.s1,border:`1px solid ${C.br}`,color:C.t2,fontSize:9.5,fontFamily:M,padding:"3px 5px",borderRadius:3}}>
          <option value="">send back to…</option>
          {previousSteps.map(s=><option key={s.stepOrder} value={s.stepOrder}>{s.stepOrder}. {s.name}</option>)}
        </select>
        {btn("↩ Send back",C.am,()=>sendBackTo&&act("send_back",{targetStep:Number(sendBackTo)}),busy||!sendBackTo)}
      </>}
      {btn("✕ Reject to start",C.rd,()=>act("reject"),busy)}
      {stepMeta?.approverRole&&<span style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:.5}}>role: {stepMeta.approverRole}</span>}
    </div>}
    {error&&<div style={{marginTop:7,fontSize:10,fontFamily:M,color:C.rd}}>⚠ {error}</div>}
  </div>;
}
