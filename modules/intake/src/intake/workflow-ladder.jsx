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
// A ticket whose type binds a ladder shows its running instance. A
// ticket without one shows a compact "Start a governance ladder"
// control (pick a definition + start it on this ticket) so any ticket
// can be put on a workflow on the spot — no seed→bind→new-ticket dance
// required. When the library is empty the card renders nothing.

const RAG_COLORS={green:C.gn,amber:C.am,red:C.rd,grey:C.br,skipped:C.t3};

export function WorkflowLadderCard({ticket}){
  const[instance,setInstance]=useState(null);
  const[definitions,setDefinitions]=useState([]);
  const[pickKey,setPickKey]=useState("");
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState(null);
  const[sendBackTo,setSendBackTo]=useState("");
  const[changing,setChanging]=useState(false);
  const[changeKey,setChangeKey]=useState("");

  const load=useCallback(async()=>{
    if(!ticket?.id) return;
    try{
      const [instResp,defResp]=await Promise.all([
        fetch(`/api/workflows/instances?entityType=intake_ticket&entityId=${encodeURIComponent(ticket.id)}`),
        fetch(`/api/workflows/definitions`),
      ]);
      if(instResp.ok){
        const data=await instResp.json();
        setInstance((data.instances&&data.instances[0])||null);
      }
      if(defResp.ok){
        const d=await defResp.json();
        setDefinitions(d.definitions||[]);
      }
    }catch{/* card is best-effort — no ladder, no noise */}
  },[ticket?.id]);

  useEffect(()=>{setInstance(null);setError(null);setSendBackTo("");setPickKey("");load();},[load]);

  const startLadder=async()=>{
    if(!pickKey) return;
    setBusy(true);setError(null);
    try{
      const resp=await fetch(`/api/workflows/instances`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({definitionKey:pickKey,entityType:"intake_ticket",entityId:ticket.id}),
      });
      const data=await resp.json();
      if(!resp.ok) setError(data.error||`${resp.status}`);
      await load();
    }catch(e){setError(String(e));}
    finally{setBusy(false);}
  };

  // No running ladder — offer to start one (when the library exists).
  if(!instance){
    if(definitions.length===0) return null;
    return <div style={{padding:"11px 14px",marginBottom:10,background:C.s1,border:`1px dashed ${C.br}`,borderRadius:4}}>
      <div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:7}}>Governance ladder · none running</div>
      <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
        <select value={pickKey} onChange={e=>setPickKey(e.target.value)} style={{background:C.s1,border:`1px solid ${C.br}`,color:C.t2,fontSize:10.5,fontFamily:M,padding:"4px 6px",borderRadius:3,maxWidth:260}}>
          <option value="">Put this ticket on a ladder…</option>
          {definitions.map(d=><option key={d.key} value={d.key}>{d.name} ({d.steps?.length??0} steps)</option>)}
        </select>
        <div onClick={pickKey&&!busy?startLadder:undefined} style={{padding:"4px 11px",border:`1px solid ${C.pp}`,color:pickKey&&!busy?C.pp:C.t3,borderRadius:3,cursor:pickKey&&!busy?"pointer":"default",fontSize:9,fontFamily:M,letterSpacing:1,textTransform:"uppercase",fontWeight:700,opacity:pickKey&&!busy?1:.5}}>{busy?"Starting…":"▸ Start ladder"}</div>
      </div>
      {error&&<div style={{marginTop:7,fontSize:10,fontFamily:M,color:C.rd}}>⚠ {error}</div>}
    </div>;
  }
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

  // Change the ladder on this ticket: cancel the current instance and
  // start the chosen one. History (the cancelled instance) is kept.
  const changeLadder=async()=>{
    if(!changeKey) return;
    setBusy(true);setError(null);
    try{
      await fetch(`/api/workflows/instances/${instance.id}/act`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"cancel",expectedVersion:instance.version,comment:"Ladder changed"}),
      });
      const resp=await fetch(`/api/workflows/instances`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({definitionKey:changeKey,entityType:"intake_ticket",entityId:ticket.id}),
      });
      const data=await resp.json();
      if(!resp.ok) setError(data.error||`${resp.status}`);
      setChanging(false);setChangeKey("");
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
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <div style={{fontSize:9,fontFamily:M,letterSpacing:1,textTransform:"uppercase",color:done?(instance.status==="COMPLETED"?C.gn:C.t3):C.am}}>
          {done?instance.status:`Step ${instance.currentStepOrder} · ${currentStep?.name||""}`}
        </div>
        {definitions.length>0&&<span onClick={()=>setChanging(c=>!c)} title="Change the ladder assigned to this ticket" style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:.5,cursor:"pointer",textTransform:"uppercase"}}>⟳ change</span>}
      </div>
    </div>

    {changing&&<div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap",marginBottom:10,padding:"7px 8px",background:C.s2,borderRadius:3}}>
      <select value={changeKey} onChange={e=>setChangeKey(e.target.value)} style={{background:C.s1,border:`1px solid ${C.br}`,color:C.t2,fontSize:9.5,fontFamily:M,padding:"3px 5px",borderRadius:3,maxWidth:220}}>
        <option value="">change to ladder…</option>
        {definitions.filter(d=>d.key!==instance.definition?.key).map(d=><option key={d.key} value={d.key}>{d.name} ({d.steps?.length??0} steps)</option>)}
      </select>
      {btn("Apply change",C.pp,changeLadder,busy||!changeKey)}
      <span style={{fontSize:9,fontFamily:M,color:C.t4}}>cancels the current ladder and starts the new one</span>
    </div>}

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
