import { useState, useEffect } from "react";
import { C, F, M, SR, Dot, CSS } from "@aegis/ui";
import { AICopilot, IntakeView } from "@aegis/intake";
import { useCurrentUser } from "@aegis/auth/react";
import { NAV, navForProfile, resolveProfile, INTAKE_PROFILE_VIEWS } from "./data/nav";
import { ALL_APPROVALS, ALL_ALERTS } from "./data/aggregate";
import { DailyView, AlertsView, ApprovalsView, LitigationView as _LitigationView, ComplianceView as _ComplianceView, GovernanceView } from "./views/v72";
import { SpendDashboard, OutsideCounselView } from "@aegis/spend/ui";
import { ContractsRepository } from "@aegis/contracts/ui";
import { MissionControlView, BoardReportView, CyberView, WorkflowBuilderView, ArchitectureView, RiskGraphView, ScenariosView } from "./views/v8";
import { BrainDemoView, RegulatoryDemoView } from "./views/gc-suite-demos.jsx";
import { MatterManagementShell, AuditLogShell } from "./views/matter-shell.jsx";
import { AdminUsersShell, AdminRolesShell } from "./views/admin-shell.jsx";
import { UserBadge } from "./views/user-badge.jsx";
import { PreviewRoleSwitcher, PreviewRoleBanner } from "./views/preview-role-switcher.jsx";

// Reads `?view=...` on first mount so deep links (e.g. /matter/[id]
// rewriting to /?view=matters&matterId=...) land in the right tile.
// Subsequent state changes don't push to the URL — Aurora is one-page,
// the side-nav is the navigation surface.
function initialViewFromUrl(fallback){
  if(typeof window==="undefined") return fallback;
  const v=new URLSearchParams(window.location.search).get("view");
  return v||fallback;
}

export default function App(){
  // Deployment profile — "intake" ships an Intake-only nav (the rest of
  // the platform still runs underneath). Default "full" is unchanged.
  const PROFILE=resolveProfile();
  const isIntakeOnly=PROFILE==="intake";
  const[view,setView]=useState(()=>initialViewFromUrl(isIntakeOnly?"intake":"mission"));
  const[copilotOpen,setCopilotOpen]=useState(false);
  const[time,setTime]=useState(new Date());
  const{has,loading:authLoading}=useCurrentUser();
  useEffect(()=>{const t=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(t)},[]);

  const critAlerts=ALL_ALERTS.filter(a=>a.sev==="critical").length;
  const pendingAppr=ALL_APPROVALS.length;

  const V={mission:MissionControlView,today:DailyView,alerts:AlertsView,approvals:ApprovalsView,
    intake:IntakeView,matters:MatterManagementShell,contracts:ContractsRepository,
    regulatory:RegulatoryDemoView,graph:RiskGraphView,scenarios:ScenariosView,
    ocm:OutsideCounselView,spend:SpendDashboard,governance:GovernanceView,
    cyber:CyberView,brain:BrainDemoView,board:BoardReportView,workflows:WorkflowBuilderView,
    architecture:ArchitectureView,
    users:AdminUsersShell,roles:AdminRolesShell,audit:AuditLogShell};
  // In the intake-only profile, any view outside the allowed set (e.g. a
  // stale ?view= deep link) falls back to Intake so hidden modules can't
  // be reached through the URL.
  const effectiveView=isIntakeOnly && !INTAKE_PROFILE_VIEWS.has(view) ? "intake" : view;
  const Comp=V[effectiveView]||DailyView;

  // Filter NAV by the user's permissions. Entries without a `permission`
  // are visible to everyone; entries with one are hidden until the
  // current-user query returns and confirms the grant. The server-side
  // gate on the underlying API stays authoritative — the nav filter is
  // a UX-only refinement.
  const permFiltered=navForProfile(PROFILE).filter(n=>!n.permission||(authLoading?false:has(n.permission)));
  // Drop dangling dividers — when a permission filter hides every
  // entry of a group (e.g. ADMIN for non-admins), the surrounding
  // divider is meaningless decor. Keep a divider only if the entries
  // before and after it belong to different groups.
  const visibleNav=permFiltered.filter((n,i,arr)=>{
    if(!n.id.startsWith("divider")) return true;
    let next=null;
    for(let j=i+1;j<arr.length;j++){if(!arr[j].id.startsWith("divider")){next=arr[j];break;}}
    if(!next) return false;
    let prev=null;
    for(let j=i-1;j>=0;j--){if(!arr[j].id.startsWith("divider")){prev=arr[j];break;}}
    if(!prev) return false;
    return prev.group!==next.group;
  });

  return <div style={{display:"flex",minHeight:"100vh",background:C.bg,fontFamily:F,color:C.t1}}>
    <style>{CSS}</style>
    {/* Sidebar */}
    <div style={{width:220,background:C.s1,borderRight:`1px solid ${C.br}`,display:"flex",flexDirection:"column",flexShrink:0}}>
      <div style={{padding:"16px 16px 12px",borderBottom:`1px solid ${C.br}`}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",background:C.em,fontSize:14,fontWeight:400,color:C.bg,fontFamily:SR}}>◎</div>
          <div>
            <div style={{fontSize:14,fontFamily:SR,fontWeight:400,letterSpacing:1,color:C.t1}}>AEGIS<span style={{color:C.em,fontStyle:"italic"}}></span></div>
            <div style={{fontSize:8,letterSpacing:2,color:C.t3,textTransform:"uppercase",fontFamily:M,marginTop:1}}>{isIntakeOnly?"Legal Intake":"Legal Mission Control"}</div>
          </div>
        </div>
      </div>
      <div style={{padding:"8px 6px",flex:1,overflowY:"auto"}}>
        {(() => {
          let currentGroup = null;
          return visibleNav.map(n=>{
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
          <div style={{fontSize:8,fontFamily:M,color:C.t4,letterSpacing:2,textTransform:"uppercase"}}>{NAV.find(n=>n.id===effectiveView)?.group||"MODULE"}</div>
          <span style={{fontSize:14,fontFamily:SR,fontWeight:400,color:C.t1,letterSpacing:.3}}>{NAV.find(n=>n.id===effectiveView)?.label||"Today"}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}><Dot c={C.em} p/><span style={{fontSize:9,color:C.em,fontFamily:M,letterSpacing:2,textTransform:"uppercase"}}>LIVE</span></div>
          <span style={{fontSize:10.5,color:C.t3,fontFamily:M,letterSpacing:.5}}>{time.toLocaleTimeString("en-US",{hour12:false})} · {time.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>
          <div onClick={()=>setCopilotOpen(true)} style={{padding:"6px 14px",border:`1px solid ${C.em}`,color:C.em,fontSize:10,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase",transition:"all .12s"}} onMouseEnter={e=>{e.currentTarget.style.background=C.em;e.currentTarget.style.color=C.bg}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=C.em}}>◎ Ask Aurora</div>
          <PreviewRoleSwitcher/>
          <UserBadge/>
        </div>
      </div>
      <PreviewRoleBanner/>
      <div style={{flex:1,overflow:"auto",padding:18}} key={view}><Comp/></div>
    </div>
    <AICopilot open={copilotOpen} setOpen={setCopilotOpen}/>
  </div>;
}
