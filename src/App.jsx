import { useState, useEffect } from "react";
import { C, F, M, SR } from "./theme/tokens";
import { CSS } from "./theme/global-css";
import { Dot } from "./atoms/ui";
import { NAV } from "./data/nav";
import { ALL_APPROVALS, ALL_ALERTS } from "./data/aggregate";
import { AICopilot } from "./shell/ai-copilot";
import { IntakeView } from "./intake";
import { DailyView, AlertsView, ApprovalsView, ContractsView, RegulatoryView, LitigationView, ComplianceView, SpendView, GovernanceView } from "./views/v72";
import { MissionControlView, BoardReportView, BrainView, OCMView, CyberView, WorkflowBuilderView, ArchitectureView, MatterManagementView, RiskGraphView, ScenariosView } from "./views/v8";

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
