import { useState, useEffect } from "react";
import { C, F, M, SR, Pill, Dot, Stat, Bar, Card, SH, WorkflowSteps, ApprovalBadge, pc } from "@aegis/ui";
import { MissionControlBriefing, MatterRiskBadge, buildBriefingContext } from "@aegis/intake";
import { INTEGRATIONS, ARCH_LAYERS } from "../data/integrations";
import { CASES } from "../data/cases";
import { GOVERNANCE as _GOVERNANCE } from "../data/governance";
import { ALL_ALERTS, ALL_APPROVALS } from "../data/aggregate";
import { BRAIN_QUERIES } from "../data/brain";
import { OCM_FIRMS } from "../data/ocm";
import { CYBER_INCIDENTS } from "../data/cyber";
import { TICKERS } from "../data/tickers";
import { AIOperationsSection } from "./ai-ops/ai-operations-section.jsx";

export function BoardReportView(){
  const[activeSec,setActiveSec]=useState(1);
  const sections=[
    {n:1,title:"Cover & Front Matter",pages:1},
    {n:2,title:"Executive Summary",pages:2},
    {n:3,title:"Enterprise Legal Posture",pages:3},
    {n:4,title:"Top Critical Matters & Movement",pages:4},
    {n:5,title:"Litigation Portfolio",pages:3},
    {n:6,title:"Regulatory Horizon",pages:2},
    {n:7,title:"Contract Risk Report",pages:2},
    {n:8,title:"Legal Spend Analysis",pages:3},
    {n:9,title:"Governance & Entity Status",pages:2},
    {n:10,title:"Recommendations & Asks",pages:1},
    {n:11,title:"Appendix — Heatmap, Register",pages:6},
  ];
  const totalPages=sections.reduce((a,s)=>a+s.pages,0);

  // Document preview content per section (bone-background rendered)
  const previews={
    1:<div style={{textAlign:"center",paddingTop:80}}>
      <div style={{fontSize:10,fontFamily:M,color:C.t3,letterSpacing:3,textTransform:"uppercase"}}>AURORA · CONFIDENTIAL</div>
      <div style={{fontSize:42,fontFamily:SR,fontWeight:400,color:C.bg,lineHeight:1.15,margin:"40px 0 20px"}}>Q1 2026<br/>Legal Risk<br/>Committee Pack</div>
      <div style={{fontSize:13,color:"#666",fontFamily:M,letterSpacing:1}}>AEGIS Legal Mission Control</div>
      <div style={{fontSize:11,color:"#999",fontFamily:M,marginTop:20}}>Prepared for: Board Audit Committee · {new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>
      <div style={{fontSize:10,color:"#999",fontFamily:M,marginTop:40}}>Auto-drafted by Aurora from live platform data</div>
    </div>,
    2:<div>
      <div style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>SECTION 02 · EXECUTIVE SUMMARY</div>
      <div style={{fontSize:32,fontFamily:SR,fontWeight:400,color:C.bg,lineHeight:1.2,marginBottom:20}}>A <em style={{color:C.em,fontStyle:"italic"}}>materially exposed</em> quarter, with LATAM FCPA as the critical exception.</div>
      <div style={{fontSize:13,color:"#333",lineHeight:1.7,fontFamily:F,marginBottom:24}}>
        The enterprise legal posture closes Q1 at 72/100, a three-point decline over Q4 2025. Regulatory (+4) and Contracts (+2) domains drove gains. Litigation declined twelve points to 58, the lowest score across all seven domains and the primary subject of this report. Total exposure across active matters stands at $473M.
      </div>
      {/* Strengths / Exposures boxes */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
        <div style={{border:`1px solid ${C.tl}44`,padding:14}}>
          <div style={{fontSize:9,fontFamily:M,color:C.tl,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>STRENGTHS</div>
          <div style={{fontSize:11,color:"#444",lineHeight:1.6,fontFamily:F}}>CLM auto-classification at 89% · AI invoice review saved $4.2M · Regulatory monitoring covering 38 jurisdictions · Company Brain indexed 24K data points · Zero data breach incidents.</div>
        </div>
        <div style={{border:`1px solid ${C.em}44`,padding:14}}>
          <div style={{fontSize:9,fontFamily:M,color:C.em,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>EXPOSURES</div>
          <div style={{fontSize:11,color:"#444",lineHeight:1.6,fontFamily:F}}>EU Antitrust fine range €80M-€160M · LATAM FCPA investigation active ($120M) · Huawei sanctions — exit strategy pending · OC spend 12% over budget · 1 departed custodian non-compliant with legal hold.</div>
        </div>
      </div>
      {/* Board decisions box */}
      <div style={{background:`${C.em}11`,border:`1px solid ${C.em}33`,padding:14,marginBottom:20}}>
        <div style={{fontSize:9,fontFamily:M,color:C.em,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>THREE BOARD-LEVEL DECISIONS REQUESTED</div>
        <div style={{fontSize:12,color:"#333",lineHeight:1.7,fontFamily:F}}>
          <div style={{marginBottom:6}}>① Settlement exploration authority for <span style={{color:C.em,fontWeight:600}}>EU Antitrust</span> — DG COMP oral hearing Q2.</div>
          <div style={{marginBottom:6}}>② Voluntary self-disclosure decision for <span style={{color:C.em,fontWeight:600}}>LATAM FCPA</span> — DOJ window closes June.</div>
          <div>③ Approval of <span style={{color:C.em,fontWeight:600}}>$420K rush review contract</span> for 12K document production due March 25.</div>
        </div>
      </div>
      {/* Big stats row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14}}>
        {[{v:"72",l:"ENTERPRISE SCORE"},{v:"-3",l:"QOQ MOVEMENT"},{v:"2 / 7",l:"DOMAINS BELOW APPETITE"},{v:"$473M",l:"TOTAL EXPOSURE"}].map((s,i)=>
          <div key={i} style={{textAlign:"left"}}>
            <div style={{fontSize:36,fontFamily:SR,fontWeight:400,color:C.bg,lineHeight:1}}>{s.v}</div>
            <div style={{fontSize:8,fontFamily:M,color:"#999",letterSpacing:2,textTransform:"uppercase",marginTop:4}}>{s.l}</div>
          </div>)}
      </div>
    </div>,
    3:<div>
      <div style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>SECTION 03 · ENTERPRISE LEGAL POSTURE</div>
      <div style={{fontSize:28,fontFamily:SR,fontWeight:400,color:C.bg,lineHeight:1.2,marginBottom:16}}>Seven-domain posture assessment</div>
      <div style={{fontSize:12,color:"#333",lineHeight:1.6,fontFamily:F,marginBottom:20}}>Each domain is scored 0-100 based on weighted combination of risk register severity, control effectiveness, incident frequency, and forward-looking exposure. The composite score of 72 places the enterprise in the "Moderate" band (60-80).</div>
      {[{d:"Contracts",score:78,trend:"+2",status:"Healthy"},{d:"Regulatory",score:74,trend:"+4",status:"Healthy"},{d:"Governance",score:88,trend:"+1",status:"Strong"},{d:"Compliance",score:81,trend:"0",status:"Healthy"},{d:"Cyber",score:74,trend:"-1",status:"Adequate"},{d:"Litigation",score:58,trend:"-12",status:"Below Appetite"},{d:"Spend",score:70,trend:"-3",status:"Adequate"}].map((d,i)=>
        <div key={i} style={{display:"grid",gridTemplateColumns:"120px 50px 50px 100px 1fr",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #ddd",fontSize:12,fontFamily:F}}>
          <span style={{color:"#333",fontWeight:500}}>{d.d}</span>
          <span style={{fontFamily:SR,fontSize:20,color:d.score>=75?C.gn:d.score>=60?C.am:C.rd}}>{d.score}</span>
          <span style={{fontFamily:M,fontSize:10,color:d.trend.startsWith("-")?C.rd:d.trend==="0"?C.t3:C.gn}}>{d.trend}</span>
          <span style={{fontFamily:M,fontSize:9,letterSpacing:1,color:d.status==="Below Appetite"?C.rd:d.status==="Strong"?C.gn:"#666",textTransform:"uppercase"}}>{d.status}</span>
          <div style={{height:4,background:"#eee"}}><div style={{height:"100%",width:`${d.score}%`,background:d.score>=75?C.gn:d.score>=60?C.am:C.rd,transition:"width .5s"}}/></div>
        </div>)}
    </div>,
    4:<div>
      <div style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>SECTION 04 · TOP CRITICAL MATTERS</div>
      <div style={{fontSize:28,fontFamily:SR,fontWeight:400,color:C.bg,lineHeight:1.2,marginBottom:16}}>Five matters require Board-level attention</div>
      {CASES.filter(c=>c.priority==="Critical").concat(CASES.filter(c=>c.priority==="High").slice(0,2)).map((c,i)=>
        <div key={i} style={{padding:"12px 0",borderBottom:"1px solid #ddd"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontFamily:M,fontSize:9,color:C.em,letterSpacing:1}}>{c.id}</span>
            <span style={{fontFamily:SR,fontSize:18,color:C.rd}}>{c.exposure}</span>
          </div>
          <div style={{fontSize:14,fontFamily:SR,color:C.bg,lineHeight:1.3,marginBottom:4}}>{c.title}</div>
          <div style={{fontSize:11,color:"#555",fontFamily:F,lineHeight:1.5}}>{c.counsel} · {c.court} · Next: {c.nextAct} ({c.nextDl})</div>
        </div>)}
    </div>,
    5:<div>
      <div style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>SECTION 05 · LITIGATION PORTFOLIO</div>
      <div style={{fontSize:28,fontFamily:SR,fontWeight:400,color:C.bg,lineHeight:1.2,marginBottom:16}}>87 active cases · $473M aggregate exposure</div>
      <div style={{fontSize:12,color:"#333",lineHeight:1.6,fontFamily:F,marginBottom:16}}>The litigation portfolio expanded by 4 matters in Q1, primarily driven by the LATAM FCPA investigation and a new employment claim in California. Win probability weighted average across the portfolio is 62%, stable from Q4.</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
        {[{l:"Active Cases",v:"87"},{l:"New in Q1",v:"+4"},{l:"Weighted Win Prob.",v:"62%"}].map((s,i)=>
          <div key={i}><div style={{fontSize:28,fontFamily:SR,color:C.bg}}>{s.v}</div><div style={{fontSize:8,fontFamily:M,color:"#999",letterSpacing:2,textTransform:"uppercase"}}>{s.l}</div></div>)}
      </div>
      <div style={{fontSize:11,color:"#555",fontFamily:F,lineHeight:1.5}}>By type: Patent (12 matters, $42M), Regulatory (8, $310M), Employment (24, $18M), Commercial (31, $62M), Environmental (6, $22M), IP/Trade Secret (6, $19M).</div>
    </div>,
    6:<div>
      <div style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>SECTION 06 · REGULATORY HORIZON</div>
      <div style={{fontSize:28,fontFamily:SR,fontWeight:400,color:C.bg,lineHeight:1.2,marginBottom:16}}>42 regulations tracked · 9 critical impact</div>
      <div style={{fontSize:12,color:"#333",lineHeight:1.6,fontFamily:F}}>Key regulatory events in next 90 days: EU AI Act high-risk obligations (Aug 2026 — preparatory work must begin now), China CAC data export review (deadline April 2026), India DPDP Board establishment (anticipated Q2 2026). Compliance posture: EU 62%, USA 88%, India 71%, China 45%, UK 78%, Brazil 82%.</div>
    </div>,
    7:<div>
      <div style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>SECTION 07 · CONTRACT RISK REPORT</div>
      <div style={{fontSize:28,fontFamily:SR,fontWeight:400,color:C.bg,lineHeight:1.2,marginBottom:16}}>124,380 contracts · 1,242 high-risk clauses</div>
      <div style={{fontSize:12,color:"#333",lineHeight:1.6,fontFamily:F}}>Auto-classification rate: 89%. Critical risk contracts: 12 (down from 15 in Q4). Revenue at risk from contract exposures: $210M. 3,211 contracts expiring within 90 days — renewal review programme in progress. Playbook compliance: 76% of new contracts aligned with company position on indemnity, IP, and data processing clauses.</div>
    </div>,
    8:<div>
      <div style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>SECTION 08 · LEGAL SPEND ANALYSIS</div>
      <div style={{fontSize:28,fontFamily:SR,fontWeight:400,color:C.bg,lineHeight:1.2,marginBottom:16}}>$92M YTD · 12% over budget</div>
      <div style={{fontSize:12,color:"#333",lineHeight:1.6,fontFamily:F,marginBottom:14}}>Primary driver: EU Antitrust ($14.8M, 185% of allocated budget) and FCPA investigation ramp ($3.2M of $10M budget in Q1 alone). AI-powered invoice review identified $4.2M in savings YTD across rate violations ($1.42M), block billing rejections ($680K), staffing optimisation ($890K), AFAs ($620K), and in-house capture ($590K). Full-year forecast: $112.8M vs $82M budget — Board reporting flag triggered.</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        {[{l:"AI Savings YTD",v:"$4.2M"},{l:"Full Year Forecast",v:"$112.8M"},{l:"Budget Variance",v:"+37%"}].map((s,i)=>
          <div key={i}><div style={{fontSize:28,fontFamily:SR,color:i===2?C.rd:C.bg}}>{s.v}</div><div style={{fontSize:8,fontFamily:M,color:"#999",letterSpacing:2,textTransform:"uppercase"}}>{s.l}</div></div>)}
      </div>
    </div>,
    9:<div>
      <div style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>SECTION 09 · GOVERNANCE & ENTITY STATUS</div>
      <div style={{fontSize:28,fontFamily:SR,fontWeight:400,color:C.bg,lineHeight:1.2,marginBottom:16}}>5 entities · 1 non-compliant</div>
      <div style={{fontSize:12,color:"#333",lineHeight:1.6,fontFamily:F}}>Brazil subsidiary non-compliant: missing 2 independent directors per local corporate law. Germany: annual filing overdue by 14 days (remediation in progress). All other entities (USA, UK, India) fully compliant. Board evaluation cycle: 3 of 5 completed.</div>
    </div>,
    10:<div>
      <div style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>SECTION 10 · RECOMMENDATIONS & ASKS</div>
      <div style={{fontSize:28,fontFamily:SR,fontWeight:400,color:C.bg,lineHeight:1.2,marginBottom:16}}>Three decisions, two investments</div>
      <div style={{background:`${C.em}11`,border:`1px solid ${C.em}33`,padding:16,marginBottom:16}}>
        <div style={{fontSize:9,fontFamily:M,color:C.em,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>BOARD DECISIONS REQUESTED</div>
        <div style={{fontSize:13,color:"#333",lineHeight:1.8,fontFamily:F}}>
          <div style={{marginBottom:6}}>① Authorise settlement exploration for <span style={{color:C.em,fontWeight:600}}>EU Antitrust</span> (est. range €80M-€120M).</div>
          <div style={{marginBottom:6}}>② Approve voluntary self-disclosure for <span style={{color:C.em,fontWeight:600}}>LATAM FCPA</span> (est. penalty reduction 25-40%).</div>
          <div>③ Approve <span style={{color:C.em,fontWeight:600}}>$420K rush review contract</span> for DG COMP production deadline March 25.</div>
        </div>
      </div>
      <div style={{fontSize:9,fontFamily:M,color:C.tl,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>INVESTMENT REQUESTS</div>
      <div style={{fontSize:13,color:"#333",lineHeight:1.8,fontFamily:F}}>
        <div style={{marginBottom:4}}>④ $2.1M for China data localization infrastructure (AWS Beijing migration).</div>
        <div>⑤ $800K for EU AI Act conformity programme (Aug 2026 deadline).</div>
      </div>
    </div>,
    11:<div>
      <div style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>APPENDIX · HEATMAP & REGISTER</div>
      <div style={{fontSize:28,fontFamily:SR,fontWeight:400,color:C.bg,lineHeight:1.2,marginBottom:16}}>Full risk register with heat mapping</div>
      <div style={{fontSize:12,color:"#555",fontFamily:F,lineHeight:1.6}}>The complete risk register, 5×5 heatmap, and detailed domain breakdowns are available in the appendix. This section is auto-generated from live platform data and updated in real time.</div>
    </div>
  };

  return <div>
    {/* Aurora eyebrow + title */}
    <div style={{marginBottom:20}}>
      <div style={{fontSize:10,fontFamily:M,letterSpacing:2,color:C.t3,textTransform:"uppercase"}}>{new Date().toLocaleDateString("en-US",{weekday:"long"}).toUpperCase()} · {new Date().toLocaleDateString("en-US",{day:"numeric",month:"short"}).toUpperCase()}</div>
      <div style={{fontSize:26,fontFamily:SR,fontWeight:400,color:C.t1,lineHeight:1.2}}>Board Reporting</div>
    </div>

    {/* Split layout: TOC left, Preview right */}
    <div style={{display:"grid",gridTemplateColumns:"340px 1fr",gap:16,alignItems:"start"}}>
      {/* LEFT: Section list */}
      <div>
        <div style={{background:C.cd,border:`1px solid ${C.br}`,padding:16,marginBottom:12}}>
          <div style={{fontSize:14,fontFamily:SR,fontWeight:400,color:C.t1,marginBottom:2}}>Q1 2026 Legal Risk Committee Pack</div>
          <div style={{fontSize:10,fontFamily:M,color:C.t3,letterSpacing:.5}}>Auto-drafted by Aurora · {totalPages} pages</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {sections.map(s=>{
            const active=activeSec===s.n;
            return <div key={s.n} onClick={()=>setActiveSec(s.n)} style={{
              display:"grid",gridTemplateColumns:"32px 1fr 40px",alignItems:"center",
              padding:"10px 12px",cursor:"pointer",transition:"all .15s",
              background:active?C.emG:C.cd,border:`1px solid ${active?C.em:C.br}`,
              borderLeft:`3px solid ${active?C.em:C.br}`
            }} onMouseEnter={e=>{if(!active)e.currentTarget.style.background=C.cdH}} onMouseLeave={e=>{if(!active)e.currentTarget.style.background=active?C.emG:C.cd}}>
              <span style={{fontFamily:SR,fontSize:16,fontWeight:400,color:active?C.em:C.t3}}>{String(s.n).padStart(2,"0")}</span>
              <span style={{fontSize:11.5,color:active?C.t1:C.t2,fontWeight:active?600:400,fontFamily:F}}>{s.title}</span>
              <span style={{fontSize:9,fontFamily:M,color:C.t4,textAlign:"right"}}>{s.pages} pp</span>
            </div>;
          })}
        </div>
        {/* Action buttons */}
        <div style={{marginTop:12,display:"flex",flexDirection:"column",gap:6}}>
          <button style={{width:"100%",padding:"12px 16px",background:C.em,border:"none",color:C.bg,fontSize:10,fontFamily:M,fontWeight:700,letterSpacing:2,cursor:"pointer",textTransform:"uppercase",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            ◇ GENERATE FULL PACK (PDF)
          </button>
          <button style={{width:"100%",padding:"10px 16px",background:"transparent",border:`1px solid ${C.br}`,color:C.t2,fontSize:10,fontFamily:M,letterSpacing:2,cursor:"pointer",textTransform:"uppercase",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            ▷ PUSH TO DILIGENT BOARDS
          </button>
        </div>
      </div>

      {/* RIGHT: Document preview (bone background) */}
      <div style={{background:C.bone,border:`1px solid ${C.br}`,padding:0,minHeight:600}}>
        {/* Document header bar */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 20px",borderBottom:`1px solid #D5CFC5`,background:"#EDE8DE"}}>
          <div style={{fontSize:9,fontFamily:M,color:"#999",letterSpacing:2,textTransform:"uppercase"}}>AURORA · CONFIDENTIAL · Q1 2026 LEGAL RISK COMMITTEE</div>
          <div style={{fontSize:10,fontFamily:M,color:"#999",letterSpacing:1}}>{String(activeSec).padStart(2,"0")} / {totalPages}</div>
        </div>
        {/* Document body */}
        <div style={{padding:"28px 36px"}} key={activeSec}>
          <div style={{animation:"fu .3s ease"}}>
            {previews[activeSec]||<div style={{fontSize:12,color:"#999",fontFamily:M,textAlign:"center",paddingTop:60}}>Section preview loading...</div>}
          </div>
        </div>
        {/* Document footer */}
        <div style={{padding:"8px 20px",borderTop:`1px solid #D5CFC5`,display:"flex",justifyContent:"space-between",fontSize:9,fontFamily:M,color:"#bbb",letterSpacing:1}}>
          <span>Document Preview — Section {String(activeSec).padStart(2,"0")} — {sections.find(s=>s.n===activeSec)?.title}</span>
          <span>Aegis Legal Mission Control · Aurora</span>
        </div>
      </div>
    </div>
  </div>;
}


export function BrainView(){
  const[activeQ,setActiveQ]=useState(null);
  return <div>
    <SH icon="🧠" title="Company Brain — Institutional Memory" sub="AI-powered organizational legal intelligence • 24,000+ data points indexed • Protocol memory active" c={C.tl}/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
      {[{l:"Data Points Indexed",v:"24,182",c:C.tl},{l:"Queries This Month",v:"1,842",c:C.bl},{l:"Avg Confidence",v:"95.6%",c:C.gn},{l:"Precedents Found",v:"312",c:C.pp}].map((s,i)=>
        <Card key={i} d={i*40}><Stat l={s.l} v={s.v} c={s.c} s/></Card>)}
    </div>
    <Card d={100} style={{marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:600,color:C.tl,marginBottom:10,letterSpacing:1}}>🔍 RECENT QUERIES & ANSWERS</div>
      {BRAIN_QUERIES.map((bq,i)=><div key={i} style={{marginBottom:12,animation:`fu .3s ease ${i*50}ms both`}}>
        <div onClick={()=>setActiveQ(activeQ===i?null:i)} style={{display:"flex",gap:8,cursor:"pointer",padding:"8px 10px",borderRadius:6,background:activeQ===i?C.blG:"transparent",border:`1px solid ${activeQ===i?C.bl:C.br}33`,transition:"all .15s"}}>
          <span style={{fontSize:10,background:C.bl,color:"#fff",padding:"2px 6px",borderRadius:4,fontWeight:600,flexShrink:0,height:16}}>Q</span>
          <span style={{fontSize:12,color:C.t1,fontWeight:500}}>{bq.q}</span>
          <Pill t={bq.category} c={C.pp}/>
        </div>
        {activeQ===i&&<div style={{marginLeft:28,marginTop:6,padding:"10px 12px",background:C.s1,borderRadius:6,borderLeft:`2px solid ${C.tl}`,animation:"fu .2s ease"}}>
          <div style={{fontSize:11,color:C.t1,lineHeight:1.6,marginBottom:8}}>{bq.answer}</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{bq.sources.map((s,j)=><span key={j} style={{padding:"2px 6px",borderRadius:3,background:`${C.tl}15`,border:`1px solid ${C.tl}33`,fontSize:9,color:C.tl}}>{s}</span>)}</div>
            <div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:9,color:C.t3}}>Confidence:</span><span style={{fontFamily:M,fontSize:11,fontWeight:700,color:bq.confidence>95?C.gn:C.am}}>{bq.confidence}%</span></div>
          </div>
        </div>}
      </div>)}
    </Card>
    <Card d={200}>
      <div style={{fontSize:11,fontWeight:600,color:C.pp,marginBottom:8,letterSpacing:1}}>📚 KNOWLEDGE BASE COVERAGE</div>
      {[{area:"Contract Precedents & Playbooks",docs:4280,coverage:94},{area:"Litigation History & Outcomes",docs:1840,coverage:91},{area:"Regulatory Interpretations",docs:2100,coverage:87},{area:"Board Resolutions & Policies",docs:680,coverage:99},{area:"Investigation Reports",docs:120,coverage:96},{area:"Outside Counsel Performance",docs:3200,coverage:93}].map((k,i)=><div key={i} style={{padding:"6px 10px",borderBottom:`1px solid ${C.br}22`,display:"flex",justifyContent:"space-between",alignItems:"center",animation:`sl .2s ease ${i*30}ms both`}}>
        <span style={{fontSize:11,color:C.t1}}>{k.area}</span>
        <div style={{display:"flex",gap:12,alignItems:"center"}}><span style={{fontFamily:M,fontSize:10,color:C.t3}}>{k.docs.toLocaleString()} docs</span><div style={{width:80}}><Bar pct={k.coverage} c={k.coverage>90?C.gn:C.am}/></div><span style={{fontFamily:M,fontSize:10,color:k.coverage>90?C.gn:C.am,fontWeight:600}}>{k.coverage}%</span></div>
      </div>)}
    </Card>
  </div>;
}


export function OCMView(){
  const[sel,setSel]=useState(null);
  const f=sel!==null?OCM_FIRMS[sel]:null;
  if(f) return <div>
    <div onClick={()=>setSel(null)} style={{display:"inline-flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:11,color:C.bl,marginBottom:12,padding:"3px 6px",borderRadius:3}} onMouseEnter={e=>e.currentTarget.style.background=C.blG} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>← Back</div>
    <Card style={{borderLeft:`3px solid ${C.am}`,marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between"}}><div>
        <div style={{display:"flex",gap:5,marginBottom:4}}><Pill t={f.panel} c={C.pp}/><Pill t={f.speciality} c={C.tl}/></div>
        <div style={{fontSize:16,fontWeight:700,color:C.t1,fontFamily:`'Fraunces',Georgia,serif`}}>{f.name}</div>
        <div style={{fontSize:11,color:C.t2,marginTop:2}}>{f.relationship} | {f.matters} active matters | Lead: {f.activeLead}</div></div>
        <div style={{textAlign:"right"}}><div style={{fontSize:22,fontWeight:800,color:C.am,fontFamily:M}}>${(f.spend.ytd/1e6).toFixed(1)}M</div><div style={{fontSize:9,color:C.t3}}>YTD of ${(f.spend.budget/1e6).toFixed(0)}M budget</div></div>
      </div>
    </Card>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:14}}>
      {/* Scorecard */}
      <Card d={50}><div style={{fontSize:11,fontWeight:600,color:C.pp,marginBottom:8,letterSpacing:1}}>PERFORMANCE SCORECARD</div>
        {Object.entries(f.scorecard).map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:`1px solid ${C.br}22`}}>
          <span style={{fontSize:10,color:C.t2,textTransform:"capitalize"}}>{k}</span>
          <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:50}}><Bar pct={v*20} c={v>=4.5?C.gn:v>=3.5?C.am:C.rd}/></div><span style={{fontFamily:M,fontSize:10,color:v>=4.5?C.gn:v>=3.5?C.am:C.rd,fontWeight:600}}>{v}</span></div>
        </div>)}</Card>
      {/* Rate Compliance */}
      <Card d={80}><div style={{fontSize:11,fontWeight:600,color:C.am,marginBottom:8,letterSpacing:1}}>RATE COMPLIANCE</div>
        <div style={{textAlign:"center",marginBottom:10}}><div style={{fontSize:28,fontWeight:700,color:f.rate.compliance>=90?C.gn:f.rate.compliance>=75?C.am:C.rd,fontFamily:M}}>{f.rate.compliance}%</div><div style={{fontSize:9,color:C.t3}}>Invoices within approved rates</div></div>
        <div style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${C.br}22`}}><span style={{fontSize:10,color:C.t3}}>Avg Billed Rate</span><span style={{fontFamily:M,fontSize:11,color:C.t1}}>${f.rate.avg}/hr</span></div>
        <div style={{display:"flex",justifyContent:"space-between",padding:"4px 0"}}><span style={{fontSize:10,color:C.t3}}>Approved Rate</span><span style={{fontFamily:M,fontSize:11,color:C.tl}}>${f.rate.approved}/hr</span></div></Card>
      {/* Diversity */}
      <Card d={110}><div style={{fontSize:11,fontWeight:600,color:C.cy,marginBottom:8,letterSpacing:1}}>DIVERSITY METRICS</div>
        <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.br}22`}}><span style={{fontSize:10,color:C.t3}}>Female Partners</span><span style={{fontFamily:M,fontSize:11,color:C.t1}}>{f.diversity.femalePartners}</span></div>
        <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.br}22`}}><span style={{fontSize:10,color:C.t3}}>Minority Partners</span><span style={{fontFamily:M,fontSize:11,color:C.t1}}>{f.diversity.minorityPartners}</span></div>
        <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.br}22`}}><span style={{fontSize:10,color:C.t3}}>Target</span><span style={{fontSize:10,color:C.am}}>{f.diversity.target}</span></div>
        <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0"}}><span style={{fontSize:10,color:C.t3}}>Trend</span><Pill t={f.diversity.trend} c={f.diversity.trend==="On Track"?C.gn:f.diversity.trend==="Improving"?C.am:C.rd}/></div></Card>
    </div>
    {/* Invoices */}
    <Card d={140}>
      <div style={{fontSize:11,fontWeight:600,color:C.am,marginBottom:8,letterSpacing:1}}>RECENT INVOICES — AI REVIEW</div>
      {f.invoices.map((inv)=><div key={inv.id} style={{display:"grid",gridTemplateColumns:"120px 100px 90px 80px 80px 1fr",padding:"8px 10px",borderBottom:`1px solid ${C.br}22`,fontSize:11,alignItems:"center"}}>
        <span style={{fontFamily:M,color:C.bl,fontSize:10}}>{inv.id}</span>
        <span style={{fontFamily:M,color:C.t1,fontWeight:600}}>${(inv.amount/1000).toFixed(0)}K</span>
        <span style={{fontSize:10,color:C.t3}}>{inv.submitted}</span>
        <Pill t={inv.status} c={inv.status==="Approved"?C.gn:inv.status==="Flagged"?C.rd:C.am}/>
        <span style={{fontSize:10,color:inv.flags>0?C.rd:C.gn}}>{inv.flags} flags</span>
        <span style={{fontSize:10,color:inv.ledesCompliant?C.gn:C.rd}}>{inv.ledesCompliant?"✓ LEDES":"✗ Non-LEDES"}</span>
      </div>)}
    </Card>
  </div>;
  return <div>
    <SH icon="🏢" title="Outside Counsel Management" sub="Panel firms, scorecards, rate compliance, LEDES invoice review, diversity tracking" c={C.am}/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
      {[{l:"Panel Firms",v:OCM_FIRMS.length+3,c:C.bl},{l:"YTD Spend",v:"$92M",c:C.am},{l:"Rate Compliance",v:"84%",c:C.am},{l:"Invoice Flags",v:OCM_FIRMS.reduce((a,f)=>a+f.invoices.reduce((b,i)=>b+i.flags,0),0),c:C.rd}].map((s,i)=>
        <Card key={i} d={i*40}><Stat l={s.l} v={s.v} c={s.c} s/></Card>)}
    </div>
    <Card>{OCM_FIRMS.map((f,i)=><div key={f.name} onClick={()=>setSel(i)} style={{padding:"12px",borderBottom:`1px solid ${C.br}22`,cursor:"pointer",animation:`fu .25s ease ${i*30}ms both`}} onMouseEnter={e=>e.currentTarget.style.background=C.cdH} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><div><div style={{display:"flex",gap:5,marginBottom:3}}><Pill t={f.panel} c={C.pp}/><span style={{fontSize:13,fontWeight:600,color:C.t1}}>{f.name}</span></div><div style={{fontSize:10,color:C.t2}}>{f.speciality}</div></div>
        <div style={{textAlign:"right"}}><div style={{fontFamily:M,fontSize:18,fontWeight:700,color:C.am}}>${(f.spend.ytd/1e6).toFixed(1)}M</div><div style={{fontSize:9,color:C.t3}}>of ${(f.spend.budget/1e6).toFixed(0)}M</div></div></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,fontSize:10}}>
        <div><span style={{color:C.t3}}>Matters: </span><span style={{color:C.t1}}>{f.matters}</span></div>
        <div><span style={{color:C.t3}}>Avg Rate: </span><span style={{fontFamily:M,color:C.t1}}>${f.rate.avg}</span></div>
        <div><span style={{color:C.t3}}>Compliance: </span><span style={{fontFamily:M,color:f.rate.compliance>=90?C.gn:C.am,fontWeight:600}}>{f.rate.compliance}%</span></div>
        <div><span style={{color:C.t3}}>Score: </span><span style={{fontFamily:M,color:f.scorecard.overall>=4?C.gn:C.am,fontWeight:600}}>{f.scorecard.overall}/5</span></div>
        <div><span style={{color:C.t3}}>Diversity: </span><span style={{color:C.t2}}>{f.diversity.trend}</span></div>
      </div>
      {f.alerts.map((a,j)=><div key={j} style={{marginTop:6,padding:"4px 8px",background:a.sev==="critical"?C.rdG:C.amG,borderRadius:3,borderLeft:`2px solid ${a.sev==="critical"?C.rd:C.am}`,fontSize:10,color:a.sev==="critical"?C.rd:C.am}}>🔔 {a.text}</div>)}
    </div>)}</Card>
  </div>;
}


export function CyberView(){
  const inc=CYBER_INCIDENTS[0];
  return <div>
    <SH icon="🛡️" title="Cyber Incident Response" sub="Active incidents, regulatory notification tracking, legal hold, insurance claims" c={C.rd}/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
      {[{l:"Active Incidents",v:"1",c:C.rd},{l:"Notifications Due",v:inc.regulatoryNotif.filter(n=>n.status!=="Filed").length,c:C.am},{l:"Records at Risk",v:"142K",c:C.rd},{l:"Insurance Claim",v:"Filed",c:C.gn}].map((s,i)=>
        <Card key={i} d={i*40}><Stat l={s.l} v={s.v} c={s.c} s/></Card>)}
    </div>
    <Card d={60} style={{borderLeft:`3px solid ${C.rd}`,marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><div>
        <div style={{display:"flex",gap:5,marginBottom:4}}><span style={{fontFamily:M,fontSize:11,color:C.rd,fontWeight:600}}>{inc.id}</span><Pill t={inc.severity} c={C.rd}/><Pill t={inc.status} c={C.am}/><Pill t={inc.type} c={C.pp}/></div>
        <div style={{fontSize:15,fontWeight:700,color:C.t1,fontFamily:`'Fraunces',Georgia,serif`}}>{inc.title}</div>
        <div style={{fontSize:10.5,color:C.t2,marginTop:2}}>Detected: {inc.detected} | Vector: {inc.vector}</div></div></div>
    </Card>
    <div style={{fontSize:11,fontWeight:600,color:C.rd,marginBottom:6,letterSpacing:1}}>INCIDENT WORKFLOW</div>
    <WorkflowSteps steps={inc.workflow}/>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:14}}>
      {/* Regulatory Notifications */}
      <Card d={100}><div style={{fontSize:11,fontWeight:600,color:C.am,marginBottom:8,letterSpacing:1}}>📋 REGULATORY NOTIFICATIONS</div>
        {inc.regulatoryNotif.map((n,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 10px",borderBottom:`1px solid ${C.br}22`,alignItems:"center"}}>
          <div><div style={{fontSize:11,color:C.t1,fontWeight:500}}>{n.reg}</div><div style={{fontSize:9,color:C.t3}}>Deadline: <span style={{fontFamily:M,color:C.am}}>{n.deadline}</span></div></div>
          <Pill t={n.status} c={n.status==="Filed"?C.gn:n.status==="In Progress"?C.am:C.rd}/>
        </div>)}
        <div style={{marginTop:8,padding:8,background:C.s1,borderRadius:5}}>
          <div style={{fontSize:10,fontWeight:600,color:C.t3,marginBottom:4}}>LEGAL HOLD</div>
          <div style={{display:"flex",gap:12,fontSize:10}}><span><Dot c={C.gn} p/> {inc.legalHold.status}</span><span>{inc.legalHold.custodians} custodians</span><span>{inc.legalHold.systems} systems</span></div>
        </div>
      </Card>
      {/* Timeline */}
      <Card d={150}><div style={{fontSize:11,fontWeight:600,color:C.bl,marginBottom:8,letterSpacing:1}}>⏱️ INCIDENT TIMELINE</div>
        <div style={{position:"relative",paddingLeft:16}}>
          <div style={{position:"absolute",left:4,top:0,bottom:0,width:2,background:`linear-gradient(to bottom,${C.gn},${C.am}80,${C.br})`}}/>
          {inc.timeline.map((t,i)=>{const dc=t.s==="done"?C.gn:t.s==="upcoming"?C.am:C.br;
            return <div key={i} style={{position:"relative",paddingBottom:8,animation:`fu .15s ease ${i*15}ms both`}}>
              <div style={{position:"absolute",left:-14,top:2,width:8,height:8,borderRadius:"50%",background:dc,border:`2px solid ${C.cd}`}}/>
              <div style={{display:"flex",gap:6}}><span style={{fontFamily:M,fontSize:9,color:C.t3,minWidth:62}}>{t.time}</span><span style={{fontSize:10,color:t.s==="done"?C.t2:C.t1,fontWeight:t.s==="upcoming"?600:400}}>{t.ev}</span></div>
            </div>;})}
        </div>
      </Card>
    </div>
    {/* Insurance & Approvals */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:12}}>
      <Card d={200}><div style={{fontSize:11,fontWeight:600,color:C.tl,marginBottom:8,letterSpacing:1}}>🛡️ INSURANCE</div>
        {Object.entries({Carrier:inc.insurance.carrier,"Policy Limit":inc.insurance.policyLimit,Deductible:inc.insurance.deductible,"Claim Ref":inc.insurance.claimRef}).map(([k,v])=>
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${C.br}22`}}><span style={{fontSize:10,color:C.t3}}>{k}</span><span style={{fontSize:10,color:C.t1,fontFamily:M}}>{v}</span></div>)}</Card>
      <Card d={230}><div style={{fontSize:11,fontWeight:600,color:C.am,marginBottom:8,letterSpacing:1}}>✅ APPROVALS</div>
        {inc.approvals.map((a,i)=><div key={i} style={{padding:"6px 8px",borderBottom:`1px solid ${C.br}22`}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><span style={{fontSize:10.5,color:C.t1,fontWeight:500}}>{a.action}</span><ApprovalBadge status={a.status}/></div>
          <div style={{fontSize:9.5,color:C.t3}}>Approver: <span style={{color:C.am}}>{a.approver}</span></div>
          {a.status==="Pending"&&<div style={{display:"flex",gap:4,marginTop:4}}><button style={{padding:"3px 10px",borderRadius:3,border:"none",background:C.gn,color:"#000",fontSize:9,fontWeight:600,cursor:"pointer"}}>Approve</button><button style={{padding:"3px 10px",borderRadius:3,border:`1px solid ${C.rd}`,background:"transparent",color:C.rd,fontSize:9,fontWeight:600,cursor:"pointer"}}>Reject</button></div>}
        </div>)}</Card>
    </div>
  </div>;
}


// The old v8 "Workflow Builder" mock was removed — the real
// @aegis/workflow-backed Workflow Designer (a tab inside Legal Intake)
// is the single workflow-authoring surface now.

export function ArchitectureView(){
  return <div>
    <SH icon="🏗️" title="Architecture & Technical Blueprint" sub="Platform stack, integration map, security posture, and deployment topology" c={C.pp}/>
    <div style={{fontSize:12,fontWeight:600,color:C.pp,marginBottom:10,letterSpacing:1,textTransform:"uppercase"}}>Platform Architecture — 7 Layers</div>
    <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:20}}>
      {ARCH_LAYERS.map((layer,i)=><Card key={i} d={i*50} style={{borderLeft:`3px solid ${layer.color}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div><div style={{fontSize:12,fontWeight:700,color:layer.color,marginBottom:4}}>{layer.name}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>{layer.items.map((item,j)=><span key={j} style={{padding:"3px 8px",borderRadius:4,background:`${layer.color}12`,border:`1px solid ${layer.color}33`,fontSize:10,color:C.t2}}>{item}</span>)}</div></div>
          <div style={{fontSize:9,color:C.t4,whiteSpace:"nowrap",marginLeft:12}}>Layer {i+1}</div>
        </div>
      </Card>)}
    </div>
    <div style={{fontSize:12,fontWeight:600,color:C.tl,marginBottom:10,letterSpacing:1,textTransform:"uppercase"}}>Integration Map — By Module</div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
      {Object.entries(INTEGRATIONS).map(([mod,data],i)=><Card key={mod} d={i*40}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:12,fontWeight:600,color:C.t1}}>{mod}</span>
          <div style={{display:"flex",gap:6}}><Pill t={data.status} c={C.gn}/><span style={{fontFamily:M,fontSize:10,color:C.tl}}>{data.health} uptime</span></div>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
          {data.systems.map((sys,j)=><span key={j} style={{padding:"3px 7px",borderRadius:4,background:C.s1,border:`1px solid ${C.br}`,fontSize:9.5,color:C.t2}}>{sys}</span>)}
        </div>
      </Card>)}
    </div>
    <div style={{fontSize:12,fontWeight:600,color:C.rd,marginBottom:10,letterSpacing:1,textTransform:"uppercase"}}>Security & Compliance Posture</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
      {[
        {title:"SOC 2 Type II",status:"Certified",detail:"Annual audit — last: Jan 2026",c:C.gn},
        {title:"ISO 27001",status:"Certified",detail:"Scope: Full platform + data processing",c:C.gn},
        {title:"EU AI Act Compliance",status:"In Progress",detail:"High-risk AI system documentation",c:C.am},
        {title:"Attorney-Client Privilege",status:"Active",detail:"Privilege-aware data isolation architecture",c:C.gn},
        {title:"GDPR / DPDP",status:"Compliant",detail:"Data processing agreements in place",c:C.gn},
        {title:"Encryption",status:"AES-256",detail:"At rest + in transit + in processing",c:C.gn},
      ].map((s,i)=><Card key={i} d={i*40}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:11,fontWeight:600,color:C.t1}}>{s.title}</span><Pill t={s.status} c={s.c}/></div>
        <div style={{fontSize:10,color:C.t3}}>{s.detail}</div>
      </Card>)}
    </div>
  </div>;
}

// ══════════════════════════════════════════════════
// MAIN APP SHELL
// ══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// AURORA — NEW COMPONENTS (v7)
// ═══════════════════════════════════════════════════════════════════

// MatterManagementView — unified replacement for Case + Litigation + Compliance Investigations
// Enriches CaseListView with a type filter (Litigation / Investigation / Regulatory / IP / Other)
export function MatterManagementView(){
  const[typeFilter,setTypeFilter]=useState("all");
  const types=["all","Litigation","Regulatory","Investigation","IP"];
  // Classify each case by type (from title/type keywords)
  const classify=c=>{
    const t=(c.type||"").toLowerCase()+" "+(c.title||"").toLowerCase();
    if(t.includes("patent")||t.includes("ip")) return "IP";
    if(t.includes("antitrust")||t.includes("regulatory")||t.includes("dg comp")||t.includes("fcpa")) return "Regulatory";
    if(t.includes("investigation")||t.includes("bribery")||t.includes("fraud")) return "Investigation";
    return "Litigation";
  };
  const filtered=typeFilter==="all"?CASES:CASES.filter(c=>classify(c)===typeFilter);
  return <div>
    {/* Eyebrow + title (Aurora style) */}
    <div style={{marginBottom:16}}>
      <div style={{fontSize:10,fontFamily:M,letterSpacing:2,color:C.em,textTransform:"uppercase",marginBottom:4}}>ENTERPRISE · MATTER · MANAGEMENT</div>
      <div style={{fontSize:24,fontFamily:SR,color:C.t1,fontWeight:400,lineHeight:1.2}}>Unified view of <em style={{color:C.em,fontStyle:"italic"}}>litigation, investigations, regulatory, and IP</em> matters</div>
      <div style={{fontSize:11,color:C.t3,marginTop:4,fontFamily:M}}>Legal holds · custodian tracking · IT preservation · matter timeline — all in one record</div>
    </div>
    {/* Type filter pills */}
    <div style={{display:"flex",gap:6,marginBottom:14}}>
      {types.map(t=>{
        const n=t==="all"?CASES.length:CASES.filter(c=>classify(c)===t).length;
        const active=typeFilter===t;
        return <div key={t} onClick={()=>setTypeFilter(t)} style={{padding:"6px 12px",border:`1px solid ${active?C.em:C.br}`,background:active?C.emG:"transparent",cursor:"pointer",transition:"all .15s",fontFamily:M,fontSize:10,letterSpacing:1,textTransform:"uppercase",color:active?C.em:C.t2}}>{t==="all"?"All Matters":t} <span style={{color:C.t3,marginLeft:4}}>{n}</span></div>;
      })}
    </div>
    {/* KPI row */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:14}}>
      {[{l:"Active Matters",v:filtered.length,c:C.bl},
        {l:"Legal Holds",v:filtered.length,c:C.am},
        {l:"Custodians",v:filtered.reduce((a,c)=>a+c.hold.custodians.length,0),c:C.pp},
        {l:"IT Systems",v:filtered.reduce((a,c)=>a+c.hold.itSystems.length,0),c:C.tl},
        {l:"Pending Ack",v:filtered.reduce((a,c)=>a+c.hold.custodians.filter(x=>!x.ack).length,0),c:C.rd}].map((s,i)=>
        <div key={i} style={{padding:14,background:C.cd,border:`1px solid ${C.br}`,animation:`fu .25s ease ${i*40}ms both`}}>
          <div style={{fontSize:10,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>{s.l}</div>
          <div style={{fontSize:28,fontFamily:SR,fontWeight:400,color:s.c,lineHeight:1}}>{s.v}</div>
        </div>)}
    </div>
    {/* Render the existing CaseListView machinery using filtered list */}
    <CaseListFilteredView cases={filtered}/>
  </div>;
}

// Helper: renders cases from a filtered list using same rendering as CaseListView
function CaseListFilteredView({cases}){
  const[sel,setSel]=useState(null);
  if(sel){
    // Reuse CaseListView's detail by invoking it and auto-selecting — simpler: inline compact detail
    const c=sel;
    return <div>
      <div onClick={()=>setSel(null)} style={{display:"inline-flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:11,color:C.em,marginBottom:12,padding:"3px 6px",fontFamily:M,letterSpacing:1}} onMouseEnter={e=>e.currentTarget.style.background=C.emG} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>← Back to Matter List</div>
      <div style={{background:C.cd,border:`1px solid ${C.br}`,padding:18,marginBottom:14,borderLeft:`3px solid ${pc(c.priority)}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{display:"flex",gap:6,marginBottom:6}}>
              <span style={{fontFamily:M,fontSize:10,color:C.em,letterSpacing:1}}>{c.id}</span>
              <Pill t={c.priority} c={pc(c.priority)}/>
              <Pill t={c.status} c={C.tl}/>
              <Pill t={c.type} c={C.bl}/>
            </div>
            <div style={{fontSize:18,fontFamily:SR,fontWeight:400,color:C.t1,lineHeight:1.3}}>{c.title}</div>
            <div style={{fontSize:10.5,color:C.t3,marginTop:4,fontFamily:M}}>{c.court} · {c.counsel} ({c.partner}) · filed {c.filed}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:28,fontFamily:SR,fontWeight:400,color:C.rd,lineHeight:1}}>{c.exposure}</div>
            <div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1,textTransform:"uppercase",marginTop:2}}>Exposure</div>
            <div style={{fontSize:10.5,color:C.am,marginTop:8,fontFamily:M}}>⏱ {c.nextDl}</div>
            <div style={{fontSize:9.5,color:C.t3}}>{c.nextAct}</div>
          </div>
        </div>
      </div>
      {/* AI risk score — detailed view */}
      <div style={{marginBottom:12}}><MatterRiskBadge matter={c} detailed/></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        {/* Legal Hold Custodians */}
        <div style={{background:C.cd,border:`1px solid ${C.br}`,padding:14}}>
          <div style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>LEGAL HOLD · CUSTODIANS ({c.hold.custodians.length})</div>
          {c.hold.custodians.map((cu,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"22px 1fr 100px 60px",padding:"6px 0",borderBottom:`1px solid ${C.br}22`,alignItems:"center",fontSize:11}}>
            <span style={{fontSize:10,color:cu.ack?C.gn:C.rd,fontWeight:700}}>{cu.ack?"✓":"✗"}</span>
            <div><div style={{color:C.t1,fontWeight:500}}>{cu.name}</div><div style={{fontSize:9,color:C.t3,fontFamily:M}}>{cu.role}</div></div>
            <div style={{fontSize:9,color:C.t3}}>{cu.dept}</div>
            <div style={{fontSize:9,fontFamily:M,color:cu.ack?C.gn:C.rd}}>{cu.ack?cu.date:"PENDING"}</div>
          </div>)}
        </div>
        {/* IT Systems */}
        <div style={{background:C.cd,border:`1px solid ${C.br}`,padding:14}}>
          <div style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>IT PRESERVATION · SYSTEMS ({c.hold.itSystems.length})</div>
          {c.hold.itSystems.map((s,i)=><div key={i} style={{padding:"6px 0",borderBottom:`1px solid ${C.br}22`,fontSize:11}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
              <span style={{color:C.t1,fontWeight:500}}>{s.sys}</span>
              <Pill t={s.status} c={s.status==="Preserved"?C.gn:s.status.includes("Pending")?C.am:C.rd}/>
            </div>
            <div style={{fontSize:9,color:C.t3,fontFamily:M,display:"flex",gap:10}}>
              <span>{s.vol}</span><span>{s.sync||"—"}</span><span>Health: {s.health}%</span>
            </div>
          </div>)}
        </div>
      </div>
      {/* Timeline */}
      <div style={{background:C.cd,border:`1px solid ${C.br}`,padding:14,marginBottom:12}}>
        <div style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>MATTER TIMELINE</div>
        <div style={{position:"relative",paddingLeft:18}}>
          <div style={{position:"absolute",left:4,top:0,bottom:0,width:1,background:C.br}}/>
          {c.milestones.map((m,i)=>{
            const dc=m.s==="done"?C.gn:m.s==="upcoming"?C.am:C.t4;
            return <div key={i} style={{position:"relative",paddingBottom:8}}>
              <div style={{position:"absolute",left:-15,top:4,width:7,height:7,background:dc,border:`1px solid ${C.bg}`}}/>
              <div style={{display:"flex",gap:10}}>
                <span style={{fontFamily:M,fontSize:9.5,color:C.t3,minWidth:76}}>{m.date}</span>
                <span style={{fontSize:11,color:m.s==="upcoming"?C.am:m.s==="done"?C.t1:C.t3}}>{m.ev}</span>
              </div>
            </div>;
          })}
        </div>
      </div>
      {/* Alerts + Approvals */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div style={{background:C.cd,border:`1px solid ${C.br}`,padding:14}}>
          <div style={{fontSize:10,fontFamily:M,color:C.rd,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>ALERTS ({c.alerts.length})</div>
          {c.alerts.map((a,i)=><div key={i} style={{display:"flex",gap:6,padding:"6px 0",borderLeft:`2px solid ${a.sev==="critical"?C.rd:a.sev==="warning"?C.am:C.tl}`,paddingLeft:8,marginBottom:4}}>
            <Dot c={a.sev==="critical"?C.rd:a.sev==="warning"?C.am:C.tl} p={a.sev==="critical"}/>
            <div><div style={{fontSize:10.5,color:C.t1,lineHeight:1.4}}>{a.text}</div><div style={{fontSize:8.5,fontFamily:M,color:C.t4,marginTop:1}}>{a.time}</div></div>
          </div>)}
        </div>
        <div style={{background:C.cd,border:`1px solid ${C.br}`,padding:14}}>
          <div style={{fontSize:10,fontFamily:M,color:C.am,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>APPROVALS ({c.approvals.length})</div>
          {c.approvals.map((a,i)=><div key={i} style={{padding:"6px 0",borderBottom:`1px solid ${C.br}22`}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
              <span style={{fontSize:11,color:C.t1,fontWeight:500}}>{a.action}</span>
              <ApprovalBadge status={a.status}/>
            </div>
            <div style={{fontSize:9.5,color:C.t3,fontFamily:M}}>→ {a.approver}</div>
            {a.status==="Pending"&&<div style={{display:"flex",gap:4,marginTop:5}}>
              <button style={{padding:"3px 10px",border:"none",background:C.gn,color:"#000",fontSize:9,fontWeight:600,fontFamily:M,letterSpacing:1,cursor:"pointer"}}>APPROVE</button>
              <button style={{padding:"3px 10px",border:`1px solid ${C.rd}`,background:"transparent",color:C.rd,fontSize:9,fontWeight:600,fontFamily:M,letterSpacing:1,cursor:"pointer"}}>REJECT</button>
            </div>}
          </div>)}
        </div>
      </div>
    </div>;
  }
  return <div>
    {cases.map((c,i)=><div key={c.id} onClick={()=>setSel(c)} style={{background:C.cd,border:`1px solid ${C.br}`,borderLeft:`3px solid ${pc(c.priority)}`,padding:14,marginBottom:8,cursor:"pointer",animation:`fu .25s ease ${i*30}ms both`,transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.background=C.cdH;e.currentTarget.style.borderColor=C.brL}} onMouseLeave={e=>{e.currentTarget.style.background=C.cd;e.currentTarget.style.borderColor=C.br}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",gap:6,marginBottom:3}}>
            <span style={{fontFamily:M,fontSize:10,color:C.em,letterSpacing:1}}>{c.id}</span>
            <Pill t={c.priority} c={pc(c.priority)}/>
            <Pill t={c.type} c={C.bl}/>
          </div>
          <div style={{fontSize:13,fontFamily:SR,color:C.t1,lineHeight:1.3}}>{c.title}</div>
          <div style={{fontSize:10,color:C.t3,marginTop:3,fontFamily:M}}>{c.counsel} · {c.court}</div>
        </div>
        <div style={{textAlign:"right",minWidth:160}}>
          <div style={{fontSize:18,fontFamily:SR,color:C.rd,lineHeight:1}}>{c.exposure}</div>
          <div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1,textTransform:"uppercase"}}>Exposure</div>
        </div>
      </div>
      <div style={{display:"flex",gap:14,fontSize:10,fontFamily:M,color:C.t3,marginTop:6,paddingTop:6,borderTop:`1px solid ${C.br}22`,alignItems:"center"}}>
        <span>◉ {c.hold.custodians.length} custodians</span>
        <span style={{color:c.hold.custodians.filter(x=>!x.ack).length>0?C.rd:C.gn}}>
          {c.hold.custodians.filter(x=>x.ack).length}/{c.hold.custodians.length} ack'd
        </span>
        <span>▣ {c.hold.itSystems.length} systems</span>
        <span>▲ {c.alerts.length} alerts</span>
        <span>⏱ {c.nextDl} — {c.nextAct}</span>
        <span style={{marginLeft:"auto"}} onClick={e=>e.stopPropagation()}><MatterRiskBadge matter={c}/></span>
      </div>
    </div>)}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// MISSION CONTROL HOME — Aurora hero view
// ═══════════════════════════════════════════════════════════════════
export function MissionControlView(){
  const[tickerIdx,setTickerIdx]=useState(0);
  useEffect(()=>{const t=setInterval(()=>setTickerIdx(i=>(i+1)%TICKERS.length),3500);return()=>clearInterval(t);},[]);

  const _totalExposure=CASES.reduce((a,c)=>a+parseFloat(c.exposure.replace(/[^0-9.]/g,""))||0,0);
  const _criticalCount=ALL_ALERTS.filter(a=>a.sev==="critical").length;
  const postureScore=72; // computed enterprise posture

  const domains=[
    {name:"Contracts",score:78,n:"124,380",c:C.bl,hot:12},
    {name:"Matters",score:64,n:CASES.length,c:C.pp,hot:CASES.filter(c=>c.priority==="Critical").length},
    {name:"Regulatory",score:62,n:"42",c:C.tl,hot:9},
    {name:"Spend",score:70,n:"$92M",c:C.am,hot:5},
    {name:"Compliance",score:81,n:"18",c:C.gn,hot:2},
    {name:"Cyber",score:74,n:"1 active",c:C.rd,hot:1},
    {name:"Governance",score:88,n:"5 entities",c:C.cy,hot:0},
  ];

  return <div>
    {/* HERO: Eyebrow + posture score */}
    <div style={{marginBottom:20}}>
      <div style={{fontSize:10,fontFamily:M,letterSpacing:2.5,color:C.em,textTransform:"uppercase",marginBottom:4}}>GENERAL · COUNSEL · MISSION · CONTROL</div>
      <div style={{display:"flex",alignItems:"flex-end",gap:24,marginTop:8}}>
        <div style={{fontSize:72,fontFamily:SR,fontWeight:400,color:C.t1,lineHeight:1}}>{postureScore}<span style={{fontSize:24,color:C.t3}}>/100</span></div>
        <div style={{paddingBottom:10}}>
          <div style={{fontSize:15,fontFamily:SR,color:C.t1}}>Enterprise legal posture is <em style={{color:C.em,fontStyle:"italic"}}>materially exposed</em></div>
          <div style={{fontSize:11,color:C.t3,fontFamily:M,marginTop:4,letterSpacing:.5}}>Composite score across 7 domains · updated {new Date().toLocaleTimeString()}</div>
        </div>
      </div>
    </div>

    {/* AI DAILY BRIEFING — auto-loads on first visit per session */}
    <MissionControlBriefing context={buildBriefingContext({domains,posture:postureScore,alerts:ALL_ALERTS,approvals:ALL_APPROVALS,cases:CASES})}/>

    {/* AI OPERATIONS — agent activity, scorecard, pending review */}
    <AIOperationsSection/>

    {/* LIVE TICKER */}
    <div style={{background:C.s1,border:`1px solid ${C.br}`,padding:"8px 14px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
      <Dot c={C.em} p/>
      <span style={{fontFamily:M,fontSize:9.5,color:C.em,letterSpacing:2,textTransform:"uppercase"}}>LIVE</span>
      <span style={{fontSize:11,color:C.t1,fontFamily:M,flex:1,animation:"fu .5s ease"}} key={tickerIdx}>{TICKERS[tickerIdx]}</span>
    </div>

    {/* DOMAIN TILES */}
    <div style={{fontSize:10,fontFamily:M,letterSpacing:2,color:C.t3,textTransform:"uppercase",marginBottom:8}}>DOMAIN · POSTURE</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:8,marginBottom:20}}>
      {domains.map((d,i)=><div key={d.name} style={{background:C.cd,border:`1px solid ${C.br}`,padding:12,animation:`fu .25s ease ${i*40}ms both`,borderTop:`2px solid ${d.c}`}}>
        <div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>{d.name}</div>
        <div style={{fontSize:24,fontFamily:SR,fontWeight:400,color:d.c,lineHeight:1}}>{d.score}</div>
        <div style={{fontSize:10,color:C.t2,marginTop:6,fontFamily:M}}>{d.n}</div>
        {d.hot>0&&<div style={{fontSize:9,color:C.rd,marginTop:4,fontFamily:M,letterSpacing:.5}}>{d.hot} critical</div>}
      </div>)}
    </div>

    {/* 3-COLUMN: AI Signals | Critical Exposures | Imminent Actions */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
      {/* AI Signals */}
      <div style={{background:C.cd,border:`1px solid ${C.br}`,padding:14}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
          <Dot c={C.em}/>
          <span style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:2,textTransform:"uppercase"}}>AURORA · SIGNALS</span>
        </div>
        {[
          {t:"Cross-domain correlation: EU Antitrust + LATAM FCPA share 3 vendors",s:"critical"},
          {t:"Regulatory-to-contract mapping: new EU AI Act affects 47 contracts",s:"warning"},
          {t:"Spend anomaly: Cleary Q1 rate 8% above market benchmark",s:"warning"},
          {t:"Contract renewal cluster: 12 critical contracts expire in 60 days",s:"info"},
          {t:"Custodian risk: Anna Petrov (dept. Eng.) has not ack'd hold",s:"critical"},
        ].map((s,i)=><div key={i} style={{padding:"7px 0",borderBottom:i<4?`1px solid ${C.br}22`:"none",display:"flex",gap:8}}>
          <Dot c={s.s==="critical"?C.rd:s.s==="warning"?C.am:C.tl} p={s.s==="critical"}/>
          <div style={{fontSize:10.5,color:C.t1,lineHeight:1.4,flex:1}}>{s.t}</div>
        </div>)}
      </div>
      {/* Critical Exposures */}
      <div style={{background:C.cd,border:`1px solid ${C.br}`,padding:14}}>
        <div style={{fontSize:10,fontFamily:M,color:C.rd,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>CRITICAL · EXPOSURES</div>
        {CASES.filter(c=>c.priority==="Critical").slice(0,3).map((c,i)=><div key={c.id} style={{padding:"8px 0",borderBottom:i<2?`1px solid ${C.br}22`:"none"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
            <span style={{fontFamily:M,fontSize:9,color:C.em,letterSpacing:1}}>{c.id}</span>
            <span style={{fontFamily:SR,fontSize:15,color:C.rd}}>{c.exposure}</span>
          </div>
          <div style={{fontSize:10.5,color:C.t1,lineHeight:1.3}}>{c.title.split("—")[0]}</div>
          <div style={{fontSize:9,color:C.t3,marginTop:2,fontFamily:M}}>⏱ {c.nextDl} · {c.nextAct}</div>
        </div>)}
      </div>
      {/* Imminent Actions */}
      <div style={{background:C.cd,border:`1px solid ${C.br}`,padding:14}}>
        <div style={{fontSize:10,fontFamily:M,color:C.am,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>IMMINENT · ACTIONS</div>
        {[
          {t:"GC approval — Settlement authority $8M (Acme Patent)",d:"today",c:C.rd},
          {t:"Board briefing — EU Antitrust Q1 update",d:"tomorrow",c:C.am},
          {t:"Custodian escalation — Anna Petrov IT forensic collection",d:"today",c:C.rd},
          {t:"DG COMP document production — 12K docs",d:"Mar 25",c:C.am},
          {t:"Regulatory filing — UK FCA Consumer Duty attestation",d:"Mar 31",c:C.tl},
        ].map((a,i)=><div key={i} style={{padding:"7px 0",borderBottom:i<4?`1px solid ${C.br}22`:"none",display:"flex",gap:8}}>
          <div style={{fontFamily:M,fontSize:9,color:a.c,minWidth:54,letterSpacing:.5}}>{a.d.toUpperCase()}</div>
          <div style={{fontSize:10.5,color:C.t1,lineHeight:1.3,flex:1}}>{a.t}</div>
        </div>)}
      </div>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// RISK GRAPH — cross-domain correlation visualization
// ═══════════════════════════════════════════════════════════════════
export function RiskGraphView(){
  const[sel,setSel]=useState(null);
  // Nodes: matters, contracts, regulations, spend firms — positioned to show correlations
  const nodes=[
    {id:"M1",label:"Acme Patent",type:"matter",x:20,y:30,r:22,c:C.pp,det:"LIT-324 · $12M exposure · Discovery"},
    {id:"M2",label:"EU Antitrust",type:"matter",x:50,y:20,r:32,c:C.rd,det:"LIT-326 · $180M exposure · Investigation"},
    {id:"M3",label:"LATAM FCPA",type:"matter",x:75,y:35,r:28,c:C.rd,det:"LIT-332 · $120M exposure · Internal Investigation"},
    {id:"M4",label:"GDPR Breach",type:"matter",x:30,y:70,r:18,c:C.am,det:"LIT-328 · $28M exposure · Pre-trial"},
    {id:"V1",label:"LATAM Vendor Pool",type:"vendor",x:80,y:65,r:16,c:C.am,det:"14 vendors across Brazil, Mexico, Argentina · 3 overlap with EU + FCPA"},
    {id:"C1",label:"SAP SE",type:"contract",x:45,y:55,r:14,c:C.bl,det:"CTR-4821 · $4.2M · Unlimited indemnity risk"},
    {id:"C2",label:"Huawei",type:"contract",x:85,y:20,r:12,c:C.rd,det:"CTR-4825 · Sanctions exposure · Legal hold"},
    {id:"R1",label:"EU AI Act",type:"reg",x:35,y:40,r:16,c:C.tl,det:"REG-001 · Aug 2026 deadline · 47 contracts affected"},
    {id:"R2",label:"DPDP India",type:"reg",x:15,y:55,r:14,c:C.tl,det:"REG-002 · Cross-border data transfer"},
    {id:"R3",label:"CAC China",type:"reg",x:65,y:75,r:14,c:C.tl,det:"REG-003 · Data localization"},
    {id:"F1",label:"Cleary Gottlieb",type:"firm",x:55,y:40,r:14,c:C.am,det:"$14.8M YTD · EU Antitrust + GDPR · 4 matters"},
    {id:"F2",label:"Sullivan & Cromwell",type:"firm",x:65,y:50,r:12,c:C.am,det:"$5.2M YTD · FCPA lead · rate 9% above benchmark"},
  ];
  const edges=[
    {a:"M2",b:"M3",s:"Shared vendor pool",w:3,c:C.rd},
    {a:"M2",b:"V1",s:"Pricing data custodians",w:2,c:C.am},
    {a:"M3",b:"V1",s:"Payment anomalies",w:3,c:C.rd},
    {a:"M2",b:"F1",s:"Lead counsel",w:2,c:C.am},
    {a:"M4",b:"F1",s:"Co-counsel",w:1,c:C.t4},
    {a:"M3",b:"F2",s:"Lead counsel",w:2,c:C.am},
    {a:"C1",b:"R1",s:"Clause impact",w:2,c:C.tl},
    {a:"C1",b:"R2",s:"Cross-border",w:1,c:C.tl},
    {a:"M1",b:"C1",s:"Contract in dispute",w:1,c:C.t4},
    {a:"M2",b:"R1",s:"AI governance overlap",w:2,c:C.tl},
  ];
  const nm={};nodes.forEach(n=>nm[n.id]=n);

  return <div>
    <div style={{marginBottom:16}}>
      <div style={{fontSize:10,fontFamily:M,letterSpacing:2,color:C.em,textTransform:"uppercase",marginBottom:4}}>CROSS · DOMAIN · CORRELATION</div>
      <div style={{fontSize:24,fontFamily:SR,fontWeight:400,color:C.t1,lineHeight:1.2}}>Risk Graph — where <em style={{color:C.em,fontStyle:"italic"}}>everything touches everything</em></div>
      <div style={{fontSize:11,color:C.t3,marginTop:4,fontFamily:M}}>Matters · contracts · regulations · outside counsel · vendors — connected by shared data points</div>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14}}>
      {/* SVG graph */}
      <div style={{background:C.cd,border:`1px solid ${C.br}`,padding:14,position:"relative",height:520}}>
        <div style={{fontSize:10,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>LIVE · TOPOLOGY</div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{width:"100%",height:"92%"}}>
          {/* Grid overlay */}
          <defs>
            <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
              <path d="M 5 0 L 0 0 0 5" fill="none" stroke={C.br} strokeWidth="0.1" opacity="0.5"/>
            </pattern>
          </defs>
          <rect width="100" height="100" fill="url(#grid)"/>
          {/* Edges */}
          {edges.map((e,i)=>{
            const a=nm[e.a],b=nm[e.b];
            if(!a||!b) return null;
            return <g key={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={e.c} strokeWidth={e.w*0.3} opacity={0.6}/>
              <text x={(a.x+b.x)/2} y={(a.y+b.y)/2-1} fontSize="1.6" fill={C.t3} textAnchor="middle" fontFamily="JetBrains Mono">{e.s}</text>
            </g>;
          })}
          {/* Nodes */}
          {nodes.map(n=>{
            const r=n.r*0.3;
            return <g key={n.id} style={{cursor:"pointer"}} onClick={()=>setSel(n)}>
              <circle cx={n.x} cy={n.y} r={r*1.4} fill={n.c} opacity="0.15"/>
              <circle cx={n.x} cy={n.y} r={r} fill={n.c} opacity={sel?.id===n.id?1:0.85} stroke={sel?.id===n.id?C.em:n.c} strokeWidth={sel?.id===n.id?0.8:0}/>
              <text x={n.x} y={n.y+r+2} fontSize="1.8" fill={C.t1} textAnchor="middle" fontFamily="Inter" fontWeight="500">{n.label}</text>
            </g>;
          })}
        </svg>
      </div>
      {/* Side panel */}
      <div style={{background:C.cd,border:`1px solid ${C.br}`,padding:14}}>
        <div style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>{sel?"NODE · DETAIL":"AURORA · INSIGHTS"}</div>
        {sel?<div>
          <div style={{fontSize:16,fontFamily:SR,color:C.t1,marginBottom:4}}>{sel.label}</div>
          <div style={{fontSize:9,fontFamily:M,color:sel.c,letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>{sel.type}</div>
          <div style={{fontSize:11,color:C.t2,lineHeight:1.6}}>{sel.det}</div>
          <div style={{fontSize:10,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",marginTop:18,marginBottom:6}}>CONNECTIONS</div>
          {edges.filter(e=>e.a===sel.id||e.b===sel.id).map((e,i)=>{
            const other=nm[e.a===sel.id?e.b:e.a];
            return <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.br}22`,fontSize:10.5}}>
              <span style={{color:C.t1}}>→ {other?.label}</span>
              <span style={{color:e.c,fontFamily:M,fontSize:9}}>{e.s}</span>
            </div>;
          })}
          <div onClick={()=>setSel(null)} style={{fontSize:9,fontFamily:M,color:C.em,letterSpacing:1,marginTop:14,cursor:"pointer",textTransform:"uppercase"}}>← CLEAR SELECTION</div>
        </div>:<div>
          <div style={{fontSize:11,color:C.t2,lineHeight:1.6,marginBottom:14}}>The graph reveals three high-conviction correlations the GC office should act on immediately:</div>
          {[
            {n:1,t:"EU Antitrust + LATAM FCPA share 3 vendors",d:"Same vendor pool raises consistency-of-disclosure risk if regulators cross-reference. Coordinate counsel."},
            {n:2,t:"Cleary Gottlieb on 4 concurrent matters",d:"Concentration risk + conflict-check exposure. Consider diversification or negotiate volume discount."},
            {n:3,t:"EU AI Act touches 47 contracts + Acme Patent",d:"IP dispute may re-open if counterparty argues AI-trained on their patents. Proactive amendment sweep recommended."},
          ].map((ins,i)=><div key={i} style={{padding:"8px 0",borderBottom:`1px solid ${C.br}22`}}>
            <div style={{display:"flex",gap:8,marginBottom:3}}>
              <span style={{fontFamily:M,fontSize:10,color:C.em,letterSpacing:1}}>#{ins.n}</span>
              <span style={{fontSize:11,color:C.t1,fontWeight:500}}>{ins.t}</span>
            </div>
            <div style={{fontSize:10,color:C.t3,marginLeft:22,lineHeight:1.5}}>{ins.d}</div>
          </div>)}
        </div>}
      </div>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// SCENARIOS — interactive impact simulator
// ═══════════════════════════════════════════════════════════════════
export function ScenariosView(){
  const[euFine,setEuFine]=useState(140);
  const[fcpaSettle,setFcpaSettle]=useState(85);
  const[acmeSettle,setAcmeSettle]=useState(8);

  const totalExposure=euFine+fcpaSettle+acmeSettle+28+8.5;
  const posture=Math.max(0,100-Math.min(totalExposure/4,60));

  return <div>
    <div style={{marginBottom:20}}>
      <div style={{fontSize:10,fontFamily:M,letterSpacing:2,color:C.em,textTransform:"uppercase",marginBottom:4}}>DECISION · SIMULATION · SANDBOX</div>
      <div style={{fontSize:24,fontFamily:SR,fontWeight:400,color:C.t1,lineHeight:1.2}}>Scenarios — <em style={{color:C.em,fontStyle:"italic"}}>what does each outcome cost us?</em></div>
      <div style={{fontSize:11,color:C.t3,marginTop:4,fontFamily:M}}>Adjust settlement ranges · observe enterprise posture · export board scenario pack</div>
    </div>

    {/* Composite posture gauge */}
    <div style={{background:C.cd,border:`1px solid ${C.br}`,padding:20,marginBottom:16,display:"grid",gridTemplateColumns:"1fr 2fr",gap:20,alignItems:"center"}}>
      <div>
        <div style={{fontSize:10,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>COMPOSITE · POSTURE</div>
        <div style={{fontSize:64,fontFamily:SR,color:posture>70?C.gn:posture>50?C.am:C.rd,lineHeight:1}}>{posture.toFixed(0)}<span style={{fontSize:20,color:C.t3}}>/100</span></div>
        <div style={{fontSize:12,fontFamily:M,color:C.t3,marginTop:4}}>Total modelled exposure: <span style={{color:C.rd,fontWeight:600}}>${totalExposure.toFixed(1)}M</span></div>
      </div>
      <div>
        <div style={{fontSize:10,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>IMPACT · BREAKDOWN</div>
        {[{l:"EU Antitrust Fine",v:euFine,c:C.rd},{l:"LATAM FCPA Settlement",v:fcpaSettle,c:C.rd},{l:"Acme Patent Settlement",v:acmeSettle,c:C.am},{l:"Other (GDPR + Env)",v:36.5,c:C.am}].map((i,idx)=>
          <div key={idx} style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10.5,marginBottom:3}}>
              <span style={{color:C.t2}}>{i.l}</span>
              <span style={{fontFamily:M,color:i.c,fontWeight:600}}>${i.v.toFixed(1)}M</span>
            </div>
            <div style={{height:3,background:C.br}}><div style={{height:"100%",width:`${(i.v/totalExposure)*100}%`,background:i.c,transition:"width .3s"}}/></div>
          </div>
        )}
      </div>
    </div>

    {/* Sliders */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
      {[
        {l:"EU Antitrust Fine",v:euFine,set:setEuFine,min:0,max:240,note:"Precedent range €80M–€160M; high-water mark €240M",c:C.rd},
        {l:"LATAM FCPA Settlement",v:fcpaSettle,set:setFcpaSettle,min:0,max:180,note:"DOJ DPA precedent $40M–$120M; corporate monitor adds $20M",c:C.rd},
        {l:"Acme Patent Settlement",v:acmeSettle,set:setAcmeSettle,min:0,max:18,note:"Willing-licensee royalty 2-4% × TAM suggests $5M–$12M",c:C.am},
      ].map((s,i)=><div key={i} style={{background:C.cd,border:`1px solid ${C.br}`,padding:14}}>
        <div style={{fontSize:10,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>{s.l}</div>
        <div style={{fontSize:32,fontFamily:SR,color:s.c,lineHeight:1,marginBottom:10}}>${s.v}M</div>
        <input type="range" min={s.min} max={s.max} value={s.v} onChange={e=>s.set(parseFloat(e.target.value))} style={{width:"100%",accentColor:s.c}}/>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:9,fontFamily:M,color:C.t3,marginTop:4}}>
          <span>${s.min}M</span><span>${s.max}M</span>
        </div>
        <div style={{fontSize:9.5,color:C.t4,marginTop:10,fontStyle:"italic",lineHeight:1.4}}>{s.note}</div>
      </div>)}
    </div>

    {/* Board Pack export */}
    <div style={{marginTop:20,background:C.emG,border:`1px solid ${C.em}`,padding:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>
        <div style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>AURORA · ACTION</div>
        <div style={{fontSize:12,color:C.t1,fontFamily:SR}}>Generate Board Audit Committee scenario pack with above assumptions</div>
      </div>
      <button style={{padding:"10px 18px",border:`1px solid ${C.em}`,background:C.em,color:C.bg,fontSize:10,fontFamily:M,fontWeight:700,letterSpacing:2,cursor:"pointer",textTransform:"uppercase"}}>EXPORT · BOARD · PACK →</button>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// LIVE TICKER messages for Mission Control
