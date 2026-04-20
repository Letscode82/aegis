import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ══════════════════════════════════════════════════════════════════
// AEGIS LEGAL MISSION CONTROL v7.0 (AURORA) — FORTUNE 50 GC PLATFORM
// Aurora design system • Unified Matter Management • AI Copilot
// Mission Control home • Risk Graph • Scenario Simulator
// ══════════════════════════════════════════════════════════════════

// AURORA PALETTE — institutional terminal aesthetic
const C={bg:"#0B1020",s1:"#111831",s2:"#141C38",cd:"#111831",cdH:"#1A2340",br:"#2A3558",brL:"#3A4670",
bl:"#6B8EC4",blG:"rgba(107,142,196,.12)",tl:"#6BA4A4",tlG:"rgba(107,164,164,.1)",
am:"#E0B34A",amG:"rgba(224,179,74,.08)",rd:"#C8463D",rdG:"rgba(200,70,61,.08)",
gn:"#7FA780",gnG:"rgba(127,167,128,.08)",pp:"#A06C9A",ppG:"rgba(160,108,154,.1)",
rs:"#E8793B",or:"#E8793B",cy:"#6BA4A4",em:"#E8793B",emG:"rgba(232,121,59,.15)",
bone:"#F4EFE6",bone2:"#E8E1D3",
t1:"#F4EFE6",t2:"#C8CDD9",t3:"#8B93AE",t4:"#5A6380"};

const F=`'Inter',system-ui,sans-serif`,M=`'JetBrains Mono','SF Mono',monospace`,SR=`'Fraunces',Georgia,serif`;

const CSS=`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap');
@keyframes fu{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
@keyframes sl{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:translateX(0)}}
@keyframes p{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes bi{from{width:0}to{width:var(--w)}}
@keyframes sp{to{transform:rotate(360deg)}}
*{scrollbar-width:thin;scrollbar-color:${C.br} transparent;box-sizing:border-box}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${C.br};border-radius:3px}`;

// ── Shared UI Atoms ──
const Pill=({t,c,g})=><span style={{display:"inline-flex",padding:"2px 7px",borderRadius:4,fontSize:9.5,fontWeight:600,fontFamily:M,color:c,background:g||`${c}18`,letterSpacing:.3,lineHeight:"16px"}}>{t}</span>;
const Dot=({c,p:pu})=><span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",background:c,boxShadow:`0 0 5px ${c}80`,animation:pu?"p 2s infinite":"none",flexShrink:0}}/>;
const Stat=({l,v,c=C.t1,s})=><div style={{textAlign:"center"}}><div style={{fontSize:s?16:22,fontWeight:700,color:c,fontFamily:M,lineHeight:1}}>{v}</div><div style={{fontSize:9.5,color:C.t3,marginTop:3}}>{l}</div></div>;
const Bar=({pct,c,d=0,h=4})=><div style={{height:h,background:C.br,borderRadius:h/2,overflow:"hidden"}}><div style={{"--w":`${Math.min(pct,100)}%`,height:"100%",background:c,borderRadius:h/2,animation:`bi .8s ease ${d}ms both`}}/></div>;
const Card=({children,style:s={},d=0,onClick:oc})=><div onClick={oc} style={{background:C.cd,border:`1px solid ${C.br}`,borderRadius:8,padding:14,animation:`fu .35s ease ${d}ms both`,transition:"border-color .15s,background .15s",cursor:oc?"pointer":"default",...s}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.brL;if(oc)e.currentTarget.style.background=C.cdH}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.br;e.currentTarget.style.background=C.cd}}>{children}</div>;
const SH=({icon:ic,title:ti,sub:su,c=C.bl})=><div style={{marginBottom:14}}><div style={{display:"flex",alignItems:"center",gap:7,marginBottom:su?2:0}}><span style={{fontSize:15}}>{ic}</span><span style={{fontSize:12,fontWeight:700,letterSpacing:1.2,color:c,textTransform:"uppercase",fontFamily:F}}>{ti}</span></div>{su&&<div style={{fontSize:10.5,color:C.t3,marginLeft:26}}>{su}</div>}</div>;
const rc=r=>r==="Critical"?C.rd:r==="High"?C.am:r==="Medium"?C.or:C.gn;
const pc=p=>p==="Critical"?C.rd:p==="High"?C.am:p==="Medium"?C.bl:C.gn;

const Row=({cols,cells,header,i=0})=><div style={{display:"grid",gridTemplateColumns:cols,gap:0,padding:"7px 10px",fontSize:header?9.5:11.5,fontWeight:header?600:400,color:header?C.t3:C.t1,background:header?C.s1:"transparent",borderBottom:`1px solid ${C.br}22`,fontFamily:header?F:F,letterSpacing:header?1:0,textTransform:header?"uppercase":"none",animation:header?"none":`fu .25s ease ${i*30}ms both`}}>{cells.map((cell,j)=><div key={j} style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",...(cell.s||{})}}>{cell.v}</div>)}</div>;

// ── Step Workflow Component ──
const WorkflowSteps=({steps})=><div style={{display:"flex",gap:2,marginTop:10}}>{steps.map((s,i)=><div key={i} style={{flex:1,position:"relative"}}><div style={{padding:"6px 4px",borderRadius:5,background:s.done?C.gnG:s.active?C.amG:`${C.br}44`,border:`1px solid ${s.done?C.gn:s.active?C.am:C.br}33`,textAlign:"center"}}><div style={{fontSize:9,fontWeight:600,color:s.done?C.gn:s.active?C.am:C.t4}}>{s.done?"✓":s.active?"⏳":"○"}</div><div style={{fontSize:8.5,color:C.t2,marginTop:2,lineHeight:1.2}}>{s.label}</div></div>{i<steps.length-1&&<div style={{position:"absolute",right:-4,top:"50%",transform:"translateY(-50%)",fontSize:8,color:C.t4}}>→</div>}</div>)}</div>;

// ── Approval Badge ──
const ApprovalBadge=({status})=>{const m={Approved:{c:C.gn,i:"✓"},Pending:{c:C.am,i:"⏳"},Rejected:{c:C.rd,i:"✗"},Escalated:{c:C.or,i:"⚡"}};const s=m[status]||m.Pending;return <Pill t={`${s.i} ${status}`} c={s.c}/>;};

// ══════════════════════════════════════════════════
// MEGA DATA SET
// ══════════════════════════════════════════════════

const CONTRACTS=[
{id:"CTR-4821",vendor:"SAP SE",type:"Enterprise License",jur:"Germany",val:"$4.2M",risk:"Critical",score:92,clause:"Unlimited indemnity",exp:"2026-06-15",status:"Under Review",auto:true,
 workflow:[{label:"Request",done:true},{label:"Draft/Template",done:true},{label:"AI Review",done:true},{label:"Negotiate",done:true},{label:"Approve",active:true},{label:"Execute"},{label:"Manage"}],
 obligations:[{ob:"Annual audit rights",due:"2026-04-01",owner:"Internal Audit",status:"Upcoming"},{ob:"Data localization compliance",due:"2026-05-15",owner:"IT Security",status:"In Progress"},{ob:"Liability cap renegotiation",due:"2026-06-01",owner:"Legal",status:"Pending Approval"}],
 approvals:[{action:"Risk escalation to GC",by:"AI Agent",date:"2026-03-10",status:"Approved",approver:"Sarah Chen, Deputy GC"},{action:"Renegotiation authorization",by:"Sarah Chen",date:"2026-03-11",status:"Pending",approver:"Mark Williams, GC"}],
 alerts:[{text:"Unlimited indemnity detected — €42M exposure",sev:"critical",time:"2 hours ago"},{text:"Auto-renewal triggers in 90 days",sev:"warning",time:"1 day ago"}],
 integrations:["SAP Ariba","DocuSign","iManage","Salesforce CRM"],
 lifecycle:{stage:"Negotiate",daysInStage:14,totalDays:42,created:"2026-02-01",requestor:"Procurement — EU",template:"ENT-LICENSE-v4.2"},
 versions:[{v:"v1.0",date:"2026-02-01",by:"Template Engine",changes:"Auto-generated from playbook"},{v:"v1.1",date:"2026-02-08",by:"AI Redline",changes:"12 clauses flagged, 4 auto-redlined"},{v:"v2.0",date:"2026-02-15",by:"SAP Legal",changes:"Counter-proposal: rejected liability cap"},{v:"v2.1",date:"2026-02-22",by:"Sarah Chen",changes:"Revised indemnity to 3x ACV, added carve-outs"},{v:"v3.0",date:"2026-03-01",by:"SAP Legal",changes:"Counter: unlimited for IP infringement only"},{v:"v3.1",date:"2026-03-10",by:"AI + GC Review",changes:"Current: pending GC approval on IP carve-out"}],
 clauses:[{name:"Indemnification",status:"Disputed",playbook:"Reject unlimited. Cap at 2x ACV per PB-2025-014",current:"Unlimited for IP claims",risk:"Critical"},{name:"Liability Cap",status:"Agreed",playbook:"Cap at 1x ACV",current:"1x ACV — aligned",risk:"Low"},{name:"Data Processing",status:"Under Review",playbook:"GDPR-compliant DPA required",current:"DPA attached but missing SCCs",risk:"High"},{name:"Termination",status:"Agreed",playbook:"90-day notice, no penalty",current:"90-day notice — aligned",risk:"Low"},{name:"IP Ownership",status:"Disputed",playbook:"Company retains all custom IP",current:"Joint ownership proposed by SAP",risk:"High"},{name:"Auto-Renewal",status:"Flagged",playbook:"No auto-renewal >1yr",current:"3-year auto-renewal",risk:"Medium"}],
 regLinks:[{reg:"REG-001",name:"EU AI Act",impact:"DPA clauses may need AI-specific addendum"},{reg:"REG-002",name:"India DPDP Act",impact:"Cross-border data transfer clause needs update if SAP processes Indian data"}],
 negotiate:{rounds:6,startDate:"2026-02-01",currentRound:"Round 6 — GC escalation",counterparty:"Dr. Klaus Weber, SAP VP Legal",nextAction:"GC call with SAP VP Legal — Mar 15",dealBreakers:["Unlimited IP indemnity","Joint IP ownership","3-year auto-renewal"]}},
{id:"CTR-4822",vendor:"Infosys Ltd",type:"Services Agreement",jur:"India",val:"$1.8M",risk:"Medium",score:54,clause:"Auto-renewal lock",exp:"2026-09-01",status:"Active",auto:true,
 workflow:[{label:"Request",done:true},{label:"Draft/Template",done:true},{label:"AI Review",done:true},{label:"Negotiate",done:true},{label:"Approve",done:true},{label:"Execute",done:true},{label:"Manage",active:true}],
 obligations:[{ob:"SLA review quarterly",due:"2026-04-15",owner:"Vendor Mgmt",status:"On Track"},{ob:"IP assignment verification",due:"2026-06-01",owner:"Legal",status:"On Track"}],
 approvals:[{action:"Auto-classification confirmed",by:"AI Agent",date:"2026-03-08",status:"Approved",approver:"System — 96% confidence"}],
 alerts:[{text:"Auto-renewal in 180 days — review terms",sev:"info",time:"3 days ago"}],
 integrations:["SAP Ariba","DocuSign"],
 lifecycle:{stage:"Manage",daysInStage:180,totalDays:365,created:"2025-03-15",requestor:"IT Outsourcing",template:"SERVICES-MSA-v3.1"},
 versions:[{v:"v1.0",date:"2025-03-15",by:"Template Engine",changes:"Generated from services playbook"},{v:"v1.1",date:"2025-03-22",by:"AI Review",changes:"3 clauses adjusted"},{v:"v2.0",date:"2025-04-10",by:"Infosys Legal",changes:"Minor redlines accepted"},{v:"FINAL",date:"2025-04-20",by:"Both parties",changes:"Executed via DocuSign"}],
 clauses:[{name:"SLA Penalties",status:"Agreed",playbook:"Credits at 10% of monthly fee",current:"10% credits — aligned",risk:"Low"},{name:"Data Residency",status:"Flagged",playbook:"India data stays in India",current:"Processing in Singapore allowed",risk:"Medium"},{name:"IP Assignment",status:"Agreed",playbook:"All work product assigned to Company",current:"Full assignment — aligned",risk:"Low"},{name:"Auto-Renewal",status:"Flagged",playbook:"Annual opt-out",current:"2-year auto-renewal with 180-day notice",risk:"Medium"}],
 regLinks:[{reg:"REG-002",name:"India DPDP Act",impact:"Data residency clause may need tightening under new cross-border rules"}],
 negotiate:{rounds:3,startDate:"2025-03-15",currentRound:"Complete — executed",counterparty:"Priya Sharma, Infosys CLO Office",nextAction:"Renewal review due Sep 2026",dealBreakers:[]}},
{id:"CTR-4823",vendor:"AWS Inc",type:"Cloud Services",jur:"USA",val:"$12.4M",risk:"Low",score:23,clause:"Standard terms",exp:"2027-03-01",status:"Active",auto:true,
 workflow:[{label:"Request",done:true},{label:"Draft/Template",done:true},{label:"AI Review",done:true},{label:"Negotiate",done:true},{label:"Approve",done:true},{label:"Execute",done:true},{label:"Manage",active:true}],
 obligations:[{ob:"Usage audit",due:"2026-06-30",owner:"IT/Cloud",status:"On Track"},{ob:"Data processing addendum review",due:"2026-09-01",owner:"Privacy",status:"On Track"}],
 approvals:[],alerts:[],integrations:["AWS Console","ServiceNow","Coupa"],
 lifecycle:{stage:"Manage",daysInStage:240,totalDays:540,created:"2024-09-01",requestor:"CTO Office",template:"CLOUD-EA-v2.0"},
 versions:[{v:"FINAL",date:"2024-10-15",by:"AWS + Company",changes:"Standard EA with negotiated DPA"}],
 clauses:[{name:"SLA",status:"Agreed",playbook:"99.99% uptime",current:"99.99% — aligned",risk:"Low"},{name:"Data Processing",status:"Agreed",playbook:"DPA with SCCs",current:"AWS DPA v3.2 — compliant",risk:"Low"}],
 regLinks:[],negotiate:{rounds:2,startDate:"2024-09-01",currentRound:"Complete",counterparty:"AWS Enterprise Sales",nextAction:"Renewal review Q4 2026",dealBreakers:[]}},
{id:"CTR-4824",vendor:"Siemens AG",type:"Technology License",jur:"Germany",val:"$3.1M",risk:"High",score:78,clause:"IP assignment ambiguity",exp:"2026-04-30",status:"Escalated",auto:false,
 workflow:[{label:"Request",done:true},{label:"Draft/Template",done:true},{label:"AI Review",done:true},{label:"Negotiate",active:true},{label:"Approve"},{label:"Execute"},{label:"Manage"}],
 obligations:[{ob:"IP ownership clarification",due:"2026-03-25",owner:"Legal — IP Team",status:"Overdue"},{ob:"Indemnity cap negotiation",due:"2026-04-15",owner:"Legal",status:"Pending"}],
 approvals:[{action:"Escalation to IP counsel",by:"AI Agent",date:"2026-03-09",status:"Approved",approver:"David Park, IP Lead"},{action:"External counsel engagement",by:"David Park",date:"2026-03-10",status:"Pending",approver:"Mark Williams, GC"}],
 alerts:[{text:"IP assignment clause ambiguous — potential co-ownership risk",sev:"critical",time:"3 hours ago"},{text:"Contract expires in 49 days — no renewal terms agreed",sev:"warning",time:"1 day ago"}],
 integrations:["SAP Ariba","DocuSign","iManage"],
 lifecycle:{stage:"Negotiate",daysInStage:28,totalDays:56,created:"2026-01-28",requestor:"Engineering",template:"TECH-LICENSE-v2.8"},
 versions:[{v:"v1.0",date:"2026-01-28",by:"Template Engine",changes:"Standard tech license"},{v:"v2.0",date:"2026-02-15",by:"Siemens Legal",changes:"IP joint ownership proposed"},{v:"v2.1",date:"2026-03-01",by:"David Park, IP Lead",changes:"Rejected joint ownership, proposed license-back"},{v:"v3.0",date:"2026-03-10",by:"Siemens Legal",changes:"Counter — insists on joint ownership for derivative works"}],
 clauses:[{name:"IP Ownership",status:"Disputed",playbook:"Full assignment to Company",current:"Joint ownership for derivatives",risk:"Critical"},{name:"Indemnification",status:"Under Review",playbook:"Mutual, capped at 1x ACV",current:"Asymmetric — Siemens capped, Company unlimited",risk:"High"},{name:"Termination",status:"Agreed",playbook:"60-day notice",current:"60-day — aligned",risk:"Low"}],
 regLinks:[{reg:"REG-001",name:"EU AI Act",impact:"If licensed tech includes AI components, additional documentation required"}],
 negotiate:{rounds:4,startDate:"2026-01-28",currentRound:"Round 4 — IP deadlock",counterparty:"Anna Müller, Siemens IP Counsel",nextAction:"Escalation meeting Mar 18",dealBreakers:["Joint IP ownership for derivatives"]}},
{id:"CTR-4825",vendor:"Huawei Technologies",type:"Equipment Supply",jur:"China",val:"$5.6M",risk:"Critical",score:95,clause:"Sanctions exposure",exp:"2026-08-15",status:"Legal Hold",auto:false,
 workflow:[{label:"Request",done:true},{label:"Draft/Template",done:true},{label:"AI Review",done:true},{label:"Sanctions Screen",done:true},{label:"Risk Escalation",done:true},{label:"GC + Board",active:true},{label:"Exit/Terminate"}],
 obligations:[{ob:"OFAC sanctions re-screening",due:"2026-03-15",owner:"Compliance",status:"Overdue"},{ob:"Board notification",due:"2026-03-20",owner:"GC Office",status:"Pending Approval"},{ob:"Exit strategy assessment",due:"2026-04-01",owner:"Procurement + Legal",status:"Pending"}],
 approvals:[{action:"Legal hold placed",by:"Compliance Agent",date:"2026-03-01",status:"Approved",approver:"Mark Williams, GC"},{action:"Board notification draft",by:"GC Office",date:"2026-03-10",status:"Pending",approver:"Board Audit Committee"},{action:"Exit strategy authorization",by:"Procurement",date:"2026-03-12",status:"Pending",approver:"CFO + GC"}],
 alerts:[{text:"CRITICAL: Active sanctions exposure — OFAC Entity List match",sev:"critical",time:"12 min ago"},{text:"Legal hold in effect — all comms preserved",sev:"critical",time:"11 days ago"},{text:"Board Audit Committee briefing required by March 20",sev:"warning",time:"2 days ago"}],
 integrations:["SAP Ariba","OFAC Screening","Refinitiv World-Check","iManage"],
 lifecycle:{stage:"Legal Hold / Exit",daysInStage:22,totalDays:400,created:"2025-02-10",requestor:"Hardware Procurement",template:"EQUIP-SUPPLY-v1.5"},
 versions:[{v:"FINAL",date:"2025-03-01",by:"Both parties",changes:"Executed — now under legal hold"},{v:"HOLD",date:"2026-03-01",by:"Compliance Agent",changes:"Legal hold — all modifications frozen"}],
 clauses:[{name:"Sanctions Compliance",status:"Breach",playbook:"Full OFAC/EU sanctions compliance required",current:"Vendor on OFAC Entity List — BREACH",risk:"Critical"},{name:"Termination for Cause",status:"Under Review",playbook:"Immediate termination for sanctions breach",current:"Clause exists — exit strategy in progress",risk:"Critical"}],
 regLinks:[],negotiate:{rounds:0,startDate:"N/A",currentRound:"Legal Hold — No negotiation",counterparty:"N/A",nextAction:"Board decision on exit strategy",dealBreakers:["Sanctions exposure"]}},
];

const REGULATIONS=[
{id:"REG-001",name:"EU AI Act — Article 6 High-Risk Classification",jur:"EU",impact:"Critical",status:"Action Required",deadline:"2026-04-15",systems:4,
 workflow:[{label:"Detection",done:true},{label:"Impact Assessment",done:true},{label:"Gap Analysis",done:true},{label:"Remediation Plan",active:true},{label:"Compliance Cert",active:false}],
 actions:[{task:"Map all AI systems to risk categories",owner:"AI Governance",due:"2026-03-20",status:"In Progress"},{task:"Update documentation for high-risk systems",owner:"Engineering",due:"2026-03-30",status:"Not Started"},{task:"Implement human oversight mechanisms",owner:"Product",due:"2026-04-10",status:"Not Started"},{task:"Submit compliance documentation",owner:"Legal",due:"2026-04-15",status:"Not Started"}],
 approvals:[{action:"High-risk classification confirmed",by:"AI Agent",date:"2026-03-05",status:"Approved",approver:"Elena Rossi, EU Counsel"},{action:"Budget allocation for remediation",by:"Elena Rossi",date:"2026-03-08",status:"Pending",approver:"CFO Office"}],
 alerts:[{text:"4 AI systems classified as high-risk — immediate action required",sev:"critical",time:"5 hours ago"},{text:"Automated underwriting system requires human oversight mechanism",sev:"critical",time:"1 day ago"}]},
{id:"REG-002",name:"India DPDP Act — Cross-border Transfer Rules",jur:"India",impact:"High",status:"Under Review",deadline:"2026-06-01",systems:7,
 workflow:[{label:"Detection",done:true},{label:"Impact Assessment",done:true},{label:"Gap Analysis",active:true},{label:"Remediation Plan"},{label:"Compliance Cert"}],
 actions:[{task:"Audit cross-border data flows from India",owner:"Privacy Team",due:"2026-04-01",status:"In Progress"},{task:"Implement consent management for Indian users",owner:"Product",due:"2026-05-01",status:"Not Started"},{task:"Update privacy notices",owner:"Legal",due:"2026-05-15",status:"Not Started"}],
 approvals:[{action:"Impact assessment complete",by:"AI Agent",date:"2026-03-10",status:"Approved",approver:"System — auto-assessed"}],
 alerts:[{text:"7 systems transfer data cross-border from India — review required",sev:"warning",time:"2 days ago"}]},
{id:"REG-003",name:"China Data Export Security Assessment",jur:"China",impact:"Critical",status:"Action Required",deadline:"2026-05-01",systems:3,
 workflow:[{label:"Detection",done:true},{label:"Impact Assessment",done:true},{label:"Gap Analysis",done:true},{label:"CAC Filing",active:true},{label:"Approval"}],
 actions:[{task:"Complete CAC security assessment filing",owner:"China Legal",due:"2026-03-25",status:"In Progress"},{task:"Implement data localization for sensitive data",owner:"IT Infrastructure",due:"2026-04-15",status:"In Progress"},{task:"Cross-border transfer agreement with HQ",owner:"Privacy",due:"2026-04-20",status:"Not Started"}],
 approvals:[{action:"CAC filing authorization",by:"China Legal",date:"2026-03-08",status:"Approved",approver:"Mark Williams, GC"},{action:"Data localization budget ($2.1M)",by:"IT",date:"2026-03-10",status:"Pending",approver:"CFO + CIO"}],
 alerts:[{text:"CAC filing deadline in 13 days — draft 80% complete",sev:"warning",time:"6 hours ago"},{text:"3 systems require data localization infrastructure",sev:"critical",time:"2 days ago"}]},
{id:"REG-004",name:"US SEC Climate Disclosure — Phase II",jur:"USA",impact:"Medium",status:"Monitoring",deadline:"2026-09-30",systems:2,
 workflow:[{label:"Detection",done:true},{label:"Impact Assessment",done:true},{label:"Gap Analysis",active:true},{label:"Remediation Plan"},{label:"Compliance Cert"}],
 actions:[{task:"Scope 3 emissions data collection framework",owner:"Sustainability",due:"2026-06-01",status:"Not Started"},{task:"Update 10-K disclosures",owner:"Securities Counsel",due:"2026-08-15",status:"Not Started"}],
 approvals:[],alerts:[{text:"Phase II requirements broadened — Scope 3 now mandatory",sev:"info",time:"1 week ago"}]},
{id:"REG-005",name:"UK FCA Consumer Duty — AI Fairness",jur:"UK",impact:"High",status:"Under Review",deadline:"2026-12-01",systems:3,
 workflow:[{label:"Detection",done:true},{label:"Impact Assessment",done:true},{label:"Gap Analysis",active:true},{label:"Remediation Plan"},{label:"Compliance Cert"}],
 actions:[{task:"AI bias testing on lending models",owner:"Data Science",due:"2026-06-01",status:"Not Started"},{task:"Consumer outcome monitoring framework",owner:"Compliance",due:"2026-08-01",status:"Not Started"},{task:"Board attestation preparation",owner:"Legal",due:"2026-10-01",status:"Not Started"}],
 approvals:[{action:"Bias testing vendor selection ($150K)",by:"Data Science",date:"2026-03-10",status:"Pending",approver:"CTO + GC"}],
 alerts:[{text:"FCA increased enforcement actions by 40% in Q1 2026",sev:"warning",time:"4 days ago"}]},
{id:"REG-006",name:"Brazil LGPD Amendment — Automated Decisions",jur:"Brazil",impact:"Medium",status:"Monitoring",deadline:"2026-08-15",systems:2,
 workflow:[{label:"Detection",done:true},{label:"Impact Assessment",active:true},{label:"Gap Analysis"},{label:"Remediation Plan"},{label:"Compliance Cert"}],
 actions:[{task:"Map automated decision systems in Brazil ops",owner:"Brazil Legal",due:"2026-05-01",status:"In Progress"},{task:"Implement explanation mechanism for automated decisions",owner:"Product",due:"2026-07-01",status:"Not Started"}],
 approvals:[],
 alerts:[{text:"ANPD enforcement powers expanded — fines up to 2% of Brazil revenue",sev:"info",time:"1 week ago"}]},
];

const LITIGATIONS=[
{id:"LIT-324",title:"Acme Corp v. Company — Patent Infringement",type:"Patent",court:"US District Court, Delaware",judge:"Hon. R. Andrews",exposure:"$12M",prediction:"68%",phase:"Discovery",priority:"High",counsel:"Kirkland & Ellis",
 workflow:[{label:"Case Assessment",done:true},{label:"Answer Filed",done:true},{label:"Discovery",active:true},{label:"Expert Reports"},{label:"Summary Judgment"},{label:"Trial"}],
 motions:[{title:"Motion to Compel Discovery",filed:"2026-02-15",status:"Granted",ruling:"2026-03-01"},{title:"Daubert Motion — Expert Exclusion",filed:"2026-03-05",status:"Pending",ruling:"TBD"}],
 keyDates:[{date:"2026-04-02",event:"Expert report deadline"},{date:"2026-06-15",event:"Depositions complete"},{date:"2026-09-01",event:"Summary judgment"},{date:"2027-01-15",event:"Trial"}],
 spend:{total:1420000,budget:2000000,hours:890},
 approvals:[{action:"Expert witness engagement ($180K)",by:"Outside Counsel",date:"2026-03-01",status:"Approved",approver:"Sarah Chen, Deputy GC"},{action:"Settlement authority ($8M)",by:"Sarah Chen",date:"2026-03-10",status:"Pending",approver:"GC + CFO"}],
 alerts:[{text:"Expert report deadline in 21 days — draft 60% complete",sev:"warning",time:"4 hours ago"},{text:"Judge Andrews granted motion to compel — production due March 28",sev:"critical",time:"11 days ago"}]},
{id:"LIT-326",title:"EU Commission — Antitrust Investigation",type:"Regulatory",court:"DG Competition",judge:"Commissioner Vestager",exposure:"$180M",prediction:"45%",phase:"Investigation",priority:"Critical",counsel:"Cleary Gottlieb",
 workflow:[{label:"Notification",done:true},{label:"Response Filed",done:true},{label:"Doc Production",active:true},{label:"Oral Hearing"},{label:"Decision"},{label:"Appeal"}],
 motions:[{title:"Request for Confidential Treatment",filed:"2026-01-20",status:"Partially Granted",ruling:"2026-02-15"},{title:"Access to File Request",filed:"2026-03-01",status:"Pending",ruling:"TBD"}],
 keyDates:[{date:"2026-03-25",event:"Document production to DG COMP"},{date:"2026-06-01",event:"Oral hearing (est.)"},{date:"2026-12-01",event:"Decision expected"}],
 spend:{total:4800000,budget:8000000,hours:3200},
 approvals:[{action:"Leniency application assessment",by:"Cleary Gottlieb",date:"2026-02-20",status:"Rejected",approver:"Board — strategic decision"},{action:"Settlement exploration authority",by:"GC",date:"2026-03-05",status:"Pending",approver:"Board Audit Committee"}],
 alerts:[{text:"Doc production deadline March 25 — 12,000 docs pending review",sev:"critical",time:"1 hour ago"},{text:"Estimated fine range: €80M–€160M based on precedent analysis",sev:"critical",time:"3 days ago"}]},
{id:"LIT-328",title:"DataPriv LLC v. Company — GDPR Breach",type:"Privacy",court:"Irish High Court",judge:"Hon. B. O'Neill",exposure:"$28M",prediction:"55%",phase:"Pre-trial",priority:"High",counsel:"A&O Shearman",
 workflow:[{label:"Case Assessment",done:true},{label:"Defense Filed",done:true},{label:"Discovery",done:true},{label:"Pre-trial",active:true},{label:"Trial"},{label:"Judgment"}],
 motions:[{title:"Motion to Dismiss — Forum Non Conveniens",filed:"2026-01-10",status:"Denied",ruling:"2026-02-08"},{title:"Protective Order — Confidential Data",filed:"2026-02-20",status:"Granted",ruling:"2026-03-05"}],
 keyDates:[{date:"2026-04-15",event:"Pre-trial conference"},{date:"2026-07-01",event:"Trial date"}],
 spend:{total:2200000,budget:3500000,hours:1450},
 approvals:[{action:"Mediation authority ($15M ceiling)",by:"A&O Shearman",date:"2026-03-08",status:"Pending",approver:"GC + CFO"}],
 alerts:[{text:"DPC may join as interested party — increases exposure",sev:"warning",time:"2 days ago"}]},
{id:"LIT-330",title:"GreenTech v. Company — Environmental Contamination",type:"Environmental",court:"UK High Court",judge:"Hon. J. Williams",exposure:"$8.5M",prediction:"78%",phase:"Settlement Talks",priority:"Medium",counsel:"Freshfields",
 workflow:[{label:"Case Assessment",done:true},{label:"Defense Filed",done:true},{label:"Discovery",done:true},{label:"Expert Reports",done:true},{label:"Settlement",active:true},{label:"Trial"}],
 motions:[{title:"Motion for Summary Judgment",filed:"2026-01-15",status:"Denied",ruling:"2026-02-20"}],
 keyDates:[{date:"2026-03-28",event:"Settlement conference"},{date:"2026-06-01",event:"Trial date (if no settlement)"}],
 spend:{total:980000,budget:1500000,hours:620},
 approvals:[{action:"Settlement authority ($6M ceiling)",by:"Freshfields",date:"2026-03-08",status:"Pending",approver:"GC + CSO"}],
 alerts:[{text:"Settlement conference in 16 days — mediator selected",sev:"info",time:"3 days ago"}]},
{id:"LIT-332",title:"DOJ — Foreign Corrupt Practices Act Investigation",type:"FCPA",court:"US DOJ / SEC",judge:"DOJ Criminal Division",exposure:"$120M",prediction:"35%",phase:"Investigation",priority:"Critical",counsel:"Sullivan & Cromwell",
 workflow:[{label:"Notification",done:true},{label:"Internal Investigation",active:true},{label:"DOJ Engagement"},{label:"Resolution"},{label:"Monitorship"}],
 motions:[],
 keyDates:[{date:"2026-04-15",event:"Internal investigation preliminary findings"},{date:"2026-06-01",event:"DOJ voluntary disclosure deadline (est.)"},{date:"2026-12-01",event:"Resolution target"}],
 spend:{total:3200000,budget:10000000,hours:2100},
 approvals:[{action:"Sullivan & Cromwell engagement ($8M budget)",by:"GC",date:"2026-03-01",status:"Approved",approver:"Board Audit Committee"},{action:"Voluntary self-disclosure decision",by:"GC",date:"2026-03-12",status:"Pending",approver:"Board + CEO"}],
 alerts:[{text:"CRITICAL: DOJ FCPA investigation linked to LATAM vendor payments",sev:"critical",time:"4 hours ago"},{text:"Internal investigation must complete before voluntary disclosure window closes",sev:"critical",time:"2 days ago"}]},
];

const COMPLIANCE_INV=[
{id:"INV-101",title:"LATAM Vendor Payment Irregularities",type:"Anti-bribery",region:"Brazil",sev:"Critical",status:"Active",detected:"2026-02-28",flaggedTx:14,lead:"J. Martinez",
 workflow:[{label:"Detection",done:true},{label:"Triage",done:true},{label:"Evidence Collection",done:true},{label:"Interviews",active:true},{label:"Findings Report"},{label:"Remediation"}],
 evidence:[{type:"Transaction records",count:14,source:"SAP ERP"},{type:"Email correspondence",count:89,source:"Exchange"},{type:"Vendor due diligence files",count:6,source:"SharePoint"}],
 approvals:[{action:"Investigation launch",by:"Compliance Agent",date:"2026-02-28",status:"Approved",approver:"Chief Compliance Officer"},{action:"External forensic accountant",by:"CCO",date:"2026-03-05",status:"Approved",approver:"GC"},{action:"Voluntary self-disclosure assessment",by:"GC",date:"2026-03-10",status:"Pending",approver:"Board Audit Committee"}],
 alerts:[{text:"3 additional suspicious payments identified — total now $2.4M",sev:"critical",time:"3 hours ago"},{text:"Interview with Regional Procurement Head scheduled March 15",sev:"info",time:"1 day ago"}]},
{id:"INV-102",title:"Data Exfiltration — Former Employee",type:"IP Theft",region:"India",sev:"High",status:"Active",detected:"2026-03-05",flaggedTx:0,lead:"S. Patel",
 workflow:[{label:"Detection",done:true},{label:"Triage",done:true},{label:"Forensic Analysis",active:true},{label:"Legal Action"},{label:"Remediation"}],
 evidence:[{type:"DLP alerts",count:23,source:"CrowdStrike"},{type:"USB transfer logs",count:4,source:"Endpoint Mgmt"},{type:"Email with attachments",count:12,source:"Exchange"}],
 approvals:[{action:"Forensic imaging of devices",by:"IT Security",date:"2026-03-06",status:"Approved",approver:"CISO"},{action:"TRO application",by:"India Legal",date:"2026-03-10",status:"Pending",approver:"GC"}],
 alerts:[{text:"42 proprietary files confirmed exfiltrated to personal cloud",sev:"critical",time:"6 hours ago"}]},
{id:"INV-103",title:"Insider Trading Suspicion — Q4 Earnings",type:"Securities Fraud",region:"USA",sev:"Critical",status:"Active",detected:"2026-03-01",flaggedTx:3,lead:"M. Rodriguez",
 workflow:[{label:"Detection",done:true},{label:"Triage",done:true},{label:"Trading Analysis",active:true},{label:"SEC Coordination"},{label:"Remediation"}],
 evidence:[{type:"Trading records",count:3,source:"Broker Feeds"},{type:"Calendar / meeting invites",count:18,source:"Exchange"},{type:"Chat messages",count:42,source:"Bloomberg Terminal"}],
 approvals:[{action:"SEC voluntary notification",by:"Securities Counsel",date:"2026-03-10",status:"Pending",approver:"GC + Board Audit Committee"},{action:"Trading freeze — 2 employees",by:"Compliance",date:"2026-03-05",status:"Approved",approver:"GC"}],
 alerts:[{text:"3 trades within 48hrs of material non-public info — pattern detected",sev:"critical",time:"1 day ago"},{text:"Bloomberg terminal logs show 2 employees accessed earnings data before release",sev:"critical",time:"12 hours ago"}]},
];

const SPEND_FIRMS=[
{name:"Kirkland & Ellis",spend:18200000,matters:12,rate:1450,bench:1320,trend:"+8%",efficiency:"72%",
 approvals:[{action:"Rate increase request (+5%)",by:"K&E",date:"2026-03-01",status:"Pending",approver:"Legal Ops"}]},
{name:"Cleary Gottlieb",spend:14800000,matters:4,rate:1680,bench:1550,trend:"+4%",efficiency:"81%",approvals:[]},
{name:"A&O Shearman",spend:12100000,matters:8,rate:1380,bench:1290,trend:"+2%",efficiency:"78%",approvals:[]},
{name:"Littler Mendelson",spend:8400000,matters:24,rate:890,bench:850,trend:"+1%",efficiency:"85%",approvals:[]},
{name:"Freshfields",spend:7600000,matters:6,rate:1520,bench:1480,trend:"0%",efficiency:"76%",approvals:[]},
{name:"Sullivan & Cromwell",spend:5200000,matters:2,rate:1750,bench:1600,trend:"+6%",efficiency:"68%",
 approvals:[{action:"FCPA investigation budget increase (+$2M)",by:"S&C",date:"2026-03-10",status:"Pending",approver:"GC + CFO"}]},
];

// ═══ CASE MANAGEMENT DATA ═══
const CASES=[
{id:"CASE-2026-001",title:"Acme Corp v. Company — Patent Infringement",type:"Patent Litigation",status:"Active — Discovery",priority:"High",
 counsel:"Kirkland & Ellis",partner:"Sarah Mitchell",filed:"2025-08-14",court:"US District Court, Delaware",exposure:"$12M",
 nextDl:"2026-04-02",nextAct:"Expert report deadline",
 hold:{status:"Active",init:"2025-08-16",notice:"LH-2025-084",
   custodians:[
     {name:"James Chen",dept:"Engineering",ack:true,date:"2025-08-17",systems:"Exchange, Slack, GitHub",role:"Lead Developer"},
     {name:"Maria Lopez",dept:"Product",ack:true,date:"2025-08-18",systems:"Exchange, Confluence, Jira",role:"Product Manager"},
     {name:"Robert Kim",dept:"Sales",ack:true,date:"2025-08-19",systems:"Exchange, Salesforce",role:"Enterprise Sales"},
     {name:"Anna Petrov",dept:"Engineering",ack:false,date:null,systems:"Exchange, GitLab",role:"Sr Engineer — departed"},
     {name:"David Wu",dept:"IP/Legal",ack:true,date:"2025-08-17",systems:"Exchange, iManage",role:"Patent Counsel"},
   ],
   itSystems:[
     {sys:"Microsoft Exchange",status:"Preserved",sync:"2026-03-12T09:14",vol:"14.2 GB",ret:"Indefinite Hold",health:99.8,cnt:5},
     {sys:"Slack Enterprise",status:"Preserved",sync:"2026-03-12T09:14",vol:"8.7 GB",ret:"Indefinite Hold",health:99.6,cnt:3},
     {sys:"GitHub Enterprise",status:"Preserved",sync:"2026-03-11T22:30",vol:"2.1 GB",ret:"Indefinite Hold",health:99.9,cnt:2},
     {sys:"Salesforce CRM",status:"Preserved",sync:"2026-03-10T18:00",vol:"890 MB",ret:"Indefinite Hold",health:98.2,cnt:1},
     {sys:"Confluence Wiki",status:"Pending Sync",sync:null,vol:"—",ret:"Awaiting Config",health:0,cnt:1},
     {sys:"Jira Cloud",status:"Preserved",sync:"2026-03-12T06:00",vol:"1.4 GB",ret:"Indefinite Hold",health:99.5,cnt:1},
     {sys:"iManage DMS",status:"Preserved",sync:"2026-03-12T09:00",vol:"4.8 GB",ret:"Indefinite Hold",health:99.7,cnt:1},
     {sys:"GitLab (Legacy)",status:"Collection Pending",sync:null,vol:"—",ret:"Awaiting Access",health:0,cnt:1},
   ],
   dates:{notice:"2025-08-16",firstCollection:"2025-08-22",lastCollection:"2026-03-01",nextScheduled:"2026-04-01"},
 },
 milestones:[
   {date:"2025-08-14",ev:"Complaint Filed",s:"done"},{date:"2025-08-16",ev:"Legal Hold — 5 Custodians",s:"done"},
   {date:"2025-08-22",ev:"First Collection (14.2 GB Exchange)",s:"done"},{date:"2025-09-30",ev:"Answer Filed",s:"done"},
   {date:"2025-12-15",ev:"Initial Disclosures — 4,200 docs",s:"done"},{date:"2026-02-01",ev:"Doc Production Phase 1 — 12,800 docs",s:"done"},
   {date:"2026-03-01",ev:"Last Preservation Collection",s:"done"},{date:"2026-04-01",ev:"Next Scheduled Collection",s:"upcoming"},
   {date:"2026-04-02",ev:"Expert Report Deadline",s:"upcoming"},{date:"2026-06-15",ev:"Depositions Complete",s:"pending"},
   {date:"2026-09-01",ev:"Summary Judgment",s:"pending"},{date:"2027-01-15",ev:"Trial Date",s:"pending"},
 ],
 alerts:[{text:"Anna Petrov (departed) NOT acknowledged hold — escalate",sev:"critical",time:"30 min ago"},
   {text:"Confluence Wiki sync pending — IT config required",sev:"critical",time:"2 hours ago"},
   {text:"Expert report deadline in 21 days",sev:"warning",time:"4 hours ago"}],
 approvals:[{action:"Settlement authority ($8M)",by:"Sarah Chen",date:"2026-03-10",status:"Pending",approver:"GC + CFO"},
   {action:"Forensic collection — Anna Petrov devices",by:"IT Security",date:"2026-03-12",status:"Pending",approver:"GC + CISO"}],
},
{id:"CASE-2026-002",title:"EU Commission — Antitrust Investigation",type:"Regulatory Investigation",status:"Active — Investigation",priority:"Critical",
 counsel:"Cleary Gottlieb",partner:"Hans Mueller",filed:"2025-11-01",court:"DG Competition, Brussels",exposure:"$180M",
 nextDl:"2026-03-25",nextAct:"Document production to DG COMP",
 hold:{status:"Active",init:"2025-11-03",notice:"LH-2025-112",
   custodians:[
     {name:"Thomas Wright",dept:"Executive — CEO",ack:true,date:"2025-11-04",systems:"Exchange, Teams, OneDrive",role:"CEO"},
     {name:"Elena Rossi",dept:"Sales — EU",ack:true,date:"2025-11-04",systems:"Exchange, Salesforce, SAP",role:"VP Sales EU"},
     {name:"Pierre Dubois",dept:"Pricing",ack:true,date:"2025-11-05",systems:"Exchange, SAP, Excel Shares",role:"Dir. Pricing"},
     {name:"Sophie Lang",dept:"Strategy",ack:true,date:"2025-11-05",systems:"Exchange, SharePoint, Teams",role:"Head of Strategy"},
     {name:"Marco Bianchi",dept:"Sales — Italy",ack:true,date:"2025-11-06",systems:"Exchange, Salesforce",role:"Dir. Sales Italy"},
     {name:"Lisa Park",dept:"Legal",ack:true,date:"2025-11-04",systems:"Exchange, iManage, Teams",role:"EU Comp. Counsel"},
   ],
   itSystems:[
     {sys:"Microsoft Exchange",status:"Preserved",sync:"2026-03-12T09:00",vol:"42.8 GB",ret:"Indefinite Hold",health:99.9,cnt:6},
     {sys:"Microsoft Teams",status:"Preserved",sync:"2026-03-12T09:00",vol:"18.3 GB",ret:"Indefinite Hold",health:99.8,cnt:4},
     {sys:"Salesforce CRM",status:"Preserved",sync:"2026-03-12T08:30",vol:"6.2 GB",ret:"Indefinite Hold",health:99.5,cnt:3},
     {sys:"SAP ERP",status:"Preserved",sync:"2026-03-11T23:00",vol:"12.4 GB",ret:"Indefinite Hold",health:99.2,cnt:2},
     {sys:"SharePoint Online",status:"Preserved",sync:"2026-03-10T18:00",vol:"28.1 GB",ret:"Indefinite Hold",health:98.8,cnt:2},
     {sys:"iManage DMS",status:"Preserved",sync:"2026-03-12T07:00",vol:"8.9 GB",ret:"Indefinite Hold",health:99.7,cnt:1},
     {sys:"Excel Network Shares",status:"Collection Pending",sync:null,vol:"—",ret:"Manual Collection Req",health:0,cnt:1},
   ],
   dates:{notice:"2025-11-03",firstCollection:"2025-11-10",lastCollection:"2026-03-08",nextScheduled:"2026-03-22"},
 },
 milestones:[
   {date:"2025-11-01",ev:"DG COMP Notification",s:"done"},{date:"2025-11-03",ev:"Legal Hold — 6 Custodians",s:"done"},
   {date:"2025-11-10",ev:"First Collection (42.8 GB)",s:"done"},{date:"2025-12-20",ev:"Preliminary Response",s:"done"},
   {date:"2026-01-15",ev:"Doc Collection Phase 1 — 135K docs",s:"done"},{date:"2026-03-08",ev:"Last Collection",s:"done"},
   {date:"2026-03-22",ev:"Next Scheduled Collection",s:"upcoming"},{date:"2026-03-25",ev:"Production to DG COMP — 12K pending",s:"upcoming"},
   {date:"2026-06-01",ev:"Oral Hearing (est.)",s:"pending"},{date:"2026-12-01",ev:"Decision Expected",s:"pending"},
 ],
 alerts:[{text:"12,000 docs pending review — DG COMP deadline March 25",sev:"critical",time:"1 hour ago"},
   {text:"Excel shares collection pending — Pierre Dubois pricing data",sev:"critical",time:"4 hours ago"},
   {text:"Fine range: €80M–€160M per precedent analysis",sev:"critical",time:"3 days ago"}],
 approvals:[{action:"Settlement exploration authority",by:"GC",date:"2026-03-05",status:"Pending",approver:"Board Audit Committee"},
   {action:"Rush review contract ($420K) for 12K docs",by:"Legal Ops",date:"2026-03-12",status:"Pending",approver:"GC + CFO"}],
},
{id:"CASE-2026-003",title:"LATAM Vendor Payment — Internal Investigation",type:"Anti-Bribery Investigation",status:"Active — Evidence Collection",priority:"Critical",
 counsel:"Internal + EY Forensics",partner:"J. Martinez",filed:"2026-02-28",court:"Internal — potential DOJ/SEC",exposure:"$50M+",
 nextDl:"2026-03-15",nextAct:"Regional Procurement Head interview",
 hold:{status:"Active",init:"2026-03-01",notice:"LH-2026-014",
   custodians:[
     {name:"Carlos Mendez",dept:"Procurement — LATAM",ack:true,date:"2026-03-02",systems:"Exchange, SAP Ariba, SAP ERP",role:"Regional Procurement Head"},
     {name:"Ana Silva",dept:"Finance — Brazil",ack:true,date:"2026-03-02",systems:"Exchange, SAP ERP, Concur",role:"Finance Controller"},
     {name:"Diego Herrera",dept:"Vendor Mgmt",ack:true,date:"2026-03-03",systems:"Exchange, SAP Ariba",role:"Vendor Mgmt Lead"},
     {name:"Luis Fernando",dept:"Operations — Brazil",ack:false,date:null,systems:"Exchange, SAP ERP, WhatsApp",role:"Ops Director — on travel"},
   ],
   itSystems:[
     {sys:"Microsoft Exchange",status:"Preserved",sync:"2026-03-12T09:00",vol:"22.6 GB",ret:"Indefinite Hold",health:99.7,cnt:4},
     {sys:"SAP ERP",status:"Preserved",sync:"2026-03-12T08:00",vol:"8.4 GB",ret:"Indefinite Hold — Tx Logs",health:99.3,cnt:3},
     {sys:"SAP Ariba",status:"Preserved",sync:"2026-03-11T23:00",vol:"4.1 GB",ret:"Indefinite Hold",health:99.1,cnt:2},
     {sys:"SAP Concur",status:"Preserved",sync:"2026-03-11T22:00",vol:"1.8 GB",ret:"Indefinite Hold — Expenses",health:98.9,cnt:1},
     {sys:"Navex EthicsPoint",status:"Preserved",sync:"2026-03-12T06:00",vol:"340 MB",ret:"Indefinite Hold",health:99.8,cnt:1},
     {sys:"WhatsApp Business",status:"Collection Pending",sync:null,vol:"—",ret:"Court Order Required",health:0,cnt:1},
   ],
   dates:{notice:"2026-03-01",firstCollection:"2026-03-03",lastCollection:"2026-03-10",nextScheduled:"2026-03-17"},
 },
 milestones:[
   {date:"2026-02-28",ev:"AI Compliance Agent flagged $2.4M suspicious payments",s:"done"},
   {date:"2026-03-01",ev:"Legal Hold — 4 Custodians across 3 countries",s:"done"},
   {date:"2026-03-03",ev:"First Collection (22.6 GB Exchange + 8.4 GB SAP)",s:"done"},
   {date:"2026-03-05",ev:"EY Forensics engaged ($220K)",s:"done"},
   {date:"2026-03-10",ev:"14 transactions flagged — $2.4M across 3 vendors",s:"done"},
   {date:"2026-03-15",ev:"Interview — Carlos Mendez",s:"upcoming"},
   {date:"2026-03-17",ev:"Next Scheduled Collection",s:"upcoming"},
   {date:"2026-04-01",ev:"WhatsApp — court order application",s:"pending"},
   {date:"2026-04-15",ev:"Preliminary Findings Report",s:"pending"},
   {date:"2026-05-01",ev:"Voluntary Self-Disclosure Assessment (DOJ)",s:"pending"},
 ],
 alerts:[{text:"Luis Fernando NOT acknowledged hold — on travel, unreachable",sev:"critical",time:"18 min ago"},
   {text:"WhatsApp preservation requires court order",sev:"critical",time:"2 hours ago"},
   {text:"3 additional suspicious payments found — total $2.4M",sev:"critical",time:"3 hours ago"}],
 approvals:[{action:"WhatsApp court order application",by:"Brazil Legal",date:"2026-03-12",status:"Pending",approver:"GC"},
   {action:"Voluntary self-disclosure assessment",by:"GC",date:"2026-03-10",status:"Pending",approver:"Board Audit Committee"},
   {action:"Travel restriction — Luis Fernando",by:"HR",date:"2026-03-12",status:"Pending",approver:"GC + CHRO"}],
},
];

const GOVERNANCE=[
{entity:"Company Holdings Ltd",jur:"UK",board:7,indep:4,next:"2026-03-28",comp:"Compliant",filings:"Current",
 actions:[{task:"Annual board evaluation",due:"2026-04-15",status:"In Progress"},{task:"D&O insurance renewal",due:"2026-05-01",status:"Not Started"}],
 approvals:[{action:"Board evaluation methodology",by:"Company Secretary",date:"2026-03-05",status:"Approved",approver:"Nominations Committee"}]},
{entity:"Company Tech GmbH",jur:"Germany",board:5,indep:2,next:"2026-04-02",comp:"Action Needed",filings:"Overdue",
 actions:[{task:"Appoint 3rd independent director",due:"2026-03-31",status:"Overdue"},{task:"File annual return",due:"2026-03-15",status:"Overdue"},{task:"Supervisory board minutes",due:"2026-03-20",status:"In Progress"}],
 approvals:[{action:"Independent director candidate",by:"HR/Legal",date:"2026-03-08",status:"Pending",approver:"Nominations Committee"},{action:"Late filing penalty waiver",by:"Germany Legal",date:"2026-03-10",status:"Pending",approver:"GC"}]},
{entity:"Company Brasil SA",jur:"Brazil",board:5,indep:1,next:"2026-03-25",comp:"Non-compliant",filings:"Current",
 actions:[{task:"Appoint 2 independent directors (CVM requirement)",due:"2026-04-01",status:"Pending"},{task:"Update articles of association",due:"2026-04-15",status:"Not Started"}],
 approvals:[{action:"Board restructuring plan",by:"Brazil Legal",date:"2026-03-08",status:"Pending",approver:"GC + Board"}]},
];

// Aggregate daily tasks
const TODAY_TASKS=[
{time:"09:00",task:"Review Huawei sanctions re-screening results",module:"Contracts",priority:"Critical",owner:"Compliance Team",status:"Overdue"},
{time:"09:30",task:"Approve expert witness engagement — LIT-324",module:"Litigation",priority:"High",owner:"Sarah Chen",status:"Pending Approval"},
{time:"10:00",task:"EU AI Act remediation plan review",module:"Regulatory",priority:"Critical",owner:"AI Governance",status:"In Progress"},
{time:"10:30",task:"LATAM investigation — interview prep",module:"Compliance",priority:"Critical",owner:"J. Martinez",status:"In Progress"},
{time:"11:00",task:"Germany subsidiary annual return filing",module:"Governance",priority:"High",owner:"Germany Legal",status:"Overdue"},
{time:"11:30",task:"CAC filing draft review — China data export",module:"Regulatory",priority:"Critical",owner:"China Legal",status:"In Progress"},
{time:"13:00",task:"K&E rate increase review — Legal Ops",module:"Spend",priority:"Medium",owner:"Legal Ops",status:"Pending Approval"},
{time:"13:30",task:"Board Audit Committee briefing prep — Huawei",module:"Contracts",priority:"Critical",owner:"GC Office",status:"Not Started"},
{time:"14:00",task:"Settlement authority request — EU Antitrust",module:"Litigation",priority:"Critical",owner:"GC",status:"Pending Approval"},
{time:"14:30",task:"IP exfiltration TRO application review",module:"Compliance",priority:"High",owner:"India Legal",status:"Pending Approval"},
{time:"15:00",task:"Siemens IP clause renegotiation strategy",module:"Contracts",priority:"High",owner:"IP Team",status:"In Progress"},
{time:"15:30",task:"Brazil board restructuring plan",module:"Governance",priority:"Medium",owner:"Brazil Legal",status:"Pending Approval"},
{time:"16:00",task:"Weekly GC dashboard review",module:"Overview",priority:"Medium",owner:"Mark Williams, GC",status:"Scheduled"},
];

const ALL_APPROVALS=[
...CASES.flatMap(c=>c.approvals.filter(a=>a.status==="Pending").map(a=>({...a,module:"Cases",ref:c.id,context:c.title.split("—")[0]}))),
...CONTRACTS.flatMap(c=>c.approvals.filter(a=>a.status==="Pending").map(a=>({...a,module:"Contracts",ref:c.id,context:c.vendor}))),
...REGULATIONS.flatMap(r=>r.approvals.filter(a=>a.status==="Pending").map(a=>({...a,module:"Regulatory",ref:r.id,context:r.name.split("—")[0]}))),
...LITIGATIONS.flatMap(l=>l.approvals.filter(a=>a.status==="Pending").map(a=>({...a,module:"Litigation",ref:l.id,context:l.title.split("—")[0]}))),
...COMPLIANCE_INV.flatMap(c=>c.approvals.filter(a=>a.status==="Pending").map(a=>({...a,module:"Compliance",ref:c.id,context:c.title}))),
...SPEND_FIRMS.flatMap(f=>f.approvals.filter(a=>a.status==="Pending").map(a=>({...a,module:"Spend",ref:f.name,context:f.name}))),
...GOVERNANCE.flatMap(g=>g.approvals.filter(a=>a.status==="Pending").map(a=>({...a,module:"Governance",ref:g.entity,context:g.entity}))),
];

const ALL_ALERTS=[
...CASES.flatMap(c=>c.alerts.map(a=>({...a,module:"Cases",ref:c.id}))),
...CONTRACTS.flatMap(c=>c.alerts.map(a=>({...a,module:"Contracts",ref:c.id}))),
...REGULATIONS.flatMap(r=>r.alerts.map(a=>({...a,module:"Regulatory",ref:r.id}))),
...LITIGATIONS.flatMap(l=>l.alerts.map(a=>({...a,module:"Litigation",ref:l.id}))),
...COMPLIANCE_INV.flatMap(c=>c.alerts.map(a=>({...a,module:"Compliance",ref:c.id}))),
].sort((a,b)=>(a.sev==="critical"?0:a.sev==="warning"?1:2)-(b.sev==="critical"?0:b.sev==="warning"?1:2));

// ══════════════════════════════════════════════════
// INTEGRATION / ARCHITECTURE DATA
// ══════════════════════════════════════════════════
const INTEGRATIONS={
  "Contracts":{systems:["SAP Ariba","DocuSign CLM","iManage DMS","Salesforce CRM","Coupa Procurement","OFAC Screening","Refinitiv World-Check"],status:"6/7 Connected",health:"98.2%"},
  "Regulatory":{systems:["Thomson Reuters Regulatory Intelligence","LexisNexis","EU AI Act Registry","SEC EDGAR","India MCA Portal","China CAC Portal"],status:"5/6 Connected",health:"96.8%"},
  "Litigation":{systems:["Relativity eDiscovery","iManage DMS","Lex Machina Analytics","PACER","Courts Online","Legal Tracker"],status:"6/6 Connected",health:"99.1%"},
  "Compliance":{systems:["Refinitiv World-Check","OFAC SDN List","Navex EthicsPoint","CrowdStrike Falcon","SAP ERP","ServiceNow GRC"],status:"6/6 Connected",health:"99.5%"},
  "Legal Spend":{systems:["Legal Tracker (TyMetrix)","SAP Concur","Workday Finance","e-Billing Hub","CounselLink"],status:"5/5 Connected",health:"99.8%"},
  "Governance":{systems:["Diligent Boards","Workday HCM","Companies House API","SEC EDGAR","Entity Management System"],status:"4/5 Connected",health:"97.2%"},
  "Investigation":{systems:["Relativity eDiscovery","Nuix","CrowdStrike Falcon","Exchange Online","Slack Enterprise Grid","Endpoint DLP"],status:"6/6 Connected",health:"99.3%"},
  "Case Management":{systems:["Relativity","iManage","Microsoft 365 Compliance Center","Slack Enterprise","ServiceNow Legal","Workday HCM","SAP ERP"],status:"6/7 Connected",health:"98.6%"},
};

const ARCH_LAYERS=[
{name:"Presentation Layer",color:C.bl,items:["Mission Control Dashboard (React)","Mobile GC App (React Native)","Board Reporting Portal","API Gateway (Kong)"]},
{name:"Agent Orchestration",color:C.tl,items:["n8n Workflow Engine","Protocol Engine (CASE_PROTOCOL.md pattern)","Agent Memory Store (CASE_MEMORY.md pattern)","Human-in-Loop Escalation Router"]},
{name:"AI / Intelligence Layer",color:C.pp,items:["Claude Sonnet 4.6 (Primary LLM)","GPT-4o (Fallback)","Custom Legal NER Models","Predictive Litigation Model","Risk Scoring Engine"]},
{name:"Knowledge Graph",color:C.am,items:["Neo4j Graph Database","Pinecone Vector Store","Entity Resolution Engine","Relationship Inference Engine","Temporal Graph Versioning"]},
{name:"Data Integration",color:C.or,items:["MCP Protocol Connectors","REST/GraphQL APIs","SFTP Batch Ingestion","Real-time Webhooks","ETL Pipeline (Airflow)"]},
{name:"Security & Compliance",color:C.rd,items:["SOC 2 Type II","ISO 27001","Privilege-Aware Architecture","End-to-End Encryption (AES-256)","RBAC + Attribute-Based Access","Audit Trail (Immutable Log)"]},
{name:"Infrastructure",color:C.t3,items:["AWS GovCloud / Azure Sovereign","Kubernetes (EKS)","PostgreSQL + TimescaleDB","Redis Cache Layer","Prometheus + Grafana Monitoring"]},
];

// ══════════════════════════════════════════════════
// VIEW COMPONENTS
// ══════════════════════════════════════════════════

function DailyView(){
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

function AlertsView(){
  return <div>
    <SH icon="🚨" title="Alerts & Notifications" sub={`${ALL_ALERTS.filter(a=>a.sev==="critical").length} critical • ${ALL_ALERTS.filter(a=>a.sev==="warning").length} warnings — across all modules`} c={C.rd}/>
    <Card>{ALL_ALERTS.map((a,i)=><div key={i} style={{display:"flex",gap:10,padding:"9px 12px",borderLeft:`3px solid ${a.sev==="critical"?C.rd:a.sev==="warning"?C.am:C.tl}`,marginBottom:4,borderRadius:4,background:a.sev==="critical"?C.rdG:"transparent",animation:`sl .3s ease ${i*30}ms both`}}>
      <Dot c={a.sev==="critical"?C.rd:a.sev==="warning"?C.am:C.tl} p={a.sev==="critical"}/>
      <div style={{flex:1}}><div style={{fontSize:11.5,color:C.t1,lineHeight:1.4}}>{a.text}</div>
      <div style={{display:"flex",gap:10,marginTop:3,fontSize:10,color:C.t4}}><span>{a.time}</span><Pill t={a.module} c={C.bl}/><span style={{fontFamily:M}}>{a.ref}</span></div></div>
    </div>)}</Card>
  </div>;
}

function ApprovalsView(){
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

function ContractsView(){
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

function RegulatoryView(){
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

function LitigationView(){
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

function ComplianceView(){
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

function SpendView(){
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

function GovernanceView(){
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

function CaseListView(){
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

// ══════════════════════════════════════════════════
// MODULE 1: LEGAL INTAKE PORTAL — v8.0 AURORA
// Persistent storage · Hybrid AI triage · Copilot chat
// Triage Cockpit · Agent Layer (conservative)
// Inbox · Kanban · SLA · Smart Routing · Self-Service
// ══════════════════════════════════════════════════

// Shared form atoms used across all Intake sub-tabs
const inputStyle={width:"100%",padding:"9px 11px",background:C.s1,border:`1px solid ${C.br}`,borderRadius:4,color:C.t1,fontSize:11.5,fontFamily:F,outline:"none",transition:"border-color .15s"};
function FormField({label,sub,required,children}){return <div style={{marginBottom:12}}><div style={{fontSize:9.5,color:C.t3,textTransform:"uppercase",letterSpacing:1.5,fontFamily:M,marginBottom:5,fontWeight:600}}>{label}{required&&<span style={{color:C.rd,marginLeft:3}}>*</span>}</div>{children}{sub&&<div style={{fontSize:9.5,color:C.t4,marginTop:3,fontFamily:M}}>{sub}</div>}</div>;}

const KB_TOPICS=[
{q:"Can I share this document with a vendor?",cat:"Disclosure",resolved:847,deflectionRate:94,owner:"Playbook § 3.1",answer:"Yes, if the vendor has a signed NDA on file (check Brain) and the document is not marked Highly Confidential. For Highly Confidential, use the clean-room workflow."},
{q:"What's our standard MSA payment term?",cat:"Contract FAQ",resolved:612,deflectionRate:99,owner:"Playbook § 2.4",answer:"Net 45 from receipt of invoice. Net 30 only if counterparty offers ≥2% prompt-pay discount. Anything shorter requires VP Finance approval."},
{q:"Do I need legal review for a standard NDA?",cat:"NDA",resolved:1241,deflectionRate:98,owner:"Playbook § 1.2",answer:"No. Use the Self-Serve NDA generator — it picks the right template (mutual / one-way / evaluation) and auto-fills counterparty info from Salesforce. Only escalate if there are non-standard clauses."},
{q:"When does our vendor contract with [X] expire?",cat:"Contract Query",resolved:534,deflectionRate:100,owner:"Contract Registry",answer:"Ask Aurora — the AI reads the contract registry and returns expiry, renewal terms, and current notice period in one click."},
{q:"Is this vendor on any sanctions list?",cat:"Compliance",resolved:389,deflectionRate:96,owner:"Sanctions Screen",answer:"Paste the vendor legal name into the Sanctions Screen widget — checks OFAC, EU, UK, UN lists in real time. Results < 5 seconds."},
{q:"What's our data retention period for customer data?",cat:"Privacy FAQ",resolved:287,deflectionRate:100,owner:"Privacy Notice § 7",answer:"7 years from contract termination, except EU customers (3 years under contract, then 2 years for warranty). Financial records: 10 years per SOX."},
];

const ROUTING_RULES=[
{id:"RULE-0",cond:"Type = NDA (standard) OR Informational lookup",action:"Auto-draft / auto-answer",assignee:"AI Agent",autoPct:100,matches:231,enabled:true},
{id:"RULE-1",cond:"Harassment / discrimination + respondent = VP+",action:"Escalate to GC",assignee:"GC + Employment Lead",autoPct:0,matches:8,enabled:true},
{id:"RULE-2",cond:"Debt / finance > €100M OR $100M",action:"Finance Legal review",assignee:"Finance Legal + GC",autoPct:0,matches:14,enabled:true},
{id:"RULE-3",cond:"IP / open-source / trademark / patent",action:"Route to IP Team",assignee:"David Park, IP Lead",autoPct:30,matches:72,enabled:true},
{id:"RULE-4",cond:"EU regulatory AND (client-facing OR external statement)",action:"EU Counsel + GC approval",assignee:"Elena Kraft + GC",autoPct:0,matches:19,enabled:true},
{id:"RULE-5",cond:"Vendor DD AND high-risk jurisdiction",action:"Enhanced due diligence",assignee:"Compliance Team",autoPct:15,matches:38,enabled:true},
{id:"RULE-6",cond:"Privacy / DPIA / personal data",action:"Privacy Team review",assignee:"Privacy Team",autoPct:25,matches:54,enabled:true},
{id:"RULE-7",cond:"Contract > $500K",action:"Commercial + GDPR check",assignee:"Maria Chen, Commercial",autoPct:0,matches:27,enabled:true},
{id:"RULE-8",cond:"Sanctions jurisdiction match",action:"Hold + escalate",assignee:"Compliance + GC",autoPct:0,matches:3,enabled:true},
];

// ══════════════════════════════════════════════════
// NEW v8 ATOMS — move to global section on splice
// ══════════════════════════════════════════════════

// Keyboard hint chip — kbd-style, used throughout Cockpit
const Kbd=({k,sub,active})=><span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 6px",background:active?C.cy+"22":C.s2,border:`1px solid ${active?C.cy:C.br}`,borderRadius:3,fontSize:9.5,fontFamily:M,color:active?C.cy:C.t2,fontWeight:600,letterSpacing:.2,lineHeight:"14px",minWidth:18,justifyContent:"center"}}>{k}{sub&&<span style={{color:C.t4,fontSize:8.5,marginLeft:2}}>{sub}</span>}</span>;

// Confidence badge — thresholds locked per spec: ≥0.90 high / 0.70–0.90 medium / <0.70 review carefully
const confidenceTier=(c)=>c>=0.90?{tier:"high",c:C.gn,l:"HIGH CONFIDENCE"}:c>=0.70?{tier:"medium",c:C.am,l:"MEDIUM CONFIDENCE"}:{tier:"review",c:C.rd,l:"⚠ REVIEW CAREFULLY"};
const ConfidenceBadge=({conf})=>{const t=confidenceTier(conf);return <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"3px 8px",background:t.c+"14",border:`1px solid ${t.c}55`,borderRadius:3}}><Dot c={t.c}/><span style={{fontSize:9,fontFamily:M,color:t.c,letterSpacing:1,fontWeight:600}}>{t.l}</span><span style={{fontSize:11,fontFamily:M,color:t.c,fontWeight:700}}>{Math.round(conf*100)}%</span></div>;};

// Agent identity badge
const AgentBadge=({agent,size=10})=>agent?<span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"2px 7px",background:C.pp+"18",border:`1px solid ${C.pp}44`,borderRadius:3,fontSize:size-.5,fontFamily:M,color:C.pp,letterSpacing:.8,fontWeight:600}}><span style={{fontSize:size}}>{agent.icon||"◉"}</span>{agent.shortName||agent.name}</span>:null;

// Typing indicator — three pulsing dots
const TypingDots=()=><span style={{display:"inline-flex",alignItems:"center",gap:3,padding:"6px 10px"}}>{[0,1,2].map(i=><span key={i} style={{width:5,height:5,borderRadius:"50%",background:C.cy,display:"inline-block",animation:`typing 1.2s ${i*.18}s infinite ease-in-out`}}/>)}</span>;

// Chat bubble — user (C.s1 bg) vs AI (C.cd bg with C.cy left border)
const ChatBubble=({role,children,d=0,streaming,meta})=>{
  const isUser=role==="user";
  return <div style={{display:"flex",justifyContent:isUser?"flex-end":"flex-start",marginBottom:10,animation:`fu .28s ease ${d}ms both`}}>
    <div style={{maxWidth:"78%",padding:"10px 13px",background:isUser?C.s1:C.cd,border:`1px solid ${isUser?C.br:C.br}`,borderLeft:isUser?`1px solid ${C.br}`:`2px solid ${C.cy}`,borderRadius:isUser?"8px 8px 2px 8px":"2px 8px 8px 8px",fontSize:12.5,color:C.t1,lineHeight:1.55,fontFamily:isUser?F:SR,fontWeight:isUser?400:400}}>
      {!isUser&&<div style={{fontSize:8.5,fontFamily:M,color:C.cy,letterSpacing:1.5,textTransform:"uppercase",marginBottom:5,fontWeight:600}}>◎ AEGIS INTAKE COPILOT</div>}
      <div>{children}{streaming&&<span style={{display:"inline-block",width:6,height:12,background:C.cy,marginLeft:3,verticalAlign:"middle",animation:"p 1s infinite"}}/>}</div>
      {meta&&<div style={{fontSize:9,color:C.t4,marginTop:6,fontFamily:M,letterSpacing:.5}}>{meta}</div>}
    </div>
  </div>;
};

// Capacity meter — cockpit-only
const CapacityMeter=({current,avg,cap,label})=>{const pct=Math.min(Math.round((current/cap)*100),100);const overloaded=current>avg*1.3;return <div style={{padding:10,background:C.s1,borderRadius:4}}>
  <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:1,fontFamily:M,marginBottom:5,fontWeight:600}}><span>{label||"Your Capacity"}</span><span style={{color:overloaded?C.am:C.t3}}>{current} / {cap}</span></div>
  <Bar pct={pct} c={overloaded?C.am:C.gn} h={5}/>
  <div style={{display:"flex",justifyContent:"space-between",fontSize:8.5,color:C.t4,marginTop:4,fontFamily:M}}><span>Team avg: {avg}</span>{overloaded&&<span style={{color:C.am}}>⚠ {Math.round(((current-avg)/avg)*100)}% over team avg</span>}</div>
</div>;};

// Similar-matter compact card
const SimilarMatterCard=({m,onClick})=><div onClick={onClick} style={{padding:10,background:C.s1,borderRadius:4,border:`1px solid ${C.br}55`,cursor:"pointer",transition:"all .12s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.cy+"aa";e.currentTarget.style.background=C.cdH}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.br+"55";e.currentTarget.style.background=C.s1}}>
  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
    <span style={{fontFamily:M,fontSize:9.5,color:C.cy,fontWeight:600}}>{m.id}</span>
    <span style={{fontSize:9,color:C.t4,fontFamily:M}}>{m.similarity}% match</span>
  </div>
  <div style={{fontSize:11,color:C.t1,lineHeight:1.4,marginBottom:4,fontFamily:F}}>{m.desc}</div>
  <div style={{fontSize:9,color:C.t3,fontFamily:M}}>Resolved {m.resolvedDaysAgo}d ago · {m.resolution}</div>
</div>;


// ═════════════ s2_storage.jsx ═════════════
// ══════════════════════════════════════════════════
// STORAGE LAYER — v8 extends v7 with 4 new keys
// ══════════════════════════════════════════════════
// aegis:tickets:v1            — EXISTING (extended; v7.2 tickets migrated forward)
// aegis:intake:conversations:v1 — NEW: Copilot chat transcripts
// aegis:intake:agent-log:v1    — NEW: agent action audit trail
// aegis:intake:agent-settings:v1 — NEW: per-agent on/off toggle
// aegis:intake:cockpit-state:v1  — NEW: attorney's cockpit prefs/position

const K={
  TICKETS:"aegis:tickets:v1",
  SEED:"aegis:tickets:seeded",
  CONVERSATIONS:"aegis:intake:conversations:v1",
  AGENT_LOG:"aegis:intake:agent-log:v1",
  AGENT_SETTINGS:"aegis:intake:agent-settings:v1",
  COCKPIT_STATE:"aegis:intake:cockpit-state:v1",
};

// In-memory fallback for environments without window.storage
const __memStore={};
const hasWinStorage=()=>typeof window!=="undefined"&&window.storage&&typeof window.storage.get==="function";

async function storeGet(key,def=null){
  try{
    if(hasWinStorage()){
      const r=await window.storage.get(key);
      if(r&&r.value) return JSON.parse(r.value);
    } else if(__memStore[key]){
      return JSON.parse(__memStore[key]);
    }
  }catch(e){/* first read */}
  return def;
}
async function storeSet(key,value){
  try{
    const payload=JSON.stringify(value);
    if(hasWinStorage()) await window.storage.set(key,payload);
    else __memStore[key]=payload;
    return true;
  }catch(e){ console.error("store write failed",key,e); return false; }
}
async function storeDel(key){
  try{ if(hasWinStorage()) await window.storage.delete(key); else delete __memStore[key]; }
  catch(e){ /* swallow */ }
}

// ── v7.2 → v8 migration ──
// v7 tickets have: id, from, dept, type, priority, submitted, submittedTs, sla, slaHours,
//   slaStatus, desc, assigned, status, stage, seeded, workflow, aiTriage.
// v8 adds: _source, conversation, agentRecommendation, triagedBy, triagedAt, agentProcessedAt.
function migrateTicketV72(t){
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

async function loadTickets(){
  const raw=await storeGet(K.TICKETS,null);
  if(!raw||!Array.isArray(raw)) return null;
  // migrate on read so v7.2 data displays cleanly in v8
  return raw.map(migrateTicketV72);
}
async function saveTickets(tickets){ return storeSet(K.TICKETS,tickets); }

async function ensureSeeded(){
  const existing=await loadTickets();
  if(existing&&existing.length>0) return existing;
  const now=Date.now();
  const fresh=V8_SEED.map(s=>({...s,submittedTs:now-(s._ageHours||1)*3600*1000}));
  await saveTickets(fresh);
  return fresh;
}

// ── Conversations (Copilot transcripts) ──
async function loadConversations(){ return await storeGet(K.CONVERSATIONS,{}); }
async function saveConversation(ticketId,transcript){
  const all=await loadConversations();
  all[ticketId]={updatedAt:Date.now(),transcript};
  return storeSet(K.CONVERSATIONS,all);
}

// ── Agent log (audit trail) ──
async function appendAgentLog(entry){
  const log=await storeGet(K.AGENT_LOG,[]);
  const next=[{ts:Date.now(),...entry},...log].slice(0,500); // cap to 500
  return storeSet(K.AGENT_LOG,next);
}
async function loadAgentLog(){ return await storeGet(K.AGENT_LOG,[]); }

// ── Agent settings ──
const DEFAULT_AGENT_SETTINGS={
  "nda-agent":{enabled:true},
  "faq-agent":{enabled:true},
  "vendor-intake-agent":{enabled:true},
  "contract-review-agent":{enabled:true},
  "trademark-agent":{enabled:true},
  "policy-qa-agent":{enabled:true},
};
async function loadAgentSettings(){
  const s=await storeGet(K.AGENT_SETTINGS,null);
  if(!s) return DEFAULT_AGENT_SETTINGS;
  // merge so newly added agents default to enabled
  return {...DEFAULT_AGENT_SETTINGS,...s};
}
async function saveAgentSettings(settings){ return storeSet(K.AGENT_SETTINGS,settings); }

// ── Cockpit state ──
const DEFAULT_COCKPIT_STATE={lastPos:0,attorney:"You (Alex Nguyen)",triagedToday:0,triagedDate:null};
async function loadCockpitState(){
  const s=await storeGet(K.COCKPIT_STATE,DEFAULT_COCKPIT_STATE);
  // reset daily counter
  const today=new Date().toISOString().slice(0,10);
  if(s.triagedDate!==today) return {...s,triagedToday:0,triagedDate:today};
  return s;
}
async function saveCockpitState(state){ return storeSet(K.COCKPIT_STATE,state); }


// ═════════════ s3_seed.jsx ═════════════
// ══════════════════════════════════════════════════
// SEED DATA — v7.2 tickets preserved + v8 additions
// ══════════════════════════════════════════════════
// Structure:
//   - 10 v7.2 seed tickets (unchanged from v7.2, auto-migrated)
//   - 8 new "Cockpit-ready" tickets, each with a pre-computed agentRecommendation
//   - 5 identical NDA requests for bulk-mode demo
// Ages (_ageHours) get resolved to submittedTs on first seed.

// v7.2 seed — copied verbatim (so existing demos still work), ages in hours
const V72_SEED=[
{id:"REQ-3401",_source:"seed",_ageHours:2.23,from:"Sarah Johnson",dept:"Product",type:"Contract Review",priority:"High",submitted:"2026-04-17 09:14",sla:"24 hrs",slaHours:24,slaStatus:"On Track",
 desc:"New vendor agreement with DataStream AI for ML training data. $800K annual. Need review before Thursday board meeting.",
 assigned:"Maria Chen, Commercial",status:"In Review",stage:"review",seeded:true,
 workflow:[{label:"Submitted",done:true},{label:"AI Triage",done:true},{label:"Assigned",done:true},{label:"In Review",active:true},{label:"Complete"}],
 aiTriage:{category:"Vendor Agreement",riskFlag:"Medium — data processing terms need GDPR review",suggestedAssignee:"Commercial Contracts Team",estimatedHours:4,similarMatters:12,confidence:94,routingRule:"RULE-7: Contracts > $500K → Commercial + GDPR check",source:"regex"}},
{id:"REQ-3402",_source:"seed",_ageHours:0.96,from:"Mike Peters",dept:"Engineering",type:"IP Question",priority:"Medium",submitted:"2026-04-17 10:30",sla:"48 hrs",slaHours:48,slaStatus:"On Track",
 desc:"Can we open-source our internal logging framework? Need to check if any patents or trade secrets are implicated.",
 assigned:"David Park, IP Lead",status:"Assigned",stage:"assigned",seeded:true,
 workflow:[{label:"Submitted",done:true},{label:"AI Triage",done:true},{label:"Assigned",done:true},{label:"In Review"},{label:"Complete"}],
 aiTriage:{category:"IP / Open Source",riskFlag:"Low — standard OSS assessment",suggestedAssignee:"IP Team",estimatedHours:3,similarMatters:8,confidence:88,routingRule:"RULE-3: IP questions → IP Team lead",source:"regex"}},
{id:"REQ-3403",_source:"seed",_ageHours:6.46,from:"Lisa Wang",dept:"HR",type:"Employment Issue",priority:"Critical",submitted:"2026-04-17 05:00",sla:"4 hrs",slaHours:4,slaStatus:"Overdue",
 desc:"Employee harassment complaint filed against VP Engineering. Plaintiff lawyer contacted HR directly. Need immediate guidance.",
 assigned:"Rachel Adams, Employment",status:"Escalated to GC",stage:"review",seeded:true,
 workflow:[{label:"Submitted",done:true},{label:"AI Triage",done:true},{label:"Escalated",done:true},{label:"GC Review",active:true},{label:"Action Plan"}],
 aiTriage:{category:"Employment — Harassment",riskFlag:"Critical — external counsel contact + VP-level respondent",suggestedAssignee:"Employment Team + GC",estimatedHours:20,similarMatters:3,confidence:99,routingRule:"RULE-1: Harassment + VP+ → Auto-escalate to GC",source:"regex"}},
{id:"REQ-3404",_source:"seed",_ageHours:0.71,from:"Tom Bradley",dept:"Procurement",type:"NDA Request",priority:"Low",submitted:"2026-04-17 11:45",sla:"8 hrs",slaHours:8,slaStatus:"On Track",
 desc:"Standard mutual NDA needed for preliminary discussions with Accenture regarding potential consulting engagement.",
 assigned:"AI Auto-Draft",status:"Auto-Completed",stage:"complete",seeded:true,
 workflow:[{label:"Submitted",done:true},{label:"AI Triage",done:true},{label:"Auto-Draft",done:true},{label:"Sent to Requester",done:true},{label:"Complete",done:true}],
 aiTriage:{category:"NDA — Standard Mutual",riskFlag:"None — matches standard template 100%",suggestedAssignee:"Auto-Draft Agent",estimatedHours:0,similarMatters:142,confidence:100,routingRule:"RULE-0: Standard NDA → Auto-draft from playbook",source:"regex"}},
{id:"REQ-3405",_source:"seed",_ageHours:3.96,from:"Elena Rossi",dept:"Sales — EU",type:"Compliance Question",priority:"High",submitted:"2026-04-17 07:30",sla:"12 hrs",slaHours:12,slaStatus:"On Track",
 desc:"Client in Germany asking if our AI product complies with EU AI Act. Need a client-ready compliance statement by tomorrow.",
 assigned:"Elena Kraft, EU Counsel",status:"In Review",stage:"review",seeded:true,
 workflow:[{label:"Submitted",done:true},{label:"AI Triage",done:true},{label:"Assigned",done:true},{label:"Drafting",active:true},{label:"GC Approval"},{label:"Complete"}],
 aiTriage:{category:"Regulatory — EU AI Act",riskFlag:"High — client-facing statement requires GC approval",suggestedAssignee:"EU Regulatory Team",estimatedHours:6,similarMatters:5,confidence:92,routingRule:"RULE-4: EU regulatory + client-facing → EU Counsel + GC approval",source:"regex"}},
{id:"REQ-3406",_source:"seed",_ageHours:19.46,from:"Carlos Mendez",dept:"Procurement LATAM",type:"Vendor Due Diligence",priority:"Medium",submitted:"2026-04-16 16:00",sla:"72 hrs",slaHours:72,slaStatus:"On Track",
 desc:"New logistics vendor in Brazil — need sanctions screening, anti-bribery due diligence, and compliance sign-off before onboarding.",
 assigned:"Compliance Team",status:"Screening",stage:"triage",seeded:true,
 workflow:[{label:"Submitted",done:true},{label:"AI Triage",done:true},{label:"Sanctions Screen",done:true},{label:"DD Review",active:true},{label:"Sign-off"}],
 aiTriage:{category:"Vendor DD — High-Risk Jurisdiction",riskFlag:"Medium — Brazil vendor requires enhanced due diligence per policy",suggestedAssignee:"Compliance + Procurement Legal",estimatedHours:8,similarMatters:24,confidence:90,routingRule:"RULE-5: Vendor DD + LATAM → Compliance (enhanced)",source:"regex"}},
{id:"REQ-3407",_source:"seed",_ageHours:0.46,from:"Auto — Slack Bot",dept:"Finance",type:"Contract Question",priority:"Low",submitted:"2026-04-17 12:00",sla:"24 hrs",slaHours:24,slaStatus:"On Track",
 desc:"When does our SAP license renewal deadline hit? Finance needs for Q2 budget planning.",
 assigned:"AI Auto-Answer",status:"Auto-Completed",stage:"complete",seeded:true,
 workflow:[{label:"Received",done:true},{label:"AI Answer",done:true},{label:"Verified",done:true},{label:"Delivered",done:true},{label:"Complete",done:true}],
 aiTriage:{category:"Contract Query — Informational",riskFlag:"None — factual lookup from contract database",suggestedAssignee:"Knowledge Graph Auto-Answer",estimatedHours:0,similarMatters:89,confidence:100,routingRule:"RULE-0: Informational lookup → Auto-answer from Brain",source:"regex"}},
{id:"REQ-3408",_source:"seed",_ageHours:2.71,from:"Priya Nair",dept:"Marketing",type:"Trademark Check",priority:"Medium",submitted:"2026-04-17 08:45",sla:"24 hrs",slaHours:24,slaStatus:"On Track",
 desc:"Need clearance on 'AegisFlow' as product name — US + EU + India. Launch planned for June.",
 assigned:"David Park, IP Lead",status:"Triage",stage:"triage",seeded:true,
 workflow:[{label:"Submitted",done:true},{label:"AI Triage",active:true},{label:"Assigned"},{label:"In Review"},{label:"Complete"}],
 aiTriage:{category:"IP — Trademark Clearance",riskFlag:"Low — routine clearance search",suggestedAssignee:"IP Team",estimatedHours:2,similarMatters:34,confidence:96,routingRule:"RULE-3: IP questions → IP Team lead",source:"regex"}},
{id:"REQ-3409",_source:"seed",_ageHours:5.22,from:"Jens Becker",dept:"Finance DE",type:"Contract Review",priority:"Critical",submitted:"2026-04-17 06:15",sla:"8 hrs",slaHours:8,slaStatus:"At Risk",
 desc:"Emergency — Deutsche Bank loan covenant amendment. €450M facility. CFO presenting to board tomorrow 9am Berlin.",
 assigned:"Unassigned",status:"Triage",stage:"new",seeded:true,
 workflow:[{label:"Submitted",done:true},{label:"AI Triage",active:true},{label:"Assigned"},{label:"In Review"},{label:"Complete"}],
 aiTriage:{category:"Finance — Debt Covenant",riskFlag:"Critical — board-deadline + €450M exposure",suggestedAssignee:"Finance Legal + GC",estimatedHours:10,similarMatters:4,confidence:97,routingRule:"RULE-2: Debt > €100M → Finance Legal + GC review",source:"regex"}},
{id:"REQ-3410",_source:"seed",_ageHours:1.43,from:"Karen Liu",dept:"Product",type:"Privacy Question",priority:"Medium",submitted:"2026-04-17 10:02",sla:"24 hrs",slaHours:24,slaStatus:"On Track",
 desc:"Adding device telemetry to mobile app. Need DPIA if we collect IMEI + approximate location for diagnostic purposes?",
 assigned:"Privacy Team",status:"Assigned",stage:"assigned",seeded:true,
 workflow:[{label:"Submitted",done:true},{label:"AI Triage",done:true},{label:"Assigned",done:true},{label:"In Review"},{label:"Complete"}],
 aiTriage:{category:"Privacy — DPIA",riskFlag:"Medium — device identifiers may constitute personal data under GDPR",suggestedAssignee:"Privacy Team",estimatedHours:5,similarMatters:18,confidence:91,routingRule:"RULE-6: Privacy / DPIA → Privacy Team",source:"regex"}},
];

// ── Agent recommendation helper (used to pre-compute demo recs) ──
const mkRec=(agentId,conf,action,response,reasoning,concerns=[],precedents=[],altTone)=>({
  agentId,confidence:conf,suggestedAction:action,draftedResponse:response,reasoning,
  concerns,precedentLinks:precedents,alternativeTone:altTone||null,
  generatedAt:Date.now(),mock:true,
});

// ── 8 Cockpit-ready tickets with pre-computed recommendations ──
const V8_COCKPIT_SEED=[
{id:"REQ-3501",_source:"form",_ageHours:0.83,from:"James Holloway",dept:"Sales — Enterprise",type:"NDA Request",priority:"Low",submitted:"2026-04-17 11:45",sla:"8 hrs",slaHours:8,slaStatus:"On Track",
 desc:"Mutual NDA needed for early discussions with Acme Corp re. potential strategic partnership. Standard terms. Target signature by EOW.",
 assigned:"Cockpit Queue",status:"Awaiting Triage",stage:"new",seeded:false,
 workflow:[{label:"Submitted",done:true},{label:"Agent Analysis",done:true},{label:"Attorney Review",active:true},{label:"Close"}],
 aiTriage:{category:"NDA — Standard Mutual",riskFlag:"None — 100% template match",suggestedAssignee:"NDA Agent",estimatedHours:0,similarMatters:142,confidence:96,routingRule:"RULE-0",source:"regex"},
 agentRecommendation:mkRec("nda-agent",0.94,"approve-and-send",
   "Hi James,\n\nBased on your request, I've drafted a Standard Mutual NDA with Acme Corp using our approved template (MNDA-v4.2). Key terms:\n\n• 2-year confidentiality period, standard carve-outs\n• Mutual no-solicit for 12 months\n• Delaware law, standard venue clause\n\nI confirmed no prior NDA is on file with Acme (checked ContractAI registry). The document is ready for counterparty review — send to DocuSign with a single click below.\n\nLet me know if you need any modifications before sending.\n\n— AEGIS Legal (auto-drafted, approved by attorney)",
   "Ticket matches RULE-0 template-fit pattern at 100%. No prior NDA with Acme in registry (last check 2026-04-17). No jurisdictional flags. Standard mutual terms apply.",
   [],
   [{id:"NDA-TEMPLATE-v4.2",title:"Standard Mutual NDA Template"},{id:"PRECEDENT-NDA-1189",title:"Recent mutual NDA with similar-sized partner (Globex, Feb 2026)"}],
   "Hi James — NDA ready. Acme, 2-yr mutual, Delaware. DocuSign link attached. Reply if edits needed.")},

{id:"REQ-3502",_source:"form",_ageHours:1.15,from:"Rhea Malhotra",dept:"Finance",type:"Contract Question",priority:"Low",submitted:"2026-04-17 10:40",sla:"24 hrs",slaHours:24,slaStatus:"On Track",
 desc:"What's our standard payment terms policy for new vendor agreements? Need to know for RFP response to Deloitte by Friday.",
 assigned:"Cockpit Queue",status:"Awaiting Triage",stage:"new",seeded:false,
 workflow:[{label:"Submitted",done:true},{label:"Agent Analysis",done:true},{label:"Attorney Review",active:true},{label:"Close"}],
 aiTriage:{category:"Contract FAQ",riskFlag:"None — KB lookup",suggestedAssignee:"FAQ Agent",estimatedHours:0,similarMatters:612,confidence:99,routingRule:"RULE-0",source:"regex"},
 agentRecommendation:mkRec("faq-agent",0.97,"approve-and-send",
   "Hi Rhea,\n\nOur standard payment terms for new vendor agreements are:\n\n• Default: Net 45 from receipt of invoice\n• Net 30 only if counterparty offers ≥2% prompt-pay discount\n• Shorter than Net 30 requires VP Finance written approval\n\nFor your Deloitte RFP: default Net 45 unless they propose the discount. Source: Playbook § 2.4.\n\n— AEGIS Legal Knowledge Graph",
   "Direct match to KB_TOPICS entry for 'standard MSA payment terms' (612 prior resolutions, 99% deflection rate). High confidence factual lookup.",
   [],
   [{id:"KB-PAY-001",title:"Payment Terms Playbook § 2.4"}],
   "Hi Rhea — Net 45 default; Net 30 with ≥2% prompt-pay discount; anything shorter needs VP Finance sign-off. Playbook § 2.4.")},

{id:"REQ-3503",_source:"form",_ageHours:0.56,from:"Dmitri Volkov",dept:"Procurement — APAC",type:"Vendor Due Diligence",priority:"Medium",submitted:"2026-04-17 11:20",sla:"72 hrs",slaHours:72,slaStatus:"On Track",
 desc:"Need onboarding sign-off for a Vietnamese software vendor: Saigon Tech Labs. They'll handle anonymized analytics data. Contract value ~$180K/yr.",
 assigned:"Cockpit Queue",status:"Awaiting Triage",stage:"new",seeded:false,
 workflow:[{label:"Submitted",done:true},{label:"Agent Analysis",done:true},{label:"Attorney Review",active:true},{label:"Close"}],
 aiTriage:{category:"Vendor DD",riskFlag:"Low-Medium — Vietnam vendor + data processing",suggestedAssignee:"Vendor Intake Agent",estimatedHours:4,similarMatters:24,confidence:87,routingRule:"RULE-5",source:"regex"},
 agentRecommendation:mkRec("vendor-intake-agent",0.82,"approve-and-send",
   "Hi Dmitri,\n\nI've run the full onboarding checks on Saigon Tech Labs:\n\n✓ OFAC / EU / UN sanctions — CLEAR (screened 2026-04-17)\n✓ Anti-bribery screen — CLEAR (no FCPA/UK Bribery Act red flags)\n⚠ DPA required — they'll process anonymized analytics; our standard DPA v3.1 covers this\n✓ Refinitiv World-Check — CLEAR\n\nRecommend: approve onboarding with our standard DPA attached. Value ($180K) is below VP Finance threshold.\n\nReady to send onboarding packet.\n\n— AEGIS Vendor Intake",
   "All mandatory screens passed. Data processing scope is limited (anonymized analytics) so standard DPA applies. Vietnam is not a high-risk jurisdiction for this data class under current policy.",
   ["Verify data will remain anonymized post-processing — confirm with Privacy Team if aggregation could re-identify"],
   [{id:"DPA-v3.1",title:"Standard DPA Template v3.1"},{id:"POLICY-VENDOR-APAC",title:"APAC Vendor Onboarding Policy"}],
   "Hi Dmitri — Saigon Tech Labs clears sanctions/ABC/World-Check. Standard DPA attached. Onboarding approved.")},

{id:"REQ-3504",_source:"form",_ageHours:1.96,from:"Aisha Patel",dept:"Marketing",type:"Trademark Check",priority:"Medium",submitted:"2026-04-17 09:55",sla:"24 hrs",slaHours:24,slaStatus:"On Track",
 desc:"Clearance needed on 'QuantumLeap' as product name — planning launch in US + EU + UK + Japan. Fintech product, B2B SaaS.",
 assigned:"Cockpit Queue",status:"Awaiting Triage",stage:"new",seeded:false,
 workflow:[{label:"Submitted",done:true},{label:"Agent Analysis",done:true},{label:"Attorney Review",active:true},{label:"Close"}],
 aiTriage:{category:"IP — Trademark",riskFlag:"Medium — name conflicts likely in fintech",suggestedAssignee:"Trademark Agent",estimatedHours:2,similarMatters:34,confidence:88,routingRule:"RULE-3",source:"regex"},
 agentRecommendation:mkRec("trademark-agent",0.68,"flag-for-review",
   "Hi Aisha,\n\nTrademark clearance search complete. ⚠ The name 'QuantumLeap' has prior registrations that may create conflicts:\n\n• USPTO — 3 live registrations in related classes (Classes 9, 36, 42)\n• EUIPO — 2 live EU registrations (Classes 9, 42) including one by a UK fintech\n• WIPO (Madrid) — 1 international mark covering financial services\n• JPO — 1 active Japanese mark in Class 36\n\nGiven your fintech B2B SaaS positioning, Classes 9, 36, and 42 are directly relevant. I recommend engaging external TM counsel for full clearance opinion before launch.\n\nSuggested alternatives the team may want to explore: QuantumPath, QuantumPivot, LeapQ, Qleap.\n\n— AEGIS Trademark Clearance (memo attached)",
   "USPTO database scan returned 3 live registrations in directly relevant NICE classes (9, 36, 42). Multi-jurisdiction conflicts elevate risk above routine clearance threshold.",
   ["External TM counsel engagement recommended before naming commitment","Do not advise launch without formal clearance opinion","Consider name alternatives"],
   [{id:"TM-USPTO-SCAN-2026-04",title:"USPTO Scan Report"},{id:"TM-EUIPO-SCAN-2026-04",title:"EUIPO Scan Report"}],
   null)},

{id:"REQ-3505",_source:"form",_ageHours:0.28,from:"Marcus Reid",dept:"HR",type:"Legal Question — General",priority:"Medium",submitted:"2026-04-17 12:00",sla:"24 hrs",slaHours:24,slaStatus:"On Track",
 desc:"Can managers require employees to use their personal phones for work communications? Is there a policy we can point them to?",
 assigned:"Cockpit Queue",status:"Awaiting Triage",stage:"new",seeded:false,
 workflow:[{label:"Submitted",done:true},{label:"Agent Analysis",done:true},{label:"Attorney Review",active:true},{label:"Close"}],
 aiTriage:{category:"Policy Q&A",riskFlag:"Low — internal policy lookup",suggestedAssignee:"Policy Q&A Agent",estimatedHours:1,similarMatters:18,confidence:84,routingRule:"RULE-default",source:"regex"},
 agentRecommendation:mkRec("policy-qa-agent",0.79,"approve-and-send",
   "Hi Marcus,\n\nPer Employee Handbook § 8.3 (BYOD Policy) and HR Policy 402:\n\n• Managers may NOT unilaterally require employees to use personal devices for work.\n• Employees may opt-in to BYOD via the BYOD Agreement (HR Portal).\n• For employees who decline BYOD, the company provides a work device on request (SLA: 5 business days).\n• CA/EU employees are entitled to reimbursement for any required personal-device use (Lab. Code § 2802 / Working Time Directive).\n\nIf a manager has expressed such a requirement, please loop in HR Business Partner — that's a policy violation that needs correction.\n\n— AEGIS Policy Desk",
   "Matches internal policy library: BYOD Policy § 8.3 and HR Policy 402 directly govern this scenario. CA/EU exposure flagged per Labor Code § 2802.",
   ["Verify specific facts — if this is a hypothetical vs. an active situation, escalation path differs"],
   [{id:"POLICY-BYOD-v3",title:"BYOD Policy § 8.3"},{id:"POLICY-HR-402",title:"HR Policy 402 — Device Reimbursement"}],
   null)},

{id:"REQ-3506",_source:"form",_ageHours:3.67,from:"Elena Rodriguez",dept:"Engineering",type:"Contract Review",priority:"High",submitted:"2026-04-17 08:20",sla:"24 hrs",slaHours:24,slaStatus:"On Track",
 desc:"Vendor sent their MSA redlines back — 18 pages. Need fast turnaround review of payment terms, liability, and IP clauses. Attached: Snowflake MSA v3 (counterparty draft).",
 assigned:"Cockpit Queue",status:"Awaiting Triage",stage:"new",seeded:false,
 workflow:[{label:"Submitted",done:true},{label:"Agent Analysis",active:true},{label:"Attorney Review"},{label:"Close"}],
 aiTriage:{category:"Contract Review — MSA",riskFlag:"Medium — deep review needed",suggestedAssignee:"Contract Review Agent",estimatedHours:5,similarMatters:27,confidence:74,routingRule:"RULE-7",source:"regex"},
 agentRecommendation:mkRec("contract-review-agent",0.71,"flag-for-review",
   "Hi Elena,\n\nI've done a first-pass scan of the Snowflake MSA v3 redlines. Clause-level summary:\n\n• Payment Terms — they propose Net 30 (vs our Net 45 playbook). Flag.\n• Liability Cap — they cap at 12 months fees (we accept up to 24 months). Acceptable.\n• IP / Derivative Works — clause 8.2 is ambiguous on derivative works created by our engineers. Flag for IP team.\n• Data Processing — their DPA attached, aligns with SCCs. Acceptable.\n• Termination — 30-day for convenience (our minimum). Acceptable.\n\nRecommend: route to Maria Chen (Commercial) for negotiation of payment terms + IP 8.2 language. Full clause-by-clause memo attached.\n\nDEEP ANALYSIS FLAG: Full Contract Intelligence module will handle deep redline diff in v8.1.\n\n— AEGIS Contract Review",
   "Surface scan identified 2 material issues (payment terms, IP 8.2). Full line-by-line analysis requires Contract Intelligence module (shipping v8.1). Current recommendation is routing, not closure.",
   ["Deep redline diff not available yet — Contract Intelligence handoff pending","Payment terms gap needs counter-proposal, not unilateral accept"],
   [{id:"PLAYBOOK-MSA-v2",title:"MSA Playbook § 4 (Payment + IP)"},{id:"PRECEDENT-SNOWFLAKE-2024",title:"Prior Snowflake engagement (2024)"}],
   null)},

{id:"REQ-3507",_source:"copilot",_ageHours:0.13,from:"Priya Kulkarni",dept:"Engineering",type:"Employment Issue",priority:"High",submitted:"2026-04-17 12:12",sla:"12 hrs",slaHours:12,slaStatus:"On Track",
 desc:"A team member has been experiencing pattern of exclusion from meetings by their manager after reporting a concern about overtime. Concerned this might be retaliation.",
 assigned:"Cockpit Queue",status:"Awaiting Triage",stage:"new",seeded:false,
 workflow:[{label:"Submitted (Copilot)",done:true},{label:"Agent Analysis",done:true},{label:"Attorney Review",active:true},{label:"Close"}],
 aiTriage:{category:"Employment — Potential Retaliation",riskFlag:"High — requires sensitive handling",suggestedAssignee:"Rachel Adams, Employment",estimatedHours:10,similarMatters:4,confidence:91,routingRule:"RULE-1",source:"claude"},
 conversation:[
  {role:"assistant",content:"Hi Priya — tell me what's going on and I'll route this to the right person. No judgment, take your time.",ts:Date.now()-780000},
  {role:"user",content:"It's about a teammate. I don't want to get them in trouble but I'm worried about a pattern I'm seeing.",ts:Date.now()-740000},
  {role:"assistant",content:"That's okay — I can take this as an informational report, and we can keep their name out of it for now. What's the pattern you're noticing?",ts:Date.now()-720000,fieldsExtracted:{isReportingForSelf:false,anonymityRequested:true}},
  {role:"user",content:"They raised a concern about us being pushed into a lot of unpaid overtime last month. Since then the manager stopped inviting them to team meetings. I think it's retaliation.",ts:Date.now()-680000},
  {role:"assistant",content:"That's a serious concern — protected activity (raising overtime concerns) followed by adverse treatment is exactly the shape of a retaliation claim. A few quick questions so I can route this correctly:\n\n1. Is the manager a VP or above?\n2. When did the overtime concern get raised (rough date)?\n3. When did the meeting exclusion start?\n\nYou can ballpark.",ts:Date.now()-600000,fieldsExtracted:{concernType:"retaliation",protectedActivity:"overtime-complaint"}},
  {role:"user",content:"Manager is a director, not VP. Overtime complaint was mid-March, maybe 3-4 weeks ago. Meeting exclusion started about a week later.",ts:Date.now()-540000},
  {role:"assistant",content:"Got it. One last question — has your teammate talked to HR directly, or is this something you're flagging on their behalf without their knowledge?",ts:Date.now()-480000,fieldsExtracted:{respondentLevel:"director",timelineWeeks:4}},
  {role:"user",content:"They don't know I'm reporting this. I just don't want it to keep happening.",ts:Date.now()-420000},
  {role:"assistant",content:"Thank you for flagging this. I'm going to file this as a sensitive HR concern — it'll go to Rachel Adams (Employment Lead) who specializes in retaliation matters. She'll decide the right approach given your teammate hasn't initiated themselves. Your name stays confidential.\n\nI've captured:\n• Type: Potential retaliation (protected activity: overtime complaint)\n• Respondent: Director-level manager\n• Timeline: Complaint ~mid-March, adverse pattern ~1 week later\n• Reporting party: Third-party (you), prefers confidentiality\n\nShall I submit?",ts:Date.now()-360000,fieldsExtracted:{ready:true}},
  {role:"user",content:"Yes please submit.",ts:Date.now()-300000},
 ],
 agentRecommendation:mkRec("policy-qa-agent",0.58,"escalate",
   "⚠ SENSITIVE — ATTORNEY MUST HANDLE DIRECTLY\n\nHi Priya,\n\nThank you for flagging this. What you're describing — adverse treatment following a protected complaint about wage-and-hour issues — has the pattern of a potential retaliation claim. Because of the sensitivity and because your teammate hasn't initiated contact themselves, I'm routing this directly to Rachel Adams (Employment Lead) who will decide the right intake approach.\n\nYour name will be kept confidential. You'll hear back from Rachel within 12 hours.\n\nThis intake agent is intentionally not drafting a substantive response — these matters require attorney-led handling.\n\n— AEGIS Legal",
   "Agent confidence is INTENTIONALLY LOW for sensitive employment matters. Retaliation claims require attorney-led investigation per policy. Agent's role here is framing + routing only — never substantive response.",
   ["DO NOT auto-send — escalate to Employment team directly","Third-party report adds complexity: attorney must decide if teammate should be contacted","Preserve all communications (legal hold consideration)"],
   [{id:"POLICY-RETAL-v2",title:"Retaliation Response Protocol"},{id:"PRECEDENT-EMP-2025-03",title:"Similar retaliation triage (2025)"}],
   null)},

{id:"REQ-3508",_source:"form",_ageHours:2.05,from:"Nikhil Shah",dept:"Corporate Development",type:"Legal Question — General",priority:"Medium",submitted:"2026-04-17 09:48",sla:"24 hrs",slaHours:24,slaStatus:"On Track",
 desc:"How does our data-sharing policy work for potential acquisition targets during due diligence? Need to send a financial model to target's advisors under NDA.",
 assigned:"Cockpit Queue",status:"Awaiting Triage",stage:"new",seeded:false,
 workflow:[{label:"Submitted",done:true},{label:"Agent Analysis",done:true},{label:"Attorney Review",active:true},{label:"Close"}],
 aiTriage:{category:"Policy Q&A — M&A",riskFlag:"Medium — confidential-info disclosure",suggestedAssignee:"Policy Q&A Agent",estimatedHours:2,similarMatters:9,confidence:76,routingRule:"RULE-default",source:"regex"},
 agentRecommendation:mkRec("policy-qa-agent",0.74,"approve-and-send",
   "Hi Nikhil,\n\nPer M&A Confidentiality Policy § 5.2:\n\n• Data Room → Confidential Info tier: requires executed NDA (use M&A NDA template, not general MNDA).\n• Financial models → 'Highly Confidential' tier: additional clean-team protocol applies.\n• Send via secure data room (Intralinks/Datasite), not email.\n• Track access logs — required for audit trail.\n\nFor your specific case: M&A NDA (v2.3) + data-room upload is the right path. Don't email directly.\n\nI can generate the M&A NDA draft if you'd like — just confirm counterparty name and target.\n\n— AEGIS Policy Desk",
   "Matches M&A confidentiality policy § 5.2. Financial model falls in 'Highly Confidential' tier per data classification schema.",
   ["Confirm counterparty not on any competitive-sensitive list before upload","Clean-team designation may be needed"],
   [{id:"POLICY-MA-v2.3",title:"M&A Confidentiality Policy § 5.2"},{id:"TEMPLATE-MA-NDA-v2.3",title:"M&A NDA Template v2.3"}],
   "Hi Nikhil — Use M&A NDA (v2.3) + data room (Intralinks/Datasite), not email. Financial models are 'Highly Confidential' tier. Policy § 5.2.")},
];

// ── 5 NDA bulk-demo tickets — all ready for bulk approval ──
const V8_BULK_NDA_SEED=(() => {
  const counterparties=["Globex Industries","Initech Solutions","Umbrella Corp","Soylent Group","Wayne Enterprises"];
  const requesters=[
    {from:"Alex Kim",dept:"Sales — Enterprise"},
    {from:"Maya Chen",dept:"Partnerships"},
    {from:"Ryan O'Brien",dept:"Corp Dev"},
    {from:"Sofia Ramirez",dept:"BD"},
    {from:"Nathan Webb",dept:"Strategy"},
  ];
  return counterparties.map((cp,i)=>({
    id:"REQ-"+(3601+i),_source:"form",_ageHours:0.3+i*.15,
    from:requesters[i].from,dept:requesters[i].dept,type:"NDA Request",priority:"Low",
    submitted:"2026-04-17 11:4"+i,sla:"8 hrs",slaHours:8,slaStatus:"On Track",
    desc:`Standard mutual NDA for early-stage discussions with ${cp}. 2-year term, mutual, Delaware law. Target signature this week.`,
    assigned:"Cockpit Queue",status:"Awaiting Triage",stage:"new",seeded:false,
    workflow:[{label:"Submitted",done:true},{label:"Agent Analysis",done:true},{label:"Attorney Review",active:true},{label:"Close"}],
    aiTriage:{category:"NDA — Standard Mutual",riskFlag:"None — 100% template match",suggestedAssignee:"NDA Agent",estimatedHours:0,similarMatters:142,confidence:96,routingRule:"RULE-0",source:"regex"},
    agentRecommendation:mkRec("nda-agent",0.95,"approve-and-send",
      `Hi ${requesters[i].from.split(" ")[0]},\n\nStandard Mutual NDA with ${cp} drafted from template MNDA-v4.2:\n• 2-year confidentiality, standard carve-outs\n• Mutual no-solicit 12 months\n• Delaware law\n\nNo prior NDA on file with ${cp}. Ready for DocuSign.\n\n— AEGIS Legal (auto-drafted)`,
      `Template-fit 100%. No prior NDA with ${cp} in registry. RULE-0 match.`,
      [],
      [{id:"NDA-TEMPLATE-v4.2",title:"Standard Mutual NDA Template"}],
      `Hi ${requesters[i].from.split(" ")[0]} — NDA ready, ${cp}, 2-yr mutual. DocuSign link attached.`),
  }));
})();

const V8_SEED=[...V72_SEED,...V8_COCKPIT_SEED,...V8_BULK_NDA_SEED];


// ═════════════ s4_claude.jsx ═════════════
// ══════════════════════════════════════════════════
// CLAUDE API CLIENT — strict JSON mode with fallbacks
// ══════════════════════════════════════════════════

const CLAUDE_MODEL="claude-sonnet-4-20250514";
const CLAUDE_ENDPOINT="https://api.anthropic.com/v1/messages";

// Strip accidental markdown fences, then parse
function parseJSONLoose(text){
  if(!text) throw new Error("Empty response");
  let raw=text.trim();
  // Strip ```json ... ``` wrappers
  raw=raw.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"");
  // Find first { or [ and last matching brace to salvage output with leading/trailing prose
  const firstBrace=Math.min(...[raw.indexOf("{"),raw.indexOf("[")].filter(i=>i>=0).concat([Infinity]));
  if(firstBrace===Infinity) throw new Error("No JSON structure found");
  const lastClose=Math.max(raw.lastIndexOf("}"),raw.lastIndexOf("]"));
  if(lastClose<firstBrace) throw new Error("Unbalanced JSON");
  raw=raw.slice(firstBrace,lastClose+1);
  return JSON.parse(raw);
}

async function callClaude(prompt,opts={}){
  const {maxTokens=1000,system,timeout=18000}=opts;
  const body={model:CLAUDE_MODEL,max_tokens:maxTokens,messages:[{role:"user",content:prompt}]};
  if(system) body.system=system;
  const ctrl=typeof AbortController!=="undefined"?new AbortController():null;
  const timer=ctrl?setTimeout(()=>ctrl.abort(),timeout):null;
  try{
    const resp=await fetch(CLAUDE_ENDPOINT,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body),
      signal:ctrl?ctrl.signal:undefined,
    });
    if(!resp.ok){
      const errBody=await resp.text().catch(()=>"");
      throw new Error(`Claude API ${resp.status}: ${errBody.slice(0,200)}`);
    }
    const data=await resp.json();
    const textBlock=(data.content||[]).find(b=>b.type==="text");
    if(!textBlock) throw new Error("No text block in response");
    return textBlock.text;
  } finally {
    if(timer) clearTimeout(timer);
  }
}

async function callClaudeJSON(prompt,opts={}){
  const text=await callClaude(prompt,opts);
  try{ return parseJSONLoose(text); }
  catch(e){
    throw new Error(`JSON parse failed: ${e.message}. Raw (first 300): ${text.slice(0,300)}`);
  }
}

// ══════════════════════════════════════════════════
// v7.2 triage (kept here for standalone file to run;
// on splice, delete this block and reuse v7.2's functions)
// ══════════════════════════════════════════════════

function classifyIntakeRegex(text,dept){
  const t=(text||"").toLowerCase();
  if(!t||t.length<10) return null;
  if(/harass|discriminat|retaliation|misconduct|wrongful.{1,10}(termination|firing)/.test(t))
    return{cat:"Employment — Sensitive",priority:"Critical",team:"Employment Team + GC",sla:"4 hrs",slaHours:4,rule:"RULE-1",conf:98,risk:"Critical",note:"Auto-escalated to GC per policy",hrs:20,source:"regex"};
  if(/\bnda\b|non.{0,3}disclosure|confidentiality/.test(t)&&!/breach|violated/.test(t))
    return{cat:"NDA — Standard",priority:"Low",team:"AI Auto-Draft",sla:"2 hrs",slaHours:2,rule:"RULE-0",conf:96,risk:"None",note:"Auto-draft from playbook template",hrs:0,source:"regex"};
  if(/(loan|debt|covenant|facility|credit agreement).*(m|b)(illion)?/i.test(t)||(/€\d+|\$\d+m|\$\d+b/i.test(t)&&/(loan|covenant|debt|financing)/.test(t)))
    return{cat:"Finance — Debt / Covenant",priority:"High",team:"Finance Legal + GC",sla:"8 hrs",slaHours:8,rule:"RULE-2",conf:93,risk:"High",note:"Board-level exposure — GC review required",hrs:10,source:"regex"};
  if(/patent|trademark|copyright|open.{0,3}source|oss|inventorship/.test(t))
    return{cat:"IP / Trademark / OSS",priority:"Medium",team:"IP Team — David Park",sla:"24 hrs",slaHours:24,rule:"RULE-3",conf:91,risk:"Low",note:"Routine IP clearance",hrs:3,source:"regex"};
  if(/\bgdpr\b|dpia|personal data|privacy|telemetry|imei|biometric/.test(t))
    return{cat:"Privacy — DPIA / GDPR",priority:"Medium",team:"Privacy Team",sla:"24 hrs",slaHours:24,rule:"RULE-6",conf:89,risk:"Medium",note:"DPIA may be required",hrs:5,source:"regex"};
  if(/sanction|ofac|iran|russia|north korea|embarg|denied party/.test(t))
    return{cat:"Compliance — Sanctions",priority:"Critical",team:"Compliance + GC",sla:"4 hrs",slaHours:4,rule:"RULE-8",conf:99,risk:"Critical",note:"Auto-hold pending screen",hrs:12,source:"regex"};
  if(/ai act|regulatory.{0,20}statement|client.{0,10}facing.{0,10}compliance|eu.{0,20}regulation/.test(t))
    return{cat:"Regulatory — EU",priority:"High",team:"EU Counsel + GC",sla:"12 hrs",slaHours:12,rule:"RULE-4",conf:88,risk:"High",note:"Client-facing requires GC sign-off",hrs:6,source:"regex"};
  if(/vendor|msa|supplier|procurement.*contract|saas|subscription/.test(t)&&/\$|€|£|\d{3,}k|\d+.?m/i.test(t))
    return{cat:"Vendor Contract",priority:"High",team:"Commercial Contracts — Maria Chen",sla:"24 hrs",slaHours:24,rule:"RULE-7",conf:87,risk:"Medium",note:"Size threshold triggers GDPR check",hrs:4,source:"regex"};
  if(/vendor.*(brazil|china|russia|india|mexico|indonesia|vietnam)|\bdd\b|due diligence/.test(t))
    return{cat:"Vendor DD",priority:"Medium",team:"Compliance Team",sla:"72 hrs",slaHours:72,rule:"RULE-5",conf:85,risk:"Medium",note:"Enhanced DD per jurisdiction policy",hrs:8,source:"regex"};
  return null;
}


// ═════════════ s5_agents.jsx ═════════════
// ══════════════════════════════════════════════════
// AGENT LAYER (System 3)
// ══════════════════════════════════════════════════
// Agents are conservative by default: they produce recommendations.
// They NEVER close tickets autonomously. Every close is attorney-initiated.
// Each agent: { id, name, shortName, icon, canHandle(ticket), process(ticket) }.
// process() returns a Recommendation object (schema below).
//
// Recommendation schema:
//   { agentId, confidence (0..1), suggestedAction, draftedResponse,
//     reasoning, precedentLinks[], concerns[], alternativeTone, generatedAt }
//
// Confidence thresholds (from v8 spec):
//   ≥0.90 → HIGH         (badge green)
//   0.70–0.90 → MEDIUM   (badge amber)
//   <0.70 → REVIEW CAREFULLY (badge red)

// Helper for building recommendations uniformly
function buildRec(agentId,{confidence,suggestedAction,draftedResponse,reasoning,concerns=[],precedentLinks=[],alternativeTone=null,mock=false}){
  return {
    agentId,confidence,suggestedAction,draftedResponse,reasoning,
    concerns,precedentLinks,alternativeTone,
    generatedAt:Date.now(),mock,
  };
}

// ── Minimal KB (mirrors v7.2 KB_TOPICS) ──
const AGENT_KB=[
  {q:"Can I share this document with a vendor?",triggers:[/share|disclose|send.*document/],answer:"Yes, if the vendor has a signed NDA on file (check Brain) and the document is not marked Highly Confidential. For Highly Confidential, use the clean-room workflow.",source:"Playbook § 3.1"},
  {q:"What's our standard MSA payment term?",triggers:[/payment.{0,10}term|net.{0,3}(30|45|60)/],answer:"Net 45 from receipt of invoice. Net 30 only if counterparty offers ≥2% prompt-pay discount. Anything shorter requires VP Finance approval.",source:"Playbook § 2.4"},
  {q:"Do I need legal review for a standard NDA?",triggers:[/\bnda\b|non.{0,3}disclosure/],answer:"No. Use the Self-Serve NDA generator — it picks the right template (mutual/one-way/evaluation) and auto-fills counterparty info. Only escalate if there are non-standard clauses.",source:"Playbook § 1.2"},
  {q:"When does our vendor contract with [X] expire?",triggers:[/\bexpir|renewal.{0,10}date|when.{0,10}(does|will).{0,20}expire/],answer:"Aurora reads the contract registry and returns expiry, renewal terms, and current notice period.",source:"Contract Registry"},
  {q:"Is this vendor on any sanctions list?",triggers:[/sanction|ofac|denied party/],answer:"Paste vendor legal name into the Sanctions Screen widget — checks OFAC, EU, UK, UN lists in real time.",source:"Sanctions Screen"},
  {q:"What's our data retention period for customer data?",triggers:[/retention|retain.*data|how long.*keep/],answer:"7 years from contract termination, except EU (3 years + 2 years warranty). Financial records: 10 years per SOX.",source:"Privacy Notice § 7"},
];

function matchAgentKB(text){
  const t=(text||"").toLowerCase();
  for(const item of AGENT_KB){
    if(item.triggers.some(re=>re.test(t))) return item;
  }
  return null;
}

// Mock registry lookups — in prod, these would call the real ContractAI / Sanctions / Policy APIs
function mockPriorNDACheck(counterparty){
  const has=(counterparty||"").toLowerCase();
  if(has.includes("acme")) return {found:true,ndaId:"NDA-2026-02-14-ACME",expires:"2028-02-14",note:"Active mutual NDA on file — consider reusing."};
  return {found:false,note:"No prior NDA on file with this counterparty."};
}
function mockSanctionsCheck(counterparty,jurisdiction){
  const name=(counterparty||"").toLowerCase();
  if(/iran|north korea|crimea/.test((jurisdiction||"").toLowerCase())) return {clear:false,flags:["Jurisdiction on restricted list"]};
  if(/huawei|zte|sberbank/.test(name)) return {clear:false,flags:["Entity appears on OFAC SDN / sectoral lists"]};
  return {clear:true,checkedLists:["OFAC","EU Consolidated","UK OFSI","UN","Refinitiv World-Check"]};
}

// ══════════════════════════════════════════════════
// AGENT 1 — NDA Agent (fully wired)
// ══════════════════════════════════════════════════
const NDAAgent={
  id:"nda-agent",
  name:"NDA Agent",
  shortName:"NDA",
  icon:"◉",
  description:"Drafts standard mutual & one-way NDAs from playbook templates. Checks for prior NDAs with counterparty. Recommends template reuse when possible.",

  canHandle(ticket){
    const cat=(ticket.aiTriage?.category||"").toLowerCase();
    const type=(ticket.type||"").toLowerCase();
    const d=(ticket.desc||"").toLowerCase();
    return /nda/.test(cat)||/nda/.test(type)||(/\bnda\b|non.{0,3}disclosure|mutual.{0,5}confidentiality/.test(d)&&!/breach|violat/.test(d));
  },

  async process(ticket){
    // Extract counterparty heuristically
    const descMatch=(ticket.desc||"").match(/(?:with|for)\s+([A-Z][A-Za-z0-9& ]{2,40}?)(?:\s+(?:re\.|regarding|for|by|$|,|\.|\n))/);
    const counterparty=descMatch?descMatch[1].trim():null;
    const priorNDA=mockPriorNDACheck(counterparty||"");
    const name=(ticket.from||"").split(" ")[0]||"there";

    // Use Claude for the drafted response if API available, else fall back to template
    let draftedResponse=null,confidence=0.92,reasoning=null;
    try{
      const prompt=`You are the NDA Agent for AEGIS Legal Mission Control. A legal intake ticket has arrived requesting a Non-Disclosure Agreement.

TICKET:
- Requester: ${ticket.from} (${ticket.dept})
- Description: "${ticket.desc}"
- Extracted counterparty: ${counterparty||"NOT FOUND — ask requester"}

PRIOR NDA CHECK:
${priorNDA.found?`FOUND — ${priorNDA.note}`:`NOT FOUND — draft new from template MNDA-v4.2`}

PLAYBOOK TEMPLATE: MNDA-v4.2 (2-year term, standard carve-outs, mutual no-solicit 12 months, Delaware law).

Draft a professional, confident response (as if sent from a senior paralegal) confirming what you've done and next steps. Mention the template version, key terms, the prior-NDA check result, and say the doc is ready for DocuSign. Address the requester by first name. 130-180 words.

Also produce a one-sentence alternative tone (shorter, more casual).

Respond with ONLY this JSON:
{"draftedResponse":"full response text with line breaks using \\n","alternativeTone":"one-line shorter version","confidence":0.92,"reasoning":"one-line why this recommendation is safe","concerns":["any concerns the attorney should see, or empty array"]}`;

      const result=await callClaudeJSON(prompt,{maxTokens:700});
      draftedResponse=result.draftedResponse;
      confidence=result.confidence||0.92;
      reasoning=result.reasoning;
      return buildRec(this.id,{
        confidence,suggestedAction:"approve-and-send",
        draftedResponse,reasoning:reasoning||`Template-fit match (MNDA-v4.2). Prior NDA check: ${priorNDA.found?"reuse existing":"new draft"}.`,
        concerns:result.concerns||[],
        precedentLinks:[{id:"NDA-TEMPLATE-v4.2",title:"Standard Mutual NDA Template"},...(priorNDA.found?[{id:priorNDA.ndaId,title:`Prior NDA with ${counterparty||"counterparty"} (active)`}]:[])],
        alternativeTone:result.alternativeTone||null,
      });
    }catch(e){
      // Fallback: template response
      const fallback=`Hi ${name},\n\nI've drafted a Standard Mutual NDA${counterparty?` with ${counterparty}`:""} using our approved template (MNDA-v4.2):\n\n• 2-year confidentiality, standard carve-outs\n• Mutual no-solicit (12 months)\n• Delaware law, standard venue\n\n${priorNDA.found?`Note: ${priorNDA.note}`:"No prior NDA on file — this is a fresh draft."}\n\nReady for DocuSign. Reply if you need edits.\n\n— AEGIS Legal (auto-drafted)`;
      return buildRec(this.id,{
        confidence:0.88,suggestedAction:"approve-and-send",draftedResponse:fallback,
        reasoning:`Template-fit match. Claude API unavailable — used playbook template directly.`,
        concerns:["Claude draft unavailable — using template text. Attorney may want to personalize."],
        precedentLinks:[{id:"NDA-TEMPLATE-v4.2",title:"Standard Mutual NDA Template"}],
        alternativeTone:counterparty?`Hi ${name} — NDA ready, ${counterparty}, 2-yr mutual. DocuSign attached.`:null,
        mock:true,
      });
    }
  },
};

// ══════════════════════════════════════════════════
// AGENT 2 — FAQ Agent (fully wired)
// ══════════════════════════════════════════════════
const FAQAgent={
  id:"faq-agent",
  name:"FAQ Agent",
  shortName:"FAQ",
  icon:"◈",
  description:"Answers common legal questions directly from the knowledge base. High-deflection, high-confidence lookups.",

  canHandle(ticket){
    if(!matchAgentKB(ticket.desc)) return false;
    // Don't handle if another specialist agent should take it (NDA request with counterparty specified, etc.)
    const d=(ticket.desc||"").toLowerCase();
    if(/draft|prepare|create|need.{0,10}nda.{0,10}for|with.{1,30}(inc|corp|ltd|llc|gmbh)/.test(d)) return false;
    return true;
  },

  async process(ticket){
    const kb=matchAgentKB(ticket.desc);
    const name=(ticket.from||"").split(" ")[0]||"there";
    if(!kb){
      return buildRec(this.id,{
        confidence:0.30,suggestedAction:"flag-for-review",draftedResponse:"",
        reasoning:"No KB match on second pass. Route to manual triage.",
        concerns:["FAQ agent fired but no KB match — unusual. Recommend manual triage."],
      });
    }

    try{
      const prompt=`You are the FAQ Agent for AEGIS Legal. A requester has asked a question that maps to a knowledge-base entry.

TICKET:
- Requester: ${ticket.from} (${ticket.dept})
- Question: "${ticket.desc}"

KB ANSWER (verbatim from ${kb.source}):
"${kb.answer}"

Draft a warm, professional response that:
1. Addresses ${name} by first name
2. Directly answers the question using the KB entry (paraphrase cleanly, don't just copy)
3. Cites the source (${kb.source})
4. Offers follow-up if they have a specific situation
5. Under 120 words

Respond with ONLY this JSON:
{"draftedResponse":"full response with \\n line breaks","alternativeTone":"one-line TL;DR version","confidence":0.95,"reasoning":"why this answer is correct","concerns":[]}`;

      const result=await callClaudeJSON(prompt,{maxTokens:500});
      return buildRec(this.id,{
        confidence:result.confidence||0.95,
        suggestedAction:"approve-and-send",
        draftedResponse:result.draftedResponse,
        reasoning:result.reasoning||`Direct KB match. Source: ${kb.source}.`,
        concerns:result.concerns||[],
        precedentLinks:[{id:`KB-${kb.source.replace(/\W+/g,"-")}`,title:kb.source}],
        alternativeTone:result.alternativeTone||null,
      });
    }catch(e){
      const fallback=`Hi ${name},\n\n${kb.answer}\n\nSource: ${kb.source}.\n\nReply if you have a specific situation that doesn't fit the standard answer.\n\n— AEGIS Legal Knowledge Graph`;
      return buildRec(this.id,{
        confidence:0.88,suggestedAction:"approve-and-send",draftedResponse:fallback,
        reasoning:`Direct KB match. Source: ${kb.source}. Claude API unavailable — used KB entry directly.`,
        concerns:["Used raw KB answer — attorney may want to personalize."],
        precedentLinks:[{id:`KB-${kb.source.replace(/\W+/g,"-")}`,title:kb.source}],
        mock:true,
      });
    }
  },
};

// ══════════════════════════════════════════════════
// AGENT 3 — Vendor Intake Agent (mocked screens, Claude-drafted response)
// ══════════════════════════════════════════════════
const VendorIntakeAgent={
  id:"vendor-intake-agent",
  name:"Vendor Intake Agent",
  shortName:"Vendor",
  icon:"⬡",
  description:"Runs sanctions screen, DPA review, anti-bribery check on new vendors. Produces an onboarding recommendation with full check trail.",

  canHandle(ticket){
    const cat=(ticket.aiTriage?.category||"").toLowerCase();
    const type=(ticket.type||"").toLowerCase();
    return /vendor.{0,5}(dd|due diligence|onboarding|intake)/.test(cat)||/vendor.{0,5}due/.test(type);
  },

  async process(ticket){
    // Extract counterparty from description
    const cpMatch=(ticket.desc||"").match(/(?:vendor|supplier|counterparty):?\s*([A-Z][A-Za-z0-9& ]{2,40}?)(?:[,.\n]|$)/)
      ||(ticket.desc||"").match(/([A-Z][A-Za-z0-9&]{2,}(?:\s+[A-Z][A-Za-z0-9&]{1,}){0,3}?)\s+(?:in|from|\()/);
    const counterparty=cpMatch?cpMatch[1].trim():null;
    const jurMatch=(ticket.desc||"").match(/\b(Brazil|China|Vietnam|India|Russia|Iran|Mexico|Indonesia|Germany|France|UK|US|Singapore|Japan)\b/i);
    const jurisdiction=jurMatch?jurMatch[1]:null;

    const sanctions=mockSanctionsCheck(counterparty||"",jurisdiction||"");

    // If sanctions fail, escalate
    if(!sanctions.clear){
      return buildRec(this.id,{
        confidence:0.92,suggestedAction:"escalate",
        draftedResponse:`⚠ VENDOR ONBOARDING HOLD — SANCTIONS EXPOSURE\n\nThe vendor ${counterparty||"(unnamed)"} has failed automated screening:\n\n${sanctions.flags.map(f=>"• "+f).join("\n")}\n\nOnboarding is paused pending Compliance + GC review. Do NOT proceed.\n\n— AEGIS Vendor Intake`,
        reasoning:`Sanctions screen failed: ${sanctions.flags.join("; ")}. Mandatory escalation per RULE-8.`,
        concerns:["Sanctions exposure — do not auto-approve under any circumstances","Escalate to Compliance + GC"],
        precedentLinks:[{id:"RULE-8",title:"Sanctions Escalation Policy"}],
      });
    }

    // Clean path — Claude drafts the success response
    try{
      const prompt=`You are the Vendor Intake Agent for AEGIS. A vendor onboarding request needs a response.

TICKET:
- Requester: ${ticket.from} (${ticket.dept})
- Description: "${ticket.desc}"
- Extracted vendor: ${counterparty||"[not clearly stated]"}
- Jurisdiction: ${jurisdiction||"[not stated]"}

AUTOMATED CHECKS (ALL CLEAR):
✓ OFAC / EU / UN sanctions screen
✓ Refinitiv World-Check
✓ Anti-bribery (FCPA / UK Bribery Act)
✓ DPA required (our standard DPA v3.1 covers this scope)

Draft a professional onboarding confirmation to the requester:
1. First-name greeting
2. List the checks that passed (use ✓)
3. Note that DPA v3.1 is attached
4. State it's approved for onboarding
5. 120-180 words

Also identify 1-2 concerns the attorney should review before approving.

Respond with ONLY this JSON:
{"draftedResponse":"...","alternativeTone":"TL;DR","confidence":0.85,"reasoning":"...","concerns":["..."]}`;

      const result=await callClaudeJSON(prompt,{maxTokens:600});
      return buildRec(this.id,{
        confidence:result.confidence||0.82,
        suggestedAction:"approve-and-send",
        draftedResponse:result.draftedResponse,
        reasoning:result.reasoning||`All sanctions/ABC checks clear. Standard DPA applies.`,
        concerns:result.concerns||[],
        precedentLinks:[{id:"DPA-v3.1",title:"Standard DPA Template v3.1"},{id:"POLICY-VENDOR",title:"Vendor Onboarding Policy"}],
        alternativeTone:result.alternativeTone||null,
      });
    }catch(e){
      const name=(ticket.from||"").split(" ")[0]||"there";
      return buildRec(this.id,{
        confidence:0.78,suggestedAction:"approve-and-send",
        draftedResponse:`Hi ${name},\n\nVendor screens complete${counterparty?` for ${counterparty}`:""}:\n\n✓ OFAC / EU / UN sanctions — CLEAR\n✓ Refinitiv World-Check — CLEAR\n✓ Anti-bribery (FCPA / UK Bribery Act) — CLEAR\n✓ DPA v3.1 applies\n\nApproved for onboarding.\n\n— AEGIS Vendor Intake`,
        reasoning:`All automated screens clear. Claude unavailable — used template response.`,
        concerns:["Attorney may want to personalize for specific data-scope questions."],
        precedentLinks:[{id:"DPA-v3.1",title:"Standard DPA Template v3.1"}],
        mock:true,
      });
    }
  },
};

// ══════════════════════════════════════════════════
// AGENT 4 — Contract Review Agent (mocked — v8.1 handoff)
// ══════════════════════════════════════════════════
const ContractReviewAgent={
  id:"contract-review-agent",
  name:"Contract Review Agent",
  shortName:"Contract",
  icon:"◐",
  description:"First-pass clause analysis on incoming contract redlines. Full deep analysis handoff to Contract Intelligence module (v8.1).",

  canHandle(ticket){
    const cat=(ticket.aiTriage?.category||"").toLowerCase();
    const d=(ticket.desc||"").toLowerCase();
    return (/contract.{0,5}review|\bmsa\b|sow|redline/.test(cat)||/contract.{0,5}review/.test(ticket.type?.toLowerCase()||""))
      &&!/\bnda\b/.test(d); // NDAs go to NDA Agent
  },

  async process(ticket){
    const name=(ticket.from||"").split(" ")[0]||"there";
    // v8.1 handoff placeholder — still produces a recommendation
    return buildRec(this.id,{
      confidence:0.62,suggestedAction:"flag-for-review",
      draftedResponse:`Hi ${name},\n\nI've done a first-pass surface scan of the contract. Initial observations:\n\n• Standard clauses present (payment, liability, termination)\n• Items flagged for deeper review: payment terms vs playbook, IP/derivative-works language\n• Full line-by-line redline analysis requires the Contract Intelligence module (shipping v8.1)\n\nRouting to Maria Chen (Commercial Contracts) for detailed review. Expected turnaround: 4 hours.\n\n— AEGIS Contract Review (v8.0 first-pass)`,
      reasoning:`Contract Intelligence module (deep clause diff, playbook-to-current comparison) not yet wired in v8.0. Current recommendation is triage + routing, not closure.`,
      concerns:["Deep clause-level analysis not available — Contract Intelligence module handoff pending in v8.1","Recommendation is routing only, not substantive review"],
      precedentLinks:[{id:"PLAYBOOK-MSA-v2",title:"MSA Playbook"}],
      alternativeTone:null,
      mock:true,
    });
  },
};

// ══════════════════════════════════════════════════
// AGENT 5 — Trademark Clearance Agent (mocked multi-jurisdiction scan)
// ══════════════════════════════════════════════════
const TrademarkAgent={
  id:"trademark-agent",
  name:"Trademark Clearance Agent",
  shortName:"Trademark",
  icon:"◇",
  description:"Runs USPTO / EUIPO / WIPO / JPO trademark searches. Produces clearance memo with conflict ranking.",

  canHandle(ticket){
    const cat=(ticket.aiTriage?.category||"").toLowerCase();
    const type=(ticket.type||"").toLowerCase();
    const d=(ticket.desc||"").toLowerCase();
    return /trademark/.test(cat)||/trademark/.test(type)||/trademark.{0,5}(clear|check|search)/.test(d);
  },

  async process(ticket){
    const name=(ticket.from||"").split(" ")[0]||"there";
    const nameMatch=(ticket.desc||"").match(/['"]([^'"]{3,30})['"]/);
    const proposedName=nameMatch?nameMatch[1]:"the proposed name";
    // Mock: randomly generate some conflicts for demo feel
    const hasConflicts=((ticket.desc||"").length%3)!==0; // deterministic-per-ticket
    if(hasConflicts){
      return buildRec(this.id,{
        confidence:0.66,suggestedAction:"flag-for-review",
        draftedResponse:`Hi ${name},\n\nTrademark clearance search on '${proposedName}' complete. ⚠ Conflicts found:\n\n• USPTO — 2 live registrations in related NICE classes\n• EUIPO — 1 live EU mark in Class 9\n• WIPO Madrid — 1 international mark overlapping scope\n\nRecommend engaging external TM counsel for full clearance opinion before naming commitment.\n\n— AEGIS Trademark Clearance (memo attached)`,
        reasoning:`Mock scan returned conflicts across USPTO / EUIPO / WIPO. Confidence intentionally below 0.70 to force attorney review — trademark decisions should not be algorithm-driven.`,
        concerns:["Trademark clearance below 70% confidence threshold","External TM counsel recommended for any multi-jurisdiction conflict","Do not advise launch without formal clearance opinion"],
        precedentLinks:[{id:"TM-SCAN-SUMMARY",title:"Multi-Jurisdiction TM Scan Report"}],
        alternativeTone:null,
        mock:true,
      });
    }
    return buildRec(this.id,{
      confidence:0.86,suggestedAction:"approve-and-send",
      draftedResponse:`Hi ${name},\n\nTrademark clearance search on '${proposedName}' complete. Result: CLEAR across USPTO / EUIPO / WIPO / JPO in targeted NICE classes.\n\n• No live registrations that pose immediate conflict\n• Recommend proceeding with filing in US + EU + key markets\n• External TM counsel can draft filings once product class is finalized\n\n— AEGIS Trademark Clearance`,
      reasoning:`Multi-jurisdiction scan returned clean. No conflicts in relevant NICE classes.`,
      concerns:["Clearance is preliminary — formal filing requires TM counsel sign-off"],
      precedentLinks:[{id:"TM-SCAN-CLEAN",title:"Clearance Scan Report"}],
      alternativeTone:null,
      mock:true,
    });
  },
};

// ══════════════════════════════════════════════════
// AGENT 6 — Policy Q&A Agent (mocked policy library)
// ══════════════════════════════════════════════════
const POLICY_LIBRARY=[
  {triggers:[/byod|personal.{0,5}device|personal.{0,5}phone/],policy:"BYOD Policy § 8.3",answer:"Managers may not unilaterally require personal devices. Employees may opt-in to BYOD; otherwise company issues work device (5 business days). CA/EU employees entitled to reimbursement per Lab. Code § 2802."},
  {triggers:[/m&a|merger|acquisition|data.{0,5}room|diligence.{0,10}share/],policy:"M&A Confidentiality Policy § 5.2",answer:"Data Room → Confidential: executed M&A NDA. Financial models → 'Highly Confidential': clean-team protocol. Send via secure data room, track access logs."},
  {triggers:[/travel.{0,5}(reimburs|expense)|per.{0,5}diem/],policy:"Travel & Expense Policy § 3",answer:"Per diem varies by location tier. Receipts required over $25. Entertainment requires pre-approval. See T&E portal for rates."},
  {triggers:[/remote.{0,5}work|work.{0,5}from.{0,5}home|hybrid.{0,5}policy/],policy:"Remote Work Policy § 6",answer:"Hybrid default: 3 days in-office, 2 remote. Full-remote requires role + manager approval. Cross-border remote (different tax jurisdiction) requires Legal + Tax approval."},
  {triggers:[/data.{0,5}retention|how long.{0,5}keep|delete.{0,5}(customer|user)/],policy:"Data Retention Policy § 2",answer:"7 years post-termination for customer data. EU: 3 years + 2 years warranty. Financial: 10 years per SOX. Personal access requests honored per GDPR/CCPA."},
];

function matchPolicy(text){
  const t=(text||"").toLowerCase();
  for(const p of POLICY_LIBRARY){
    if(p.triggers.some(re=>re.test(t))) return p;
  }
  return null;
}

const PolicyQAAgent={
  id:"policy-qa-agent",
  name:"Policy Q&A Agent",
  shortName:"Policy",
  icon:"◎",
  description:"Answers internal policy questions from the policy library. Defers sensitive matters (employment, harassment) to specialist teams.",

  canHandle(ticket){
    // Hand off sensitive employment to the Employment team explicitly (no agent auto-drafts)
    const cat=(ticket.aiTriage?.category||"").toLowerCase();
    if(/harassment|discriminat|retaliation/.test(cat)) return true; // handle but with low confidence → escalate
    return matchPolicy(ticket.desc)!==null;
  },

  async process(ticket){
    const name=(ticket.from||"").split(" ")[0]||"there";
    const cat=(ticket.aiTriage?.category||"").toLowerCase();

    // Sensitive employment: intentionally low confidence, escalation path
    if(/harassment|discriminat|retaliation/.test(cat)){
      return buildRec(this.id,{
        confidence:0.55,suggestedAction:"escalate",
        draftedResponse:`⚠ SENSITIVE MATTER — ATTORNEY HANDLING REQUIRED\n\nHi ${name},\n\nThis request describes a sensitive employment matter (potential retaliation / harassment pattern). I'm not drafting a substantive response — these matters require attorney-led investigation.\n\nRouting directly to Rachel Adams (Employment Lead). You'll hear back within 12 hours.\n\n— AEGIS Legal`,
        reasoning:"Sensitive employment matter. Agent confidence is INTENTIONALLY low per policy — these tickets must be attorney-handled.",
        concerns:["Do not auto-send","Third-party reports of retaliation require specialist attorney review","Consider legal hold / preservation obligations"],
        precedentLinks:[{id:"POLICY-RETAL-v2",title:"Retaliation Response Protocol"}],
        alternativeTone:null,
      });
    }

    const policy=matchPolicy(ticket.desc);
    if(!policy){
      return buildRec(this.id,{
        confidence:0.35,suggestedAction:"flag-for-review",draftedResponse:"",
        reasoning:"No policy library match on second pass.",
        concerns:["Manual triage recommended — no policy match"],
      });
    }

    try{
      const prompt=`You are the Policy Q&A Agent. Draft a response to an internal policy question.

TICKET:
- Requester: ${ticket.from} (${ticket.dept})
- Question: "${ticket.desc}"

POLICY MATCH: ${policy.policy}
POLICY ANSWER: "${policy.answer}"

Draft a warm, professional response:
1. First-name greeting (${name})
2. Cite ${policy.policy} explicitly
3. Restate the answer in context of their question (don't just paste)
4. Offer follow-up if their situation doesn't fit the standard
5. 100-160 words

Respond with ONLY this JSON:
{"draftedResponse":"...","alternativeTone":"TL;DR","confidence":0.82,"reasoning":"...","concerns":[]}`;

      const result=await callClaudeJSON(prompt,{maxTokens:500});
      return buildRec(this.id,{
        confidence:result.confidence||0.82,
        suggestedAction:"approve-and-send",
        draftedResponse:result.draftedResponse,
        reasoning:result.reasoning||`Policy match: ${policy.policy}.`,
        concerns:result.concerns||[],
        precedentLinks:[{id:`POLICY-${policy.policy.replace(/\W+/g,"-")}`,title:policy.policy}],
        alternativeTone:result.alternativeTone||null,
      });
    }catch(e){
      return buildRec(this.id,{
        confidence:0.78,suggestedAction:"approve-and-send",
        draftedResponse:`Hi ${name},\n\nPer ${policy.policy}: ${policy.answer}\n\nIf your specific situation doesn't fit the standard answer, reply and I'll loop in the right specialist.\n\n— AEGIS Policy Desk`,
        reasoning:`Policy match: ${policy.policy}. Claude unavailable — used policy text directly.`,
        concerns:["Used raw policy text — attorney may want to personalize."],
        precedentLinks:[{id:`POLICY-${policy.policy.replace(/\W+/g,"-")}`,title:policy.policy}],
        mock:true,
      });
    }
  },
};

// ══════════════════════════════════════════════════
// AGENT REGISTRY + ROUTER
// ══════════════════════════════════════════════════
const ALL_AGENTS=[NDAAgent,FAQAgent,VendorIntakeAgent,ContractReviewAgent,TrademarkAgent,PolicyQAAgent];
const AGENTS_BY_ID=Object.fromEntries(ALL_AGENTS.map(a=>[a.id,a]));

// Route a ticket to the best-fit agent. Order matters: more specific agents first.
// Returns the agent or null.
function routeToAgent(ticket,enabledSettings){
  const order=[NDAAgent,VendorIntakeAgent,TrademarkAgent,ContractReviewAgent,FAQAgent,PolicyQAAgent];
  for(const a of order){
    if(enabledSettings&&enabledSettings[a.id]&&enabledSettings[a.id].enabled===false) continue;
    if(a.canHandle(ticket)) return a;
  }
  return null;
}

// Run the router against a ticket and log the result
async function processTicketWithAgent(ticket,settings){
  const agent=routeToAgent(ticket,settings);
  if(!agent){
    await appendAgentLog({type:"no-agent-match",ticketId:ticket.id,desc:(ticket.desc||"").slice(0,80)});
    return {agent:null,recommendation:null};
  }
  try{
    const rec=await agent.process(ticket);
    await appendAgentLog({type:"recommendation-generated",ticketId:ticket.id,agentId:agent.id,confidence:rec.confidence,action:rec.suggestedAction});
    return {agent,recommendation:rec};
  }catch(e){
    await appendAgentLog({type:"agent-error",ticketId:ticket.id,agentId:agent.id,error:String(e).slice(0,200)});
    // Produce a visible low-confidence recommendation so the ticket doesn't silently fail
    return {agent,recommendation:buildRec(agent.id,{
      confidence:0.25,suggestedAction:"flag-for-review",draftedResponse:"",
      reasoning:`Agent ${agent.name} encountered an error. Manual triage recommended.`,
      concerns:["Agent processing failed — see audit log for details"],
    })};
  }
}


// ═════════════ s6_copilot_engine.jsx ═════════════
// ══════════════════════════════════════════════════
// INTAKE COPILOT ENGINE (System 1)
// ══════════════════════════════════════════════════
// Conversational intake: chat UI that coexists with the v7.2 form.
// Each user turn → Claude returns {message, fieldsExtracted, ready, readyReason}.
// State object tracks structured fields as they're extracted.
// On "ready", Copilot emits a ticket with _source:"copilot" and transcript attached.

// Initial state template — fields Copilot tries to extract
const COPILOT_INITIAL_STATE=()=>({
  requestType:null,         // "NDA Request" | "Contract Review" | etc.
  counterparty:null,        // "Acme Corp"
  value:null,               // "$2M" | "€450M"
  jurisdiction:null,        // "Germany" | "Delaware"
  urgency:null,             // "Standard" | "Urgent" | "Emergency"
  documentType:null,        // "MSA" | "NDA" | "DPA"
  keyTerms:null,            // freeform
  requesterRole:null,       // role of requester if given
  sensitiveFlags:[],        // e.g. ["retaliation","harassment"] — gates auto-drafting
  isReportingForSelf:null,
  anonymityRequested:null,
  concernType:null,
  protectedActivity:null,
  respondentLevel:null,
  timelineWeeks:null,
  topicSwitchDetected:false,
});

// Topic-type mapping — used when deciding if Copilot thinks topic has switched
const TOPIC_TYPES=["NDA Request","Contract Review","IP Question","Employment Issue","Privacy Question","Regulatory","Vendor Due Diligence","Litigation / Dispute","Policy Question","Other"];

// Seed message shown when chat opens — varies by initial type pick
function initialAssistantMessage(type){
  const byType={
    "Employment Issue":"Hi — sorry you're dealing with something. Tell me what's going on, I'll keep it confidential and route it to the right person. No judgment.",
    "Regulatory":"Hi — a regulatory or compliance question. Tell me what's happening and I'll help structure the right intake. Include the jurisdiction and deadline if you know them.",
    "Litigation / Dispute":"Hi — a potential dispute or litigation matter. Give me the shape of what's happening. I'll keep the intake tight and route it quickly.",
    "Vendor Due Diligence":"Hi — a vendor onboarding or diligence question. Tell me who the vendor is, the scope, and any jurisdictional context you have.",
    "Other":"Hi — tell me what's going on and I'll figure out where it needs to go. Be as detailed or brief as you like.",
    "I'm not sure":"Hi — no worries, we can figure it out together. Tell me what's on your mind and I'll help shape this into the right intake.",
  };
  return byType[type]||byType["Other"];
}

// ── Copilot turn (Pattern A) ──
async function copilotTurn({history,state,ticketType,requester}){
  const unknownFields=Object.entries(state).filter(([k,v])=>v===null||(Array.isArray(v)&&v.length===0)).map(([k])=>k).filter(k=>!["topicSwitchDetected","isReportingForSelf","anonymityRequested","concernType","protectedActivity","respondentLevel","timelineWeeks","sensitiveFlags"].includes(k));

  const histBlock=history.map(m=>`${m.role==="user"?"USER":"AGENT"}: ${m.content}`).join("\n");

  const prompt=`You are the AEGIS Intake Copilot — a warm, intelligent legal intake agent for a Fortune 50 General Counsel's office. You're talking to an employee (requester) who has a legal need.

Your job across the conversation:
1. Understand what they need
2. Extract structured fields as they come up
3. Know when you have enough to file a ticket
4. Be concise, human, and professional

CURRENT REQUEST TYPE (as selected at start): ${ticketType||"not specified"}
REQUESTER: ${requester||"(name not provided)"}

CURRENT STRUCTURED STATE (what's already extracted):
${JSON.stringify(state,null,2)}

FIELDS STILL UNKNOWN (if any are critical for this request type, ask about them):
${unknownFields.length?unknownFields.join(", "):"(none — consider ready)"}

CONVERSATION SO FAR:
${histBlock||"(this is the first turn)"}

GUIDELINES:
- For SIMPLE requests (NDA, standard vendor question, FAQ lookup), you only need: requestType, counterparty (if applicable), urgency. Don't over-ask.
- For COMPLEX requests (employment, regulatory, disputes), tread gently. Open-ended questions first. Don't interrogate.
- For SENSITIVE topics (harassment, retaliation, discrimination): acknowledge, don't promise outcomes, do not give legal advice, do not draft substantive responses — your job is intake only.
- DETECT TOPIC SWITCHES: if the user starts on NDA but pivots to e.g. an employment concern, set topicSwitchDetected:true and ask a single clarifying question like "That sounds like a separate concern — want me to file this as a new ticket about [new topic] instead?" — do NOT silently continue.
- When you have enough (request type + core who/what/urgency for the request type), set ready:true. Don't be greedy.
- One or two follow-up questions per turn, not four.

Respond with ONLY this JSON (no markdown, no prose, no backticks):
{
  "message": "your natural-language response (shown in chat)",
  "fieldsExtracted": { "field1": "value", ... },
  "ready": false,
  "readyReason": "one sentence — what's still missing, or 'have enough to file'",
  "topicSwitchDetected": false,
  "topicSwitchTo": null
}

Only include fieldsExtracted keys where you're pulling in a NEW or UPDATED value. Omit fields you don't have. "message" must be friendly and under 70 words.`;

  try{
    const result=await callClaudeJSON(prompt,{maxTokens:700});
    return {
      message:result.message||"(no response)",
      fieldsExtracted:result.fieldsExtracted||{},
      ready:!!result.ready,
      readyReason:result.readyReason||"",
      topicSwitchDetected:!!result.topicSwitchDetected,
      topicSwitchTo:result.topicSwitchTo||null,
      _error:null,
    };
  }catch(e){
    return {
      message:"Sorry — the Copilot hit a snag. Can you try rephrasing, or switch to the structured form using the toggle above?",
      fieldsExtracted:{},ready:false,readyReason:"copilot error",
      topicSwitchDetected:false,topicSwitchTo:null,
      _error:e.message,
    };
  }
}

// Merge a fieldsExtracted patch into state
function mergeState(state,patch){
  const next={...state};
  for(const[k,v]of Object.entries(patch||{})){
    if(v==null||v===""||(Array.isArray(v)&&v.length===0)) continue;
    if(Array.isArray(state[k])){
      // Merge arrays uniquely
      const seen=new Set(state[k]);
      v.forEach(x=>seen.add(x));
      next[k]=Array.from(seen);
    } else {
      next[k]=v;
    }
  }
  return next;
}

// Create a v8 ticket from a completed Copilot conversation
function createCopilotTicket({state,transcript,type,requester,dept,priority}){
  const now=new Date();
  const id="REQ-"+(4000+Math.floor(Math.random()*999));
  const desc=transcript.filter(m=>m.role==="user").map(m=>m.content).join(" ").slice(0,500);
  // Build a synthetic aiTriage from the conversation state
  const regex=classifyIntakeRegex(desc,dept||"");
  const triage=regex||{
    cat:state.requestType||type||"General Inquiry",
    priority:priority||"Medium",team:"Triage Queue",sla:"24 hrs",slaHours:24,
    rule:"RULE-default",conf:70,risk:"Medium",note:"Copilot-generated intake",hrs:2,source:"copilot",
  };
  const priFinal=priority||triage.priority||"Medium";

  return {
    id,
    _source:"copilot",
    from:requester||"(via Copilot)",
    dept:dept||"Unspecified",
    type:state.requestType||type||"Other",
    priority:priFinal,
    submitted:now.toISOString().slice(0,16).replace("T"," "),
    submittedTs:now.getTime(),
    sla:triage.sla,slaHours:triage.slaHours,slaStatus:"On Track",
    desc,
    assigned:"Cockpit Queue",
    status:"Awaiting Triage",stage:"new",seeded:false,
    workflow:[
      {label:"Submitted (Copilot)",done:true},
      {label:"Agent Analysis",active:true},
      {label:"Attorney Review"},
      {label:"Close"},
    ],
    aiTriage:{
      category:triage.cat,
      riskFlag:`${triage.risk} — ${triage.note}`,
      suggestedAssignee:triage.team,
      estimatedHours:triage.hrs,
      similarMatters:Math.floor(Math.random()*40)+5,
      confidence:triage.conf,
      routingRule:`${triage.rule}: ${triage.cat}`,
      source:triage.source||"copilot",
    },
    conversation:transcript,
    conversationState:state,
    agentRecommendation:null, // will be populated by agent layer
    triagedBy:null,triagedAt:null,triagedAction:null,agentProcessedAt:null,
  };
}

// ══════════════════════════════════════════════════
// SIMILAR MATTERS — local fuzzy retrieval (Pattern C)
// ══════════════════════════════════════════════════
// Given a ticket, find top-3 closest resolved matters from the store.
// Scoring: category match (3pts) + type match (2pts) + shared words in desc (1pt each capped 5)

function tokenize(t){
  return (t||"").toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(w=>w.length>3&&!["with","that","from","this","need","have","the","and","for","are","was","will","our"].includes(w));
}

function findSimilarMatters(ticket,allTickets,limit=3){
  const myWords=new Set(tokenize(ticket.desc));
  const myCat=ticket.aiTriage?.category||"";
  const myType=ticket.type||"";
  const scored=allTickets
    .filter(t=>t.id!==ticket.id&&(t.stage==="complete"||t.status==="Auto-Completed"||t.status==="Completed"||t.triagedAction==="approved"))
    .map(t=>{
      const otherWords=tokenize(t.desc);
      const overlap=otherWords.filter(w=>myWords.has(w)).length;
      let score=0;
      if((t.aiTriage?.category||"")===myCat) score+=3;
      if((t.type||"")===myType) score+=2;
      score+=Math.min(overlap,5);
      return {t,score,overlap};
    })
    .filter(x=>x.score>=2)
    .sort((a,b)=>b.score-a.score)
    .slice(0,limit);

  const now=Date.now();
  return scored.map(({t,score})=>({
    id:t.id,
    desc:(t.desc||"").slice(0,100)+((t.desc||"").length>100?"…":""),
    similarity:Math.min(Math.round((score/10)*100),99),
    resolvedDaysAgo:Math.max(1,Math.floor((now-(t.submittedTs||now))/86400000)),
    resolution:t.status==="Auto-Completed"?"Auto-resolved":t.triagedAction==="approved"?`Approved via ${t.triagedBy||"Cockpit"}`:t.status||"Resolved",
    category:t.aiTriage?.category||t.type,
    assigned:t.assigned,
  }));
}


// ═════════════ s7_hooks.jsx ═════════════
// ══════════════════════════════════════════════════
// HOOKS — shared across Copilot, Agents, Cockpit
// ══════════════════════════════════════════════════

// Extended useTicketStore. v7's hook gives: tickets, loading, addTicket, updateTicket, resetToSeed.
// v8 additionally exposes: addTicketAndRunAgent, recordTriageAction, bulkApprove.
function useTicketStore(agentSettings){
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

// ── Agent settings hook ──
function useAgentSettings(){
  const[settings,setSettings]=useState(DEFAULT_AGENT_SETTINGS);
  const[loaded,setLoaded]=useState(false);
  useEffect(()=>{
    loadAgentSettings().then(s=>{setSettings(s);setLoaded(true);});
  },[]);
  const toggle=useCallback(async(id)=>{
    const next={...settings,[id]:{enabled:!(settings[id]?.enabled!==false)}};
    setSettings(next);
    await saveAgentSettings(next);
  },[settings]);
  return {settings,toggle,loaded};
}

// ── Cockpit state hook ──
function useCockpitState(){
  const[state,setState]=useState(DEFAULT_COCKPIT_STATE);
  const[loaded,setLoaded]=useState(false);
  useEffect(()=>{
    loadCockpitState().then(s=>{setState(s);setLoaded(true);});
  },[]);
  const update=useCallback(async(patch)=>{
    const next={...state,...patch};
    setState(next);
    await saveCockpitState(next);
  },[state]);
  const incrementTriaged=useCallback(async()=>{
    const today=new Date().toISOString().slice(0,10);
    const next={...state,triagedToday:(state.triagedDate===today?state.triagedToday:0)+1,triagedDate:today};
    setState(next);
    await saveCockpitState(next);
  },[state]);
  return {state,update,incrementTriaged,loaded};
}

// ── Agent log live-view hook (polls on interval) ──
function useAgentLog(){
  const[log,setLog]=useState([]);
  useEffect(()=>{
    let mounted=true;
    const load=()=>loadAgentLog().then(l=>{if(mounted)setLog(l);});
    load();
    const t=setInterval(load,5000);
    return()=>{mounted=false;clearInterval(t);};
  },[]);
  return log;
}

// ── Keyboard shortcuts hook ──
// handlers: { [key: string]: (event) => void }
// enabled: boolean — disables entirely (e.g. when not on Cockpit tab)
function useKeyboardShortcuts(handlers,enabled=true){
  const handlersRef=useRef(handlers);
  handlersRef.current=handlers;
  useEffect(()=>{
    if(!enabled||typeof document==="undefined") return;
    const onKeydown=(e)=>{
      // Skip when typing in inputs/textareas/selects/contenteditable
      const tn=e.target?.tagName;
      if(tn==="INPUT"||tn==="TEXTAREA"||tn==="SELECT") return;
      if(e.target?.isContentEditable) return;
      // Skip modifier-key combos (cmd/ctrl/alt) except for handlers that explicitly want them
      if(e.metaKey||e.ctrlKey||e.altKey) return;

      // Build key string: handle arrows + letter keys
      let k=e.key;
      if(k==="ArrowDown") k="ArrowDown";
      else if(k==="ArrowUp") k="ArrowUp";
      else k=k.length===1?k.toLowerCase():k;

      const h=handlersRef.current[k];
      if(h){ e.preventDefault(); h(e); }
    };
    document.addEventListener("keydown",onKeydown);
    return()=>document.removeEventListener("keydown",onKeydown);
  },[enabled]);
}


// ═════════════ s8_copilot_ui.jsx ═════════════
// ══════════════════════════════════════════════════
// COPILOT UI (System 1 — chat)
// ══════════════════════════════════════════════════

// Type picker gate — shown at top of New Request tab
// Splits simple vs complex request types into Form path vs Copilot path.
const SIMPLE_TYPES=[
  {id:"NDA Request",icon:"◉",hint:"Standard NDA — template fit"},
  {id:"Contract Question",icon:"◈",hint:"FAQ-style lookup"},
  {id:"Vendor Due Diligence",icon:"⬡",hint:"Standard vendor onboarding"},
  {id:"IP Question",icon:"◇",hint:"Trademark / OSS / patent"},
  {id:"Privacy Question",icon:"◎",hint:"DPIA / GDPR question"},
  {id:"Contract Review",icon:"◐",hint:"Known contract type"},
];
const COMPLEX_TYPES=[
  {id:"Employment Issue",icon:"⚠",hint:"Sensitive — HR / Employment matter",sensitive:true},
  {id:"Regulatory",icon:"§",hint:"Novel or evolving regulatory question"},
  {id:"Litigation / Dispute",icon:"⚡",hint:"Potential dispute or claim"},
  {id:"Other",icon:"◌",hint:"Doesn't fit above"},
  {id:"I'm not sure",icon:"?",hint:"Talk it through with me"},
];

function TypePickerGate({onPickSimple,onPickComplex}){
  return <div style={{maxWidth:920,margin:"0 auto"}}>
    <div style={{fontSize:11,fontWeight:600,color:C.cy,letterSpacing:1.8,textTransform:"uppercase",fontFamily:M,marginBottom:8}}>How would you like to file this?</div>
    <div style={{fontSize:16,fontFamily:SR,color:C.t1,lineHeight:1.4,marginBottom:20}}>Pick a <em style={{color:C.cy,fontStyle:"italic"}}>simple request type</em> for the fast structured form, or start a <em style={{color:C.cy,fontStyle:"italic"}}>conversation with the Copilot</em> for complex or ambiguous matters.</div>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:8}}>
      <div style={{background:C.cd,border:`1px solid ${C.br}`,borderLeft:`3px solid ${C.tl}`,borderRadius:6,padding:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div>
            <div style={{fontSize:10,fontFamily:M,color:C.tl,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:3}}>FAST PATH · STRUCTURED FORM</div>
            <div style={{fontSize:14,color:C.t1,fontFamily:SR,lineHeight:1.3}}>When you know exactly what you need</div>
          </div>
          <Pill t="v7.2 FORM" c={C.tl}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
          {SIMPLE_TYPES.map(t=><div key={t.id} onClick={()=>onPickSimple(t.id)} style={{padding:10,border:`1px solid ${C.br}`,borderRadius:4,cursor:"pointer",transition:"all .12s",background:C.s1}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.tl;e.currentTarget.style.background=C.tlG}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.br;e.currentTarget.style.background=C.s1}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}><span style={{fontSize:13,color:C.tl}}>{t.icon}</span><span style={{fontSize:11.5,color:C.t1,fontWeight:600}}>{t.id}</span></div>
            <div style={{fontSize:9.5,color:C.t3,fontFamily:M}}>{t.hint}</div>
          </div>)}
        </div>
      </div>

      <div style={{background:C.cd,border:`1px solid ${C.br}`,borderLeft:`3px solid ${C.em}`,borderRadius:6,padding:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div>
            <div style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:3}}>SMART PATH · COPILOT CHAT</div>
            <div style={{fontSize:14,color:C.t1,fontFamily:SR,lineHeight:1.3}}>When you're not sure what you need</div>
          </div>
          <Pill t="v8 NEW" c={C.em}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
          {COMPLEX_TYPES.map(t=><div key={t.id} onClick={()=>onPickComplex(t.id)} style={{padding:10,border:`1px solid ${t.sensitive?C.am+"66":C.br}`,borderRadius:4,cursor:"pointer",transition:"all .12s",background:C.s1}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.em;e.currentTarget.style.background=C.emG}} onMouseLeave={e=>{e.currentTarget.style.borderColor=t.sensitive?C.am+"66":C.br;e.currentTarget.style.background=C.s1}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}><span style={{fontSize:13,color:t.sensitive?C.am:C.em}}>{t.icon}</span><span style={{fontSize:11.5,color:C.t1,fontWeight:600}}>{t.id}</span></div>
            <div style={{fontSize:9.5,color:C.t3,fontFamily:M}}>{t.hint}</div>
          </div>)}
        </div>
      </div>
    </div>

    <div style={{padding:12,background:C.s1,borderRadius:5,borderLeft:`2px solid ${C.cy}`,fontSize:10.5,color:C.t2,fontFamily:M,lineHeight:1.55,letterSpacing:.2}}>
      <span style={{color:C.cy,fontWeight:600}}>Either path works.</span> You can switch between form and chat at any time — we'll carry your progress across.
    </div>
  </div>;
}

// ══════════════════════════════════════════════════
// CopilotChat — the conversational intake UI
// ══════════════════════════════════════════════════
function CopilotChat({initialType,onFiled,onSwitchToForm,store,settings}){
  const[state,setState]=useState(()=>({...COPILOT_INITIAL_STATE(),requestType:initialType}));
  const[history,setHistory]=useState(()=>[{role:"assistant",content:initialAssistantMessage(initialType),ts:Date.now()}]);
  const[input,setInput]=useState("");
  const[thinking,setThinking]=useState(false);
  const[ready,setReady]=useState(false);
  const[readyReason,setReadyReason]=useState("");
  const[topicSwitchPending,setTopicSwitchPending]=useState(null);
  const[apiError,setApiError]=useState(null);
  const[submitting,setSubmitting]=useState(false);
  const[filedTicket,setFiledTicket]=useState(null);
  const[requesterName,setRequesterName]=useState("");
  const[requesterDept,setRequesterDept]=useState("Product");
  const scrollRef=useRef(null);
  const inputRef=useRef(null);

  useEffect(()=>{
    if(scrollRef.current){ scrollRef.current.scrollTop=scrollRef.current.scrollHeight; }
  },[history,thinking]);

  useEffect(()=>{
    if(inputRef.current&&!filedTicket) inputRef.current.focus();
  },[filedTicket,thinking]);

  const send=async()=>{
    if(!input.trim()||thinking||submitting) return;
    const userMsg={role:"user",content:input.trim(),ts:Date.now()};
    const nextHistory=[...history,userMsg];
    setHistory(nextHistory);
    setInput("");
    setThinking(true);
    setApiError(null);

    const result=await copilotTurn({
      history:nextHistory,state,ticketType:initialType,
      requester:requesterName||"(not provided)",
    });

    if(result._error){ setApiError(result._error); }

    const nextState=mergeState(state,result.fieldsExtracted||{});
    // Stamp topic-switch flag into state
    if(result.topicSwitchDetected&&result.topicSwitchTo){ nextState.topicSwitchDetected=true; }
    setState(nextState);

    const assistantMsg={role:"assistant",content:result.message,ts:Date.now(),fieldsExtracted:result.fieldsExtracted};
    setHistory([...nextHistory,assistantMsg]);
    setReady(result.ready);
    setReadyReason(result.readyReason||"");
    if(result.topicSwitchDetected&&result.topicSwitchTo){
      setTopicSwitchPending(result.topicSwitchTo);
    }
    setThinking(false);
  };

  const confirmTopicSwitch=(acceptSwitch)=>{
    if(acceptSwitch){
      // Reset: new conversation around the new topic
      const newType=topicSwitchPending;
      setState({...COPILOT_INITIAL_STATE(),requestType:newType});
      setHistory([{role:"assistant",content:`Got it — switching this over. ${initialAssistantMessage(newType)}`,ts:Date.now()}]);
      setReady(false);setReadyReason("");
    } else {
      // Stay on current topic
      setHistory(h=>[...h,{role:"assistant",content:"Understood — sticking with the original topic. Continue.",ts:Date.now()}]);
    }
    setTopicSwitchPending(null);
  };

  const submit=async(overrideReady)=>{
    if(submitting) return;
    if(!requesterName.trim()){ alert("Please enter your name before submitting."); return; }
    setSubmitting(true);
    try{
      const transcript=history.map(m=>({role:m.role,content:m.content,ts:m.ts,...(m.fieldsExtracted?{fieldsExtracted:m.fieldsExtracted}:{})}));
      const ticket=createCopilotTicket({
        state,transcript,type:initialType,
        requester:requesterName,dept:requesterDept,
        priority:state.urgency==="Emergency"?"Critical":state.urgency==="Urgent"?"High":null,
      });
      const {ticket:saved,agent,recommendation}=await store.addTicketAndRunAgent(ticket);
      await saveConversation(saved.id,transcript);
      setFiledTicket({...saved,_agent:agent,_rec:recommendation});
      if(onFiled) onFiled(saved);
    }catch(e){
      setApiError("Failed to file: "+e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Extracted fields to display in the sidebar (filtering out nulls and meta)
  const visibleFields=Object.entries(state).filter(([k,v])=>v!==null&&v!==""&&!["topicSwitchDetected","sensitiveFlags"].includes(k)&&!(Array.isArray(v)&&v.length===0));

  if(filedTicket){
    return <div style={{maxWidth:820,margin:"0 auto"}}>
      <div style={{background:C.gnG,border:`1px solid ${C.gn}`,borderLeft:`4px solid ${C.gn}`,padding:20,marginBottom:14,animation:"fu .4s ease"}}>
        <div style={{fontSize:11,fontFamily:M,color:C.gn,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>✓ COPILOT INTAKE FILED · PERSISTED</div>
        <div style={{fontSize:20,fontFamily:SR,color:C.t1,marginBottom:4}}>Ticket <span style={{color:C.gn,fontFamily:M}}>{filedTicket.id}</span> filed from conversation</div>
        <div style={{fontSize:12,color:C.t2,lineHeight:1.6}}>
          {filedTicket._agent?<>Routed to <span style={{color:C.pp,fontWeight:600}}>{filedTicket._agent.name}</span> · Recommendation generated ({Math.round((filedTicket._rec?.confidence||0)*100)}% confidence) · </>:<>No matching agent — will land in Cockpit for manual triage · </>}
          Full transcript ({filedTicket.conversation?.length||0} messages) attached to ticket.
        </div>
      </div>
      <Card>
        <div style={{fontSize:11,fontWeight:600,color:C.cy,letterSpacing:1.2,textTransform:"uppercase",fontFamily:M,marginBottom:10}}>What happens next</div>
        <div style={{fontSize:12,color:C.t2,lineHeight:1.7}}>
          Your conversation has been filed as a structured ticket. An attorney will review the agent's recommendation in the Triage Cockpit — every close is a human decision. You'll hear back within your SLA window ({filedTicket.sla}).
        </div>
        <div style={{display:"flex",gap:8,marginTop:14}}>
          <div onClick={()=>window.location.reload()} style={{padding:"9px 16px",border:`1px solid ${C.br}`,color:C.t2,fontSize:10,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase"}}>File Another</div>
        </div>
      </Card>
    </div>;
  }

  return <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14,maxWidth:1100,margin:"0 auto"}}>
    {/* Left: chat */}
    <div>
      <div style={{background:C.cd,border:`1px solid ${C.br}`,borderLeft:`3px solid ${C.em}`,borderRadius:6,padding:12,marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <Dot c={C.em} p/>
            <span style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600}}>INTAKE COPILOT</span>
            <span style={{fontSize:10,color:C.t3,fontFamily:M}}>· Initial type: {initialType}</span>
          </div>
          <div onClick={onSwitchToForm} style={{padding:"4px 10px",border:`1px solid ${C.br}`,color:C.t3,fontSize:9.5,fontFamily:M,letterSpacing:1.2,cursor:"pointer",textTransform:"uppercase"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.tl;e.currentTarget.style.color=C.tl}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.br;e.currentTarget.style.color=C.t3}}>⇄ Switch to form</div>
        </div>
      </div>

      {/* Requester identity — required before submission */}
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:8,marginBottom:10}}>
        <input value={requesterName} onChange={e=>setRequesterName(e.target.value)} placeholder="Your name (required)" style={{...inputStyle,fontSize:11}}/>
        <select value={requesterDept} onChange={e=>setRequesterDept(e.target.value)} style={{...inputStyle,fontSize:11}}>
          {["Product","Engineering","Sales","HR","Finance","Procurement","Marketing","Operations","Legal","Executive"].map(d=><option key={d} value={d} style={{background:C.s1}}>{d}</option>)}
        </select>
      </div>

      <div ref={scrollRef} style={{background:C.cd,border:`1px solid ${C.br}`,borderRadius:6,padding:14,height:440,overflowY:"auto"}}>
        {history.map((m,i)=><ChatBubble key={i} role={m.role} d={i*30} meta={m.fieldsExtracted?`+ extracted: ${Object.keys(m.fieldsExtracted).join(", ")}`:null}>{m.content}</ChatBubble>)}
        {thinking&&<div style={{display:"flex",justifyContent:"flex-start",marginBottom:10}}>
          <div style={{padding:"10px 13px",background:C.cd,border:`1px solid ${C.br}`,borderLeft:`2px solid ${C.cy}`,borderRadius:"2px 8px 8px 8px"}}>
            <div style={{fontSize:8.5,fontFamily:M,color:C.cy,letterSpacing:1.5,textTransform:"uppercase",marginBottom:3,fontWeight:600}}>◎ COPILOT · THINKING</div>
            <TypingDots/>
          </div>
        </div>}
      </div>

      {topicSwitchPending&&<div style={{marginTop:10,padding:12,background:C.amG,border:`1px solid ${C.am}`,borderLeft:`3px solid ${C.am}`,borderRadius:5}}>
        <div style={{fontSize:10,fontFamily:M,color:C.am,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:5}}>⚠ TOPIC SWITCH DETECTED</div>
        <div style={{fontSize:11.5,color:C.t1,lineHeight:1.5,marginBottom:8}}>It looks like the conversation has shifted to <span style={{color:C.am,fontWeight:600}}>{topicSwitchPending}</span>. Want me to file this as a new ticket on that topic instead, or stick with the original?</div>
        <div style={{display:"flex",gap:8}}>
          <div onClick={()=>confirmTopicSwitch(true)} style={{padding:"6px 12px",background:C.am+"22",border:`1px solid ${C.am}`,color:C.am,fontSize:10,fontFamily:M,letterSpacing:1.2,cursor:"pointer",textTransform:"uppercase",fontWeight:600}}>Switch topic · Reset</div>
          <div onClick={()=>confirmTopicSwitch(false)} style={{padding:"6px 12px",border:`1px solid ${C.br}`,color:C.t2,fontSize:10,fontFamily:M,letterSpacing:1.2,cursor:"pointer",textTransform:"uppercase"}}>Stay on topic</div>
        </div>
      </div>}

      {apiError&&<div style={{marginTop:10,padding:10,background:C.rdG,borderLeft:`2px solid ${C.rd}`,fontSize:10.5,color:C.t2,fontFamily:M}}>API: {apiError}</div>}

      <div style={{marginTop:10,display:"flex",gap:8,alignItems:"stretch"}}>
        <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder="Type your message — press Enter to send, Shift+Enter for newline" rows={2} style={{...inputStyle,resize:"none",fontFamily:F,minHeight:52,flex:1}}/>
        <div onClick={send} style={{padding:"0 18px",background:input.trim()&&!thinking?C.cy:C.br,color:input.trim()&&!thinking?C.bg:C.t4,fontSize:11,fontFamily:M,letterSpacing:1.5,cursor:input.trim()&&!thinking?"pointer":"not-allowed",textTransform:"uppercase",fontWeight:600,display:"flex",alignItems:"center",whiteSpace:"nowrap"}}>{thinking?"…":"↵ Send"}</div>
      </div>

      {ready&&!filedTicket&&<div style={{marginTop:12,padding:12,background:C.gnG,border:`1px solid ${C.gn}`,borderLeft:`3px solid ${C.gn}`,borderRadius:5}}>
        <div style={{fontSize:10,fontFamily:M,color:C.gn,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:5}}>✓ COPILOT READY TO FILE</div>
        <div style={{fontSize:11.5,color:C.t2,lineHeight:1.5,marginBottom:8}}>{readyReason||"Enough information captured to file this as a structured ticket."}</div>
        <div style={{display:"flex",gap:8}}>
          <div onClick={()=>submit(true)} style={{padding:"7px 14px",background:C.gn,color:C.bg,fontSize:10.5,fontFamily:M,letterSpacing:1.5,cursor:submitting?"wait":"pointer",textTransform:"uppercase",fontWeight:700}}>{submitting?"Filing…":"→ File Ticket"}</div>
          <div onClick={()=>setReady(false)} style={{padding:"7px 12px",border:`1px solid ${C.br}`,color:C.t2,fontSize:10,fontFamily:M,letterSpacing:1.2,cursor:"pointer",textTransform:"uppercase"}}>Keep chatting</div>
        </div>
      </div>}

      {/* Always-available escape hatch */}
      {!ready&&history.length>2&&!filedTicket&&<div style={{marginTop:10,textAlign:"center"}}>
        <span onClick={()=>submit(false)} style={{fontSize:9.5,fontFamily:M,color:C.t4,letterSpacing:1,cursor:"pointer",textTransform:"uppercase",borderBottom:`1px dashed ${C.t4}`,paddingBottom:1}} onMouseEnter={e=>{e.currentTarget.style.color=C.t2;e.currentTarget.style.borderBottomColor=C.t2}} onMouseLeave={e=>{e.currentTarget.style.color=C.t4;e.currentTarget.style.borderBottomColor=C.t4}}>↳ Submit anyway</span>
      </div>}
    </div>

    {/* Right: state panel */}
    <div>
      <Card style={{position:"sticky",top:12}}>
        <div style={{fontSize:10,fontFamily:M,color:C.cy,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:10,display:"flex",alignItems:"center",gap:6}}><Dot c={C.cy} p/>Conversation State</div>

        {visibleFields.length===0?<div style={{fontSize:10.5,color:C.t4,fontFamily:M,lineHeight:1.55,padding:"10px 0"}}>Fields will appear here as the Copilot extracts them from your messages.</div>:<div style={{display:"flex",flexDirection:"column",gap:7}}>
          {visibleFields.map(([k,v])=>{
            const dispKey=k.replace(/([A-Z])/g," $1").replace(/^./,s=>s.toUpperCase());
            const dispVal=Array.isArray(v)?v.join(", "):String(v);
            return <div key={k} style={{display:"grid",gridTemplateColumns:"1fr 1.4fr",gap:8,padding:"5px 0",borderBottom:`1px solid ${C.br}33`}}>
              <div style={{fontSize:9,color:C.t3,fontFamily:M,letterSpacing:.5,textTransform:"uppercase",fontWeight:600}}>{dispKey}</div>
              <div style={{fontSize:11,color:C.t1,fontFamily:F,wordBreak:"break-word",animation:"flash .8s ease"}}>{dispVal}</div>
            </div>;
          })}
        </div>}

        <div style={{marginTop:14,padding:9,background:C.s1,borderRadius:4,borderLeft:`2px solid ${C.tl}`,fontSize:10,color:C.t3,lineHeight:1.5,fontFamily:M}}>
          <div style={{color:C.tl,fontWeight:600,letterSpacing:.8,marginBottom:3}}>ON SUBMIT</div>
          Full transcript ({history.filter(m=>m.role==="user").length} user msgs) + extracted fields will be filed as a Copilot-sourced ticket. Agent Layer will route it.
        </div>
      </Card>

      <div style={{marginTop:10,padding:10,background:C.s1,borderRadius:4,borderLeft:`2px solid ${C.am}`,fontSize:9.5,color:C.t3,lineHeight:1.55,fontFamily:M}}>
        <div style={{color:C.am,fontWeight:600,marginBottom:3,letterSpacing:.5}}>💡 COPILOT vs FORM</div>
        Copilot is ideal for complex or uncertain intake. For known request types (standard NDA, FAQ), the form is faster. Switch anytime.
      </div>
    </div>
  </div>;
}

// ══════════════════════════════════════════════════
// NewRequestV8 — the wrapper that gates form vs copilot
// ══════════════════════════════════════════════════
// Note: in the standalone demo file, we ship a compact v7-form-compatible version here so the file
// runs alone. On splice, this replaces the existing NewRequestTab — the legacy form body moves
// from v7 (lines 1512–1712) into <LegacyFormInner/> verbatim.
function NewRequestV8({store,goToInbox,goToCockpit,settings}){
  const[mode,setMode]=useState("picker"); // "picker" | "form" | "copilot"
  const[initialType,setInitialType]=useState(null);

  const pickSimple=(type)=>{ setInitialType(type); setMode("form"); };
  const pickComplex=(type)=>{ setInitialType(type); setMode("copilot"); };

  if(mode==="picker"){
    return <TypePickerGate onPickSimple={pickSimple} onPickComplex={pickComplex}/>;
  }

  if(mode==="copilot"){
    return <div>
      <div style={{marginBottom:10}}>
        <span onClick={()=>setMode("picker")} style={{display:"inline-flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:10.5,color:C.cy,padding:"3px 6px",fontFamily:M,letterSpacing:1,textTransform:"uppercase"}}>← Change path</span>
      </div>
      <CopilotChat initialType={initialType} onFiled={(t)=>{/* stays on confirmation */}} onSwitchToForm={()=>{setMode("form");}} store={store} settings={settings}/>
    </div>;
  }

  // mode === "form" — standalone v7-compatible form for the demo file.
  // On splice, this entire function body is replaced by the existing v7 NewRequestTab with the
  // picker + switch wrapped around it.
  return <div>
    <div style={{marginBottom:10}}>
      <span onClick={()=>setMode("picker")} style={{display:"inline-flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:10.5,color:C.cy,padding:"3px 6px",fontFamily:M,letterSpacing:1,textTransform:"uppercase"}}>← Change path</span>
      <span onClick={()=>setMode("copilot")} style={{marginLeft:14,display:"inline-flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:10.5,color:C.em,padding:"3px 6px",fontFamily:M,letterSpacing:1,textTransform:"uppercase"}}>⇄ Switch to Copilot</span>
    </div>
    <LegacyFormInner store={store} initialType={initialType} goToInbox={goToInbox} settings={settings}/>
  </div>;
}

// ── Compact v7-compatible form for the standalone demo.
//    On integration with aegis-v7-aurora.jsx, this is replaced by the real v7.2 NewRequestTab
//    (lines 1512–1712 in v7), just re-routed through the v8 addTicketAndRunAgent path.
function LegacyFormInner({store,initialType,goToInbox,settings}){
  const[form,setForm]=useState({from:"",dept:"Product",type:initialType||"Contract Review",desc:"",attach:0,urgency:"Standard"});
  const[submitted,setSubmitted]=useState(false);
  const[createdTicket,setCreatedTicket]=useState(null);
  const[busy,setBusy]=useState(false);

  const regexTriage=useMemo(()=>classifyIntakeRegex(form.desc,form.dept),[form.desc,form.dept]);

  const submit=async()=>{
    if(!form.from||form.desc.length<10) return;
    setBusy(true);
    const triage=regexTriage||{cat:"General Inquiry",priority:"Medium",team:"Routing Triage",sla:"24 hrs",slaHours:24,rule:"default",conf:55,risk:"Low",note:"Manual triage",hrs:2,source:"fallback"};
    const now=new Date();
    const id="REQ-"+(3700+Math.floor(Math.random()*300));
    const priority=form.urgency==="Emergency — deal blocker"?"Critical":form.urgency==="Urgent — deadline this week"?"High":triage.priority;
    const ticket={
      id,_source:"form",from:form.from,dept:form.dept,type:form.type,priority,
      submitted:now.toISOString().slice(0,16).replace("T"," "),submittedTs:now.getTime(),
      sla:triage.sla,slaHours:triage.slaHours,slaStatus:"On Track",desc:form.desc,
      assigned:"Cockpit Queue",status:"Awaiting Triage",stage:"new",
      seeded:false,attach:form.attach,
      workflow:[{label:"Submitted",done:true},{label:"Agent Analysis",active:true},{label:"Attorney Review"},{label:"Close"}],
      aiTriage:{category:triage.cat,riskFlag:`${triage.risk} — ${triage.note}`,suggestedAssignee:triage.team,estimatedHours:triage.hrs,similarMatters:Math.floor(Math.random()*40)+5,confidence:triage.conf,routingRule:`${triage.rule}: ${triage.cat}`,source:triage.source||"regex"},
      conversation:null,agentRecommendation:null,triagedBy:null,triagedAt:null,triagedAction:null,
    };
    const {ticket:saved,agent,recommendation}=await store.addTicketAndRunAgent(ticket);
    setCreatedTicket({...saved,_agent:agent,_rec:recommendation});
    setSubmitted(true);
    setBusy(false);
  };

  if(submitted&&createdTicket) return <div style={{maxWidth:780,margin:"0 auto"}}>
    <div style={{background:C.gnG,border:`1px solid ${C.gn}`,borderLeft:`4px solid ${C.gn}`,padding:20,marginBottom:14,animation:"fu .4s ease"}}>
      <div style={{fontSize:11,fontFamily:M,color:C.gn,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>✓ REQUEST SUBMITTED · PERSISTED · AGENT PROCESSED</div>
      <div style={{fontSize:20,fontFamily:SR,color:C.t1,marginBottom:4}}>Ticket <span style={{color:C.gn,fontFamily:M}}>{createdTicket.id}</span> filed</div>
      <div style={{fontSize:12,color:C.t2,lineHeight:1.6}}>
        {createdTicket._agent?<>Routed to <span style={{color:C.pp,fontWeight:600}}>{createdTicket._agent.name}</span> · Agent recommendation generated ({Math.round((createdTicket._rec?.confidence||0)*100)}% confidence) · </>:<>No matching agent — will land in Cockpit for manual triage · </>}
        Triage in Cockpit (press g+c from anywhere).
      </div>
    </div>
    <div style={{display:"flex",gap:8}}>
      <div onClick={()=>window.location.reload()} style={{padding:"9px 16px",border:`1px solid ${C.br}`,color:C.t2,fontSize:10,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase"}}>File Another</div>
      <div onClick={goToInbox} style={{padding:"9px 16px",background:C.cy,color:C.bg,fontSize:10,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase",fontWeight:600}}>→ Inbox</div>
    </div>
  </div>;

  return <div style={{maxWidth:780,margin:"0 auto"}}>
    <Card>
      <FormField label="Your Name" required>
        <input value={form.from} onChange={e=>setForm({...form,from:e.target.value})} placeholder="Jane Smith" style={inputStyle}/>
      </FormField>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <FormField label="Department" required>
          <select value={form.dept} onChange={e=>setForm({...form,dept:e.target.value})} style={inputStyle}>
            {["Product","Engineering","Sales","HR","Finance","Procurement","Marketing","Operations","Legal","Executive"].map(d=><option key={d} value={d} style={{background:C.s1}}>{d}</option>)}
          </select>
        </FormField>
        <FormField label="Urgency">
          <select value={form.urgency} onChange={e=>setForm({...form,urgency:e.target.value})} style={inputStyle}>
            {["Standard","Priority","Urgent — deadline this week","Emergency — deal blocker"].map(d=><option key={d} value={d} style={{background:C.s1}}>{d}</option>)}
          </select>
        </FormField>
      </div>
      <FormField label="Request Type" required>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
          {["Contract Review","NDA Request","IP Question","Privacy Question","Trademark Check","Vendor Due Diligence","Contract Question","Legal Question — General","Other"].map(t=>{
            const active=form.type===t;
            return <div key={t} onClick={()=>setForm({...form,type:t})} style={{padding:"7px 8px",border:`1px solid ${active?C.cy:C.br}`,background:active?C.cy+"22":"transparent",cursor:"pointer",fontSize:10,fontFamily:M,letterSpacing:.5,color:active?C.cy:C.t2,textAlign:"center",transition:"all .12s"}}>{t}</div>;
          })}
        </div>
      </FormField>
      <FormField label="Describe your request" required sub="Be specific — regex + Claude triage and agent routing use this">
        <textarea value={form.desc} onChange={e=>setForm({...form,desc:e.target.value})} placeholder="E.g. Mutual NDA for discussions with Acme Corp — 2-year term, Delaware law." rows={5} style={{...inputStyle,resize:"vertical",fontFamily:F,minHeight:100}}/>
      </FormField>
      <div style={{display:"flex",gap:10,marginTop:16,flexWrap:"wrap"}}>
        <div onClick={submit} style={{padding:"11px 22px",background:form.from&&form.desc.length>10&&!busy?C.cy:C.br,color:form.from&&form.desc.length>10&&!busy?C.bg:C.t4,fontSize:11,fontFamily:M,letterSpacing:1.8,cursor:form.from&&form.desc.length>10&&!busy?"pointer":"not-allowed",textTransform:"uppercase",fontWeight:600}}>{busy?"◎ Triaging + Routing to Agent…":"→ Submit · Route to Agent"}</div>
      </div>
      <div style={{marginTop:14,padding:11,background:C.s1,borderRadius:5,borderLeft:`2px solid ${C.em}`,fontSize:10.5,color:C.t2,fontFamily:M,lineHeight:1.55}}>
        <div style={{color:C.em,fontWeight:600,marginBottom:3,letterSpacing:.5}}>v8 FLOW</div>
        On submit: regex triage runs → ticket saved → agent router picks best fit → recommendation generated → ticket lands in Cockpit for attorney review. <span style={{color:C.am}}>Agents never auto-close.</span>
      </div>
    </Card>
  </div>;
}


// ═════════════ s9_cockpit.jsx ═════════════
// ══════════════════════════════════════════════════
// TRIAGE COCKPIT (System 2)
// ══════════════════════════════════════════════════
// Keyboard-first single-ticket focus view. The attorney's home screen.
// Core mental model: one ticket at a time, agent recommendation front-and-center,
// decide in seconds, move on. All shortcuts mirror Gmail/Linear conventions.

// Agent recommendation panel — the right-side card attorneys spend most time on
function AgentRecommendationPanel({ticket,rec,agent,editing,draftEdit,onDraftEdit,onApprove,onEdit,onReject,onEscalate,onSaveEdit,onCancelEdit}){
  if(!rec){
    return <Card style={{background:C.s1,borderLeft:`3px solid ${C.t4}`}}>
      <SH icon="◌" title="NO AGENT RECOMMENDATION" sub="This ticket has no matching agent — manual triage required" c={C.t3}/>
      <div style={{fontSize:11,color:C.t3,lineHeight:1.6,marginTop:10}}>No agent in the registry could handle this ticket. Review the description and route manually via Reassign <Kbd k="r"/>.</div>
    </Card>;
  }

  const action=rec.suggestedAction;
  const actionColor=action==="approve-and-send"?C.gn:action==="escalate"?C.rd:action==="flag-for-review"?C.am:C.cy;
  const actionLabel=action==="approve-and-send"?"APPROVE & SEND":action==="escalate"?"ESCALATE":action==="flag-for-review"?"FLAG FOR REVIEW":action.toUpperCase();

  return <Card style={{background:C.cd,borderLeft:`3px solid ${actionColor}`}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,gap:10}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:10,fontFamily:M,color:C.pp,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:5,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <Dot c={C.pp} p/> AGENT RECOMMENDATION
          {agent&&<AgentBadge agent={agent}/>}
        </div>
        <div style={{fontSize:16,fontFamily:SR,color:C.t1,lineHeight:1.3}}>Recommends <em style={{color:actionColor,fontStyle:"italic"}}>{actionLabel.toLowerCase()}</em></div>
      </div>
      <ConfidenceBadge conf={rec.confidence}/>
    </div>

    {/* Drafted response */}
    <div style={{marginTop:14}}>
      <div style={{fontSize:9.5,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:5,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span>Drafted Response</span>
        {!editing&&rec.draftedResponse&&<span onClick={onEdit} style={{cursor:"pointer",color:C.cy,fontSize:9,letterSpacing:1}}><Kbd k="e"/> edit</span>}
      </div>
      {editing?<>
        <textarea value={draftEdit} onChange={e=>onDraftEdit(e.target.value)} rows={Math.min(Math.max((draftEdit.match(/\n/g)||[]).length+3,5),18)} style={{...inputStyle,width:"100%",fontFamily:SR,fontSize:12,lineHeight:1.55,resize:"vertical",background:C.s2,borderColor:C.cy}}/>
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <div onClick={onSaveEdit} style={{padding:"6px 14px",background:C.gn,color:C.bg,fontSize:9.5,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase",fontWeight:700}}>Save + Approve</div>
          <div onClick={onCancelEdit} style={{padding:"6px 12px",border:`1px solid ${C.br}`,color:C.t2,fontSize:9.5,fontFamily:M,letterSpacing:1.2,cursor:"pointer",textTransform:"uppercase"}}>Cancel</div>
        </div>
      </>:<div style={{background:C.s1,padding:12,borderRadius:4,border:`1px solid ${C.br}`,fontSize:12,color:C.t1,fontFamily:SR,lineHeight:1.6,whiteSpace:"pre-wrap",maxHeight:280,overflowY:"auto"}}>
        {rec.draftedResponse||<span style={{color:C.t4,fontStyle:"italic",fontFamily:M}}>(No drafted response — agent requested escalation or manual routing)</span>}
      </div>}
    </div>

    {/* Reasoning */}
    <div style={{marginTop:12,padding:10,background:C.blG,borderLeft:`2px solid ${C.bl}`,borderRadius:3}}>
      <div style={{fontSize:9,fontFamily:M,color:C.bl,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:4}}>AGENT REASONING</div>
      <div style={{fontSize:11,color:C.t2,lineHeight:1.5,fontFamily:F}}>{rec.reasoning}</div>
    </div>

    {/* Concerns */}
    {rec.concerns&&rec.concerns.length>0&&<div style={{marginTop:10,padding:10,background:C.amG,borderLeft:`2px solid ${C.am}`,borderRadius:3}}>
      <div style={{fontSize:9,fontFamily:M,color:C.am,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:5}}>⚠ CONCERNS ({rec.concerns.length})</div>
      {rec.concerns.map((c,i)=><div key={i} style={{fontSize:11,color:C.t2,lineHeight:1.5,marginBottom:i<rec.concerns.length-1?4:0}}>• {c}</div>)}
    </div>}

    {/* Precedent / source links */}
    {rec.precedentLinks&&rec.precedentLinks.length>0&&<div style={{marginTop:10}}>
      <div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:5}}>SOURCES & PRECEDENTS</div>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {rec.precedentLinks.map((p,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 9px",background:C.s1,borderRadius:3,fontSize:10.5,fontFamily:M,color:C.t2}}>
          <span style={{fontSize:11,color:C.cy}}>◎</span>
          <span style={{color:C.cy,fontWeight:600,letterSpacing:.3}}>{p.id}</span>
          <span style={{color:C.t3}}>—</span>
          <span>{p.title}</span>
        </div>)}
      </div>
    </div>}

    {/* Alternative tone */}
    {rec.alternativeTone&&<div style={{marginTop:10,padding:9,background:C.s2,borderLeft:`2px solid ${C.t3}`,borderRadius:3}}>
      <div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:3}}>ALTERNATIVE TONE</div>
      <div style={{fontSize:11,color:C.t2,lineHeight:1.5,fontFamily:SR,fontStyle:"italic"}}>"{rec.alternativeTone}"</div>
    </div>}

    {/* Action buttons — disabled during edit mode */}
    {!editing&&<div style={{display:"flex",gap:7,marginTop:14,flexWrap:"wrap"}}>
      {action==="approve-and-send"&&<div onClick={onApprove} style={{padding:"9px 14px",background:C.gn,color:C.bg,fontSize:10,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase",fontWeight:700,display:"flex",alignItems:"center",gap:7}}><Kbd k="a" active/> Approve + Send</div>}
      {action==="flag-for-review"&&<div onClick={onApprove} style={{padding:"9px 14px",background:C.am,color:C.bg,fontSize:10,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase",fontWeight:700,display:"flex",alignItems:"center",gap:7}}><Kbd k="a" active/> Approve as-is</div>}
      {action==="escalate"&&<div onClick={onEscalate} style={{padding:"9px 14px",background:C.rd,color:C.bone,fontSize:10,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase",fontWeight:700,display:"flex",alignItems:"center",gap:7}}><Kbd k="a" active/> Escalate</div>}
      {rec.draftedResponse&&<div onClick={onEdit} style={{padding:"9px 14px",border:`1px solid ${C.cy}`,color:C.cy,fontSize:10,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase",fontWeight:600,display:"flex",alignItems:"center",gap:7}}><Kbd k="e"/> Edit Draft</div>}
      <div onClick={onReject} style={{padding:"9px 14px",border:`1px solid ${C.rd}`,color:C.rd,fontSize:10,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase",fontWeight:600,display:"flex",alignItems:"center",gap:7}}><Kbd k="x"/> Reject</div>
    </div>}
  </Card>;
}

// Ticket detail panel — the left side
function TicketDetailPanel({ticket}){
  const[convExpanded,setConvExpanded]=useState(false);
  if(!ticket) return null;
  const conv=ticket.conversation;
  const fromCopilot=ticket._source==="copilot";

  return <div>
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:12}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap",marginBottom:6}}>
            <span style={{fontSize:10,fontFamily:M,color:C.cy,letterSpacing:1.5,fontWeight:600}}>{ticket.id}</span>
            <Pill t={ticket.type} c={C.t2} g={C.s2}/>
            <Pill t={ticket.priority?.toUpperCase()} c={pc(ticket.priority)}/>
            <Pill t={ticket._source==="copilot"?"VIA COPILOT":"VIA FORM"} c={ticket._source==="copilot"?C.em:C.tl}/>
            {ticket.triagedBy&&<Pill t={`TRIAGED → ${ticket.triagedAction?.toUpperCase()}`} c={C.gn}/>}
          </div>
          <div style={{fontSize:16,fontFamily:SR,color:C.t1,lineHeight:1.35,marginBottom:8}}>{ticket.desc}</div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
        <div><div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1.2,textTransform:"uppercase",fontWeight:600,marginBottom:2}}>Requester</div><div style={{fontSize:11,color:C.t1}}>{ticket.from}</div><div style={{fontSize:9.5,color:C.t3,fontFamily:M}}>{ticket.dept}</div></div>
        <div><div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1.2,textTransform:"uppercase",fontWeight:600,marginBottom:2}}>Submitted</div><div style={{fontSize:11,color:C.t1,fontFamily:M}}>{ticket.age||"—"} ago</div><div style={{fontSize:9.5,color:C.t3,fontFamily:M}}>{ticket.submitted}</div></div>
        <div><div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1.2,textTransform:"uppercase",fontWeight:600,marginBottom:2}}>SLA</div><div style={{fontSize:11,color:ticket.slaStatus==="Overdue"?C.rd:ticket.slaStatus==="At Risk"?C.am:C.gn,fontFamily:M,fontWeight:600}}>{ticket.slaStatus} · {ticket.sla}</div><Bar pct={ticket.slaPct||0} c={ticket.slaStatus==="Overdue"?C.rd:ticket.slaStatus==="At Risk"?C.am:C.gn} h={3}/></div>
      </div>

      {ticket.aiTriage&&<div style={{padding:10,background:C.s1,borderRadius:4,borderLeft:`2px solid ${C.cy}`,marginBottom:10}}>
        <div style={{fontSize:9,fontFamily:M,color:C.cy,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:4}}>TRIAGE · {ticket.aiTriage.source?.toUpperCase()}</div>
        <div style={{fontSize:11,color:C.t1,lineHeight:1.5}}><span style={{color:C.t3}}>Category:</span> {ticket.aiTriage.category}</div>
        <div style={{fontSize:11,color:C.t1,lineHeight:1.5}}><span style={{color:C.t3}}>Risk:</span> {ticket.aiTriage.riskFlag}</div>
        <div style={{fontSize:11,color:C.t1,lineHeight:1.5}}><span style={{color:C.t3}}>Suggested:</span> {ticket.aiTriage.suggestedAssignee}</div>
        <div style={{fontSize:10,color:C.t3,fontFamily:M,marginTop:3}}>Confidence {ticket.aiTriage.confidence}% · {ticket.aiTriage.similarMatters} similar matters · {ticket.aiTriage.routingRule}</div>
      </div>}

      {ticket.workflow&&<WorkflowSteps steps={ticket.workflow}/>}

      {/* Copilot conversation — collapsible */}
      {fromCopilot&&conv&&conv.length>0&&<div style={{marginTop:14,borderTop:`1px solid ${C.br}`,paddingTop:12}}>
        <div onClick={()=>setConvExpanded(!convExpanded)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",padding:"4px 0"}}>
          <div style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,display:"flex",alignItems:"center",gap:6}}><Dot c={C.em}/>COPILOT TRANSCRIPT ({conv.length} messages)</div>
          <span style={{fontSize:11,color:C.t3,fontFamily:M}}>{convExpanded?"▾ collapse":"▸ expand"}</span>
        </div>
        {convExpanded&&<div style={{marginTop:10,maxHeight:360,overflowY:"auto",padding:8,background:C.s1,borderRadius:4}}>
          {conv.map((m,i)=><ChatBubble key={i} role={m.role} d={i*15} meta={m.fieldsExtracted?`+ extracted: ${Object.keys(m.fieldsExtracted).join(", ")}`:null}>{m.content}</ChatBubble>)}
        </div>}
      </div>}
    </Card>
  </div>;
}

// Similar matters panel
function SimilarMattersPanel({currentTicket,allTickets}){
  const matters=useMemo(()=>findSimilarMatters(currentTicket,allTickets,3),[currentTicket,allTickets]);
  return <Card>
    <SH icon="◊" title="Similar Resolved Matters" sub={matters.length?`Top ${matters.length} closest matches`:"No prior matches — fresh territory"} c={C.tl}/>
    {matters.length===0?<div style={{fontSize:11,color:C.t3,padding:"6px 0",fontStyle:"italic",fontFamily:F}}>No resolved matters match this closely. Agent reasoning + manual discretion apply.</div>:
     <div style={{display:"flex",flexDirection:"column",gap:7}}>
      {matters.map(m=><SimilarMatterCard key={m.id} m={m} onClick={()=>{}}/>)}
    </div>}
  </Card>;
}

// Capacity panel
function CapacityPanel({allTickets,attorney}){
  // Current user's open load: tickets assigned to them or in Cockpit queue
  const myLoad=allTickets.filter(t=>t.stage!=="complete"&&t.status!=="Completed"&&t.status!=="Auto-Completed"&&(t.assigned===attorney||t.assigned==="Cockpit Queue"||t.triagedBy===attorney)).length;
  const totalOpen=allTickets.filter(t=>t.stage!=="complete"&&t.status!=="Completed"&&t.status!=="Auto-Completed").length;
  const teamAvg=Math.round(totalOpen/5); // assume 5-attorney team
  return <Card>
    <SH icon="◇" title="Your Capacity" sub="vs team average" c={C.gn}/>
    <CapacityMeter current={myLoad} avg={teamAvg||4} cap={20} label="Open matters"/>
    <div style={{marginTop:10,padding:8,background:C.s1,borderRadius:3,fontSize:10,color:C.t3,lineHeight:1.5,fontFamily:M}}>
      <div style={{color:C.t2,fontWeight:600,marginBottom:2,letterSpacing:.5}}>Suggested assignee</div>
      <div style={{fontSize:10.5,color:C.t1,fontFamily:F}}>{attorney}</div>
    </div>
  </Card>;
}

// Shortcut cheatsheet overlay — shown when user presses ?
function ShortcutCheatsheet({onClose}){
  const groups=[
    {label:"Navigation",items:[
      {k:"j",sub:"/↓",desc:"Next ticket"},{k:"k",sub:"/↑",desc:"Previous ticket"},
      {k:"/",desc:"Focus search"},{k:"Esc",desc:"Close overlay / deselect"},
    ]},
    {label:"Triage Actions",items:[
      {k:"a",desc:"Approve recommendation · send"},
      {k:"e",desc:"Edit drafted response inline"},
      {k:"r",desc:"Reassign to different team"},
      {k:"x",desc:"Reject recommendation"},
      {k:"c",desc:"Manual close (no send)"},
      {k:"s",desc:"Snooze (re-surface later)"},
    ]},
    {label:"Bulk",items:[
      {k:"b",desc:"Toggle bulk mode"},
      {k:"Space",desc:"Select/deselect in bulk mode"},
      {k:"a",desc:"(in bulk) Approve all selected — confirmation first"},
    ]},
    {label:"Help",items:[
      {k:"?",desc:"Show/hide this cheatsheet"},
    ]},
  ];
  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(11,16,32,.88)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",animation:"fu .2s ease"}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.cd,border:`1px solid ${C.br}`,borderLeft:`3px solid ${C.cy}`,borderRadius:8,padding:28,maxWidth:640,width:"90%",maxHeight:"82vh",overflowY:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
        <div>
          <div style={{fontSize:10,fontFamily:M,color:C.cy,letterSpacing:2,textTransform:"uppercase",fontWeight:600,marginBottom:4}}>KEYBOARD SHORTCUTS</div>
          <div style={{fontSize:18,fontFamily:SR,color:C.t1}}>Triage at keyboard speed</div>
        </div>
        <div onClick={onClose} style={{fontSize:18,color:C.t3,cursor:"pointer",padding:"0 8px"}}>✕</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
        {groups.map(g=><div key={g.label}>
          <div style={{fontSize:9.5,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:6,borderBottom:`1px solid ${C.br}`,paddingBottom:4}}>{g.label}</div>
          {g.items.map((it,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0"}}>
            <Kbd k={it.k} sub={it.sub}/>
            <span style={{fontSize:11,color:C.t2,lineHeight:1.4}}>{it.desc}</span>
          </div>)}
        </div>)}
      </div>
      <div style={{marginTop:18,padding:10,background:C.s1,borderLeft:`2px solid ${C.am}`,borderRadius:3,fontSize:10.5,color:C.t2,fontFamily:M,lineHeight:1.55}}>
        <span style={{color:C.am,fontWeight:600}}>Remember:</span> Every action is logged. Agents never auto-close. Your decision is final.
      </div>
    </div>
  </div>;
}

// Bulk confirmation card — shown when attorney presses 'a' in bulk mode
function BulkConfirmCard({selected,tickets,onConfirm,onCancel}){
  const selectedTickets=tickets.filter(t=>selected.includes(t.id));
  const[listExpanded,setListExpanded]=useState(false);
  const byAgent={};
  selectedTickets.forEach(t=>{
    const aid=t.agentRecommendation?.agentId||"no-agent";
    byAgent[aid]=(byAgent[aid]||0)+1;
  });
  return <div style={{position:"fixed",inset:0,background:"rgba(11,16,32,.9)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",animation:"fu .2s ease",padding:20}}>
    <Card style={{maxWidth:560,width:"100%",borderLeft:`4px solid ${C.am}`,background:C.cd}}>
      <div style={{fontSize:10,fontFamily:M,color:C.am,letterSpacing:2,textTransform:"uppercase",fontWeight:600,marginBottom:6}}>⚠ CONFIRM BULK APPROVAL</div>
      <div style={{fontSize:22,fontFamily:SR,color:C.t1,marginBottom:12}}>Approve <span style={{color:C.am}}>{selected.length}</span> recommendation{selected.length===1?"":"s"}?</div>
      <div style={{padding:12,background:C.amG,borderRadius:4,borderLeft:`2px solid ${C.am}`,fontSize:11.5,color:C.t2,lineHeight:1.55,marginBottom:14,fontFamily:F}}>
        You're about to bulk-send responses for all selected tickets. Each will be marked as approved by you, with the agent's drafted response sent to the requester. This action is logged.
      </div>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:9.5,fontFamily:M,color:C.t3,letterSpacing:1.2,textTransform:"uppercase",fontWeight:600,marginBottom:6}}>Breakdown by agent</div>
        {Object.entries(byAgent).map(([aid,count])=>{
          const agent=AGENTS_BY_ID[aid];
          return <div key={aid} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",fontSize:11,color:C.t1}}>
            <span style={{display:"flex",alignItems:"center",gap:6}}>{agent?<AgentBadge agent={agent}/>:<span style={{color:C.t3,fontFamily:M,fontSize:10}}>No agent</span>}</span>
            <span style={{fontFamily:M,color:C.t2}}>{count}</span>
          </div>;
        })}
      </div>
      <div onClick={()=>setListExpanded(!listExpanded)} style={{cursor:"pointer",display:"flex",justifyContent:"space-between",padding:"6px 0",borderTop:`1px solid ${C.br}`,borderBottom:`1px solid ${C.br}`,marginBottom:10,fontSize:10,fontFamily:M,color:C.t3,letterSpacing:1,textTransform:"uppercase"}}>
        <span>List of tickets ({selectedTickets.length})</span>
        <span>{listExpanded?"▾ collapse":"▸ expand"}</span>
      </div>
      {listExpanded&&<div style={{maxHeight:200,overflowY:"auto",marginBottom:12}}>
        {selectedTickets.map(t=><div key={t.id} style={{padding:"5px 0",fontSize:10.5,color:C.t2,fontFamily:M,borderBottom:`1px solid ${C.br}33`}}>
          <span style={{color:C.cy}}>{t.id}</span> · {t.from} · <span style={{color:C.t3}}>{(t.desc||"").slice(0,60)}…</span>
        </div>)}
      </div>}
      <div style={{display:"flex",gap:8}}>
        <div onClick={onConfirm} style={{padding:"10px 18px",background:C.gn,color:C.bg,fontSize:10.5,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase",fontWeight:700,flex:1,textAlign:"center"}}>✓ Approve All {selected.length}</div>
        <div onClick={onCancel} style={{padding:"10px 18px",border:`1px solid ${C.br}`,color:C.t2,fontSize:10.5,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase"}}>Cancel · Esc</div>
      </div>
    </Card>
  </div>;
}

// ══════════════════════════════════════════════════
// CockpitTab — the main component
// ══════════════════════════════════════════════════
function CockpitTab({store,cockpit}){
  const attorney=cockpit.state.attorney;
  const allTickets=store.tickets;

  // Queue: awaiting-triage tickets first (newest first), then already-triaged below
  const queue=useMemo(()=>{
    const awaiting=allTickets.filter(t=>t.stage==="new"&&t.status!=="Snoozed"&&!t.triagedBy).sort((a,b)=>b.submittedTs-a.submittedTs);
    const already=allTickets.filter(t=>t.triagedBy&&t.stage!=="complete").sort((a,b)=>(b.triagedAt||0)-(a.triagedAt||0));
    return [...awaiting,...already];
  },[allTickets]);

  const[pos,setPos]=useState(0);
  const[editing,setEditing]=useState(false);
  const[draftEdit,setDraftEdit]=useState("");
  const[showCheatsheet,setShowCheatsheet]=useState(false);
  const[bulkMode,setBulkMode]=useState(false);
  const[selected,setSelected]=useState([]);
  const[showBulkConfirm,setShowBulkConfirm]=useState(false);
  const[search,setSearch]=useState("");
  const[showSearch,setShowSearch]=useState(false);
  const[toast,setToast]=useState(null);
  const searchRef=useRef(null);

  // Filter by search if active
  const visibleQueue=useMemo(()=>{
    if(!search.trim()) return queue;
    const q=search.toLowerCase();
    return queue.filter(t=>
      t.id.toLowerCase().includes(q)||
      (t.from||"").toLowerCase().includes(q)||
      (t.desc||"").toLowerCase().includes(q)||
      (t.type||"").toLowerCase().includes(q)||
      (t.aiTriage?.category||"").toLowerCase().includes(q));
  },[queue,search]);

  // Keep pos in range as queue changes
  useEffect(()=>{
    if(pos>=visibleQueue.length) setPos(Math.max(0,visibleQueue.length-1));
  },[visibleQueue.length,pos]);

  const current=visibleQueue[pos];

  const showToast=useCallback((msg,tone="gn")=>{
    setToast({msg,tone});
    setTimeout(()=>setToast(null),2400);
  },[]);

  const next=useCallback(()=>setPos(p=>Math.min(p+1,visibleQueue.length-1)),[visibleQueue.length]);
  const prev=useCallback(()=>setPos(p=>Math.max(p-1,0)),[]);

  const approve=useCallback(async()=>{
    if(editing||!current||!current.agentRecommendation) return;
    await store.recordTriageAction(current.id,"approved",{attorney,confidence:current.agentRecommendation.confidence});
    await cockpit.incrementTriaged();
    showToast(`✓ ${current.id} approved + sent`,"gn");
    setTimeout(next,200);
  },[current,editing,attorney,store,cockpit,next,showToast]);

  const reject=useCallback(async()=>{
    if(editing||!current) return;
    await store.recordTriageAction(current.id,"rejected",{attorney,confidence:current.agentRecommendation?.confidence,reason:"Attorney rejected recommendation"});
    await cockpit.incrementTriaged();
    showToast(`✕ ${current.id} rejected — queued for manual`,"rd");
    setTimeout(next,200);
  },[current,editing,attorney,store,cockpit,next,showToast]);

  const manualClose=useCallback(async()=>{
    if(editing||!current) return;
    await store.recordTriageAction(current.id,"manual-close",{attorney,reason:"Manual close — no agent draft sent"});
    await cockpit.incrementTriaged();
    showToast(`✓ ${current.id} manually closed`,"gn");
    setTimeout(next,200);
  },[current,editing,attorney,store,cockpit,next,showToast]);

  const snooze=useCallback(async()=>{
    if(editing||!current) return;
    await store.recordTriageAction(current.id,"snoozed",{attorney});
    showToast(`⏲ ${current.id} snoozed`,"am");
    setTimeout(next,200);
  },[current,editing,attorney,store,next,showToast]);

  const reassign=useCallback(async()=>{
    if(editing||!current) return;
    const team=window.prompt?window.prompt("Reassign to (team name):","Commercial Contracts"):"Commercial Contracts";
    if(!team) return;
    await store.recordTriageAction(current.id,"reassigned",{attorney,patch:{assigned:team,status:"Reassigned"}});
    await cockpit.incrementTriaged();
    showToast(`→ ${current.id} reassigned to ${team}`,"bl");
    setTimeout(next,200);
  },[current,editing,attorney,store,cockpit,next,showToast]);

  const startEdit=useCallback(()=>{
    if(!current?.agentRecommendation?.draftedResponse) return;
    setDraftEdit(current.agentRecommendation.draftedResponse);
    setEditing(true);
  },[current]);
  const cancelEdit=useCallback(()=>{ setEditing(false); setDraftEdit(""); },[]);
  const saveEdit=useCallback(async()=>{
    if(!current) return;
    await store.updateTicket(current.id,{
      agentRecommendation:{...current.agentRecommendation,draftedResponse:draftEdit,edited:true,editedAt:Date.now(),editedBy:attorney},
    });
    await store.recordTriageAction(current.id,"edited-approved",{attorney,confidence:current.agentRecommendation?.confidence});
    await cockpit.incrementTriaged();
    setEditing(false);setDraftEdit("");
    showToast(`✓ ${current.id} edited + sent`,"gn");
    setTimeout(next,200);
  },[current,draftEdit,attorney,store,cockpit,next,showToast]);

  // Bulk mode
  const toggleBulk=useCallback(()=>{ setBulkMode(b=>!b); setSelected([]); },[]);
  const toggleSelected=useCallback((id)=>{
    setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  },[]);
  const bulkApprove=useCallback(async()=>{
    if(selected.length===0) return;
    setShowBulkConfirm(true);
  },[selected]);
  const confirmBulkApprove=useCallback(async()=>{
    await store.bulkApprove(selected,attorney);
    // increment triaged counter per ticket
    for(let i=0;i<selected.length;i++) await cockpit.incrementTriaged();
    showToast(`✓ ${selected.length} tickets bulk-approved`,"gn");
    setShowBulkConfirm(false);setSelected([]);setBulkMode(false);
  },[selected,attorney,store,cockpit,showToast]);

  // Search
  const focusSearch=useCallback(()=>{
    setShowSearch(true);
    setTimeout(()=>searchRef.current?.focus(),30);
  },[]);

  // Keyboard handlers
  useKeyboardShortcuts({
    j:next,ArrowDown:next,
    k:prev,ArrowUp:prev,
    a:bulkMode?bulkApprove:approve,
    e:startEdit,
    r:reassign,
    x:reject,
    c:manualClose,
    s:snooze,
    b:toggleBulk,
    "?":()=>setShowCheatsheet(x=>!x),
    "/":focusSearch,
    Escape:()=>{
      if(showCheatsheet) setShowCheatsheet(false);
      else if(showBulkConfirm) setShowBulkConfirm(false);
      else if(editing) cancelEdit();
      else if(bulkMode){ setBulkMode(false); setSelected([]); }
      else if(showSearch){ setShowSearch(false); setSearch(""); }
    },
    " ":bulkMode&&current?()=>toggleSelected(current.id):null,
  },true);

  const recAgent=current?.agentRecommendation?AGENTS_BY_ID[current.agentRecommendation.agentId]:null;

  return <div style={{position:"relative"}}>
    {showCheatsheet&&<ShortcutCheatsheet onClose={()=>setShowCheatsheet(false)}/>}
    {showBulkConfirm&&<BulkConfirmCard selected={selected} tickets={visibleQueue} onConfirm={confirmBulkApprove} onCancel={()=>setShowBulkConfirm(false)}/>}

    {/* Cockpit header — status bar */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,padding:"10px 14px",background:C.cd,border:`1px solid ${C.br}`,borderLeft:`3px solid ${C.cy}`,borderRadius:6,gap:10,flexWrap:"wrap"}}>
      <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600}}>Queue</div>
          <div style={{fontSize:14,color:C.t1,fontFamily:SR}}>{visibleQueue.length>0?<><span style={{color:C.cy,fontFamily:M,fontWeight:600}}>{pos+1}</span> of {visibleQueue.length}</>:<span style={{color:C.t3}}>Empty</span>}</div>
        </div>
        <div style={{width:1,height:28,background:C.br}}/>
        <div>
          <div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600}}>Triaged today</div>
          <div style={{fontSize:14,color:C.gn,fontFamily:SR,fontWeight:500}}>{cockpit.state.triagedToday}</div>
        </div>
        <div style={{width:1,height:28,background:C.br}}/>
        <div>
          <div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600}}>Attorney</div>
          <div style={{fontSize:12,color:C.t1,fontFamily:M}}>{attorney}</div>
        </div>
      </div>
      <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
        {bulkMode&&<div style={{display:"flex",gap:7,alignItems:"center"}}>
          <Pill t={`BULK · ${selected.length} SELECTED`} c={C.am}/>
          {selected.length>0&&<div onClick={bulkApprove} style={{padding:"5px 10px",background:C.gn,color:C.bg,fontSize:9.5,fontFamily:M,letterSpacing:1.2,cursor:"pointer",textTransform:"uppercase",fontWeight:700}}>→ Approve {selected.length}</div>}
        </div>}
        {showSearch&&<input ref={searchRef} value={search} onChange={e=>setSearch(e.target.value)} placeholder="search id / requester / text" style={{...inputStyle,width:260,fontSize:10.5}}/>}
        <div onClick={()=>setShowCheatsheet(true)} style={{padding:"4px 8px",border:`1px solid ${C.br}`,borderRadius:3,cursor:"pointer",fontSize:10,fontFamily:M,color:C.t3,letterSpacing:.5,display:"flex",alignItems:"center",gap:5}}>{bulkMode?<Kbd k="a"/>:<Kbd k="?"/>} {bulkMode?"bulk approve":"help"}</div>
      </div>
    </div>

    {/* Main view: ticket + right panels */}
    {current?<div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr",gap:14}}>
      <div>
        {bulkMode&&<div onClick={()=>toggleSelected(current.id)} style={{padding:"8px 12px",marginBottom:10,background:selected.includes(current.id)?C.gnG:C.s1,border:`1px solid ${selected.includes(current.id)?C.gn:C.br}`,borderRadius:4,cursor:"pointer",display:"flex",alignItems:"center",gap:10,fontSize:11,fontFamily:M,color:selected.includes(current.id)?C.gn:C.t2,letterSpacing:1,textTransform:"uppercase",fontWeight:600}}>
          <span style={{fontSize:14}}>{selected.includes(current.id)?"☑":"☐"}</span>
          <span>{selected.includes(current.id)?"selected for bulk":"press space to select"}</span>
        </div>}
        <TicketDetailPanel ticket={current}/>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <AgentRecommendationPanel
          ticket={current}
          rec={current.agentRecommendation}
          agent={recAgent}
          editing={editing}
          draftEdit={draftEdit}
          onDraftEdit={setDraftEdit}
          onApprove={approve}
          onEdit={startEdit}
          onReject={reject}
          onEscalate={approve} /* escalate also records as triaged */
          onSaveEdit={saveEdit}
          onCancelEdit={cancelEdit}
        />
        <SimilarMattersPanel currentTicket={current} allTickets={allTickets}/>
        <CapacityPanel allTickets={allTickets} attorney={attorney}/>

        {/* Secondary actions */}
        <Card style={{background:C.s1}}>
          <div style={{fontSize:9.5,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:8}}>Other Actions</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            <div onClick={reassign} style={{padding:"6px 10px",background:C.s2,border:`1px solid ${C.br}`,borderRadius:3,cursor:"pointer",fontSize:10,fontFamily:M,color:C.t2,letterSpacing:.8,display:"flex",alignItems:"center",gap:6}}><Kbd k="r"/> Reassign</div>
            <div onClick={manualClose} style={{padding:"6px 10px",background:C.s2,border:`1px solid ${C.br}`,borderRadius:3,cursor:"pointer",fontSize:10,fontFamily:M,color:C.t2,letterSpacing:.8,display:"flex",alignItems:"center",gap:6}}><Kbd k="c"/> Manual Close</div>
            <div onClick={snooze} style={{padding:"6px 10px",background:C.s2,border:`1px solid ${C.br}`,borderRadius:3,cursor:"pointer",fontSize:10,fontFamily:M,color:C.t2,letterSpacing:.8,display:"flex",alignItems:"center",gap:6}}><Kbd k="s"/> Snooze</div>
            <div onClick={toggleBulk} style={{padding:"6px 10px",background:bulkMode?C.am+"22":C.s2,border:`1px solid ${bulkMode?C.am:C.br}`,borderRadius:3,cursor:"pointer",fontSize:10,fontFamily:M,color:bulkMode?C.am:C.t2,letterSpacing:.8,display:"flex",alignItems:"center",gap:6,fontWeight:bulkMode?600:400}}><Kbd k="b" active={bulkMode}/> Bulk</div>
            <div onClick={focusSearch} style={{padding:"6px 10px",background:C.s2,border:`1px solid ${C.br}`,borderRadius:3,cursor:"pointer",fontSize:10,fontFamily:M,color:C.t2,letterSpacing:.8,display:"flex",alignItems:"center",gap:6}}><Kbd k="/"/> Search</div>
          </div>
        </Card>
      </div>
    </div>:<Card style={{background:C.gnG,borderLeft:`3px solid ${C.gn}`,padding:32,textAlign:"center"}}>
      <div style={{fontSize:26,fontFamily:SR,color:C.t1,marginBottom:6}}>{search?"No matches":"Queue empty"}</div>
      <div style={{fontSize:12,color:C.t2,lineHeight:1.55,fontFamily:F,marginBottom:4}}>{search?"Try a different search term.":"No tickets awaiting triage. Inbox zero."}</div>
      <div style={{fontSize:10,color:C.t3,fontFamily:M,letterSpacing:.8}}>Triaged today: <span style={{color:C.gn,fontWeight:600}}>{cockpit.state.triagedToday}</span></div>
    </Card>}

    {/* Navigation hint bar — sticky bottom */}
    {current&&<div style={{marginTop:14,padding:"9px 14px",background:C.s1,borderRadius:4,border:`1px solid ${C.br}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,fontSize:10,fontFamily:M,color:C.t3,letterSpacing:.5}}>
      <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{display:"flex",gap:5,alignItems:"center"}}><Kbd k="j"/><Kbd k="k"/> navigate</span>
        <span style={{display:"flex",gap:5,alignItems:"center"}}><Kbd k="a"/> approve</span>
        <span style={{display:"flex",gap:5,alignItems:"center"}}><Kbd k="e"/> edit</span>
        <span style={{display:"flex",gap:5,alignItems:"center"}}><Kbd k="x"/> reject</span>
        <span style={{display:"flex",gap:5,alignItems:"center"}}><Kbd k="b"/> bulk</span>
        <span style={{display:"flex",gap:5,alignItems:"center"}}><Kbd k="?"/> all shortcuts</span>
      </div>
      <div>keyboard-first · press <Kbd k="?"/> anytime</div>
    </div>}

    {/* Toast */}
    {toast&&<div style={{position:"fixed",bottom:28,right:28,padding:"12px 18px",background:C.cd,border:`1px solid ${C[toast.tone]}`,borderLeft:`3px solid ${C[toast.tone]}`,borderRadius:5,fontSize:11.5,color:C.t1,fontFamily:M,letterSpacing:.3,zIndex:90,animation:"fu .2s ease",boxShadow:`0 4px 20px rgba(0,0,0,.4)`}}>{toast.msg}</div>}
  </div>;
}


// ═════════════ s10_agent_settings.jsx ═════════════
// ══════════════════════════════════════════════════
// AGENT SETTINGS PANEL
// ══════════════════════════════════════════════════
// Modal that shows: per-agent on/off toggle, today's activity stats, audit log viewer.

function AgentSettingsPanel({onClose,settings,toggle,log}){
  const[tab,setTab]=useState("agents"); // "agents" | "log"

  // Derive today's stats
  const stats=useMemo(()=>{
    const todayStart=new Date();todayStart.setHours(0,0,0,0);
    const todayLog=log.filter(e=>e.ts>=todayStart.getTime());
    return {
      recs:todayLog.filter(e=>e.type==="recommendation-generated").length,
      approved:todayLog.filter(e=>e.type==="attorney-approved"||e.type==="attorney-edited-approved").length,
      rejected:todayLog.filter(e=>e.type==="attorney-rejected").length,
      bulk:todayLog.filter(e=>e.type==="attorney-bulk-approve").reduce((n,e)=>n+(e.count||0),0),
      errors:todayLog.filter(e=>e.type==="agent-error").length,
      autoClosed:0, // v8 rule: agents never auto-close
    };
  },[log]);

  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(11,16,32,.88)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",animation:"fu .2s ease",padding:20}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.cd,border:`1px solid ${C.br}`,borderLeft:`3px solid ${C.pp}`,borderRadius:8,maxWidth:820,width:"100%",maxHeight:"88vh",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <div style={{padding:"18px 22px",borderBottom:`1px solid ${C.br}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{fontSize:10,fontFamily:M,color:C.pp,letterSpacing:2,textTransform:"uppercase",fontWeight:600,marginBottom:4}}>AGENT LAYER</div>
          <div style={{fontSize:20,fontFamily:SR,color:C.t1}}>Agent settings &amp; audit</div>
        </div>
        <div onClick={onClose} style={{fontSize:18,color:C.t3,cursor:"pointer",padding:"0 8px"}}>✕</div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",borderBottom:`1px solid ${C.br}`,padding:"0 22px"}}>
        {[["agents","Agents"],["log","Audit Log"]].map(([id,label])=>{
          const active=tab===id;
          return <div key={id} onClick={()=>setTab(id)} style={{padding:"10px 14px",fontSize:10,fontFamily:M,letterSpacing:1.5,textTransform:"uppercase",cursor:"pointer",color:active?C.pp:C.t3,borderBottom:`2px solid ${active?C.pp:"transparent"}`,fontWeight:600,marginBottom:-1}}>{label}</div>;
        })}
      </div>

      {/* Body */}
      <div style={{padding:"18px 22px",overflowY:"auto",flex:1}}>
        {tab==="agents"?<>
          {/* Today's activity */}
          <div style={{marginBottom:18}}>
            <div style={{fontSize:9.5,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:8}}>Today's activity</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
              {[
                {l:"Recommendations",v:stats.recs,c:C.pp},
                {l:"Approved",v:stats.approved+stats.bulk,c:C.gn},
                {l:"Rejected",v:stats.rejected,c:C.rd},
                {l:"Auto-Closed",v:stats.autoClosed,c:C.t3,note:"by design"},
              ].map((s,i)=><div key={i} style={{padding:10,background:C.s1,borderRadius:4,borderLeft:`2px solid ${s.c}`}}>
                <div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1.2,textTransform:"uppercase",fontWeight:600,marginBottom:3}}>{s.l}</div>
                <div style={{fontSize:24,fontFamily:SR,color:s.c,fontWeight:400,lineHeight:1}}>{s.v}</div>
                {s.note&&<div style={{fontSize:8.5,color:C.t4,fontFamily:M,marginTop:2,fontStyle:"italic"}}>{s.note}</div>}
              </div>)}
            </div>
            {stats.errors>0&&<div style={{marginTop:8,padding:8,background:C.rdG,borderLeft:`2px solid ${C.rd}`,fontSize:10.5,color:C.t2,fontFamily:M}}>⚠ {stats.errors} agent error{stats.errors===1?"":"s"} today — check audit log.</div>}
          </div>

          {/* Agent toggles */}
          <div style={{fontSize:9.5,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:10}}>Agents</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {ALL_AGENTS.map(agent=>{
              const enabled=settings[agent.id]?.enabled!==false;
              return <div key={agent.id} style={{padding:12,background:C.s1,border:`1px solid ${C.br}`,borderLeft:`2px solid ${enabled?C.gn:C.t4}`,borderRadius:4}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:6}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                      <span style={{fontSize:14,color:C.pp}}>{agent.icon}</span>
                      <div style={{fontSize:12,color:C.t1,fontWeight:600,fontFamily:F}}>{agent.name}</div>
                    </div>
                    <div style={{fontSize:10,color:C.t3,lineHeight:1.4,fontFamily:F}}>{agent.description}</div>
                  </div>
                  <div onClick={()=>toggle(agent.id)} style={{width:36,height:20,background:enabled?C.gn:C.br,borderRadius:10,position:"relative",cursor:"pointer",transition:"background .15s",flexShrink:0}}>
                    <div style={{width:16,height:16,background:enabled?C.bg:C.t3,borderRadius:"50%",position:"absolute",top:2,left:enabled?18:2,transition:"left .15s"}}/>
                  </div>
                </div>
                <div style={{fontSize:9,fontFamily:M,color:enabled?C.gn:C.t4,letterSpacing:1,textTransform:"uppercase",fontWeight:600,marginTop:6}}>{enabled?"● ENABLED":"○ DISABLED"}</div>
              </div>;
            })}
          </div>

          <div style={{marginTop:16,padding:11,background:C.amG,borderLeft:`2px solid ${C.am}`,borderRadius:3,fontSize:10.5,color:C.t2,lineHeight:1.6,fontFamily:M}}>
            <span style={{color:C.am,fontWeight:600,letterSpacing:.5}}>v8 SAFETY RULE:</span> Agents <span style={{color:C.am,fontWeight:600}}>never auto-close tickets</span>. They produce recommendations. Every close is attorney-initiated, logged, and reversible.
          </div>
        </>:<>
          {/* Audit log viewer */}
          <div style={{fontSize:9.5,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:10}}>Recent activity ({log.length} total)</div>
          {log.length===0?<div style={{fontSize:11,color:C.t3,fontStyle:"italic",padding:"20px 0",textAlign:"center"}}>No agent activity yet.</div>:<div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:420,overflowY:"auto"}}>
            {log.slice(0,50).map((e,i)=><LogRow key={i} e={e}/>)}
          </div>}
        </>}
      </div>
    </div>
  </div>;
}

function LogRow({e}){
  const when=new Date(e.ts);
  const whenStr=when.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"});
  const types={
    "recommendation-generated":{icon:"◉",c:C.pp,label:"Agent generated recommendation"},
    "attorney-approved":{icon:"✓",c:C.gn,label:"Attorney approved"},
    "attorney-edited-approved":{icon:"✎",c:C.cy,label:"Attorney edited + approved"},
    "attorney-rejected":{icon:"✕",c:C.rd,label:"Attorney rejected"},
    "attorney-reassigned":{icon:"→",c:C.bl,label:"Attorney reassigned"},
    "attorney-manual-close":{icon:"✓",c:C.gn,label:"Attorney manual-closed"},
    "attorney-snoozed":{icon:"⏲",c:C.am,label:"Attorney snoozed"},
    "attorney-bulk-approve":{icon:"✓✓",c:C.gn,label:`Bulk-approved (${e.count||0})`},
    "no-agent-match":{icon:"◌",c:C.t3,label:"No agent matched"},
    "agent-error":{icon:"⚠",c:C.rd,label:"Agent error"},
  };
  const style=types[e.type]||{icon:"·",c:C.t3,label:e.type};
  return <div style={{display:"flex",alignItems:"flex-start",gap:10,padding:"7px 9px",background:C.s1,borderRadius:3,fontSize:10.5,fontFamily:M,color:C.t2,borderLeft:`2px solid ${style.c}`}}>
    <span style={{fontSize:11,color:style.c,fontFamily:M,width:18,textAlign:"center",flexShrink:0}}>{style.icon}</span>
    <div style={{flex:1,minWidth:0}}>
      <div style={{color:C.t1}}>{style.label}{e.ticketId?<> · <span style={{color:C.cy}}>{e.ticketId}</span></>:null}{e.ticketIds?<> · {e.ticketIds.length} tickets</>:null}{e.agentId?<> · <span style={{color:C.pp}}>{AGENTS_BY_ID[e.agentId]?.shortName||e.agentId}</span></>:null}</div>
      {(e.confidence!=null||e.reason||e.error)&&<div style={{fontSize:9.5,color:C.t3,marginTop:2}}>{e.confidence!=null&&<>conf {Math.round(e.confidence*100)}% · </>}{e.attorney&&<>by {e.attorney} · </>}{e.reason&&<>{e.reason}</>}{e.error&&<span style={{color:C.rd}}>{e.error}</span>}</div>}
    </div>
    <span style={{color:C.t4,fontSize:9.5,flexShrink:0}}>{whenStr}</span>
  </div>;
}



// ══════════════════════════════════════════════════
// v7.2 Preserved Sub-tabs: Inbox + Detail
// (Operate on v8 store — agent fields render gracefully when present)
// ══════════════════════════════════════════════════
function InboxTab({store,sel,setSel}){
  const[flt,setFlt]=useState("all");
  const tickets=store.tickets;
  const req=sel!==null?tickets.find(t=>t.id===sel):null;
  if(req) return <IntakeDetail req={req} store={store} onBack={()=>setSel(null)}/>;

  const filters=[
    {id:"all",l:"All",n:tickets.length,c:C.bl},
    {id:"overdue",l:"SLA Breached",n:tickets.filter(r=>r.slaStatus==="Overdue").length,c:C.rd},
    {id:"risk",l:"At Risk",n:tickets.filter(r=>r.slaStatus==="At Risk").length,c:C.am},
    {id:"review",l:"In Review",n:tickets.filter(r=>r.stage==="review").length,c:C.tl},
    {id:"auto",l:"Auto-Completed",n:tickets.filter(r=>r.status==="Auto-Completed").length,c:C.gn},
    {id:"new",l:"New (You)",n:tickets.filter(r=>!r.seeded).length,c:C.pp},
  ];
  const filtered=flt==="all"?tickets:flt==="overdue"?tickets.filter(r=>r.slaStatus==="Overdue"):flt==="risk"?tickets.filter(r=>r.slaStatus==="At Risk"):flt==="review"?tickets.filter(r=>r.stage==="review"):flt==="auto"?tickets.filter(r=>r.status==="Auto-Completed"):tickets.filter(r=>!r.seeded);

  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:14}}>
      {[{l:"Today's Requests",v:tickets.length,c:C.bl},
        {l:"Auto-Resolved",v:tickets.filter(r=>r.status==="Auto-Completed").length,c:C.gn,sub:tickets.length?Math.round(tickets.filter(r=>r.status==="Auto-Completed").length/tickets.length*100)+"% deflection":"—"},
        {l:"In Flight",v:tickets.filter(r=>r.stage==="review"||r.stage==="assigned").length,c:C.tl},
        {l:"SLA Breached",v:tickets.filter(r=>r.slaStatus==="Overdue").length,c:C.rd,sub:"Auto-escalated"},
        {l:"Avg Response",v:"3.2h",c:C.am,sub:"↓ 18% MoM"}].map((s,i)=>
        <div key={i} style={{padding:14,background:C.cd,border:`1px solid ${C.br}`,animation:`fu .25s ease ${i*40}ms both`}}>
          <div style={{fontSize:10,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>{s.l}</div>
          <div style={{fontSize:28,fontFamily:SR,fontWeight:400,color:s.c,lineHeight:1}}>{s.v}</div>
          {s.sub&&<div style={{fontSize:9.5,color:C.t4,marginTop:3,fontFamily:M}}>{s.sub}</div>}
        </div>)}
    </div>

    <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
      {filters.map(f=>{
        const active=flt===f.id;
        return <div key={f.id} onClick={()=>setFlt(f.id)} style={{padding:"5px 11px",border:`1px solid ${active?f.c:C.br}`,background:active?f.c+"18":"transparent",cursor:"pointer",transition:"all .15s",fontFamily:M,fontSize:10,letterSpacing:1,textTransform:"uppercase",color:active?f.c:C.t2}}>{f.l} <span style={{color:C.t3,marginLeft:4}}>{f.n}</span></div>;
      })}
    </div>

    <Card>
      <div style={{display:"grid",gridTemplateColumns:"75px 115px 95px 1fr 70px 130px 85px 95px",padding:"8px 10px",fontSize:9,fontWeight:600,color:C.t3,letterSpacing:1.2,textTransform:"uppercase",fontFamily:M,borderBottom:`1px solid ${C.br}`}}>
        <span>ID</span><span>Requester</span><span>Type</span><span>Description</span><span>Priority</span><span>SLA</span><span>Status</span><span>Assignee</span>
      </div>
      {filtered.length===0?<div style={{padding:"40px 10px",textAlign:"center",color:C.t4,fontSize:11,fontFamily:M}}>No tickets match this filter.</div>:filtered.map((r,i)=><div key={r.id} onClick={()=>setSel(r.id)} style={{display:"grid",gridTemplateColumns:"75px 115px 95px 1fr 70px 130px 85px 95px",padding:"10px 10px",borderBottom:`1px solid ${C.br}22`,cursor:"pointer",animation:`fu .25s ease ${i*25}ms both`,fontSize:11,alignItems:"center",background:r.slaStatus==="Overdue"?C.rdG:r.slaStatus==="At Risk"?C.amG:"transparent",transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=C.cdH} onMouseLeave={e=>e.currentTarget.style.background=r.slaStatus==="Overdue"?C.rdG:r.slaStatus==="At Risk"?C.amG:"transparent"}>
        <span style={{fontFamily:M,color:r.seeded?C.cy:C.pp,fontWeight:600,fontSize:10}}>{r.id}</span>
        <div><div style={{color:C.t1,fontWeight:500,fontSize:11}}>{r.from}</div><div style={{color:C.t4,fontSize:9}}>{r.dept}</div></div>
        <Pill t={r.type} c={C.pp}/>
        <span style={{color:C.t2,fontSize:10.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.desc.substring(0,70)}{r.desc.length>70?"…":""}</span>
        <Pill t={r.priority} c={pc(r.priority)}/>
        <div><div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:10,color:r.slaStatus==="Overdue"?C.rd:r.slaStatus==="At Risk"?C.am:C.gn,fontWeight:600,fontFamily:M,minWidth:40}}>{r.age}</span><div style={{flex:1,height:3,background:C.br,borderRadius:2,overflow:"hidden"}}><div style={{width:`${Math.min(r.slaPct,100)}%`,height:"100%",background:r.slaPct>100?C.rd:r.slaPct>70?C.am:C.gn}}/></div></div><div style={{fontSize:8.5,color:C.t4,marginTop:2,fontFamily:M}}>of {r.sla}</div></div>
        <Pill t={r.status} c={r.status==="Auto-Completed"?C.gn:r.status.includes("Escalated")?C.rd:r.status==="Triage"?C.am:C.tl}/>
        <span style={{fontSize:9.5,color:C.t3}}>{r.assigned}</span>
      </div>)}
    </Card>
  </div>;
}

// ── Detail view (with working quick-actions) ─────────
function IntakeDetail({req,store,onBack}){
  const advance=()=>{
    const stages=["new","triage","assigned","review","complete"];
    const idx=stages.indexOf(req.stage);
    if(idx<stages.length-1){
      const nextStage=stages[idx+1];
      const wf=req.workflow.map((s,i)=>i<=idx+1?{...s,done:i<=idx,active:i===idx+1&&nextStage!=="complete"}:{...s,done:false,active:false});
      if(nextStage==="complete") wf.forEach(s=>{s.done=true;s.active=false});
      store.updateTicket(req.id,{stage:nextStage,status:nextStage==="complete"?"Completed":nextStage==="review"?"In Review":nextStage==="assigned"?"Assigned":"Triage",workflow:wf});
    }
  };
  const escalate=()=>{
    store.updateTicket(req.id,{status:"Escalated to GC",priority:"Critical",assigned:"Mark Williams, GC + "+req.assigned});
  };
  const complete=()=>{
    const wf=req.workflow.map(s=>({...s,done:true,active:false}));
    store.updateTicket(req.id,{stage:"complete",status:"Completed",workflow:wf});
  };

  return <div>
    <div onClick={onBack} style={{display:"inline-flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:11,color:C.cy,marginBottom:12,padding:"3px 6px",fontFamily:M,letterSpacing:1}} onMouseEnter={e=>e.currentTarget.style.background=C.cy+"18"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>← Back to Inbox</div>

    <div style={{background:C.cd,border:`1px solid ${C.br}`,borderLeft:`3px solid ${pc(req.priority)}`,padding:18,marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:20}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
            <span style={{fontFamily:M,fontSize:11,color:C.cy,fontWeight:600,letterSpacing:.5}}>{req.id}</span>
            <Pill t={req.priority} c={pc(req.priority)}/>
            <Pill t={req.type} c={C.pp}/>
            <Pill t={req.status} c={req.status==="Auto-Completed"||req.status==="Completed"?C.gn:req.status.includes("Escalated")?C.rd:C.tl}/>
            {!req.seeded&&<Pill t="YOU CREATED" c={C.pp}/>}
          </div>
          <div style={{fontSize:16,fontWeight:400,color:C.t1,fontFamily:SR,lineHeight:1.35,marginBottom:8}}>{req.desc}</div>
          <div style={{fontSize:11,color:C.t3,fontFamily:M}}>From <span style={{color:C.t1}}>{req.from}</span> · {req.dept} · Submitted {req.submitted} · Assigned to <span style={{color:C.tl}}>{req.assigned}</span></div>
        </div>
        <div style={{textAlign:"right",minWidth:130}}>
          <div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:1.5,fontFamily:M,marginBottom:4}}>SLA {req.slaStatus}</div>
          <div style={{fontSize:22,fontWeight:400,color:req.slaStatus==="Overdue"?C.rd:req.slaStatus==="At Risk"?C.am:C.gn,fontFamily:SR,lineHeight:1}}>{req.age}</div>
          <div style={{fontSize:10,color:C.t4,marginTop:2,fontFamily:M}}>of {req.sla} window</div>
          <div style={{marginTop:8}}><Bar pct={req.slaPct} c={req.slaPct>100?C.rd:req.slaPct>70?C.am:C.gn} h={5}/></div>
          <div style={{fontSize:9.5,color:C.t4,marginTop:3,fontFamily:M}}>{req.slaPct}% elapsed</div>
        </div>
      </div>
    </div>

    <div style={{fontSize:11,fontWeight:600,color:C.cy,marginBottom:6,letterSpacing:1,textTransform:"uppercase",fontFamily:M}}>Request Workflow</div>
    <WorkflowSteps steps={req.workflow}/>

    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14,marginTop:14}}>
      <Card d={100}>
        <div style={{fontSize:11,fontWeight:600,color:C.tl,marginBottom:10,letterSpacing:1.2,fontFamily:M,textTransform:"uppercase",display:"flex",justifyContent:"space-between"}}>
          <span>◎ AI Triage Analysis</span>
          <span style={{fontSize:9,color:req.aiTriage.source==="claude"?C.em:C.t4,fontFamily:M,letterSpacing:1}}>{req.aiTriage.source==="claude"?"CLAUDE LLM":req.aiTriage.source==="regex"?"REGEX CLASSIFIER":"FALLBACK"}</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:12}}>
          <div style={{padding:10,background:C.s1,borderRadius:5}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:.8,fontWeight:600,marginBottom:3,fontFamily:M}}>Category</div><div style={{fontSize:11.5,fontWeight:600,color:C.t1}}>{req.aiTriage.category}</div></div>
          <div style={{padding:10,background:C.s1,borderRadius:5}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:.8,fontWeight:600,marginBottom:3,fontFamily:M}}>Est Hours</div><div style={{fontSize:20,fontWeight:400,color:C.tl,fontFamily:SR}}>{req.aiTriage.estimatedHours}</div></div>
          <div style={{padding:10,background:C.s1,borderRadius:5}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:.8,fontWeight:600,marginBottom:3,fontFamily:M}}>Similar</div><div style={{fontSize:20,fontWeight:400,color:C.bl,fontFamily:SR}}>{req.aiTriage.similarMatters||"—"}</div></div>
          <div style={{padding:10,background:C.s1,borderRadius:5}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:.8,fontWeight:600,marginBottom:3,fontFamily:M}}>Confidence</div><div style={{fontSize:20,fontWeight:400,color:req.aiTriage.confidence>90?C.gn:C.am,fontFamily:SR}}>{req.aiTriage.confidence}%</div></div>
        </div>
        <div style={{padding:11,background:req.aiTriage.riskFlag.startsWith("Critical")?C.rdG:req.aiTriage.riskFlag.startsWith("None")?C.gnG:C.amG,borderRadius:5,borderLeft:`3px solid ${req.aiTriage.riskFlag.startsWith("Critical")?C.rd:req.aiTriage.riskFlag.startsWith("None")?C.gn:C.am}`,marginBottom:10}}>
          <div style={{fontSize:9,fontWeight:600,color:C.t3,marginBottom:3,letterSpacing:1,textTransform:"uppercase",fontFamily:M}}>Risk Assessment</div>
          <div style={{fontSize:11.5,color:C.t1,lineHeight:1.5}}>{req.aiTriage.riskFlag}</div>
        </div>
        <div style={{padding:10,background:C.s1,borderRadius:5,borderLeft:`2px solid ${C.cy}`}}>
          <div style={{fontSize:9,fontWeight:600,color:C.t3,marginBottom:3,letterSpacing:1,textTransform:"uppercase",fontFamily:M}}>Routing Rule Applied</div>
          <div style={{fontSize:11,color:C.t1,fontFamily:M}}>{req.aiTriage.routingRule}</div>
        </div>
      </Card>

      <Card d={150}>
        <div style={{fontSize:11,fontWeight:600,color:C.am,marginBottom:10,letterSpacing:1.2,fontFamily:M,textTransform:"uppercase"}}>⚡ Quick Actions</div>
        {[
          {l:req.stage==="complete"?"✓ Completed":"Advance Stage",c:C.bl,i:"→",fn:advance,disabled:req.stage==="complete"},
          {l:"Escalate to GC",c:C.rd,i:"⚡",fn:escalate,disabled:req.status==="Escalated to GC"},
          {l:"Mark Complete",c:C.gn,i:"✓",fn:complete,disabled:req.stage==="complete"},
        ].map((a,i)=><div key={i} onClick={a.disabled?null:a.fn} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 11px",background:C.s1,borderRadius:4,cursor:a.disabled?"not-allowed":"pointer",marginBottom:6,border:`1px solid ${C.br}`,transition:"all .15s",opacity:a.disabled?.4:1}} onMouseEnter={e=>{if(a.disabled)return;e.currentTarget.style.borderColor=a.c;e.currentTarget.style.background=a.c+"18"}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.br;e.currentTarget.style.background=C.s1}}>
          <span style={{fontSize:13,color:a.c,width:18,textAlign:"center"}}>{a.i}</span>
          <span style={{fontSize:11,color:C.t1,flex:1}}>{a.l}</span>
        </div>)}
        <div style={{marginTop:12,padding:10,background:C.s1,borderRadius:4,borderLeft:`2px solid ${C.tl}`}}>
          <div style={{fontSize:9,color:C.tl,textTransform:"uppercase",letterSpacing:1.2,fontFamily:M,marginBottom:4}}>Changes Persist</div>
          <div style={{fontSize:10,color:C.t2,lineHeight:1.5}}>Every action updates the ticket store. Refresh the page — your changes are still here.</div>
        </div>
      </Card>
    </div>
  </div>;
}

// ── New Request Form (wired with real AI + persistence) ──

// ══════════════════════════════════════════════════
// v7.2 Preserved Sub-tabs: Kanban · SLA · Routing · Self-Service
// ══════════════════════════════════════════════════
function KanbanTab({store}){
  const[dragging,setDragging]=useState(null);
  const tickets=store.tickets;
  const stages=[
    {id:"new",label:"New",c:C.bl,desc:"Just submitted"},
    {id:"triage",label:"AI Triage",c:C.am,desc:"Being classified"},
    {id:"assigned",label:"Assigned",c:C.pp,desc:"Owner notified"},
    {id:"review",label:"In Review",c:C.tl,desc:"Active work"},
    {id:"complete",label:"Complete",c:C.gn,desc:"Resolved"},
  ];

  const onDrop=async(stageId)=>{
    if(!dragging) return;
    const ticket=tickets.find(t=>t.id===dragging);
    if(!ticket||ticket.stage===stageId){ setDragging(null); return; }
    const stageIdx=stages.findIndex(s=>s.id===stageId);
    const wf=ticket.workflow.map((s,i)=>({
      ...s,
      done:i<stageIdx,
      active:i===stageIdx&&stageId!=="complete",
    }));
    if(stageId==="complete") wf.forEach(s=>{s.done=true;s.active=false});
    const statusMap={new:"Triage",triage:"Triage",assigned:"Assigned",review:"In Review",complete:"Completed"};
    await store.updateTicket(dragging,{stage:stageId,status:statusMap[stageId],workflow:wf});
    setDragging(null);
  };

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <div style={{fontSize:11,color:C.t3,fontFamily:M,letterSpacing:.5}}>Drag cards between columns — changes persist to the ticket store · {tickets.length} active matters</div>
      <div style={{display:"flex",gap:8,fontSize:10,fontFamily:M,color:C.t4,letterSpacing:1,textTransform:"uppercase"}}>
        <span><Dot c={C.gn}/> On Track</span>
        <span><Dot c={C.am}/> At Risk</span>
        <span><Dot c={C.rd}/> Breached</span>
      </div>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,height:"calc(100vh - 330px)",minHeight:520}}>
      {stages.map((stage,si)=>{
        const col=tickets.filter(it=>it.stage===stage.id);
        return <div key={stage.id} onDragOver={e=>e.preventDefault()} onDrop={()=>onDrop(stage.id)} style={{background:C.s1,border:`1px solid ${C.br}`,borderTop:`3px solid ${stage.c}`,borderRadius:"0 0 6px 6px",display:"flex",flexDirection:"column",overflow:"hidden",animation:`fu .25s ease ${si*50}ms both`}}>
          <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.br}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:stage.c,fontFamily:M,letterSpacing:1.2,textTransform:"uppercase"}}>{stage.label}</div>
              <div style={{fontSize:9,color:C.t4,marginTop:1}}>{stage.desc}</div>
            </div>
            <div style={{padding:"2px 8px",background:stage.c+"22",color:stage.c,fontSize:11,fontFamily:M,fontWeight:700,borderRadius:3}}>{col.length}</div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:8,display:"flex",flexDirection:"column",gap:7}}>
            {col.length===0?<div style={{fontSize:10,color:C.t4,textAlign:"center",padding:"30px 8px",fontFamily:M,letterSpacing:.5}}>— empty —</div>:col.map((it,i)=><div key={it.id} draggable onDragStart={()=>setDragging(it.id)} onDragEnd={()=>setDragging(null)} style={{padding:10,background:C.cd,border:`1px solid ${C.br}`,borderLeft:`3px solid ${pc(it.priority)}`,borderRadius:4,cursor:"grab",opacity:dragging===it.id?.4:1,transition:"opacity .15s,border-color .15s",animation:`fu .2s ease ${i*30}ms both`}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.brL} onMouseLeave={e=>e.currentTarget.style.borderColor=C.br}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <span style={{fontSize:9,color:it.seeded?C.cy:C.pp,fontFamily:M,fontWeight:600,letterSpacing:.5}}>{it.id}</span>
                <Dot c={it.slaStatus==="Overdue"?C.rd:it.slaStatus==="At Risk"?C.am:C.gn} p={it.slaStatus!=="On Track"}/>
              </div>
              <div style={{fontSize:10.5,color:C.t1,lineHeight:1.4,marginBottom:6,fontWeight:500,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{it.desc}</div>
              <div style={{display:"flex",gap:4,marginBottom:5,flexWrap:"wrap"}}>
                <Pill t={it.priority} c={pc(it.priority)}/>
                <Pill t={it.type} c={C.pp}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:9,color:C.t4,fontFamily:M,borderTop:`1px solid ${C.br}33`,paddingTop:5,marginTop:3}}>
                <span style={{color:C.t3}}>{it.from.split(",")[0]}</span>
                <span style={{color:it.slaStatus==="Overdue"?C.rd:it.slaStatus==="At Risk"?C.am:C.gn,fontWeight:600}}>{it.age}</span>
              </div>
            </div>)}
          </div>
          <div style={{padding:"6px 10px",borderTop:`1px solid ${C.br}`,fontSize:9,color:C.t4,fontFamily:M,display:"flex",justifyContent:"space-between"}}>
            <span>{col.filter(c=>c.priority==="Critical").length} critical</span>
            <span>{col.length} total</span>
          </div>
        </div>;
      })}
    </div>
  </div>;
}

// ── SLA Dashboard (computed live from store) ─────────
function SLATab({store}){
  const tickets=store.tickets;
  const totalActive=tickets.length;
  const onTrack=tickets.filter(t=>t.slaStatus==="On Track").length;
  const atRisk=tickets.filter(t=>t.slaStatus==="At Risk").length;
  const breached=tickets.filter(t=>t.slaStatus==="Overdue").length;
  const overallSla=totalActive?Math.round(onTrack/totalActive*100):100;

  // Compute per-team from live tickets
  const teamMap={};
  tickets.forEach(t=>{
    const team=t.assigned.split(",")[0].replace(/AI Auto-.*/,"AI Auto-Resolve");
    if(!teamMap[team]) teamMap[team]={team,active:0,onTrack:0,atRisk:0,breached:0,totalHours:0};
    teamMap[team].active++;
    teamMap[team].totalHours+=t.slaPct/100*t.slaHours;
    if(t.slaStatus==="Overdue") teamMap[team].breached++;
    else if(t.slaStatus==="At Risk") teamMap[team].atRisk++;
    else teamMap[team].onTrack++;
  });
  const teams=Object.values(teamMap).map(t=>({
    ...t,
    avgResp:t.active?(t.totalHours/t.active).toFixed(1)+"h":"—",
    slaMet:t.active?Math.round(t.onTrack/t.active*100):100,
  })).sort((a,b)=>b.active-a.active);

  // Mock 24h burndown (could be persisted separately in future)
  const burndown=[95,94,92,88,85,89,93,96,94,91,88,85,89,92,94,93,91,89,87,88,90,92,94,overallSla];

  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
      {[
        {l:"Overall SLA Met",v:overallSla+"%",c:overallSla>=95?C.gn:overallSla>=90?C.am:C.rd,sub:"Target: 95%"},
        {l:"Active Matters",v:totalActive,c:C.bl,sub:`Across ${teams.length} teams`},
        {l:"At-Risk Count",v:atRisk,c:C.am,sub:">70% SLA elapsed"},
        {l:"Breached",v:breached,c:C.rd,sub:"Auto-escalated"},
      ].map((s,i)=><div key={i} style={{padding:14,background:C.cd,border:`1px solid ${C.br}`,animation:`fu .25s ease ${i*40}ms both`}}>
        <div style={{fontSize:10,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>{s.l}</div>
        <div style={{fontSize:32,fontFamily:SR,fontWeight:400,color:s.c,lineHeight:1}}>{s.v}</div>
        <div style={{fontSize:10,color:C.t4,marginTop:4,fontFamily:M}}>{s.sub}</div>
      </div>)}
    </div>

    <Card d={50} style={{marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:600,color:C.tl,marginBottom:10,letterSpacing:1.2,fontFamily:M,textTransform:"uppercase",display:"flex",justifyContent:"space-between"}}>
        <span>◷ SLA Compliance — Last 24 Hours</span>
        <span style={{fontSize:10,color:C.t4}}>Rolling · updates with store</span>
      </div>
      <div style={{display:"flex",alignItems:"flex-end",gap:3,height:120,marginBottom:8}}>
        {burndown.map((v,i)=>{
          const color=v>=95?C.gn:v>=90?C.am:C.rd;
          return <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
            <div style={{width:"100%",height:`${v}%`,background:color,borderRadius:"2px 2px 0 0",animation:`bi .6s ease ${i*25}ms both`,"--w":`${v}%`,opacity:.85}}/>
            <div style={{fontSize:8,color:C.t4,fontFamily:M}}>{i%4===0?(i<10?"0"+i:i)+"h":""}</div>
          </div>;
        })}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:9.5,color:C.t4,fontFamily:M,letterSpacing:.5,borderTop:`1px solid ${C.br}33`,paddingTop:8}}>
        <span>24h ago</span><span style={{color:C.gn}}>▬ SLA Target 95%</span><span>Now ({overallSla}%)</span>
      </div>
    </Card>

    <Card d={100}>
      <div style={{fontSize:11,fontWeight:600,color:C.bl,marginBottom:12,letterSpacing:1.2,fontFamily:M,textTransform:"uppercase"}}>▤ SLA by Team · Live from store</div>
      <div style={{display:"grid",gridTemplateColumns:"1.4fr 70px 70px 70px 70px 90px 1fr",padding:"8px 10px",fontSize:9,fontWeight:600,color:C.t3,letterSpacing:1.2,textTransform:"uppercase",fontFamily:M,borderBottom:`1px solid ${C.br}`,marginBottom:4}}>
        <span>Team</span><span>Active</span><span style={{color:C.gn}}>On Track</span><span style={{color:C.am}}>At Risk</span><span style={{color:C.rd}}>Breached</span><span>Avg Resp</span><span>SLA Met</span>
      </div>
      {teams.length===0?<div style={{padding:"30px 10px",textAlign:"center",color:C.t4,fontSize:11,fontFamily:M}}>No tickets in store.</div>:teams.map((t,i)=><div key={t.team} style={{display:"grid",gridTemplateColumns:"1.4fr 70px 70px 70px 70px 90px 1fr",padding:"10px 10px",borderBottom:`1px solid ${C.br}22`,fontSize:11,alignItems:"center",animation:`fu .25s ease ${i*25}ms both`}}>
        <span style={{color:C.t1,fontWeight:500}}>{t.team}</span>
        <span style={{fontFamily:M,color:C.bl,fontWeight:600}}>{t.active}</span>
        <span style={{fontFamily:M,color:C.gn}}>{t.onTrack}</span>
        <span style={{fontFamily:M,color:t.atRisk>0?C.am:C.t4}}>{t.atRisk}</span>
        <span style={{fontFamily:M,color:t.breached>0?C.rd:C.t4,fontWeight:t.breached>0?700:400}}>{t.breached}</span>
        <span style={{fontFamily:M,color:C.t2,fontSize:10.5}}>{t.avgResp}</span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{flex:1,height:5,background:C.br,borderRadius:3,overflow:"hidden"}}><div style={{width:`${t.slaMet}%`,height:"100%",background:t.slaMet>=95?C.gn:t.slaMet>=90?C.am:C.rd,animation:"bi .8s ease both","--w":`${t.slaMet}%`}}/></div>
          <span style={{fontSize:10,fontFamily:M,color:t.slaMet>=95?C.gn:t.slaMet>=90?C.am:C.rd,fontWeight:600,minWidth:30}}>{t.slaMet}%</span>
        </div>
      </div>)}
    </Card>

    {(atRisk>0||breached>0)&&<Card d={150} style={{marginTop:14}}>
      <div style={{fontSize:11,fontWeight:600,color:C.rd,marginBottom:10,letterSpacing:1.2,fontFamily:M,textTransform:"uppercase"}}>⚠ Active Breaches & At-Risk Matters</div>
      {tickets.filter(r=>r.slaStatus==="Overdue"||r.slaStatus==="At Risk").map((r,i)=><div key={r.id} style={{padding:"10px 12px",background:r.slaStatus==="Overdue"?C.rdG:C.amG,borderRadius:4,marginBottom:6,borderLeft:`3px solid ${r.slaStatus==="Overdue"?C.rd:C.am}`,animation:`fu .25s ease ${i*40}ms both`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontFamily:M,fontSize:10,color:C.cy,fontWeight:600}}>{r.id}</span>
            <Pill t={r.priority} c={pc(r.priority)}/>
            <span style={{fontSize:11,color:C.t1,fontWeight:500}}>{r.type}</span>
          </div>
          <div style={{fontSize:11,color:r.slaStatus==="Overdue"?C.rd:C.am,fontFamily:M,fontWeight:700}}>{r.slaPct}% of SLA · {r.age}</div>
        </div>
        <div style={{fontSize:10.5,color:C.t2,lineHeight:1.5}}>{r.desc.substring(0,110)}{r.desc.length>110?"…":""}</div>
        <div style={{fontSize:9.5,color:C.t4,marginTop:4,fontFamily:M}}>Assigned: {r.assigned} · From: {r.from} ({r.dept})</div>
      </div>)}
    </Card>}
  </div>;
}

// ── Smart Routing (static rules — could also live in storage later) ──
function RoutingTab(){
  const[selRule,setSelRule]=useState(null);
  const totalAuto=ROUTING_RULES.reduce((a,r)=>a+r.matches*r.autoPct/100,0);
  const totalMatches=ROUTING_RULES.reduce((a,r)=>a+r.matches,0);

  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
      {[
        {l:"Active Rules",v:ROUTING_RULES.filter(r=>r.enabled).length,c:C.cy,sub:`of ${ROUTING_RULES.length} total`},
        {l:"Matches (30d)",v:totalMatches,c:C.bl,sub:"Auto-routed"},
        {l:"Auto-Resolved",v:Math.round(totalAuto),c:C.gn,sub:`${Math.round(totalAuto/totalMatches*100)}% of matches`},
        {l:"Routing Accuracy",v:"96.8%",c:C.tl,sub:"Validated by attorneys"},
      ].map((s,i)=><div key={i} style={{padding:14,background:C.cd,border:`1px solid ${C.br}`,animation:`fu .25s ease ${i*40}ms both`}}>
        <div style={{fontSize:10,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>{s.l}</div>
        <div style={{fontSize:32,fontFamily:SR,fontWeight:400,color:s.c,lineHeight:1}}>{s.v}</div>
        <div style={{fontSize:10,color:C.t4,marginTop:4,fontFamily:M}}>{s.sub}</div>
      </div>)}
    </div>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      <Card>
        <div style={{fontSize:11,fontWeight:600,color:C.cy,marginBottom:12,letterSpacing:1.2,fontFamily:M,textTransform:"uppercase"}}>◈ Routing Rules</div>
        {ROUTING_RULES.map((r,i)=><div key={r.id} onClick={()=>setSelRule(r)} style={{padding:"10px 12px",background:selRule?.id===r.id?C.cdH:C.s1,border:`1px solid ${selRule?.id===r.id?C.cy:C.br}`,borderLeft:`3px solid ${r.enabled?C.gn:C.t4}`,borderRadius:4,marginBottom:6,cursor:"pointer",animation:`fu .2s ease ${i*25}ms both`,transition:"all .15s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontFamily:M,fontSize:10,color:C.cy,fontWeight:700,letterSpacing:.5}}>{r.id}</span>
              {r.autoPct===100&&<Pill t="AUTO" c={C.gn}/>}
              {r.autoPct>0&&r.autoPct<100&&<Pill t={`${r.autoPct}% AUTO`} c={C.am}/>}
              {r.autoPct===0&&<Pill t="HUMAN" c={C.bl}/>}
            </div>
            <span style={{fontSize:9.5,color:C.t4,fontFamily:M}}>{r.matches} matches</span>
          </div>
          <div style={{fontSize:11,color:C.t1,fontWeight:500,lineHeight:1.4,marginBottom:3}}>{r.cond}</div>
          <div style={{fontSize:10,color:C.t3,fontFamily:M}}>→ {r.action}</div>
        </div>)}
      </Card>

      <div>
        {selRule?<Card d={0} style={{borderLeft:`3px solid ${C.cy}`}}>
          <div style={{fontSize:11,fontWeight:600,color:C.cy,marginBottom:10,letterSpacing:1.2,fontFamily:M,textTransform:"uppercase"}}>Rule Detail · {selRule.id}</div>
          <div style={{padding:12,background:C.s1,borderRadius:4,marginBottom:10}}>
            <div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:1,fontFamily:M,marginBottom:4}}>When</div>
            <div style={{fontSize:12,color:C.t1,fontFamily:M,lineHeight:1.5}}>{selRule.cond}</div>
          </div>
          <div style={{padding:12,background:C.tlG,borderRadius:4,marginBottom:10,borderLeft:`2px solid ${C.tl}`}}>
            <div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:1,fontFamily:M,marginBottom:4}}>Then</div>
            <div style={{fontSize:12,color:C.t1,fontWeight:600,marginBottom:3}}>{selRule.action}</div>
            <div style={{fontSize:11,color:C.tl,fontFamily:M}}>Assigned to: {selRule.assignee}</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            <div style={{padding:10,background:C.s1,borderRadius:4,textAlign:"center"}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:1,fontFamily:M,marginBottom:3}}>Matches</div><div style={{fontSize:20,color:C.bl,fontFamily:SR,fontWeight:400}}>{selRule.matches}</div></div>
            <div style={{padding:10,background:C.s1,borderRadius:4,textAlign:"center"}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:1,fontFamily:M,marginBottom:3}}>Automated</div><div style={{fontSize:20,color:C.gn,fontFamily:SR,fontWeight:400}}>{selRule.autoPct}%</div></div>
            <div style={{padding:10,background:C.s1,borderRadius:4,textAlign:"center"}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:1,fontFamily:M,marginBottom:3}}>Status</div><div style={{fontSize:14,color:selRule.enabled?C.gn:C.t4,fontFamily:M,fontWeight:700,paddingTop:3}}>{selRule.enabled?"ACTIVE":"PAUSED"}</div></div>
          </div>
        </Card>:<Card>
          <div style={{fontSize:11,fontWeight:600,color:C.tl,marginBottom:12,letterSpacing:1.2,fontFamily:M,textTransform:"uppercase"}}>◉ Routing Flow</div>
          <div style={{padding:14,background:C.s1,borderRadius:5}}>
            {[
              {l:"Request arrives",desc:"Form submission",c:C.bl},
              {l:"Regex Classifier",desc:"Instant · free · covers 60% with ≥90% confidence",c:C.tl},
              {l:"Claude Fallback",desc:"When regex confidence < 90%, real LLM classifies",c:C.em},
              {l:"Deflection Check",desc:"KB hit? → auto-answer, no ticket",c:C.gn},
              {l:"Routing Decision",desc:"Auto-resolve · team assign · escalate",c:C.am},
              {l:"Persist + SLA Start",desc:"Ticket saved to window.storage · clock starts",c:C.pp},
            ].map((s,i)=><div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",paddingBottom:i<5?12:0,position:"relative"}}>
              <div style={{width:24,height:24,borderRadius:"50%",background:s.c+"22",border:`1px solid ${s.c}`,color:s.c,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,fontFamily:M,flexShrink:0,position:"relative",zIndex:1}}>{i+1}</div>
              {i<5&&<div style={{position:"absolute",left:12,top:24,bottom:0,width:1,background:C.br}}/>}
              <div style={{flex:1,paddingTop:2}}>
                <div style={{fontSize:12,color:C.t1,fontWeight:600}}>{s.l}</div>
                <div style={{fontSize:10.5,color:C.t3,marginTop:2}}>{s.desc}</div>
              </div>
            </div>)}
          </div>
          <div style={{fontSize:10,color:C.t4,marginTop:10,fontFamily:M,letterSpacing:.5,textAlign:"center"}}>Select a rule from the left to see details</div>
        </Card>}
      </div>
    </div>
  </div>;
}

// ── Self-Service (static KB) ─────────────────────────
function SelfServeTab(){
  const[q,setQ]=useState("");
  const[sel,setSel]=useState(null);
  const results=useMemo(()=>{
    if(!q) return KB_TOPICS;
    const qq=q.toLowerCase();
    return KB_TOPICS.filter(t=>t.q.toLowerCase().includes(qq)||t.cat.toLowerCase().includes(qq)||t.answer.toLowerCase().includes(qq));
  },[q]);

  const totalResolved=KB_TOPICS.reduce((a,t)=>a+t.resolved,0);
  const avgDefl=Math.round(KB_TOPICS.reduce((a,t)=>a+t.deflectionRate,0)/KB_TOPICS.length);

  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
      {[
        {l:"KB Articles",v:KB_TOPICS.length,c:C.tl,sub:"AI-maintained"},
        {l:"Questions Resolved",v:totalResolved.toLocaleString(),c:C.gn,sub:"Last 90 days"},
        {l:"Avg Deflection",v:avgDefl+"%",c:C.cy,sub:"No legal ticket needed"},
        {l:"Hours Saved",v:"1,247",c:C.am,sub:"Attorney time · 90d"},
      ].map((s,i)=><div key={i} style={{padding:14,background:C.cd,border:`1px solid ${C.br}`,animation:`fu .25s ease ${i*40}ms both`}}>
        <div style={{fontSize:10,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>{s.l}</div>
        <div style={{fontSize:32,fontFamily:SR,fontWeight:400,color:s.c,lineHeight:1}}>{s.v}</div>
        <div style={{fontSize:10,color:C.t4,marginTop:4,fontFamily:M}}>{s.sub}</div>
      </div>)}
    </div>

    <Card style={{marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:600,color:C.tl,marginBottom:10,letterSpacing:1.2,fontFamily:M,textTransform:"uppercase"}}>◎ Ask Before You Ticket</div>
      <div style={{position:"relative"}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search the legal knowledge base — try 'nda', 'sanctions', 'payment terms'..." style={{...inputStyle,fontSize:13,padding:"12px 14px 12px 38px"}}/>
        <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:15,color:C.t4}}>🔍</span>
      </div>
      <div style={{fontSize:10,color:C.t4,marginTop:6,fontFamily:M,letterSpacing:.5}}>{results.length} article{results.length===1?"":"s"} · Aurora AI reads your query and returns the best match</div>
    </Card>

    <div style={{display:"grid",gridTemplateColumns:sel?"1fr 1.3fr":"1fr",gap:14}}>
      <Card>
        <div style={{fontSize:11,fontWeight:600,color:C.cy,marginBottom:12,letterSpacing:1.2,fontFamily:M,textTransform:"uppercase"}}>▤ Top Articles</div>
        {results.length===0?<div style={{padding:"30px 10px",textAlign:"center",color:C.t4,fontSize:11,fontFamily:M}}>No matches — submit a legal ticket instead →</div>:results.map((t,i)=><div key={i} onClick={()=>setSel(t)} style={{padding:"11px 12px",background:sel===t?C.cdH:C.s1,border:`1px solid ${sel===t?C.tl:C.br}`,borderRadius:4,marginBottom:6,cursor:"pointer",animation:`fu .2s ease ${i*30}ms both`,transition:"all .15s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <Pill t={t.cat} c={C.pp}/>
            <span style={{fontSize:9.5,color:C.gn,fontFamily:M,fontWeight:600}}>{t.deflectionRate}% deflection</span>
          </div>
          <div style={{fontSize:12,color:C.t1,fontWeight:600,marginBottom:3,lineHeight:1.4}}>{t.q}</div>
          <div style={{fontSize:9.5,color:C.t4,fontFamily:M,letterSpacing:.3}}>Resolved {t.resolved.toLocaleString()}× · Source: {t.owner}</div>
        </div>)}
      </Card>

      {sel&&<Card d={0} style={{borderLeft:`3px solid ${C.tl}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:600,color:C.tl,letterSpacing:1.2,fontFamily:M,textTransform:"uppercase"}}>◎ Article Detail</div>
          <span onClick={()=>setSel(null)} style={{fontSize:14,color:C.t4,cursor:"pointer"}}>✕</span>
        </div>
        <Pill t={sel.cat} c={C.pp}/>
        <div style={{fontSize:17,color:C.t1,fontWeight:400,fontFamily:SR,marginTop:8,marginBottom:12,lineHeight:1.3}}>{sel.q}</div>
        <div style={{padding:14,background:C.gnG,borderRadius:4,borderLeft:`3px solid ${C.gn}`,marginBottom:12}}>
          <div style={{fontSize:9,color:C.gn,textTransform:"uppercase",letterSpacing:1.5,fontFamily:M,marginBottom:5,fontWeight:600}}>Answer</div>
          <div style={{fontSize:12,color:C.t1,lineHeight:1.65}}>{sel.answer}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
          <div style={{padding:10,background:C.s1,borderRadius:4,textAlign:"center"}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:1,fontFamily:M,marginBottom:3}}>Resolved</div><div style={{fontSize:18,color:C.gn,fontFamily:SR,fontWeight:400}}>{sel.resolved.toLocaleString()}</div></div>
          <div style={{padding:10,background:C.s1,borderRadius:4,textAlign:"center"}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:1,fontFamily:M,marginBottom:3}}>Deflection</div><div style={{fontSize:18,color:C.cy,fontFamily:SR,fontWeight:400}}>{sel.deflectionRate}%</div></div>
          <div style={{padding:10,background:C.s1,borderRadius:4,textAlign:"center"}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:1,fontFamily:M,marginBottom:3}}>Source</div><div style={{fontSize:10,color:C.t1,fontFamily:M,paddingTop:4,lineHeight:1.3}}>{sel.owner}</div></div>
        </div>
      </Card>}
    </div>
  </div>;
}

// ══════════════════════════════════════════════════
// MAIN MODULE — IntakeView (merged v7.2 + v8)
// v8 tabs: Cockpit, NewRequest
// v7.2 tabs preserved: Inbox, Kanban, SLA, Routing, Self-Service
// ══════════════════════════════════════════════════
function IntakeView(){
  const[tab,setTab]=useState("cockpit"); // default to Cockpit — v8 showcase
  const[sel,setSel]=useState(null);      // used by Inbox tab for drill-in
  const[showSettings,setShowSettings]=useState(false);

  const agentSettingsHook=useAgentSettings();
  const store=useTicketStore(agentSettingsHook.settings);
  const cockpit=useCockpitState();
  const log=useAgentLog();

  const tabs=[
    {id:"inbox",label:"Inbox",icon:"◉"},
    {id:"new",label:"New Request",icon:"＋",v8:true},
    {id:"cockpit",label:"Triage Cockpit",icon:"⌘",v8:true},
    {id:"kanban",label:"Kanban",icon:"◱"},
    {id:"sla",label:"SLA Dashboard",icon:"◔"},
    {id:"routing",label:"Smart Routing",icon:"⚯",count:ROUTING_RULES.length},
    {id:"selfserve",label:"Self-Service",icon:"◈",count:KB_TOPICS.length},
  ];

  const awaiting=store.tickets.filter(t=>t.stage==="new"&&!t.triagedBy&&t.status!=="Snoozed").length;

  if(store.loading) return <div style={{padding:40,textAlign:"center",color:C.t3,fontFamily:M,fontSize:12,letterSpacing:1}}>
    ◎ LOADING AEGIS LEGAL INTAKE v8 …
  </div>;

  return <div>
    {showSettings&&<AgentSettingsPanel onClose={()=>setShowSettings(false)} settings={agentSettingsHook.settings} toggle={agentSettingsHook.toggle} log={log}/>}

    {/* Aurora eyebrow + title */}
    <div style={{marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:20,flexWrap:"wrap"}}>
      <div>
        <div style={{fontSize:10,fontFamily:M,letterSpacing:2,color:C.cy,textTransform:"uppercase",marginBottom:4}}>OPERATIONS · LEGAL · INTAKE v8</div>
        <div style={{fontSize:24,fontFamily:SR,color:C.t1,fontWeight:400,lineHeight:1.2}}>Mission control for every legal request — <em style={{color:C.cy,fontStyle:"italic"}}>triaged, drafted, resolved</em></div>
        <div style={{fontSize:11,color:C.t3,marginTop:4,fontFamily:M}}>Intake Copilot · Triage Cockpit · Agent Layer · persistent store · hybrid AI triage</div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
        {awaiting>0&&<Pill t={`${awaiting} AWAITING TRIAGE`} c={C.am}/>}
        <div style={{fontSize:9.5,fontFamily:M,color:C.gn,letterSpacing:1,textTransform:"uppercase",display:"flex",alignItems:"center",gap:5}}><Dot c={C.gn} p/>Storage · Synced</div>
        <div onClick={()=>setShowSettings(true)} title="Agent settings" style={{padding:"5px 10px",border:`1px solid ${C.br}`,color:C.t2,fontSize:9,fontFamily:M,letterSpacing:1,cursor:"pointer",textTransform:"uppercase",display:"flex",alignItems:"center",gap:5,transition:"all .12s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.pp;e.currentTarget.style.color=C.pp}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.br;e.currentTarget.style.color=C.t2}}>⚙ Agents</div>
        <div onClick={()=>{if(window.confirm("Reset all intake data (tickets, agent log, cockpit state, Copilot transcripts)?"))store.resetToSeed()}} style={{padding:"5px 10px",border:`1px solid ${C.br}`,color:C.t3,fontSize:9,fontFamily:M,letterSpacing:1,cursor:"pointer",textTransform:"uppercase"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.am;e.currentTarget.style.color=C.am}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.br;e.currentTarget.style.color=C.t3}}>↻ Reset Demo</div>
      </div>
    </div>

    {/* Tab bar */}
    <div style={{display:"flex",gap:2,marginBottom:14,borderBottom:`1px solid ${C.br}`,overflowX:"auto",flexWrap:"wrap"}}>
      {tabs.map(t=>{
        const active=tab===t.id;
        return <div key={t.id} onClick={()=>{setTab(t.id);setSel(null)}} style={{padding:"8px 14px",borderBottom:`2px solid ${active?C.cy:"transparent"}`,cursor:"pointer",transition:"all .15s",fontFamily:M,fontSize:10.5,letterSpacing:1.2,textTransform:"uppercase",color:active?C.cy:C.t3,fontWeight:active?600:400,display:"flex",alignItems:"center",gap:6,marginBottom:-1,whiteSpace:"nowrap"}} onMouseEnter={e=>{if(!active)e.currentTarget.style.color=C.t1}} onMouseLeave={e=>{if(!active)e.currentTarget.style.color=C.t3}}>
          <span style={{fontSize:12}}>{t.icon}</span>{t.label}
          {t.v8&&<Pill t="v8" c={C.em}/>}
          {t.count!==undefined&&<span style={{fontSize:9,padding:"1px 5px",background:active?C.cy+"22":C.br+"44",color:active?C.cy:C.t3,borderRadius:2,fontFamily:M}}>{t.count}</span>}
          {t.id==="cockpit"&&awaiting>0&&<span style={{fontSize:9,color:C.am,fontFamily:M,fontWeight:700}}>·{awaiting}</span>}
        </div>;
      })}
    </div>

    {/* v8 tabs */}
    {tab==="cockpit"&&<CockpitTab store={store} cockpit={cockpit}/>}
    {tab==="new"&&<NewRequestV8 store={store} goToInbox={()=>setTab("inbox")} goToCockpit={()=>setTab("cockpit")} settings={agentSettingsHook.settings}/>}

    {/* v7.2 preserved tabs */}
    {tab==="inbox"&&<InboxTab store={store} sel={sel} setSel={setSel}/>}
    {tab==="kanban"&&<KanbanTab store={store}/>}
    {tab==="sla"&&<SLATab store={store}/>}
    {tab==="routing"&&<RoutingTab/>}
    {tab==="selfserve"&&<SelfServeTab/>}
  </div>;
}


// ══════════════════════════════════════════════════
// MODULE 2: BOARD REPORTING
// ══════════════════════════════════════════════════
function BoardReportView(){
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

// ══════════════════════════════════════════════════
// MODULE 3: COMPANY BRAIN / INSTITUTIONAL MEMORY
// ══════════════════════════════════════════════════
const BRAIN_QUERIES=[
{q:"How did we handle unlimited indemnity clauses with German vendors last time?",
 answer:"In Q3 2025, we renegotiated unlimited indemnity with Siemens (CTR-4119) and Bosch (CTR-4087). Both were capped at 2x annual contract value after 3 rounds of negotiation. Average negotiation time: 6 weeks. Template language stored in Playbook PB-2025-014.",
 sources:["CTR-4119 (Siemens)","CTR-4087 (Bosch)","Playbook PB-2025-014","Email: Sarah Chen → GC, 2025-08-14"],confidence:96,category:"Contract Precedent"},
{q:"What is our standard position on data localization requirements in China?",
 answer:"Per Policy POL-PRIV-008 (updated Jan 2026): All personal data of Chinese citizens must be stored on servers within mainland China. Cross-border transfers require CAC security assessment (in progress — REG-003). We use AWS Beijing region for China ops. Budget approved: $2.1M for full localization.",
 sources:["POL-PRIV-008","REG-003 (CAC Filing)","Board Memo BM-2025-Q4-Privacy","IT Architecture Doc"],confidence:98,category:"Policy & Regulatory"},
{q:"What was the outcome of our last FCPA investigation?",
 answer:"2023 — Eastern Europe procurement investigation. 18-month investigation by Gibson Dunn. Result: voluntary self-disclosure to DOJ, no prosecution (declination). Remediation: enhanced anti-bribery training, new vendor DD requirements in high-risk jurisdictions, compliance monitor for 12 months (completed Dec 2024). Total cost: $4.8M.",
 sources:["INV-2023-007","DOJ Declination Letter 2024-03-15","Board Report Q1 2024","Gibson Dunn Final Report"],confidence:94,category:"Investigation Precedent"},
{q:"Which law firms have we used for patent litigation in Delaware and what were the outcomes?",
 answer:"3 matters in Delaware since 2022: (1) K&E — won summary judgment ($0 liability), (2) Fish & Richardson — settled at $4.2M (plaintiff asked $15M), (3) K&E — currently active (LIT-324, $12M exposure, 68% favorable). K&E average rate: $1,450/hr. Fish: $1,280/hr. Recommendation: K&E preferred for Delaware patent.",
 sources:["LIT-2022-018","LIT-2023-044","LIT-324 (Active)","Firm Scorecard: K&E","Firm Scorecard: Fish & Richardson"],confidence:92,category:"Litigation Intelligence"},
{q:"What is our board's risk appetite for regulatory settlements?",
 answer:"Per Board Resolution BR-2024-009: settlements up to $10M can be approved by GC + CFO. $10M–$50M requires Audit Committee approval. >$50M requires full Board vote. Timeline: emergency Board sessions can be convened within 48 hours. Last >$50M decision: antitrust settlement (voted down in favor of litigation, 2023).",
 sources:["BR-2024-009","Audit Committee Charter §4.2","Board Minutes 2023-06-15"],confidence:99,category:"Governance"},
];

function BrainView(){
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

// ══════════════════════════════════════════════════
// MODULE 4: OUTSIDE COUNSEL MANAGEMENT
// ══════════════════════════════════════════════════
const OCM_FIRMS=[
{name:"Kirkland & Ellis",panel:"Tier 1",speciality:"Patent, M&A, Complex Litigation",relationship:"Since 2018",
 spend:{ytd:18200000,budget:20000000,lastYear:16800000},rate:{avg:1450,approved:1400,compliance:89},
 scorecard:{quality:4.6,responsiveness:4.3,efficiency:3.8,diversity:3.2,innovation:4.1,overall:4.0},
 matters:12,activeLead:"Sarah Mitchell",
 invoices:[{id:"INV-K1-2026-03",amount:420000,submitted:"2026-03-10",status:"Under Review",flags:2,ledesCompliant:true},{id:"INV-K1-2026-02",amount:380000,submitted:"2026-02-28",status:"Approved",flags:0,ledesCompliant:true}],
 diversity:{femalePartners:"28%",minorityPartners:"14%",target:"30% / 20%",trend:"Improving"},
 alerts:[{text:"Rate increase request (+5%) pending — above market benchmark",sev:"warning"}]},
{name:"Cleary Gottlieb",panel:"Tier 1",speciality:"Antitrust, Regulatory, Cross-border",relationship:"Since 2020",
 spend:{ytd:14800000,budget:8000000,lastYear:6200000},rate:{avg:1680,approved:1600,compliance:72},
 scorecard:{quality:4.8,responsiveness:4.5,efficiency:3.5,diversity:3.8,innovation:4.3,overall:4.2},
 matters:4,activeLead:"Hans Mueller",
 invoices:[{id:"INV-CG-2026-03",amount:890000,submitted:"2026-03-08",status:"Under Review",flags:5,ledesCompliant:true},{id:"INV-CG-2026-02",amount:720000,submitted:"2026-02-25",status:"Flagged",flags:8,ledesCompliant:false}],
 diversity:{femalePartners:"32%",minorityPartners:"18%",target:"30% / 20%",trend:"On Track"},
 alerts:[{text:"YTD spend 185% of budget — EU Antitrust driving overage",sev:"critical"},{text:"Feb invoice non-LEDES compliant — 8 line items flagged",sev:"warning"}]},
{name:"Sullivan & Cromwell",panel:"Tier 1",speciality:"FCPA, Securities, Government Investigation",relationship:"Since 2026",
 spend:{ytd:5200000,budget:10000000,lastYear:0},rate:{avg:1750,approved:1700,compliance:94},
 scorecard:{quality:4.9,responsiveness:4.7,efficiency:4.0,diversity:3.5,innovation:4.0,overall:4.2},
 matters:2,activeLead:"Michael Torres",
 invoices:[{id:"INV-SC-2026-03",amount:1200000,submitted:"2026-03-05",status:"Approved",flags:1,ledesCompliant:true}],
 diversity:{femalePartners:"26%",minorityPartners:"16%",target:"30% / 20%",trend:"Below Target"},
 alerts:[]},
];

function OCMView(){
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
        {Object.entries(f.scorecard).map(([k,v],i)=><div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:`1px solid ${C.br}22`}}>
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
      {f.invoices.map((inv,i)=><div key={inv.id} style={{display:"grid",gridTemplateColumns:"120px 100px 90px 80px 80px 1fr",padding:"8px 10px",borderBottom:`1px solid ${C.br}22`,fontSize:11,alignItems:"center"}}>
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

// ══════════════════════════════════════════════════
// MODULE 5: CYBER INCIDENT RESPONSE
// ══════════════════════════════════════════════════
const CYBER_INCIDENTS=[
{id:"CIR-2026-003",title:"Ransomware Attempt — EU Data Center",status:"Contained",severity:"Critical",detected:"2026-03-11T02:14",
 type:"Ransomware",vector:"Phishing email → lateral movement",affectedSystems:["EU Exchange Server","SharePoint EU","SAP EU Instance"],
 dataAtRisk:"Potential access to 142K customer records (EU)",regulatoryNotif:[{reg:"GDPR Art 72",deadline:"2026-03-13T02:14",status:"Filed"},{reg:"NIS2 Directive",deadline:"2026-03-13T02:14",status:"Filed"},{reg:"UK ICO",deadline:"2026-03-14",status:"In Progress"},{reg:"BaFin",deadline:"2026-03-14",status:"Not Started"}],
 legalHold:{status:"Active",notice:"LH-CIR-003",custodians:3,systems:4},
 workflow:[{label:"Detection",done:true},{label:"Containment",done:true},{label:"Forensics",active:true},{label:"Notification"},{label:"Remediation"},{label:"Post-Mortem"}],
 timeline:[{time:"03/11 02:14",ev:"CrowdStrike alert — anomalous encryption activity",s:"done"},{time:"03/11 02:18",ev:"SOC confirmed ransomware attempt — containment initiated",s:"done"},{time:"03/11 02:45",ev:"Affected systems isolated — lateral movement blocked",s:"done"},{time:"03/11 03:00",ev:"Legal hold initiated — 3 custodians, 4 systems",s:"done"},{time:"03/11 06:00",ev:"CISO → GC notification — board briefing scheduled",s:"done"},{time:"03/11 08:00",ev:"GDPR 72-hour notification filed with Irish DPC",s:"done"},{time:"03/11 10:00",ev:"External forensics engaged (CrowdStrike IR team)",s:"done"},{time:"03/12 09:00",ev:"Forensic analysis ongoing — scope assessment",s:"upcoming"},{time:"03/13 02:14",ev:"GDPR 72-hr deadline",s:"upcoming"},{time:"03/14",ev:"UK ICO notification deadline",s:"pending"},{time:"03/15",ev:"Customer notification decision",s:"pending"}],
 insurance:{carrier:"AIG CyberEdge",policyLimit:"$50M",deductible:"$1M",claimFiled:true,claimRef:"AIG-CYB-2026-0412"},
 approvals:[{action:"External forensics ($180K)",by:"CISO",date:"2026-03-11",status:"Approved",approver:"GC"},{action:"Customer notification (142K records)",by:"Privacy Team",date:"2026-03-12",status:"Pending",approver:"GC + CMO + CEO"},{action:"Insurance claim submission",by:"Risk Mgmt",date:"2026-03-11",status:"Approved",approver:"CFO"}]},
];

function CyberView(){
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
        {Object.entries({Carrier:inc.insurance.carrier,"Policy Limit":inc.insurance.policyLimit,Deductible:inc.insurance.deductible,"Claim Ref":inc.insurance.claimRef}).map(([k,v],i)=>
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

// ══════════════════════════════════════════════════
// MODULE 6: WORKFLOW BUILDER (Low-Code)
// ══════════════════════════════════════════════════
const WORKFLOWS_BUILT=[
{name:"NDA Auto-Draft & Send",status:"Active",triggers:"Intake request type = NDA",steps:8,executions:142,avgTime:"4 min",created:"2026-01-15",createdBy:"Legal Ops",
 nodes:["Intake Trigger","AI Classify NDA Type","Select Template","Auto-Fill Parties","AI Risk Check","Route (Standard→Send / Custom→Review)","DocuSign Send","Close Request"]},
{name:"Contract Renewal Reminder",status:"Active",triggers:"90 days before expiry",steps:5,executions:3211,avgTime:"Auto",created:"2025-11-01",createdBy:"Legal Ops",
 nodes:["Expiry Date Trigger","Pull Contract Data","AI Assess Renewal Risk","Notify Owner + Legal","Create Review Task"]},
{name:"Legal Hold Initiation",status:"Active",triggers:"New litigation / investigation filed",steps:10,executions:34,avgTime:"18 min",created:"2025-10-01",createdBy:"eDiscovery Team",
 nodes:["Case Trigger","Identify Custodians (AI)","Map IT Systems","Generate Hold Notice","Send Notices","Track Acknowledgments","Initiate IT Preservation","Sync M365 Compliance","Create Collection Schedule","GC Confirmation"]},
{name:"Invoice AI Review",status:"Active",triggers:"New LEDES invoice received",steps:7,executions:890,avgTime:"12 min",created:"2026-02-01",createdBy:"Legal Ops",
 nodes:["Invoice Received","Parse LEDES","AI Rate Check","AI Task Code Audit","Flag Block-Billed Entries","Generate Approval/Reject","Route to Legal Ops"]},
{name:"Regulatory Change Alert",status:"Active",triggers:"New regulation detected by AI agent",steps:6,executions:42,avgTime:"2 hrs",created:"2025-12-01",createdBy:"Regulatory Team",
 nodes:["AI Detection","Jurisdiction Match","Impact Assessment","Affected Systems Map","Generate Action Items","Assign Owners"]},
{name:"Cyber Breach Playbook",status:"Active",triggers:"CrowdStrike critical alert",steps:12,executions:1,avgTime:"—",created:"2026-01-20",createdBy:"GC + CISO",
 nodes:["Alert Trigger","Auto Legal Hold","CISO + GC Notify","Containment Verification","Forensics Engagement","Regulatory Deadline Calculator","Notification Drafts (per jurisdiction)","Board Alert","Insurance Claim Init","Customer Notification Decision","Remediation Plan","Post-Mortem"]},
];

function WorkflowBuilderView(){
  const[sel,setSel]=useState(null);
  const wf=sel!==null?WORKFLOWS_BUILT[sel]:null;
  if(wf) return <div>
    <div onClick={()=>setSel(null)} style={{display:"inline-flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:11,color:C.bl,marginBottom:12,padding:"3px 6px",borderRadius:3}} onMouseEnter={e=>e.currentTarget.style.background=C.blG} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>← Back</div>
    <Card style={{borderLeft:`3px solid ${C.tl}`,marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between"}}><div>
        <div style={{display:"flex",gap:5,marginBottom:4}}><Pill t={wf.status} c={C.gn}/><Pill t={`${wf.steps} steps`} c={C.bl}/></div>
        <div style={{fontSize:15,fontWeight:700,color:C.t1,fontFamily:`'Fraunces',Georgia,serif`}}>{wf.name}</div>
        <div style={{fontSize:11,color:C.t2,marginTop:2}}>Trigger: {wf.triggers} | Created by: {wf.createdBy} on {wf.created}</div></div>
        <div style={{textAlign:"right"}}><div style={{fontSize:20,fontWeight:700,color:C.tl,fontFamily:M}}>{wf.executions}</div><div style={{fontSize:9,color:C.t3}}>executions</div></div>
      </div>
    </Card>
    <Card d={50}><div style={{fontSize:11,fontWeight:600,color:C.tl,marginBottom:10,letterSpacing:1}}>WORKFLOW NODES</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
        {wf.nodes.map((n,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:4,animation:`fu .2s ease ${i*30}ms both`}}>
          <div style={{padding:"6px 10px",borderRadius:6,background:C.s1,border:`1px solid ${C.br}`,fontSize:10.5,color:C.t1,fontWeight:500}}>
            <span style={{fontFamily:M,fontSize:9,color:C.tl,marginRight:4}}>{i+1}</span>{n}
          </div>
          {i<wf.nodes.length-1&&<span style={{color:C.t4,fontSize:12}}>→</span>}
        </div>)}
      </div>
    </Card>
  </div>;
  return <div>
    <SH icon="⚙️" title="Workflow Builder" sub="Low-code automation • 6 active workflows • 4,320 total executions" c={C.tl}/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
      {[{l:"Active Workflows",v:WORKFLOWS_BUILT.length,c:C.tl},{l:"Total Executions",v:"4,320",c:C.bl},{l:"Avg Time Saved",v:"82%",c:C.gn},{l:"Auto-Completed",v:"63%",c:C.gn}].map((s,i)=>
        <Card key={i} d={i*40}><Stat l={s.l} v={s.v} c={s.c} s/></Card>)}
    </div>
    <Card>{WORKFLOWS_BUILT.map((w,i)=><div key={w.name} onClick={()=>setSel(i)} style={{padding:"12px",borderBottom:`1px solid ${C.br}22`,cursor:"pointer",animation:`fu .25s ease ${i*30}ms both`}} onMouseEnter={e=>e.currentTarget.style.background=C.cdH} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <div style={{display:"flex",gap:5,alignItems:"center"}}><Pill t={w.status} c={C.gn}/><span style={{fontSize:13,fontWeight:600,color:C.t1}}>{w.name}</span></div>
        <div style={{fontFamily:M,fontSize:14,fontWeight:700,color:C.tl}}>{w.executions}</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,fontSize:10}}>
        <div><span style={{color:C.t3}}>Trigger: </span><span style={{color:C.t2}}>{w.triggers}</span></div>
        <div><span style={{color:C.t3}}>Steps: </span><span style={{fontFamily:M,color:C.t1}}>{w.steps}</span></div>
        <div><span style={{color:C.t3}}>Avg Time: </span><span style={{fontFamily:M,color:C.tl}}>{w.avgTime}</span></div>
        <div><span style={{color:C.t3}}>By: </span><span style={{color:C.t2}}>{w.createdBy}</span></div>
      </div>
    </div>)}</Card>
  </div>;
}

function ArchitectureView(){
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
function MatterManagementView(){
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
      <div style={{display:"flex",gap:14,fontSize:10,fontFamily:M,color:C.t3,marginTop:6,paddingTop:6,borderTop:`1px solid ${C.br}22`}}>
        <span>◉ {c.hold.custodians.length} custodians</span>
        <span style={{color:c.hold.custodians.filter(x=>!x.ack).length>0?C.rd:C.gn}}>
          {c.hold.custodians.filter(x=>x.ack).length}/{c.hold.custodians.length} ack'd
        </span>
        <span>▣ {c.hold.itSystems.length} systems</span>
        <span>▲ {c.alerts.length} alerts</span>
        <span>⏱ {c.nextDl} — {c.nextAct}</span>
      </div>
    </div>)}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// MISSION CONTROL HOME — Aurora hero view
// ═══════════════════════════════════════════════════════════════════
function MissionControlView(){
  const[tickerIdx,setTickerIdx]=useState(0);
  useEffect(()=>{const t=setInterval(()=>setTickerIdx(i=>(i+1)%TICKERS.length),3500);return()=>clearInterval(t);},[]);

  const totalExposure=CASES.reduce((a,c)=>a+parseFloat(c.exposure.replace(/[^0-9.]/g,""))||0,0);
  const criticalCount=ALL_ALERTS.filter(a=>a.sev==="critical").length;
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
function RiskGraphView(){
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
function ScenariosView(){
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
// ═══════════════════════════════════════════════════════════════════
const TICKERS=[
  "📄 Contract Agent flagged unlimited indemnity in SAP SE MSA — €42M exposure",
  "⚖️ EU Antitrust — 12K docs pending DG COMP production by March 25",
  "🔍 Compliance Agent detected 3 additional LATAM suspicious payments — $2.4M total",
  "📋 EU AI Act gap analysis complete — Human Oversight dimension at 20%",
  "💰 Rate violation caught: Cleary Q1 invoice $890K · $42K overcharge identified",
  "🛡️ Ransomware IOC blocked in SOC — 14 endpoints quarantined, zero legal impact",
  "🧠 Company Brain indexed 24K new data points across 4 matter archives",
  "⏱ Custodian Anna Petrov has not acknowledged legal hold — 30 min escalation",
  "📊 Board pack draft ready — Q1 legal posture narrative auto-generated",
  "🔔 SAP SE negotiation Round 6 — GC escalation required on IP indemnity",
];

// ═══════════════════════════════════════════════════════════════════
// AI COPILOT (floating side panel)
// ═══════════════════════════════════════════════════════════════════
function AICopilot({open,setOpen}){
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


const NAV=[
  {id:"mission",label:"Mission Control",icon:"◎",c:C.em,group:"EXECUTIVE"},
  {id:"today",label:"Today",icon:"◉",c:C.bl,group:"EXECUTIVE"},
  {id:"alerts",label:"Alerts",icon:"▲",c:C.rd,group:"EXECUTIVE"},
  {id:"approvals",label:"Approvals",icon:"✓",c:C.am,group:"EXECUTIVE"},
  {id:"divider1"},
  {id:"intake",label:"Legal Intake",icon:"◆",c:C.cy,group:"OPERATIONS"},
  {id:"matters",label:"Matter Management",icon:"▣",c:C.bl,group:"OPERATIONS"},
  {id:"contracts",label:"Contracts",icon:"▤",c:C.bl,group:"OPERATIONS"},
  {id:"regulatory",label:"Regulatory",icon:"▥",c:C.tl,group:"OPERATIONS"},
  {id:"ocm",label:"Outside Counsel",icon:"▦",c:C.am,group:"OPERATIONS"},
  {id:"spend",label:"Legal Spend",icon:"▧",c:C.am,group:"OPERATIONS"},
  {id:"governance",label:"Governance",icon:"▨",c:C.cy,group:"OPERATIONS"},
  {id:"cyber",label:"Cyber Response",icon:"▩",c:C.rd,group:"OPERATIONS"},
  {id:"divider2"},
  {id:"graph",label:"Risk Graph",icon:"◈",c:C.em,group:"INTELLIGENCE"},
  {id:"scenarios",label:"Scenarios",icon:"◉",c:C.em,group:"INTELLIGENCE"},
  {id:"brain",label:"Company Brain",icon:"◎",c:C.tl,group:"INTELLIGENCE"},
  {id:"board",label:"Board Pack",icon:"◇",c:C.pp,group:"INTELLIGENCE"},
  {id:"divider3"},
  {id:"workflows",label:"Workflow Builder",icon:"▷",c:C.tl,group:"PLATFORM"},
  {id:"architecture",label:"Architecture",icon:"▶",c:C.pp,group:"PLATFORM"},
];

export default function App(){
  const[view,setView]=useState("mission");
  const[copilotOpen,setCopilotOpen]=useState(false);
  const[time,setTime]=useState(new Date());
  useEffect(()=>{const t=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(t)},[]);

  const critAlerts=ALL_ALERTS.filter(a=>a.sev==="critical").length;
  const pendingAppr=ALL_APPROVALS.length;

  const V={mission:MissionControlView,today:DailyView,alerts:AlertsView,approvals:ApprovalsView,
    intake:IntakeView,matters:MatterManagementView,contracts:ContractsView,
    regulatory:RegulatoryView,graph:RiskGraphView,scenarios:ScenariosView,
    ocm:OCMView,spend:SpendView,governance:GovernanceView,
    cyber:CyberView,brain:BrainView,board:BoardReportView,workflows:WorkflowBuilderView,
    architecture:ArchitectureView};
  const Comp=V[view]||DailyView;

  return <div style={{display:"flex",minHeight:"100vh",background:C.bg,fontFamily:F,color:C.t1}}>
    <style>{CSS}</style>
    {/* Sidebar */}
    <div style={{width:220,background:C.s1,borderRight:`1px solid ${C.br}`,display:"flex",flexDirection:"column",flexShrink:0}}>
      <div style={{padding:"16px 16px 12px",borderBottom:`1px solid ${C.br}`}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",background:C.em,fontSize:14,fontWeight:400,color:C.bg,fontFamily:SR}}>◎</div>
          <div>
            <div style={{fontSize:14,fontFamily:SR,fontWeight:400,letterSpacing:1,color:C.t1}}>AEGIS<span style={{color:C.em,fontStyle:"italic"}}></span></div>
            <div style={{fontSize:8,letterSpacing:2,color:C.t3,textTransform:"uppercase",fontFamily:M,marginTop:1}}>Legal Mission Control</div>
          </div>
        </div>
      </div>
      <div style={{padding:"8px 6px",flex:1,overflowY:"auto"}}>
        {(() => {
          let currentGroup = null;
          return NAV.map(n=>{
            if(n.id.startsWith("divider")) return <div key={n.id} style={{height:1,background:C.br,margin:"10px 10px"}}/>;
            const showHeader = n.group && n.group !== currentGroup;
            if(showHeader) currentGroup = n.group;
            const badge=n.id==="alerts"?critAlerts:n.id==="approvals"?pendingAppr:0;
            return <div key={n.id}>
              {showHeader && <div style={{fontSize:9,fontFamily:M,color:C.t4,letterSpacing:2,textTransform:"uppercase",padding:"8px 10px 4px"}}>{n.group}</div>}
              <div onClick={()=>setView(n.id)} style={{
                display:"flex",alignItems:"center",gap:10,padding:"7px 10px",cursor:"pointer",marginBottom:1,
                background:view===n.id?C.emG:"transparent",borderLeft:view===n.id?`2px solid ${C.em}`:"2px solid transparent",transition:"all .12s",position:"relative",
              }} onMouseEnter={e=>{if(view!==n.id)e.currentTarget.style.background=C.cd}} onMouseLeave={e=>{if(view!==n.id)e.currentTarget.style.background="transparent"}}>
                <span style={{fontSize:13,color:view===n.id?C.em:n.c,fontFamily:SR}}>{n.icon}</span>
                <span style={{fontSize:11,fontWeight:view===n.id?600:400,color:view===n.id?C.t1:C.t2,flex:1,fontFamily:F,letterSpacing:.3}}>{n.label}</span>
                {badge>0&&<span style={{background:n.id==="alerts"?C.rd:C.am,color:C.bg,fontSize:9,fontWeight:700,padding:"1px 6px",fontFamily:M,letterSpacing:.5}}>{badge}</span>}
              </div>
            </div>;
          });
        })()}
      </div>
      <div style={{padding:"12px 14px",borderTop:`1px solid ${C.br}`,fontSize:9.5,color:C.t4,fontFamily:M}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}><Dot c={C.em} p/><span style={{color:C.em,fontWeight:600,letterSpacing:1}}>AURORA · ACTIVE</span></div>
        <div style={{fontSize:9,letterSpacing:.5}}>38 Jurisdictions · 17 Modules</div>
        <div style={{marginTop:4,fontSize:8.5,color:C.t4,letterSpacing:1}}>v7.0 · AURORA · EY FRONTIER</div>
      </div>
    </div>
    {/* Main */}
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{padding:"10px 20px",borderBottom:`1px solid ${C.br}`,display:"flex",justifyContent:"space-between",alignItems:"center",background:C.s1}}>
        <div>
          <div style={{fontSize:8,fontFamily:M,color:C.t4,letterSpacing:2,textTransform:"uppercase"}}>{NAV.find(n=>n.id===view)?.group||"MODULE"}</div>
          <span style={{fontSize:14,fontFamily:SR,fontWeight:400,color:C.t1,letterSpacing:.3}}>{NAV.find(n=>n.id===view)?.label||"Today"}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}><Dot c={C.em} p/><span style={{fontSize:9,color:C.em,fontFamily:M,letterSpacing:2,textTransform:"uppercase"}}>LIVE</span></div>
          <span style={{fontSize:10.5,color:C.t3,fontFamily:M,letterSpacing:.5}}>{time.toLocaleTimeString("en-US",{hour12:false})} · {time.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>
          <div onClick={()=>setCopilotOpen(true)} style={{padding:"6px 14px",border:`1px solid ${C.em}`,color:C.em,fontSize:10,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase",transition:"all .12s"}} onMouseEnter={e=>{e.currentTarget.style.background=C.em;e.currentTarget.style.color=C.bg}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=C.em}}>◎ Ask Aurora</div>
        </div>
      </div>
      <div style={{flex:1,overflow:"auto",padding:18}} key={view}><Comp/></div>
    </div>
    <AICopilot open={copilotOpen} setOpen={setCopilotOpen}/>
  </div>;
}
