import { useState } from "react";
import { C, F, M, SR } from "../theme/tokens";
import { Pill, Dot, Stat, Bar, Card, SH, WorkflowSteps, ApprovalBadge, rc, pc } from "../atoms/ui";
import { TODAY_TASKS } from "../data/today-tasks";
import { CONTRACTS } from "../data/contracts";
import { REGULATIONS } from "../data/regulations";
import { LITIGATIONS } from "../data/litigations";
import { COMPLIANCE_INV } from "../data/compliance";
import { SPEND_FIRMS } from "../data/spend";
import { GOVERNANCE } from "../data/governance";
import { CASES } from "../data/cases";
import { ALL_APPROVALS, ALL_ALERTS } from "../data/aggregate";

export function DailyView(){
  const overdue=TODAY_TASKS.filter(t=>t.status==="Overdue").length;
  const pending=TODAY_TASKS.filter(t=>t.status==="Pending Approval").length;
  const critical=TODAY_TASKS.filter(t=>t.priority==="Critical").length;
  return <div>
    <SH icon="📅" title="Today's GC Command Center" sub={`March 12, 2026 — ${TODAY_TASKS.length} tasks across all modules • ${overdue} overdue • ${pending} pending approval`}/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:16}}>
      {[{l:"Total Tasks",v:TODAY_TASKS.length,c:C.bl},{l:"Critical",v:critical,c:C.rd},{l:"Overdue",v:overdue,c:C.rd},{l:"Pending Approval",v:pending,c:C.am},{l:"In Progress",v:TODAY_TASKS.filter(t=>t.status==="In Progress").length,c:C.tl}].map((s,i)=>
        <Card key={i} d={i*40}><Stat l={s.l} v={s.v} c={s.c} s/></Card>)}
    </div>
    <Card>
      {TODAY_TASKS.map((t,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"50px 1fr 90px 80px 130px 110px",padding:"9px 10px",borderBottom:`1px solid ${C.br}22`,animation:`fu .25s ease ${i*25}ms both`,alignItems:"center"}}>
        <span style={{fontFamily:M,fontSize:10,color:C.t3}}>{t.time}</span>
        <span style={{fontSize:11.5,color:C.t1,fontWeight:500}}>{t.task}</span>
        <Pill t={t.module} c={t.module==="Contracts"?C.bl:t.module==="Litigation"?C.pp:t.module==="Regulatory"?C.tl:t.module==="Compliance"?C.rd:t.module==="Spend"?C.am:t.module==="Governance"?C.cy:C.bl}/>
        <Pill t={t.priority} c={pc(t.priority)}/>
        <span style={{fontSize:10.5,color:C.t2}}>{t.owner}</span>
        <Pill t={t.status} c={t.status==="Overdue"?C.rd:t.status==="Pending Approval"?C.am:t.status==="In Progress"?C.tl:t.status==="Not Started"?C.t4:C.gn}/>
      </div>)}
    </Card>
  </div>;
}

export function AlertsView(){
  return <div>
    <SH icon="🚨" title="Alerts & Notifications" sub={`${ALL_ALERTS.filter(a=>a.sev==="critical").length} critical • ${ALL_ALERTS.filter(a=>a.sev==="warning").length} warnings — across all modules`} c={C.rd}/>
    <Card>{ALL_ALERTS.map((a,i)=><div key={i} style={{display:"flex",gap:10,padding:"9px 12px",borderLeft:`3px solid ${a.sev==="critical"?C.rd:a.sev==="warning"?C.am:C.tl}`,marginBottom:4,borderRadius:4,background:a.sev==="critical"?C.rdG:"transparent",animation:`sl .3s ease ${i*30}ms both`}}>
      <Dot c={a.sev==="critical"?C.rd:a.sev==="warning"?C.am:C.tl} p={a.sev==="critical"}/>
      <div style={{flex:1}}><div style={{fontSize:11.5,color:C.t1,lineHeight:1.4}}>{a.text}</div>
      <div style={{display:"flex",gap:10,marginTop:3,fontSize:10,color:C.t4}}><span>{a.time}</span><Pill t={a.module} c={C.bl}/><span style={{fontFamily:M}}>{a.ref}</span></div></div>
    </div>)}</Card>
  </div>;
}

export function ApprovalsView(){
  return <div>
    <SH icon="✅" title="Pending Approvals" sub={`${ALL_APPROVALS.length} approvals awaiting action across all modules`} c={C.am}/>
    <Card>{ALL_APPROVALS.map((a,i)=><div key={i} style={{padding:"12px 14px",borderBottom:`1px solid ${C.br}22`,animation:`fu .3s ease ${i*40}ms both`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
        <div><div style={{fontSize:12.5,fontWeight:600,color:C.t1,marginBottom:3}}>{a.action}</div>
        <div style={{display:"flex",gap:10,fontSize:10,color:C.t3}}><Pill t={a.module} c={C.bl}/><span style={{fontFamily:M}}>{a.ref}</span><span>{a.context}</span></div></div>
        <ApprovalBadge status="Pending"/>
      </div>
      <div style={{display:"flex",gap:16,fontSize:10.5,color:C.t3,marginTop:4}}>
        <span>Requested by: <span style={{color:C.t1}}>{a.by}</span></span>
        <span>Date: <span style={{fontFamily:M,color:C.t1}}>{a.date}</span></span>
        <span>Approver: <span style={{color:C.am,fontWeight:600}}>{a.approver}</span></span>
      </div>
      <div style={{display:"flex",gap:6,marginTop:8}}>
        <button style={{padding:"4px 14px",borderRadius:4,border:"none",background:C.gn,color:"#000",fontSize:10,fontWeight:600,cursor:"pointer"}}>Approve</button>
        <button style={{padding:"4px 14px",borderRadius:4,border:`1px solid ${C.rd}`,background:"transparent",color:C.rd,fontSize:10,fontWeight:600,cursor:"pointer"}}>Reject</button>
        <button style={{padding:"4px 14px",borderRadius:4,border:`1px solid ${C.am}`,background:"transparent",color:C.am,fontSize:10,fontWeight:600,cursor:"pointer"}}>Escalate</button>
      </div>
    </div>)}</Card>
  </div>;
}

export function ContractsView(){
  const[sel,setSel]=useState(null);const[tab,setTab]=useState("overview");
  const c=sel!==null?CONTRACTS[sel]:null;
  if(c){const tabs=["overview","clauses","versions","negotiate","regulatory"];
  return <div>
    <div onClick={()=>{setSel(null);setTab("overview")}} style={{display:"inline-flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:11,color:C.bl,marginBottom:12,padding:"3px 6px",borderRadius:3}} onMouseEnter={e=>e.currentTarget.style.background=C.blG} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>← Back</div>
    <Card style={{borderLeft:`3px solid ${rc(c.risk)}`,marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div><div style={{display:"flex",gap:5,marginBottom:4}}><span style={{fontFamily:M,fontSize:11,color:C.bl,fontWeight:600}}>{c.id}</span><Pill t={c.risk} c={rc(c.risk)}/><Pill t={c.status} c={c.status==="Legal Hold"?C.rd:c.status==="Escalated"?C.am:C.gn}/><Pill t={c.lifecycle.stage} c={C.tl}/></div>
        <div style={{fontSize:16,fontWeight:700,color:C.t1,fontFamily:`'Fraunces',Georgia,serif`}}>{c.vendor} — {c.type}</div>
        <div style={{fontSize:11,color:C.t2,marginTop:2}}>Jurisdiction: {c.jur} | Expires: {c.exp} | Template: {c.lifecycle.template} | Requestor: {c.lifecycle.requestor}</div></div>
        <div style={{textAlign:"right"}}><div style={{fontSize:24,fontWeight:800,color:C.rd,fontFamily:M}}>{c.val}</div><div style={{fontSize:9,color:C.t3}}>contract value</div><div style={{fontSize:10,color:C.t3,marginTop:4}}>Day {c.lifecycle.totalDays} | {c.lifecycle.daysInStage}d in stage</div></div>
      </div>
    </Card>
    {/* CLM Lifecycle Pipeline */}
    <div style={{fontSize:11,fontWeight:600,color:C.bl,marginBottom:6,letterSpacing:1,textTransform:"uppercase"}}>Contract Lifecycle Pipeline</div>
    <WorkflowSteps steps={c.workflow}/>
    {/* Tab Navigation */}
    <div style={{display:"flex",gap:2,marginTop:14,marginBottom:12}}>{tabs.map(t=><div key={t} onClick={()=>setTab(t)} style={{padding:"6px 14px",borderRadius:5,cursor:"pointer",fontSize:11,fontWeight:tab===t?600:400,background:tab===t?C.blG:"transparent",color:tab===t?C.bl:C.t3,border:`1px solid ${tab===t?C.bl:C.br}33`,textTransform:"capitalize",transition:"all .12s"}}>{t==="negotiate"?"Negotiation":t==="regulatory"?"Reg Links":t}</div>)}</div>
    {/* Tab Content */}
    {tab==="overview"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
      <Card d={50}><div style={{fontSize:11,fontWeight:600,color:C.am,marginBottom:8,letterSpacing:1}}>OBLIGATIONS & DEADLINES</div>
        {c.obligations.map((o,i)=><div key={i} style={{padding:"7px 10px",borderBottom:`1px solid ${C.br}22`,animation:`sl .2s ease ${i*30}ms both`}}>
          <div style={{fontSize:11.5,color:C.t1,fontWeight:500,marginBottom:3}}>{o.ob}</div>
          <div style={{display:"flex",gap:12,fontSize:10,color:C.t3}}><span>Due: <span style={{fontFamily:M,color:o.status==="Overdue"?C.rd:C.t1}}>{o.due}</span></span><span>Owner: {o.owner}</span><Pill t={o.status} c={o.status==="Overdue"?C.rd:o.status==="Pending Approval"?C.am:o.status==="In Progress"?C.tl:C.gn}/></div>
        </div>)}</Card>
      <Card d={80}><div style={{fontSize:11,fontWeight:600,color:C.rd,marginBottom:8,letterSpacing:1}}>ALERTS & APPROVALS</div>
        {c.alerts.map((a,i)=><div key={i} style={{display:"flex",gap:6,padding:"6px 8px",borderLeft:`2px solid ${a.sev==="critical"?C.rd:C.am}`,marginBottom:3,background:a.sev==="critical"?C.rdG:"transparent",borderRadius:2}}><Dot c={a.sev==="critical"?C.rd:C.am} p={a.sev==="critical"}/><div><div style={{fontSize:10.5,color:C.t1,lineHeight:1.3}}>{a.text}</div><div style={{fontSize:8.5,color:C.t4,marginTop:1}}>{a.time}</div></div></div>)}
        <div style={{marginTop:8}}>{c.approvals.map((a,i)=><div key={i} style={{padding:"6px 8px",borderBottom:`1px solid ${C.br}22`}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><span style={{fontSize:10.5,color:C.t1,fontWeight:500}}>{a.action}</span><ApprovalBadge status={a.status}/></div>
          <div style={{fontSize:9.5,color:C.t3}}>Approver: <span style={{color:C.am}}>{a.approver}</span></div>
          {a.status==="Pending"&&<div style={{display:"flex",gap:4,marginTop:4}}><button style={{padding:"3px 10px",borderRadius:3,border:"none",background:C.gn,color:"#000",fontSize:9,fontWeight:600,cursor:"pointer"}}>Approve</button><button style={{padding:"3px 10px",borderRadius:3,border:`1px solid ${C.rd}`,background:"transparent",color:C.rd,fontSize:9,fontWeight:600,cursor:"pointer"}}>Reject</button></div>}
        </div>)}</div></Card>
    </div>}
    {tab==="clauses"&&<Card d={50}>
      <div style={{fontSize:11,fontWeight:600,color:C.pp,marginBottom:10,letterSpacing:1}}>📋 CLAUSE-BY-CLAUSE ANALYSIS vs PLAYBOOK</div>
      <div style={{display:"grid",gridTemplateColumns:"120px 75px 1fr 1fr 60px",padding:"5px 8px",background:C.s1,borderRadius:"4px 4px 0 0",fontSize:9,fontWeight:600,color:C.t3,letterSpacing:.8,textTransform:"uppercase"}}>
        <span>Clause</span><span>Status</span><span>Playbook Position</span><span>Current Draft</span><span>Risk</span></div>
      {c.clauses.map((cl,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"120px 75px 1fr 1fr 60px",padding:"8px 8px",borderBottom:`1px solid ${C.br}22`,animation:`fu .2s ease ${i*25}ms both`,background:cl.risk==="Critical"?C.rdG:cl.risk==="High"?C.amG:"transparent"}}>
        <span style={{fontSize:11,fontWeight:600,color:C.t1}}>{cl.name}</span>
        <Pill t={cl.status} c={cl.status==="Disputed"?C.rd:cl.status==="Agreed"?C.gn:cl.status==="Flagged"?C.am:cl.status==="Breach"?C.rd:C.tl}/>
        <span style={{fontSize:10,color:C.tl}}>{cl.playbook}</span>
        <span style={{fontSize:10,color:cl.risk==="Critical"?C.rd:cl.risk==="High"?C.am:C.t2}}>{cl.current}</span>
        <Pill t={cl.risk} c={rc(cl.risk)}/>
      </div>)}
      <div style={{marginTop:10,padding:"8px 10px",background:C.s1,borderRadius:4}}>
        <div style={{fontSize:10,color:C.t3}}>Playbook Compliance: <span style={{fontFamily:M,fontWeight:700,color:c.clauses.filter(cl=>cl.status==="Agreed").length/c.clauses.length>.7?C.gn:C.am}}>{Math.round(c.clauses.filter(cl=>cl.status==="Agreed").length/c.clauses.length*100)}%</span> aligned | {c.clauses.filter(cl=>cl.status==="Disputed").length} disputed | {c.clauses.filter(cl=>cl.risk==="Critical").length} critical risk</div>
      </div>
    </Card>}
    {tab==="versions"&&<Card d={50}>
      <div style={{fontSize:11,fontWeight:600,color:C.bl,marginBottom:10,letterSpacing:1}}>📝 VERSION HISTORY & REDLINE TRACKER</div>
      <div style={{position:"relative",paddingLeft:18}}>
        <div style={{position:"absolute",left:4,top:0,bottom:0,width:2,background:`linear-gradient(to bottom,${C.bl}80,${C.br})`}}/>
        {c.versions.map((v,i)=><div key={i} style={{position:"relative",paddingBottom:12,animation:`fu .2s ease ${i*30}ms both`}}>
          <div style={{position:"absolute",left:-15,top:3,width:8,height:8,borderRadius:"50%",background:i===c.versions.length-1?C.am:C.bl,border:`2px solid ${C.cd}`}}/>
          <div style={{display:"flex",gap:10,alignItems:"baseline"}}>
            <span style={{fontFamily:M,fontSize:10,color:C.bl,fontWeight:600,minWidth:35}}>{v.v}</span>
            <span style={{fontFamily:M,fontSize:9.5,color:C.t3,minWidth:72}}>{v.date}</span>
            <Pill t={v.by} c={v.by.includes("AI")?C.tl:v.by.includes("SAP")||v.by.includes("Siemens")||v.by.includes("Infosys")?C.or:C.bl}/>
            <span style={{fontSize:10.5,color:C.t1}}>{v.changes}</span>
          </div>
        </div>)}
      </div>
    </Card>}
    {tab==="negotiate"&&<Card d={50}>
      <div style={{fontSize:11,fontWeight:600,color:C.or,marginBottom:10,letterSpacing:1}}>🤝 NEGOTIATION TRACKER</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:12}}>
        <div style={{padding:8,background:C.s1,borderRadius:5,textAlign:"center"}}><div style={{fontSize:20,fontWeight:700,color:C.or,fontFamily:M}}>{c.negotiate.rounds}</div><div style={{fontSize:9,color:C.t3}}>Rounds</div></div>
        <div style={{padding:8,background:C.s1,borderRadius:5,textAlign:"center"}}><div style={{fontSize:12,fontWeight:600,color:C.t1,fontFamily:M}}>{c.negotiate.startDate}</div><div style={{fontSize:9,color:C.t3}}>Started</div></div>
        <div style={{padding:8,background:C.s1,borderRadius:5,textAlign:"center"}}><div style={{fontSize:11,fontWeight:600,color:C.am}}>{c.negotiate.currentRound}</div><div style={{fontSize:9,color:C.t3}}>Current</div></div>
        <div style={{padding:8,background:C.s1,borderRadius:5,textAlign:"center"}}><div style={{fontSize:11,fontWeight:500,color:C.t1}}>{c.negotiate.counterparty}</div><div style={{fontSize:9,color:C.t3}}>Counterparty</div></div>
      </div>
      {c.negotiate.nextAction&&<div style={{padding:"8px 10px",background:C.amG,borderRadius:4,borderLeft:`3px solid ${C.am}`,marginBottom:10}}>
        <div style={{fontSize:10,fontWeight:600,color:C.am}}>Next Action</div><div style={{fontSize:11,color:C.t1}}>{c.negotiate.nextAction}</div></div>}
      {c.negotiate.dealBreakers.length>0&&<div>
        <div style={{fontSize:10,fontWeight:600,color:C.rd,marginBottom:6}}>DEAL BREAKERS</div>
        {c.negotiate.dealBreakers.map((db,i)=><div key={i} style={{display:"flex",gap:6,padding:"4px 8px",borderLeft:`2px solid ${C.rd}`,marginBottom:3}}><Dot c={C.rd}/><span style={{fontSize:10.5,color:C.t1}}>{db}</span></div>)}
      </div>}
    </Card>}
    {tab==="regulatory"&&<Card d={50}>
      <div style={{fontSize:11,fontWeight:600,color:C.tl,marginBottom:10,letterSpacing:1}}>🔗 REGULATORY CROSS-LINKS — CONTRACT ↔ REGULATION</div>
      {c.regLinks.length>0?c.regLinks.map((rl,i)=><div key={i} style={{padding:"10px 12px",borderBottom:`1px solid ${C.br}22`,animation:`sl .2s ease ${i*30}ms both`}}>
        <div style={{display:"flex",gap:6,marginBottom:4}}><span style={{fontFamily:M,fontSize:10,color:C.tl}}>{rl.reg}</span><span style={{fontSize:12,fontWeight:600,color:C.t1}}>{rl.name}</span></div>
        <div style={{fontSize:10.5,color:C.am,borderLeft:`2px solid ${C.am}33`,paddingLeft:8}}>{rl.impact}</div>
      </div>):<div style={{fontSize:11,color:C.t3,padding:16,textAlign:"center"}}>No regulatory cross-links detected for this contract.</div>}
    </Card>}
  </div>;}
  // CLM Dashboard
  return <div>
    <SH icon="📄" title="Contract Lifecycle Management" sub="124,380 contracts • Full CLM: Request → Draft → Review → Negotiate → Approve → Execute → Manage"/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:8,marginBottom:14}}>
      {[{l:"Total",v:"124,380",c:C.bl},{l:"Drafting",v:"42",c:C.tl},{l:"In Review",v:"89",c:C.pp},{l:"Negotiating",v:"34",c:C.or},{l:"Pending Approval",v:"18",c:C.am},{l:"Critical Risk",v:"12",c:C.rd},{l:"Expiring 90d",v:"3,211",c:C.am}].map((s,i)=>
        <Card key={i} d={i*30}><Stat l={s.l} v={s.v} c={s.c} s/></Card>)}
    </div>
    <Card>{CONTRACTS.map((c,i)=><div key={c.id} onClick={()=>setSel(i)} style={{display:"grid",gridTemplateColumns:"75px 130px 100px 65px 55px 45px 65px 65px 70px 1fr",padding:"8px 10px",borderBottom:`1px solid ${C.br}22`,cursor:"pointer",animation:`fu .2s ease ${i*25}ms both`,fontSize:11,alignItems:"center",transition:"background .1s"}} onMouseEnter={e=>e.currentTarget.style.background=C.cdH} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      <span style={{fontFamily:M,color:C.bl,fontWeight:600,fontSize:10}}>{c.id}</span>
      <span style={{color:C.t1,fontWeight:500}}>{c.vendor}</span>
      <span style={{color:C.t2,fontSize:10}}>{c.type}</span>
      <span style={{color:C.t2,fontSize:10}}>{c.jur}</span>
      <span style={{fontFamily:M,fontSize:10}}>{c.val}</span>
      <span style={{fontFamily:M,color:rc(c.risk),fontWeight:700,fontSize:10}}>{c.score}</span>
      <Pill t={c.lifecycle.stage} c={C.tl}/>
      <Pill t={c.risk} c={rc(c.risk)}/>
      <span style={{fontSize:9,color:C.t3}}>v{c.versions.length} | R{c.negotiate.rounds}</span>
      <span style={{fontSize:9,color:C.t4}}>{c.alerts.length>0?`🔔${c.alerts.length}`:""} {c.regLinks.length>0?`🔗${c.regLinks.length} regs`:""}</span>
    </div>)}</Card>
  </div>;
}

export function RegulatoryView(){
  const[sel,setSel]=useState(null);const[tab,setTab]=useState("overview");
  const r=sel!==null?REGULATIONS[sel]:null;
  if(r){const tabs=["overview","gap","actions","contracts","timeline"];
  return <div>
    <div onClick={()=>{setSel(null);setTab("overview")}} style={{display:"inline-flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:11,color:C.bl,marginBottom:12,padding:"3px 6px",borderRadius:3}} onMouseEnter={e=>e.currentTarget.style.background=C.blG} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>← Back</div>
    <Card style={{borderLeft:`3px solid ${rc(r.impact)}`,marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between"}}><div><div style={{display:"flex",gap:5,marginBottom:4}}><span style={{fontFamily:M,fontSize:11,color:C.tl}}>{r.id}</span><Pill t={r.impact} c={rc(r.impact)}/><Pill t={r.status} c={r.status==="Action Required"?C.rd:r.status==="Compliant"?C.gn:C.am}/></div>
      <div style={{fontSize:16,fontWeight:700,color:C.t1,fontFamily:`'Fraunces',Georgia,serif`}}>{r.name}</div>
      <div style={{fontSize:11,color:C.t2,marginTop:2}}>Jurisdiction: {r.jur} | Deadline: {r.deadline} | {r.systems} systems affected</div></div></div>
    </Card>
    <WorkflowSteps steps={r.workflow}/>
    <div style={{display:"flex",gap:2,marginTop:12,marginBottom:10}}>{tabs.map(t=><div key={t} onClick={()=>setTab(t)} style={{padding:"5px 12px",borderRadius:5,cursor:"pointer",fontSize:10.5,fontWeight:tab===t?600:400,background:tab===t?C.tlG:"transparent",color:tab===t?C.tl:C.t3,border:`1px solid ${tab===t?C.tl:C.br}33`,textTransform:"capitalize",transition:"all .12s"}}>{t==="gap"?"Gap Analysis":t==="contracts"?"Affected Contracts":t}</div>)}</div>
    {tab==="overview"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
      <Card d={50}><div style={{fontSize:11,fontWeight:600,color:C.tl,marginBottom:8,letterSpacing:1}}>📋 REGULATION SUMMARY</div>
        <div style={{fontSize:11,color:C.t1,lineHeight:1.6,marginBottom:10}}>
          {r.id==="REG-001"?"The EU AI Act classifies AI systems into risk tiers. Article 6 defines high-risk systems requiring conformity assessments, human oversight, and technical documentation. Non-compliance penalties: up to 6% of global turnover or €30M.":
           r.id==="REG-003"?"China's CAC requires security assessments for cross-border data transfers involving personal information of 100K+ individuals or sensitive data. Companies must file with the Cyberspace Administration and demonstrate data localization for critical categories.":
           r.id==="REG-005"?"The UK FCA Consumer Duty requires firms to demonstrate that AI-driven decisions produce fair outcomes for consumers. This includes bias testing, outcome monitoring, and board-level attestation of compliance.":
           "Regulatory requirement impacting company operations. Full text and analysis available in the regulatory library."}
        </div>
        <div style={{fontSize:10,fontWeight:600,color:C.rd,marginBottom:6}}>ALERTS</div>
        {r.alerts.map((a,i)=><div key={i} style={{display:"flex",gap:6,padding:"5px 8px",borderLeft:`2px solid ${a.sev==="critical"?C.rd:a.sev==="warning"?C.am:C.tl}`,marginBottom:3}}><Dot c={a.sev==="critical"?C.rd:a.sev==="warning"?C.am:C.tl} p={a.sev==="critical"}/><div style={{fontSize:10.5,color:C.t1}}>{a.text}</div></div>)}
      </Card>
      <Card d={80}><div style={{fontSize:11,fontWeight:600,color:C.am,marginBottom:8,letterSpacing:1}}>✅ APPROVALS & ESCALATIONS</div>
        {r.approvals.map((a,i)=><div key={i} style={{padding:"7px 8px",borderBottom:`1px solid ${C.br}22`}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><span style={{fontSize:10.5,color:C.t1,fontWeight:500}}>{a.action}</span><ApprovalBadge status={a.status}/></div>
          <div style={{fontSize:9.5,color:C.t3}}>Approver: <span style={{color:C.am}}>{a.approver}</span></div>
          {a.status==="Pending"&&<div style={{display:"flex",gap:4,marginTop:4}}><button style={{padding:"3px 10px",borderRadius:3,border:"none",background:C.gn,color:"#000",fontSize:9,fontWeight:600,cursor:"pointer"}}>Approve</button><button style={{padding:"3px 10px",borderRadius:3,border:`1px solid ${C.rd}`,background:"transparent",color:C.rd,fontSize:9,fontWeight:600,cursor:"pointer"}}>Reject</button></div>}
        </div>)}{r.approvals.length===0&&<div style={{fontSize:10,color:C.t3,padding:10}}>No pending approvals for this regulation.</div>}
      </Card>
    </div>}
    {tab==="gap"&&<Card d={50}>
      <div style={{fontSize:11,fontWeight:600,color:C.rd,marginBottom:10,letterSpacing:1}}>🔍 AI-DRIVEN GAP ANALYSIS — Current Posture vs Requirements</div>
      {[{area:"Technical Documentation",required:"Full system architecture, training data lineage, model cards for each high-risk AI",current:r.id==="REG-001"?"Partial — 2 of 4 systems documented":"In Progress",gap:r.id==="REG-001"?"2 systems missing documentation":"Minor gaps",compliance:r.id==="REG-001"?50:75},
        {area:"Human Oversight Mechanisms",required:"Human-in-the-loop for all automated decisions affecting individuals",current:r.id==="REG-001"?"Not implemented for underwriting AI":"Implemented for 2 of 3 systems",gap:r.id==="REG-001"?"Critical — underwriting system fully automated":"1 system pending",compliance:r.id==="REG-001"?20:70},
        {area:"Risk Assessment & Testing",required:"Bias testing, accuracy benchmarks, adversarial testing",current:"Annual testing only",gap:"Continuous monitoring required — current frequency insufficient",compliance:40},
        {area:"Data Governance",required:"Data quality metrics, consent tracking, retention policies",current:"Partial — consent tracking in place, quality metrics missing",gap:"Data quality framework needed",compliance:55},
      ].map((g,i)=><div key={i} style={{padding:"10px 12px",borderBottom:`1px solid ${C.br}22`,animation:`fu .2s ease ${i*30}ms both`}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
          <span style={{fontSize:11.5,fontWeight:600,color:C.t1}}>{g.area}</span>
          <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:60}}><Bar pct={g.compliance} c={g.compliance>=70?C.gn:g.compliance>=40?C.am:C.rd}/></div><span style={{fontFamily:M,fontSize:10,color:g.compliance>=70?C.gn:g.compliance>=40?C.am:C.rd,fontWeight:600}}>{g.compliance}%</span></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,fontSize:10}}>
          <div><span style={{color:C.t3}}>Required: </span><span style={{color:C.t2}}>{g.required}</span></div>
          <div><span style={{color:C.t3}}>Current: </span><span style={{color:C.t2}}>{g.current}</span></div>
          <div><span style={{color:C.t3}}>Gap: </span><span style={{color:C.rd}}>{g.gap}</span></div>
        </div>
      </div>)}
    </Card>}
    {tab==="actions"&&<Card d={50}>
      <div style={{fontSize:11,fontWeight:600,color:C.am,marginBottom:10,letterSpacing:1}}>📋 REMEDIATION ACTIONS</div>
      {r.actions.map((a,i)=><div key={i} style={{padding:"8px 10px",borderBottom:`1px solid ${C.br}22`,animation:`sl .2s ease ${i*30}ms both`}}>
        <div style={{fontSize:11.5,color:C.t1,fontWeight:500,marginBottom:3}}>{a.task}</div>
        <div style={{display:"flex",gap:12,fontSize:10,color:C.t3}}><span>Due: <span style={{fontFamily:M,color:C.t1}}>{a.due}</span></span><span>Owner: {a.owner}</span><Pill t={a.status} c={a.status==="Not Started"?C.t4:a.status==="In Progress"?C.tl:C.gn}/></div>
      </div>)}</Card>}
    {tab==="contracts"&&<Card d={50}>
      <div style={{fontSize:11,fontWeight:600,color:C.bl,marginBottom:10,letterSpacing:1}}>🔗 AFFECTED CONTRACTS — Auto-Flagged by AI</div>
      {CONTRACTS.filter(ct=>ct.regLinks.some(rl=>rl.reg===r.id)).map((ct,i)=><div key={ct.id} style={{padding:"10px 12px",borderBottom:`1px solid ${C.br}22`,animation:`sl .2s ease ${i*30}ms both`}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
          <div style={{display:"flex",gap:5}}><span style={{fontFamily:M,fontSize:10,color:C.bl}}>{ct.id}</span><span style={{fontSize:12,fontWeight:600,color:C.t1}}>{ct.vendor}</span><Pill t={ct.risk} c={rc(ct.risk)}/></div>
          <span style={{fontFamily:M,fontSize:11,color:C.t1}}>{ct.val}</span>
        </div>
        <div style={{fontSize:10,color:C.am,borderLeft:`2px solid ${C.am}33`,paddingLeft:8}}>{ct.regLinks.find(rl=>rl.reg===r.id)?.impact}</div>
      </div>)}
      {CONTRACTS.filter(ct=>ct.regLinks.some(rl=>rl.reg===r.id)).length===0&&<div style={{fontSize:10,color:C.t3,padding:10,textAlign:"center"}}>No contracts directly linked to this regulation.</div>}
    </Card>}
    {tab==="timeline"&&<Card d={50}>
      <div style={{fontSize:11,fontWeight:600,color:C.bl,marginBottom:10,letterSpacing:1}}>📅 REGULATORY TIMELINE</div>
      <div style={{position:"relative",paddingLeft:18}}>
        <div style={{position:"absolute",left:4,top:0,bottom:0,width:2,background:`linear-gradient(to bottom,${C.tl}80,${C.br})`}}/>
        {[{date:"Detection",ev:`AI agent detected ${r.name}`,s:"done"},{date:"Assessment",ev:"Impact assessment completed — "+r.systems+" systems affected",s:"done"},{date:"Gap Analysis",ev:"AI gap analysis: compliance gaps identified in "+r.actions.length+" areas",s:r.workflow.find(w=>w.label&&w.label.includes("Gap"))?.done?"done":"active"},{date:r.deadline,ev:"COMPLIANCE DEADLINE",s:"upcoming"}].map((m,i)=>{
          const dc=m.s==="done"?C.gn:m.s==="active"?C.am:C.rd;
          return <div key={i} style={{position:"relative",paddingBottom:14,animation:`fu .2s ease ${i*30}ms both`}}>
            <div style={{position:"absolute",left:-15,top:3,width:8,height:8,borderRadius:"50%",background:dc,border:`2px solid ${C.cd}`,animation:m.s==="upcoming"?"p 2s infinite":"none"}}/>
            <div style={{display:"flex",gap:8}}><span style={{fontFamily:M,fontSize:10,color:C.t3,minWidth:70}}>{m.date}</span><span style={{fontSize:11,color:m.s==="upcoming"?C.rd:C.t1,fontWeight:m.s==="upcoming"?600:400}}>{m.ev}</span></div>
          </div>;})}
      </div>
    </Card>}
  </div>;}
  // Regulatory Dashboard with Compliance Heatmap
  return <div>
    <SH icon="📋" title="Real-Time Regulatory Intelligence & Compliance" sub="42 regulations • 38 jurisdictions • AI-driven gap analysis • Contract cross-links" c={C.tl}/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:12}}>
      {[{l:"Active Regulations",v:"42",c:C.tl},{l:"Critical Impact",v:"9",c:C.rd},{l:"Action Required",v:"3",c:C.am},{l:"Jurisdictions",v:"38",c:C.bl},{l:"Contracts Affected",v:CONTRACTS.filter(c=>c.regLinks.length>0).length,c:C.or}].map((s,i)=>
        <Card key={i} d={i*30}><Stat l={s.l} v={s.v} c={s.c} s/></Card>)}
    </div>
    {/* Compliance Posture Heatmap */}
    <Card d={80} style={{marginBottom:12}}>
      <div style={{fontSize:11,fontWeight:600,color:C.tl,marginBottom:8,letterSpacing:1}}>🌍 GLOBAL COMPLIANCE POSTURE — Real-Time</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6}}>
        {[{jur:"EU",score:62,regs:3,color:C.am},{jur:"USA",score:88,regs:1,color:C.gn},{jur:"India",score:71,regs:1,color:C.am},{jur:"China",score:45,regs:1,color:C.rd},{jur:"UK",score:78,regs:1,color:C.am},{jur:"Brazil",score:82,regs:1,color:C.gn}].map((j,i)=>
          <div key={j.jur} style={{padding:8,background:C.s1,borderRadius:5,textAlign:"center",borderTop:`3px solid ${j.color}`,animation:`fu .2s ease ${i*30}ms both`}}>
            <div style={{fontSize:16,fontWeight:700,color:j.color,fontFamily:M}}>{j.score}%</div>
            <div style={{fontSize:11,fontWeight:600,color:C.t1}}>{j.jur}</div>
            <div style={{fontSize:9,color:C.t3}}>{j.regs} active reg{j.regs>1?"s":""}</div>
          </div>)}
      </div>
    </Card>
    {/* Regulation List */}
    <Card>{REGULATIONS.map((r,i)=><div key={r.id} onClick={()=>setSel(i)} style={{padding:"11px 12px",borderBottom:`1px solid ${C.br}22`,cursor:"pointer",animation:`fu .2s ease ${i*25}ms both`,transition:"background .1s"}} onMouseEnter={e=>e.currentTarget.style.background=C.cdH} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontFamily:M,fontSize:10,color:C.tl}}>{r.id}</span><span style={{fontSize:12,fontWeight:600,color:C.t1}}>{r.name}</span></div><div style={{display:"flex",gap:4}}><Pill t={r.impact} c={rc(r.impact)}/><Pill t={r.status} c={r.status==="Action Required"?C.rd:r.status==="Compliant"?C.gn:C.am}/></div></div>
      <div style={{display:"flex",gap:12,fontSize:10,color:C.t3}}><span>📍 {r.jur}</span><span>📅 {r.deadline}</span><span>🖥️ {r.systems} systems</span><span>🔗 {CONTRACTS.filter(c=>c.regLinks.some(rl=>rl.reg===r.id)).length} contracts</span><span>🔔 {r.alerts.length} alerts</span></div>
    </div>)}</Card>
  </div>;
}

export function LitigationView(){
  const[sel,setSel]=useState(null);
  const l=sel!==null?LITIGATIONS[sel]:null;
  if(l)return <div>
    <div onClick={()=>setSel(null)} style={{display:"inline-flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:11,color:C.bl,marginBottom:12,padding:"3px 6px",borderRadius:3}} onMouseEnter={e=>e.currentTarget.style.background=C.blG} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>← Back</div>
    <Card style={{borderLeft:`3px solid ${pc(l.priority)}`,marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between"}}><div><div style={{display:"flex",gap:6,marginBottom:4}}><span style={{fontFamily:M,fontSize:11,color:C.pp}}>{l.id}</span><Pill t={l.priority} c={pc(l.priority)}/><Pill t={l.type} c={C.bl}/><Pill t={l.phase} c={C.tl}/></div>
      <div style={{fontSize:16,fontWeight:700,color:C.t1,fontFamily:`'Fraunces',Georgia,serif`}}>{l.title}</div>
      <div style={{fontSize:11,color:C.t2,marginTop:2}}>{l.court} | {l.judge} | {l.counsel}</div></div>
      <div style={{textAlign:"right"}}><div style={{fontSize:24,fontWeight:800,color:C.rd,fontFamily:M}}>{l.exposure}</div><div style={{fontSize:12,color:C.gn,fontWeight:600}}>{l.prediction} favorable</div></div></div>
    </Card>
    <div style={{fontSize:11,fontWeight:600,color:C.pp,marginBottom:6,letterSpacing:1,textTransform:"uppercase"}}>Litigation Lifecycle</div>
    <WorkflowSteps steps={l.workflow}/>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginTop:16}}>
      <Card d={100}><div style={{fontSize:11,fontWeight:600,color:C.am,marginBottom:10,letterSpacing:1}}>KEY DATES</div>
        {l.keyDates.map((d,i)=><div key={i} style={{display:"flex",gap:10,padding:"7px 10px",borderBottom:`1px solid ${C.br}22`,animation:`sl .25s ease ${i*40}ms both`}}>
          <span style={{fontFamily:M,fontSize:10,color:C.t1,minWidth:75}}>{d.date}</span><span style={{fontSize:11,color:C.t2}}>{d.event}</span></div>)}
        <div style={{fontSize:11,fontWeight:600,color:C.bl,marginTop:14,marginBottom:8,letterSpacing:1}}>MOTIONS</div>
        {l.motions.map((m,i)=><div key={i} style={{padding:"7px 10px",borderBottom:`1px solid ${C.br}22`}}>
          <div style={{fontSize:11,color:C.t1,fontWeight:500}}>{m.title}</div>
          <div style={{display:"flex",gap:10,fontSize:10,color:C.t3,marginTop:2}}><span>Filed: {m.filed}</span><Pill t={m.status} c={m.status==="Granted"?C.gn:m.status==="Denied"?C.rd:C.am}/></div>
        </div>)}</Card>
      <Card d={150}><div style={{fontSize:11,fontWeight:600,color:C.am,marginBottom:10,letterSpacing:1}}>SPEND vs BUDGET</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
          <div style={{textAlign:"center",padding:8,background:C.s1,borderRadius:5}}><div style={{fontSize:16,fontWeight:700,color:C.am,fontFamily:M}}>${(l.spend.total/1e6).toFixed(1)}M</div><div style={{fontSize:9,color:C.t3}}>Spent</div></div>
          <div style={{textAlign:"center",padding:8,background:C.s1,borderRadius:5}}><div style={{fontSize:16,fontWeight:700,color:C.t1,fontFamily:M}}>${(l.spend.budget/1e6).toFixed(1)}M</div><div style={{fontSize:9,color:C.t3}}>Budget</div></div>
          <div style={{textAlign:"center",padding:8,background:C.s1,borderRadius:5}}><div style={{fontSize:16,fontWeight:700,color:C.tl,fontFamily:M}}>{l.spend.hours}</div><div style={{fontSize:9,color:C.t3}}>Hours</div></div>
        </div>
        <Bar pct={(l.spend.total/l.spend.budget)*100} c={l.spend.total/l.spend.budget>.85?C.am:C.gn}/>
        <div style={{fontSize:10,color:C.t3,marginTop:4}}>{Math.round(l.spend.total/l.spend.budget*100)}% of budget utilized</div>
      </Card>
      <Card d={200}><div style={{fontSize:11,fontWeight:600,color:C.rd,marginBottom:10,letterSpacing:1}}>ALERTS & APPROVALS</div>
        {l.alerts.map((a,i)=><div key={i} style={{display:"flex",gap:8,padding:"7px 10px",borderLeft:`2px solid ${a.sev==="critical"?C.rd:C.am}`,marginBottom:4}}>
          <Dot c={a.sev==="critical"?C.rd:C.am} p={a.sev==="critical"}/><div><div style={{fontSize:10.5,color:C.t1,lineHeight:1.3}}>{a.text}</div><div style={{fontSize:9,color:C.t4,marginTop:1}}>{a.time}</div></div></div>)}
        <div style={{marginTop:10}}>{l.approvals.map((a,i)=><div key={i} style={{padding:"7px 10px",borderBottom:`1px solid ${C.br}22`}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><span style={{fontSize:10.5,color:C.t1,fontWeight:500}}>{a.action}</span><ApprovalBadge status={a.status}/></div>
          <div style={{fontSize:9.5,color:C.t3}}>Approver: <span style={{color:C.am}}>{a.approver}</span></div>
          {a.status==="Pending"&&<div style={{display:"flex",gap:4,marginTop:4}}><button style={{padding:"2px 8px",borderRadius:3,border:"none",background:C.gn,color:"#000",fontSize:9,fontWeight:600,cursor:"pointer"}}>Approve</button><button style={{padding:"2px 8px",borderRadius:3,border:`1px solid ${C.rd}`,background:"transparent",color:C.rd,fontSize:9,fontWeight:600,cursor:"pointer"}}>Reject</button></div>}
        </div>)}</div></Card>
    </div>
  </div>;
  return <div>
    <SH icon="⚖️" title="Litigation Strategy Agent" sub="87 active cases • $420M exposure • Click for full workflow" c={C.pp}/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
      {[{l:"Active Cases",v:"87",c:C.pp},{l:"Exposure",v:"$420M",c:C.rd},{l:"Avg Win Prob",v:"62%",c:C.gn},{l:"Pending Approvals",v:LITIGATIONS.reduce((a,l)=>a+l.approvals.filter(x=>x.status==="Pending").length,0),c:C.am}].map((s,i)=>
        <Card key={i} d={i*40}><Stat l={s.l} v={s.v} c={s.c} s/></Card>)}
    </div>
    <Card>{LITIGATIONS.map((l,i)=><div key={l.id} onClick={()=>setSel(i)} style={{padding:"12px",borderBottom:`1px solid ${C.br}22`,cursor:"pointer",animation:`fu .25s ease ${i*30}ms both`,transition:"background .1s"}} onMouseEnter={e=>e.currentTarget.style.background=C.cdH} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><div><div style={{display:"flex",gap:6,marginBottom:3}}><span style={{fontFamily:M,fontSize:10,color:C.pp}}>{l.id}</span><Pill t={l.priority} c={pc(l.priority)}/><Pill t={l.type} c={C.bl}/></div><div style={{fontSize:13,fontWeight:600,color:C.t1}}>{l.title}</div></div>
      <div style={{textAlign:"right"}}><div style={{fontSize:18,fontWeight:700,color:C.rd,fontFamily:M}}>{l.exposure}</div><div style={{fontSize:10,color:C.gn}}>{l.prediction} favorable</div></div></div>
      <div style={{display:"flex",gap:14,fontSize:10,color:C.t3}}><span>Phase: <span style={{color:C.tl,fontWeight:600}}>{l.phase}</span></span><span>{l.court}</span><span>{l.counsel}</span><span>🔔 {l.alerts.length} alerts</span></div>
    </div>)}</Card>
  </div>;
}

export function ComplianceView(){
  const[sel,setSel]=useState(null);
  const inv=sel!==null?COMPLIANCE_INV[sel]:null;
  if(inv)return <div>
    <div onClick={()=>setSel(null)} style={{display:"inline-flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:11,color:C.bl,marginBottom:12,padding:"3px 6px",borderRadius:3}} onMouseEnter={e=>e.currentTarget.style.background=C.blG} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>← Back</div>
    <Card style={{borderLeft:`3px solid ${C.rd}`,marginBottom:14}}>
      <div style={{display:"flex",gap:6,marginBottom:4}}><span style={{fontFamily:M,fontSize:11,color:C.rd}}>{inv.id}</span><Pill t={inv.sev} c={pc(inv.sev)}/><Pill t={inv.type} c={C.pp}/></div>
      <div style={{fontSize:16,fontWeight:700,color:C.t1,fontFamily:`'Fraunces',Georgia,serif`}}>{inv.title}</div>
      <div style={{fontSize:11,color:C.t2,marginTop:2}}>Region: {inv.region} | Lead: {inv.lead} | Detected: {inv.detected}</div>
    </Card>
    <WorkflowSteps steps={inv.workflow}/>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginTop:16}}>
      <Card d={100}><div style={{fontSize:11,fontWeight:600,color:C.pp,marginBottom:10,letterSpacing:1}}>EVIDENCE COLLECTED</div>
        {inv.evidence.map((e,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 10px",borderBottom:`1px solid ${C.br}22`}}>
          <span style={{fontSize:11,color:C.t1}}>{e.type}</span><div style={{display:"flex",gap:10}}><span style={{fontFamily:M,fontSize:11,color:C.tl,fontWeight:600}}>{e.count} items</span><span style={{fontSize:10,color:C.t3}}>from {e.source}</span></div></div>)}
      </Card>
      <Card d={150}><div style={{fontSize:11,fontWeight:600,color:C.rd,marginBottom:10,letterSpacing:1}}>ALERTS & APPROVALS</div>
        {inv.alerts.map((a,i)=><div key={i} style={{display:"flex",gap:8,padding:"7px 10px",borderLeft:`2px solid ${a.sev==="critical"?C.rd:C.am}`,marginBottom:4}}>
          <Dot c={a.sev==="critical"?C.rd:C.am} p={a.sev==="critical"}/><div><div style={{fontSize:10.5,color:C.t1,lineHeight:1.3}}>{a.text}</div></div></div>)}
        {inv.approvals.map((a,i)=><div key={i} style={{padding:"8px 10px",borderBottom:`1px solid ${C.br}22`,marginTop:4}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><span style={{fontSize:10.5,color:C.t1,fontWeight:500}}>{a.action}</span><ApprovalBadge status={a.status}/></div>
          <div style={{fontSize:9.5,color:C.t3}}>Approver: <span style={{color:C.am}}>{a.approver}</span></div>
          {a.status==="Pending"&&<div style={{display:"flex",gap:4,marginTop:4}}><button style={{padding:"2px 8px",borderRadius:3,border:"none",background:C.gn,color:"#000",fontSize:9,fontWeight:600,cursor:"pointer"}}>Approve</button><button style={{padding:"2px 8px",borderRadius:3,border:`1px solid ${C.rd}`,background:"transparent",color:C.rd,fontSize:9,fontWeight:600,cursor:"pointer"}}>Reject</button></div>}
        </div>)}</Card>
    </div>
  </div>;
  return <div>
    <SH icon="🔍" title="Compliance & Investigation Agent" sub="14 open investigations • 4,280 sanctions screenings • Click for workflow" c={C.rd}/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
      {[{l:"Investigations",v:"14",c:C.rd},{l:"Flagged Tx",v:"22",c:C.am},{l:"Sanctions Hits",v:"6",c:C.rd},{l:"Policy Violations",v:"23",c:C.or}].map((s,i)=>
        <Card key={i} d={i*40}><Stat l={s.l} v={s.v} c={s.c} s/></Card>)}
    </div>
    <Card>{COMPLIANCE_INV.map((inv,i)=><div key={inv.id} onClick={()=>setSel(i)} style={{padding:"12px",borderBottom:`1px solid ${C.br}22`,cursor:"pointer",animation:`fu .25s ease ${i*30}ms both`,transition:"background .1s"}} onMouseEnter={e=>e.currentTarget.style.background=C.cdH} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><div style={{display:"flex",gap:6}}><span style={{fontFamily:M,fontSize:10,color:C.rd}}>{inv.id}</span><Pill t={inv.sev} c={pc(inv.sev)}/><Pill t={inv.type} c={C.pp}/></div><Pill t={inv.status} c={C.gn}/></div>
      <div style={{fontSize:12.5,fontWeight:600,color:C.t1,marginBottom:3}}>{inv.title}</div>
      <div style={{display:"flex",gap:14,fontSize:10,color:C.t3}}><span>📍 {inv.region}</span><span>Lead: {inv.lead}</span><span>🔗 {inv.flaggedTx} flagged tx</span><span>🔔 {inv.alerts.length} alerts</span></div>
    </div>)}</Card>
  </div>;
}

export function SpendView(){
  const[tab,setTab]=useState("dashboard");
  const tabs=["dashboard","firms","invoices","forecast","savings"];
  return <div>
    <SH icon="💰" title="Legal Spend Management" sub="$92M tracked • AI-powered invoice review • Rate benchmarking • Savings analytics • CFO-ready reporting" c={C.am}/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8,marginBottom:12}}>
      {[{l:"YTD Spend",v:"$92M",c:C.am},{l:"Budget",v:"$82M",c:C.t1},{l:"Variance",v:"+$10M",c:C.rd},{l:"AI Savings",v:"$4.2M",c:C.gn},{l:"Invoices Reviewed",v:"890",c:C.bl},{l:"Flags Raised",v:"142",c:C.rd}].map((s,i)=>
        <Card key={i} d={i*25}><Stat l={s.l} v={s.v} c={s.c} s/></Card>)}
    </div>
    <div style={{display:"flex",gap:2,marginBottom:12}}>{tabs.map(t=><div key={t} onClick={()=>setTab(t)} style={{padding:"5px 14px",borderRadius:5,cursor:"pointer",fontSize:10.5,fontWeight:tab===t?600:400,background:tab===t?C.amG:"transparent",color:tab===t?C.am:C.t3,border:`1px solid ${tab===t?C.am:C.br}33`,textTransform:"capitalize",transition:"all .12s"}}>{t}</div>)}</div>

    {tab==="dashboard"&&<div>
      {/* Spend by Practice Area */}
      <Card d={30} style={{marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:600,color:C.am,marginBottom:10,letterSpacing:1}}>SPEND BY PRACTICE AREA — YTD vs BUDGET</div>
        {[{area:"Litigation",ytd:34200000,budget:28000000,matters:87,pct:122},{area:"Regulatory & Compliance",ytd:22400000,budget:20000000,matters:14,pct:112},{area:"Commercial / Contracts",ytd:18600000,budget:18000000,matters:342,pct:103},{area:"IP / Patent",ytd:8800000,budget:8000000,matters:24,pct:110},{area:"Employment",ytd:5200000,budget:5500000,matters:48,pct:95},{area:"M&A / Corporate",ytd:2800000,budget:2500000,matters:6,pct:112}].map((pa,i)=>
          <div key={pa.area} style={{padding:"8px 10px",borderBottom:`1px solid ${C.br}22`,animation:`fu .2s ease ${i*25}ms both`}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:11.5,fontWeight:600,color:C.t1}}>{pa.area}</span>
              <div style={{display:"flex",gap:12,alignItems:"center"}}>
                <span style={{fontFamily:M,fontSize:12,color:C.am,fontWeight:700}}>${(pa.ytd/1e6).toFixed(1)}M</span>
                <span style={{fontSize:10,color:C.t3}}>of ${(pa.budget/1e6).toFixed(1)}M</span>
                <span style={{fontFamily:M,fontSize:10,color:pa.pct>110?C.rd:pa.pct>100?C.am:C.gn,fontWeight:600}}>{pa.pct}%</span>
              </div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <div style={{flex:1}}><Bar pct={Math.min(pa.pct,130)/1.3} c={pa.pct>110?C.rd:pa.pct>100?C.am:C.gn} d={i*30}/></div>
              <span style={{fontSize:9,color:C.t3,minWidth:60}}>{pa.matters} matters</span>
            </div>
          </div>)}
      </Card>
      {/* Top Spenders + Outside Counsel Summary */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Card d={80}><div style={{fontSize:11,fontWeight:600,color:C.bl,marginBottom:8,letterSpacing:1}}>TOP OUTSIDE COUNSEL — SPEND RANKING</div>
          {SPEND_FIRMS.map((f,i)=><div key={f.name} style={{display:"flex",justifyContent:"space-between",padding:"6px 8px",borderBottom:`1px solid ${C.br}22`,animation:`sl .2s ease ${i*25}ms both`}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontFamily:M,fontSize:10,color:C.t3,minWidth:16}}>{i+1}.</span><span style={{fontSize:11,color:C.t1,fontWeight:500}}>{f.name}</span></div>
            <div style={{display:"flex",gap:10,alignItems:"center"}}><span style={{fontFamily:M,fontSize:11,color:C.am,fontWeight:600}}>${(f.spend/1e6).toFixed(1)}M</span><span style={{fontFamily:M,fontSize:10,color:f.rate>f.bench?C.rd:C.gn}}>{f.trend}</span></div>
          </div>)}</Card>
        <Card d={110}><div style={{fontSize:11,fontWeight:600,color:C.rd,marginBottom:8,letterSpacing:1}}>⚠️ SPEND ALERTS</div>
          {[{text:"Cleary Gottlieb at 185% of budget — EU Antitrust driving overage. Review required.",sev:"critical"},{text:"K&E rate increase request (+5%) — above market benchmark by 8%.",sev:"warning"},{text:"Sullivan & Cromwell FCPA budget increase request (+$2M).",sev:"warning"},{text:"Block-billed entries detected in 12% of Littler invoices.",sev:"warning"},{text:"$420K rush review contract pending GC+CFO approval.",sev:"info"}].map((a,i)=>
            <div key={i} style={{display:"flex",gap:6,padding:"5px 8px",borderLeft:`2px solid ${a.sev==="critical"?C.rd:a.sev==="warning"?C.am:C.tl}`,marginBottom:3,background:a.sev==="critical"?C.rdG:"transparent",borderRadius:2,animation:`sl .2s ease ${i*25}ms both`}}>
              <Dot c={a.sev==="critical"?C.rd:a.sev==="warning"?C.am:C.tl} p={a.sev==="critical"}/><span style={{fontSize:10,color:C.t1}}>{a.text}</span></div>)}</Card>
      </div>
    </div>}

    {tab==="firms"&&<Card>{SPEND_FIRMS.map((f,i)=><div key={f.name} style={{padding:"12px",borderBottom:`1px solid ${C.br}22`,animation:`fu .2s ease ${i*25}ms both`}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><div style={{fontSize:13,fontWeight:600,color:C.t1}}>{f.name}</div><div style={{fontFamily:M,fontSize:16,fontWeight:700,color:C.am}}>${(f.spend/1e6).toFixed(1)}M</div></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,fontSize:10.5}}>
        <div><span style={{color:C.t3}}>Matters: </span><span style={{color:C.t1}}>{f.matters}</span></div>
        <div><span style={{color:C.t3}}>Rate: </span><span style={{fontFamily:M,color:C.t1}}>${f.rate}/hr</span></div>
        <div><span style={{color:C.t3}}>Benchmark: </span><span style={{fontFamily:M,color:C.tl}}>${f.bench}/hr</span></div>
        <div><span style={{color:C.t3}}>vs Bench: </span><span style={{fontFamily:M,color:f.rate>f.bench?C.rd:C.gn,fontWeight:600}}>{f.trend}</span></div>
        <div><span style={{color:C.t3}}>Efficiency: </span><span style={{color:C.tl,fontWeight:600}}>{f.efficiency}</span></div>
      </div>
      <div style={{marginTop:6}}><Bar pct={(f.spend/92000000)*100*5} c={C.am} d={i*30}/></div>
      {f.approvals.filter(a=>a.status==="Pending").map((a,j)=><div key={j} style={{marginTop:6,padding:"5px 8px",background:C.amG,borderRadius:3,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:10,color:C.am}}>⏳ {a.action}</span>
        <div style={{display:"flex",gap:3}}><button style={{padding:"2px 8px",borderRadius:3,border:"none",background:C.gn,color:"#000",fontSize:9,fontWeight:600,cursor:"pointer"}}>Approve</button><button style={{padding:"2px 8px",borderRadius:3,border:`1px solid ${C.rd}`,background:"transparent",color:C.rd,fontSize:9,fontWeight:600,cursor:"pointer"}}>Reject</button></div>
      </div>)}
    </div>)}</Card>}

    {tab==="invoices"&&<Card>
      <div style={{fontSize:11,fontWeight:600,color:C.pp,marginBottom:10,letterSpacing:1}}>🤖 AI-POWERED INVOICE REVIEW — LEDES ANALYSIS</div>
      {[{id:"INV-KE-2026-03",firm:"Kirkland & Ellis",amount:420000,submitted:"2026-03-10",status:"Under Review",flags:2,details:"2 entries with vague task descriptions (block-billed)",ledesComp:true,aiAction:"Auto-flagged vague entries. Recommended: request time breakdown."},
        {id:"INV-CG-2026-03",firm:"Cleary Gottlieb",amount:890000,submitted:"2026-03-08",status:"Flagged",flags:5,details:"3 partner entries at $2,100/hr (above approved $1,680), 2 admin tasks billed at associate rate",ledesComp:true,aiAction:"Rate violation detected. $42K overcharge. Auto-generated rejection memo."},
        {id:"INV-CG-2026-02",firm:"Cleary Gottlieb",amount:720000,submitted:"2026-02-25",status:"Rejected",flags:8,details:"Non-LEDES format. 8 block-billed entries. No task codes.",ledesComp:false,aiAction:"Auto-rejected. LEDES compliance required per engagement letter. Rejection sent to firm."},
        {id:"INV-SC-2026-03",firm:"Sullivan & Cromwell",amount:1200000,submitted:"2026-03-05",status:"Approved",flags:1,details:"1 minor: associate travel time billed at full rate",ledesComp:true,aiAction:"Minor flag noted. Approved with comment — travel should be at 50% rate per policy."},
        {id:"INV-LM-2026-03",firm:"Littler Mendelson",amount:180000,submitted:"2026-03-12",status:"Under Review",flags:3,details:"3 entries for 'legal research' without specificity",ledesComp:true,aiAction:"Flagged generic descriptions. AI compared against matter scope — 2 entries may be out-of-scope."},
      ].map((inv,i)=><div key={inv.id} style={{padding:"10px 12px",borderBottom:`1px solid ${C.br}22`,animation:`fu .2s ease ${i*30}ms both`,background:inv.status==="Rejected"?C.rdG:inv.status==="Flagged"?C.amG:"transparent"}}>
        <div style={{display:"grid",gridTemplateColumns:"110px 130px 80px 80px 70px 55px 1fr",alignItems:"center",marginBottom:4,fontSize:11}}>
          <span style={{fontFamily:M,color:C.bl,fontSize:10}}>{inv.id}</span>
          <span style={{color:C.t1,fontWeight:500}}>{inv.firm}</span>
          <span style={{fontFamily:M,color:C.am,fontWeight:600}}>${(inv.amount/1000).toFixed(0)}K</span>
          <span style={{fontSize:10,color:C.t3}}>{inv.submitted}</span>
          <Pill t={inv.status} c={inv.status==="Approved"?C.gn:inv.status==="Rejected"?C.rd:inv.status==="Flagged"?C.rd:C.am}/>
          <span style={{fontSize:10,color:inv.flags>2?C.rd:inv.flags>0?C.am:C.gn,fontWeight:600}}>{inv.flags} flags</span>
          <span style={{fontSize:9,color:inv.ledesComp?C.gn:C.rd}}>{inv.ledesComp?"✓ LEDES":"✗ Non-LEDES"}</span>
        </div>
        <div style={{fontSize:10,color:C.t3,marginBottom:3}}>Details: {inv.details}</div>
        <div style={{fontSize:10,color:C.tl,borderLeft:`2px solid ${C.tl}33`,paddingLeft:8}}>🤖 AI: {inv.aiAction}</div>
      </div>)}
    </Card>}

    {tab==="forecast"&&<Card>
      <div style={{fontSize:11,fontWeight:600,color:C.bl,marginBottom:10,letterSpacing:1}}>📈 SPEND FORECAST — Q2-Q4 2026</div>
      {[{quarter:"Q2 2026",projected:26800000,budget:22000000,drivers:"EU Antitrust oral hearing prep (+$2.4M), FCPA investigation ramp (+$1.8M)",risk:"High"},
        {quarter:"Q3 2026",projected:24200000,budget:20000000,drivers:"Patent trial prep (+$1.5M), potential LATAM DOJ engagement (+$2M)",risk:"High"},
        {quarter:"Q4 2026",projected:19800000,budget:20000000,drivers:"Projected normalisation if EU Antitrust settles. Employment matters seasonal decline.",risk:"Medium"},
      ].map((q,i)=><div key={q.quarter} style={{padding:"12px",borderBottom:`1px solid ${C.br}22`,animation:`fu .2s ease ${i*30}ms both`}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
          <span style={{fontSize:13,fontWeight:700,color:C.t1}}>{q.quarter}</span>
          <div style={{display:"flex",gap:12}}><span style={{fontFamily:M,fontSize:14,color:q.projected>q.budget?C.rd:C.gn,fontWeight:700}}>${(q.projected/1e6).toFixed(1)}M</span><span style={{fontSize:11,color:C.t3}}>budget: ${(q.budget/1e6).toFixed(0)}M</span><Pill t={q.risk+" Risk"} c={rc(q.risk)}/></div>
        </div>
        <div style={{marginBottom:4}}><Bar pct={(q.projected/q.budget)*100/1.3} c={q.projected>q.budget?C.rd:C.gn} d={i*40}/></div>
        <div style={{fontSize:10,color:C.t2}}>Drivers: {q.drivers}</div>
      </div>)}
      <div style={{padding:10,background:C.s1,borderRadius:4,marginTop:8}}>
        <div style={{fontSize:10,color:C.t3}}>Full Year Forecast: <span style={{fontFamily:M,fontWeight:700,color:C.rd}}>$112.8M</span> vs $82M budget (+37%). Primary drivers: EU Antitrust (+$14.8M), FCPA Investigation (+$8M). <span style={{color:C.am}}>Board reporting flag: material budget overrun requires Audit Committee notification.</span></div>
      </div>
    </Card>}

    {tab==="savings"&&<Card>
      <div style={{fontSize:11,fontWeight:600,color:C.gn,marginBottom:10,letterSpacing:1}}>💚 AI-DRIVEN SAVINGS ANALYTICS — YTD $4.2M</div>
      {[{source:"AI Invoice Review — Rate Violations Caught",amount:1420000,invoices:42,desc:"Overcharges identified and recovered through AI rate compliance checking"},
        {source:"AI Invoice Review — Block Billing Rejections",amount:680000,invoices:28,desc:"Block-billed entries rejected, requiring firms to rebill with proper time entries"},
        {source:"Matter Staffing Optimization",amount:890000,matters:8,desc:"AI identified over-staffing on routine matters. Shifted from partner to senior associate."},
        {source:"Alternative Fee Arrangements",amount:620000,matters:4,desc:"AI recommended fixed-fee structures based on historical matter data for predictable work."},
        {source:"In-House Work Capture",amount:590000,matters:12,desc:"AI identified matters currently outsourced that in-house team can handle — NDA, standard reviews."},
      ].map((sv,i)=><div key={sv.source} style={{padding:"10px 12px",borderBottom:`1px solid ${C.br}22`,animation:`fu .2s ease ${i*30}ms both`}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
          <span style={{fontSize:11.5,fontWeight:600,color:C.t1}}>{sv.source}</span>
          <span style={{fontFamily:M,fontSize:14,fontWeight:700,color:C.gn}}>${(sv.amount/1000).toFixed(0)}K</span>
        </div>
        <div style={{fontSize:10,color:C.t2}}>{sv.desc}</div>
        <div style={{fontSize:9,color:C.t3,marginTop:2}}>{sv.invoices?`${sv.invoices} invoices affected`:`${sv.matters} matters affected`}</div>
      </div>)}
      <div style={{padding:10,background:C.gnG,borderRadius:4,marginTop:8,borderLeft:`3px solid ${C.gn}`}}>
        <div style={{fontSize:11,color:C.gn,fontWeight:600}}>Total AI-Driven Savings YTD: $4.2M</div>
        <div style={{fontSize:10,color:C.t2,marginTop:2}}>Annualised projection: $6.8M. ROI on Aegis platform: 340% in first year.</div>
      </div>
    </Card>}
  </div>;
}

export function GovernanceView(){
  return <div>
    <SH icon="🏛️" title="Corporate Governance Agent" sub="5 entities • Board compliance • Filing status" c={C.cy}/>
    <Card>{GOVERNANCE.map((g,i)=><div key={g.entity} style={{padding:"14px",borderBottom:`1px solid ${C.br}22`,animation:`fu .25s ease ${i*30}ms both`}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <div style={{fontSize:13,fontWeight:600,color:C.t1}}>{g.entity}</div>
        <div style={{display:"flex",gap:4}}><Pill t={g.comp} c={g.comp==="Compliant"?C.gn:g.comp==="Non-compliant"?C.rd:C.am}/><Pill t={g.filings} c={g.filings==="Overdue"?C.rd:C.gn}/></div>
      </div>
      <div style={{display:"flex",gap:14,fontSize:10.5,color:C.t3,marginBottom:8}}><span>📍 {g.jur}</span><span>Board: {g.board} ({g.indep} independent)</span><span>Next: {g.next}</span></div>
      {g.actions.map((a,j)=><div key={j} style={{padding:"6px 10px",borderBottom:`1px solid ${C.br}11`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:10.5,color:C.t2}}>{a.task}</span><div style={{display:"flex",gap:8}}><span style={{fontFamily:M,fontSize:10,color:C.t3}}>{a.due}</span><Pill t={a.status} c={a.status==="Overdue"?C.rd:a.status==="In Progress"?C.tl:a.status==="Not Started"?C.t4:C.gn}/></div>
      </div>)}
      {g.approvals.filter(a=>a.status==="Pending").map((a,j)=><div key={j} style={{marginTop:6,padding:"6px 10px",background:C.amG,borderRadius:4,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:10,color:C.am}}>⏳ {a.action} → {a.approver}</span>
        <div style={{display:"flex",gap:4}}><button style={{padding:"2px 8px",borderRadius:3,border:"none",background:C.gn,color:"#000",fontSize:9,fontWeight:600,cursor:"pointer"}}>Approve</button><button style={{padding:"2px 8px",borderRadius:3,border:`1px solid ${C.rd}`,background:"transparent",color:C.rd,fontSize:9,fontWeight:600,cursor:"pointer"}}>Reject</button></div>
      </div>)}
    </div>)}</Card>
  </div>;
}

export function CaseListView(){
  const[sel,setSel]=useState(null);
  if(sel){const c=sel;const allAck=c.hold.custodians.every(x=>x.ack);const allPres=c.hold.itSystems.every(x=>x.status==="Preserved");
  const totalVol=c.hold.itSystems.reduce((a,s)=>{const m=s.vol.match(/([\d.]+)\s*(GB|MB)/);if(!m)return a;return a+(m[2]==="GB"?parseFloat(m[1]):parseFloat(m[1])/1024)},0);
  return <div>
    <div onClick={()=>setSel(null)} style={{display:"inline-flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:11,color:C.bl,marginBottom:12,padding:"3px 6px",borderRadius:3}} onMouseEnter={e=>e.currentTarget.style.background=C.blG} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>← Back to Cases</div>
    <Card style={{borderLeft:`3px solid ${pc(c.priority)}`,marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between"}}><div><div style={{display:"flex",gap:5,marginBottom:4}}><span style={{fontFamily:M,fontSize:11,color:C.bl,fontWeight:600}}>{c.id}</span><Pill t={c.priority} c={pc(c.priority)}/><Pill t={c.type} c={C.pp}/><Pill t={c.status} c={C.tl}/></div>
        <div style={{fontSize:16,fontWeight:700,color:C.t1,fontFamily:`'Fraunces',Georgia,serif`}}>{c.title}</div>
        <div style={{fontSize:11,color:C.t2,marginTop:2}}>{c.counsel} — {c.partner} | {c.court}</div></div>
      <div style={{textAlign:"right"}}><div style={{fontSize:24,fontWeight:800,color:C.rd,fontFamily:M}}>{c.exposure}</div><div style={{fontSize:9,color:C.t3}}>exposure</div></div></div>
    </Card>
    {/* Legal Hold Header */}
    <div style={{fontSize:12,fontWeight:700,color:C.am,marginBottom:10,letterSpacing:1,textTransform:"uppercase",borderBottom:`1px solid ${C.am}33`,paddingBottom:4}}>⚠️ Legal Hold & Preservation Management</div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:14}}>
      <Card d={50}><div style={{textAlign:"center"}}><Dot c={C.gn} p/><div style={{fontSize:18,fontWeight:700,color:C.gn,marginTop:5}}>{c.hold.status}</div><div style={{fontSize:9,color:C.t3}}>Hold Status</div><div style={{fontFamily:M,fontSize:10,color:C.t2,marginTop:4}}>{c.hold.notice}</div></div></Card>
      <Card d={80}><div style={{fontSize:10,fontWeight:600,color:C.t3,marginBottom:6,letterSpacing:1,textTransform:"uppercase"}}>Preservation Dates</div>
        {Object.entries(c.hold.dates).map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:`1px solid ${C.br}22`}}>
          <span style={{fontSize:9.5,color:C.t3,textTransform:"capitalize"}}>{k.replace(/([A-Z])/g,' $1')}</span>
          <span style={{fontFamily:M,fontSize:9.5,color:C.t1,fontWeight:600}}>{v}</span></div>)}</Card>
      <Card d={110}><div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:700,color:C.tl,fontFamily:M}}>{totalVol.toFixed(1)} GB</div><div style={{fontSize:9,color:C.t3}}>Data Preserved</div>
        <div style={{fontSize:16,fontWeight:700,color:C.pp,fontFamily:M,marginTop:6}}>{c.hold.itSystems.length}</div><div style={{fontSize:9,color:C.t3}}>IT Systems</div></div></Card>
    </div>
    {/* Custodians */}
    <Card d={140} style={{marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:700,color:C.pp,letterSpacing:1,textTransform:"uppercase"}}>👥 Custodian Acknowledgment</div>
        <Pill t={allAck?"All Confirmed":"⚠ Pending"} c={allAck?C.gn:C.rd}/>
      </div>
      <Bar pct={(c.hold.custodians.filter(x=>x.ack).length/c.hold.custodians.length)*100} c={allAck?C.gn:C.am}/>
      <div style={{marginTop:8}}>
        <div style={{display:"grid",gridTemplateColumns:"130px 100px 65px 80px 1fr",padding:"4px 8px",background:C.s1,borderRadius:"4px 4px 0 0",fontSize:9,fontWeight:600,color:C.t3,letterSpacing:.8,textTransform:"uppercase"}}>
          <span>Name</span><span>Dept / Role</span><span>Status</span><span>Date</span><span>Systems</span></div>
        {c.hold.custodians.map((cu,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"130px 100px 65px 80px 1fr",padding:"6px 8px",borderBottom:`1px solid ${C.br}22`,animation:`sl .2s ease ${i*25}ms both`,background:!cu.ack?C.rdG:"transparent"}}>
          <span style={{fontSize:11,color:C.t1,fontWeight:500}}>{cu.name}</span>
          <div><div style={{fontSize:10,color:C.t2}}>{cu.dept}</div><div style={{fontSize:8,color:C.t4}}>{cu.role}</div></div>
          <span>{cu.ack?<span style={{color:C.gn,fontWeight:700,fontSize:11}}>✓</span>:<span style={{color:C.rd,fontWeight:700,fontSize:11,animation:"p 1.5s infinite"}}>✗</span>}</span>
          <span style={{fontFamily:M,fontSize:9.5,color:cu.date?C.t1:C.rd}}>{cu.date||"—"}</span>
          <div style={{display:"flex",flexWrap:"wrap",gap:2}}>{cu.systems.split(", ").map((s,j)=><span key={j} style={{padding:"1px 4px",borderRadius:3,background:C.s1,border:`1px solid ${C.br}`,fontSize:8,color:C.t2}}>{s}</span>)}</div>
        </div>)}
      </div>
    </Card>
    {/* IT Systems */}
    <Card d={180} style={{marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:700,color:C.tl,letterSpacing:1,textTransform:"uppercase"}}>🖥️ IT System Preservation — Live Sync</div>
        <Pill t={allPres?"All Preserved":"⚠ Pending"} c={allPres?C.gn:C.am}/>
      </div>
      <div style={{overflowX:"auto"}}><div style={{minWidth:750}}>
        <div style={{display:"grid",gridTemplateColumns:"140px 85px 120px 75px 120px 45px 1fr",padding:"4px 8px",background:C.s1,borderRadius:"4px 4px 0 0",fontSize:9,fontWeight:600,color:C.t3,letterSpacing:.8,textTransform:"uppercase"}}>
          <span>System</span><span>Status</span><span>Last Sync</span><span>Volume</span><span>Retention</span><span>Cust</span><span>Health</span></div>
        {c.hold.itSystems.map((s,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"140px 85px 120px 75px 120px 45px 1fr",padding:"7px 8px",borderBottom:`1px solid ${C.br}22`,animation:`fu .2s ease ${i*25}ms both`,background:s.status!=="Preserved"?`${C.am}08`:"transparent"}}>
          <span style={{fontSize:11,fontWeight:600,color:C.t1}}>{s.sys}</span>
          <Pill t={s.status} c={s.status==="Preserved"?C.gn:C.am}/>
          <span style={{fontFamily:M,fontSize:10,color:s.sync?C.t1:C.am}}>{s.sync?new Date(s.sync).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"⚠ Awaiting"}</span>
          <span style={{fontFamily:M,fontSize:10,color:C.t2}}>{s.vol}</span>
          <span style={{fontSize:9,color:s.ret.includes("Indefinite")?C.gn:C.am}}>{s.ret}</span>
          <span style={{fontFamily:M,fontSize:10,color:C.t2,textAlign:"center"}}>{s.cnt}</span>
          <div>{s.health>0?<div style={{display:"flex",alignItems:"center",gap:4}}><Dot c={s.health>99?C.gn:C.am}/><span style={{fontFamily:M,fontSize:10,color:s.health>99?C.gn:C.am}}>{s.health}%</span></div>:
            <div style={{display:"flex",alignItems:"center",gap:3}}><Dot c={C.am} p/><span style={{fontSize:9,color:C.am}}>Pending</span></div>}</div>
        </div>)}
      </div></div>
    </Card>
    {/* Timeline */}
    <Card d={220} style={{marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:700,color:C.bl,marginBottom:10,letterSpacing:1,textTransform:"uppercase"}}>📅 Case Timeline</div>
      <div style={{position:"relative",paddingLeft:20}}>
        <div style={{position:"absolute",left:5,top:0,bottom:0,width:2,background:`linear-gradient(to bottom,${C.gn},${C.bl}80,${C.br})`}}/>
        {c.milestones.map((m,i)=>{const dc=m.s==="done"?C.gn:m.s==="upcoming"?C.am:C.br;
          return <div key={i} style={{position:"relative",paddingBottom:11,animation:`fu .2s ease ${i*20}ms both`}}>
            <div style={{position:"absolute",left:-17,top:2,width:10,height:10,borderRadius:"50%",background:dc,border:`2px solid ${C.cd}`,boxShadow:m.s==="upcoming"?`0 0 6px ${C.am}50`:"none",animation:m.s==="upcoming"?"p 2s infinite":"none"}}/>
            <div style={{display:"flex",alignItems:"baseline",gap:8}}>
              <span style={{fontFamily:M,fontSize:9.5,color:C.t3,minWidth:72}}>{m.date}</span>
              <span style={{fontSize:11,color:m.s==="done"?C.t2:m.s==="upcoming"?C.t1:C.t3,fontWeight:m.s==="upcoming"?600:400}}>{m.ev}</span>
              <Pill t={m.s==="done"?"Done":m.s==="upcoming"?"Upcoming":"Pending"} c={dc}/>
            </div></div>;})}
      </div>
    </Card>
    {/* Alerts & Approvals */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
      <Card d={260}><div style={{fontSize:11,fontWeight:600,color:C.rd,marginBottom:8,letterSpacing:1}}>🚨 ALERTS</div>
        {c.alerts.map((a,i)=><div key={i} style={{display:"flex",gap:6,padding:"6px 8px",borderLeft:`2px solid ${a.sev==="critical"?C.rd:C.am}`,marginBottom:3,background:a.sev==="critical"?C.rdG:"transparent",borderRadius:2,animation:`sl .2s ease ${i*25}ms both`}}>
          <Dot c={a.sev==="critical"?C.rd:C.am} p={a.sev==="critical"}/><div><div style={{fontSize:10.5,color:C.t1,lineHeight:1.3}}>{a.text}</div><div style={{fontSize:8.5,color:C.t4,marginTop:1}}>{a.time}</div></div></div>)}</Card>
      <Card d={300}><div style={{fontSize:11,fontWeight:600,color:C.am,marginBottom:8,letterSpacing:1}}>✅ APPROVALS</div>
        {c.approvals.map((a,i)=><div key={i} style={{padding:"6px 8px",borderBottom:`1px solid ${C.br}22`,animation:`sl .2s ease ${i*25}ms both`}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><span style={{fontSize:10.5,color:C.t1,fontWeight:500}}>{a.action}</span><ApprovalBadge status={a.status}/></div>
          <div style={{fontSize:9.5,color:C.t3}}>Approver: <span style={{color:C.am}}>{a.approver}</span></div>
          {a.status==="Pending"&&<div style={{display:"flex",gap:4,marginTop:4}}><button style={{padding:"3px 10px",borderRadius:3,border:"none",background:C.gn,color:"#000",fontSize:9,fontWeight:600,cursor:"pointer"}}>Approve</button><button style={{padding:"3px 10px",borderRadius:3,border:`1px solid ${C.rd}`,background:"transparent",color:C.rd,fontSize:9,fontWeight:600,cursor:"pointer"}}>Reject</button></div>}
        </div>)}</Card>
    </div>
  </div>;}
  // Case List
  return <div>
    <SH icon="📁" title="Case Management & Legal Hold" sub={`${CASES.length} active matters • Full legal hold, custodian tracking, IT preservation & timeline`}/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:14}}>
      {[{l:"Active Matters",v:CASES.length,c:C.bl},{l:"Legal Holds",v:CASES.length,c:C.am},{l:"Custodians",v:CASES.reduce((a,c)=>a+c.hold.custodians.length,0),c:C.pp},{l:"IT Systems",v:CASES.reduce((a,c)=>a+c.hold.itSystems.length,0),c:C.tl},{l:"Pending Ack",v:CASES.reduce((a,c)=>a+c.hold.custodians.filter(x=>!x.ack).length,0),c:C.rd}].map((s,i)=>
        <Card key={i} d={i*40}><Stat l={s.l} v={s.v} c={s.c} s/></Card>)}
    </div>
    {CASES.map((c,idx)=><Card key={c.id} style={{marginBottom:10}} d={idx*60} onClick={()=>setSel(c)}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
        <div><div style={{display:"flex",gap:5,marginBottom:4}}><span style={{fontFamily:M,fontSize:10,color:C.bl,fontWeight:600}}>{c.id}</span><Pill t={c.priority} c={pc(c.priority)}/><Pill t={c.type} c={C.pp}/><Pill t={c.status} c={C.tl}/></div>
          <div style={{fontSize:14,fontWeight:700,color:C.t1,fontFamily:`'Fraunces',Georgia,serif`}}>{c.title}</div>
          <div style={{fontSize:10.5,color:C.t2,marginTop:2}}>{c.counsel} — {c.partner} | {c.court}</div></div>
        <div style={{textAlign:"right"}}><div style={{fontSize:20,fontWeight:700,color:C.rd,fontFamily:M}}>{c.exposure}</div><div style={{fontSize:9,color:C.t3}}>exposure</div></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
        <div style={{padding:8,background:C.s1,borderRadius:5}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:.8,fontWeight:600,marginBottom:3}}>Legal Hold</div>
          <div style={{display:"flex",alignItems:"center",gap:4}}><Dot c={C.gn} p/><span style={{fontSize:12,fontWeight:700,color:C.gn}}>{c.hold.status}</span></div>
          <div style={{fontSize:9,color:C.t3,marginTop:2}}>{c.hold.notice}</div></div>
        <div style={{padding:8,background:C.s1,borderRadius:5}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:.8,fontWeight:600,marginBottom:3}}>Custodians</div>
          <div style={{fontSize:16,fontWeight:700,color:C.pp,fontFamily:M}}>{c.hold.custodians.length}</div>
          <div style={{fontSize:9,color:c.hold.custodians.every(x=>x.ack)?C.gn:C.rd}}>{c.hold.custodians.filter(x=>x.ack).length}/{c.hold.custodians.length} ack</div></div>
        <div style={{padding:8,background:C.s1,borderRadius:5}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:.8,fontWeight:600,marginBottom:3}}>IT Preserved</div>
          <div style={{fontSize:16,fontWeight:700,color:C.tl,fontFamily:M}}>{c.hold.itSystems.filter(s=>s.status==="Preserved").length}/{c.hold.itSystems.length}</div></div>
        <div style={{padding:8,background:C.s1,borderRadius:5}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:.8,fontWeight:600,marginBottom:3}}>Next Deadline</div>
          <div style={{fontSize:11,fontWeight:600,color:C.am,fontFamily:M}}>{c.nextDl}</div>
          <div style={{fontSize:9,color:C.t2}}>{c.nextAct}</div></div>
      </div>
      {c.alerts.filter(a=>a.sev==="critical").length>0&&<div style={{marginTop:8,padding:"4px 8px",background:C.rdG,borderRadius:4,borderLeft:`2px solid ${C.rd}`}}>
        <span style={{fontSize:9,color:C.rd}}>🚨 {c.alerts.filter(a=>a.sev==="critical").length} critical alerts • {c.approvals.filter(a=>a.status==="Pending").length} pending approvals</span></div>}
    </Card>)}
  </div>;
}

