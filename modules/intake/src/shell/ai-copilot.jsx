import { useState } from "react";
import { C, F, M, SR } from "@aegis/ui";

export function AICopilot({open,setOpen}){
  const[msgs,setMsgs]=useState([
    {from:"ai",t:"Good morning, Mark. I've reviewed overnight activity across all 7 domains."},
    {from:"ai",t:"Top priority: EU Antitrust document production is 13 days out with 12,000 docs pending. Recommend approving the rush review contract ($420K) to maintain timeline."},
  ]);
  const[inp,setInp]=useState("");
  const suggested=[
    "What's my biggest exposure this week?",
    "Summarise the LATAM FCPA investigation",
    "Which contracts are affected by EU AI Act?",
    "Draft board memo on current litigation",
  ];
  const ask=(q)=>{
    setMsgs(m=>[...m,{from:"user",t:q}]);
    setInp("");
    setTimeout(()=>{
      const answers={
        "What's my biggest exposure this week?":"EU Antitrust (LIT-326 · €80M–€160M fine range) followed by LATAM FCPA ($120M exposure). Acme Patent settlement authority ($8M) is pending your approval — recommend signing off today as Sarah Chen has endorsed.",
        "Summarise the LATAM FCPA investigation":"CASE-2026-003 · detected Feb 28 via AI pattern match on SAP Ariba. $2.4M in suspicious LATAM vendor payments across 14 transactions. 4 custodians on hold (3 ack'd). Regional Procurement Head interview scheduled Mar 15. Sullivan & Cromwell engaged ($8M budget approved). Voluntary self-disclosure decision pending Board Audit Committee by Mar 20.",
        "Which contracts are affected by EU AI Act?":"47 contracts flagged. 2 critical in current CLM view: SAP SE (CTR-4821) — DPA clauses need AI-specific addendum; Siemens (CTR-4824) — licensed tech may include AI components requiring additional documentation. Open Regulatory → REG-001 → Affected Contracts for full list.",
        "Draft board memo on current litigation":"Draft generated. Key points: 5 active matters · $348.5M aggregate exposure · 2 critical (EU Antitrust, FCPA) · 3 approvals pending GC+Board. Key strategic decisions in next 30 days: (1) EU Antitrust settlement exploration, (2) FCPA voluntary self-disclosure, (3) Acme Patent settlement. Full draft in Board Pack module — ready for your review.",
      };
      const ans=answers[q]||"I'll look into that. (Demo mode — connect to Company Brain RAG pipeline for full answer.)";
      setMsgs(m=>[...m,{from:"ai",t:ans}]);
    },400);
  };
  if(!open) return <div onClick={()=>setOpen(true)} style={{position:"fixed",right:20,bottom:20,width:54,height:54,borderRadius:0,background:C.em,border:`1px solid ${C.em}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",boxShadow:`0 0 24px ${C.em}66`,zIndex:100}}>
    <span style={{fontSize:22,color:C.bg,fontFamily:SR}}>◎</span>
  </div>;
  return <div style={{position:"fixed",right:0,top:0,bottom:0,width:420,background:C.s1,borderLeft:`1px solid ${C.em}`,display:"flex",flexDirection:"column",zIndex:100,boxShadow:`-8px 0 32px ${C.bg}cc`}}>
    <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.br}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>
        <div style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:2,textTransform:"uppercase"}}>AURORA · COPILOT</div>
        <div style={{fontSize:14,fontFamily:SR,color:C.t1,marginTop:2}}>Your <em style={{color:C.em,fontStyle:"italic"}}>GC assistant</em></div>
      </div>
      <div onClick={()=>setOpen(false)} style={{fontSize:18,color:C.t3,cursor:"pointer",fontFamily:M,padding:"4px 10px"}}>×</div>
    </div>
    <div style={{flex:1,overflow:"auto",padding:14}}>
      {msgs.map((m,i)=><div key={i} style={{marginBottom:12,animation:"fu .3s ease"}}>
        <div style={{fontSize:9,fontFamily:M,color:m.from==="ai"?C.em:C.bl,letterSpacing:1.5,textTransform:"uppercase",marginBottom:3}}>{m.from==="ai"?"AURORA":"YOU"}</div>
        <div style={{fontSize:12,color:C.t1,lineHeight:1.5,background:m.from==="ai"?C.emG:C.blG,padding:"8px 12px",borderLeft:`2px solid ${m.from==="ai"?C.em:C.bl}`}}>{m.t}</div>
      </div>)}
    </div>
    <div style={{padding:"10px 14px",borderTop:`1px solid ${C.br}`}}>
      <div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>SUGGESTED</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:10}}>
        {suggested.map((s,i)=><div key={i} onClick={()=>ask(s)} style={{padding:"5px 10px",border:`1px solid ${C.br}`,fontSize:10,color:C.t2,cursor:"pointer",transition:"all .12s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.em;e.currentTarget.style.color=C.em}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.br;e.currentTarget.style.color=C.t2}}>{s}</div>)}
      </div>
      <div style={{display:"flex",gap:6}}>
        <input value={inp} onChange={e=>setInp(e.target.value)} onKeyDown={e=>e.key==="Enter"&&inp&&ask(inp)} placeholder="Ask Aurora anything..." style={{flex:1,background:C.bg,border:`1px solid ${C.br}`,padding:"8px 12px",color:C.t1,fontSize:11,fontFamily:F,outline:"none"}}/>
        <button onClick={()=>inp&&ask(inp)} style={{padding:"8px 14px",border:`1px solid ${C.em}`,background:C.em,color:C.bg,fontSize:10,fontFamily:M,fontWeight:700,letterSpacing:1,cursor:"pointer"}}>→</button>
      </div>
    </div>
  </div>;
}
