import { useState, useEffect } from "react";
import { C, F, M, SR, Dot, CSS, useIsNarrow } from "@aegis/ui";
import { IntakeView } from "@aegis/intake";
import { useCurrentUser } from "@aegis/auth/react";
import { NAV, navForProfile, resolveProfile, INTAKE_PROFILE_VIEWS } from "./data/nav";
import { ALL_APPROVALS, ALL_ALERTS } from "./data/aggregate";
import { DailyView, AlertsView, ApprovalsView, LitigationView as _LitigationView, ComplianceView as _ComplianceView, GovernanceView } from "./views/v72";
import { SpendDashboard, OutsideCounselView } from "@aegis/spend/ui";
import { ContractsRepository } from "@aegis/contracts/ui";
import { PrivacyShell } from "@aegis/privacy/ui";
import { MissionControlView, BoardReportView, CyberView, ArchitectureView, RiskGraphView, ScenariosView } from "./views/v8";
import { BrainDemoView, RegulatoryDemoView } from "./views/gc-suite-demos.jsx";
import { MatterManagementShell, AuditLogShell } from "./views/matter-shell.jsx";
import { EDiscoveryHub } from "./views/ediscovery-hub.jsx";
import { TrademarkHub } from "./views/trademark-hub.jsx";
import { NoticeCockpit } from "./views/notice-cockpit.jsx";
import { InvestigationsHub } from "./views/investigations-hub.jsx";
import { AdminUsersShell, AdminRolesShell } from "./views/admin-shell.jsx";
import { UserBadge } from "./views/user-badge.jsx";
import { PreviewRoleSwitcher, PreviewRoleBanner } from "./views/preview-role-switcher.jsx";
import { CommandBar } from "./CommandBar.jsx";
import { CommandConsole } from "./CommandConsole.jsx";
import { WorkFeedView } from "./views/work-feed.jsx";
import { VaultShell } from "./views/vault-shell.jsx";

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
  const[view,setView]=useState(()=>initialViewFromUrl(isIntakeOnly?"intake":"onelegal"));
  const[time,setTime]=useState(new Date());
  const{has,loading:authLoading}=useCurrentUser();
  useEffect(()=>{const t=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(t)},[]);

  // Sidebar: on a phone it's an off-canvas drawer (hidden until the ☰ button
  // opens it, with a scrim); on a wider screen it collapses to an icon rail
  // that the user pins open again. The desktop collapsed/pinned choice
  // persists per browser; the mobile drawer is always closed on load.
  const SIDEBAR_KEY="onelegal.sidebar.collapsed";
  const narrow=useIsNarrow(820);
  const[collapsed,setCollapsed]=useState(()=>{
    if(typeof window==="undefined") return false;
    try{return window.localStorage.getItem(SIDEBAR_KEY)==="1";}catch{return false;}
  });
  const[mobileOpen,setMobileOpen]=useState(false);
  const toggleCollapsed=()=>setCollapsed(c=>{
    const next=!c;
    try{window.localStorage.setItem(SIDEBAR_KEY,next?"1":"0");}catch{/* storage disabled */}
    return next;
  });
  // Esc closes the mobile drawer; lock body scroll while it's open.
  useEffect(()=>{
    if(!(narrow&&mobileOpen)) return;
    const onKey=e=>{if(e.key==="Escape")setMobileOpen(false);};
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[narrow,mobileOpen]);

  // On the desktop rail the labels/headers/footer text collapse to icons;
  // in the mobile drawer everything shows at full width.
  const rail=collapsed&&!narrow;
  const showLabels=!rail;
  const goTo=(id)=>{setView(id);if(narrow)setMobileOpen(false);};
  // Shared style for the sidebar's collapse / expand / close + the header's
  // open-menu buttons — a quiet square that reads as a control, not a nav
  // item. Defined in-render so it re-reads the live Aurora tokens on theme
  // change (the toggle mutates C in place rather than remounting styles).
  const navBtnStyle={width:28,height:28,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:"transparent",border:`1px solid ${C.br}`,borderRadius:6,color:C.t3,fontSize:13,lineHeight:1,cursor:"pointer",fontFamily:M};

  const critAlerts=ALL_ALERTS.filter(a=>a.sev==="critical").length;
  const pendingAppr=ALL_APPROVALS.length;

  const V={mission:MissionControlView,today:DailyView,alerts:AlertsView,approvals:ApprovalsView,
    intake:IntakeView,matters:MatterManagementShell,contracts:ContractsRepository,
    regulatory:RegulatoryDemoView,graph:RiskGraphView,scenarios:ScenariosView,
    ocm:OutsideCounselView,spend:SpendDashboard,governance:GovernanceView,
    cyber:CyberView,brain:BrainDemoView,board:BoardReportView,activity:WorkFeedView,
    privacy:PrivacyShell,
    dsar:PrivacyShell,
    vault:VaultShell,
    investigations:InvestigationsHub,
    ediscovery:EDiscoveryHub,
    trademark:TrademarkHub,
    notices:NoticeCockpit,
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
    {/* Scrim behind the mobile drawer */}
    {narrow && mobileOpen && <div onClick={()=>setMobileOpen(false)} aria-hidden="true" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.42)",zIndex:40,animation:"fu .15s ease both"}}/>}
    {/* Sidebar — off-canvas drawer on a phone, pinned column / icon rail on desktop */}
    <div style={narrow
      ? {width:248,background:C.s1,borderRight:`1px solid ${C.br}`,display:"flex",flexDirection:"column",position:"fixed",top:0,left:0,bottom:0,zIndex:50,transform:mobileOpen?"translateX(0)":"translateX(-100%)",transition:"transform .2s ease",boxShadow:mobileOpen?"4px 0 24px rgba(0,0,0,.18)":"none"}
      : {width:rail?64:220,background:C.s1,borderRight:`1px solid ${C.br}`,display:"flex",flexDirection:"column",flexShrink:0,transition:"width .16s ease"}}>
      <div style={{padding:rail?"14px 0 12px":"16px 16px 12px",borderBottom:`1px solid ${C.br}`,display:"flex",flexDirection:rail?"column":"row",alignItems:"center",justifyContent:rail?"center":"space-between",gap:rail?10:8}}>
        <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0,flex:showLabels?1:"0 0 auto"}}>
          <div style={{width:30,height:30,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:C.em,fontSize:13,fontWeight:600,letterSpacing:1,color:"#fff",fontFamily:SR}}>OL</div>
          {showLabels && <div style={{minWidth:0,overflow:"hidden"}}>
            <div style={{fontSize:14,fontFamily:SR,fontWeight:400,letterSpacing:1,color:C.t1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>OneLegal<span style={{color:C.em,fontStyle:"italic"}}></span></div>
            <div style={{fontSize:8,letterSpacing:1.3,lineHeight:1.3,color:C.t3,textTransform:"uppercase",fontFamily:M,marginTop:1}}>{isIntakeOnly?"Legal Intake":"Legal Mission Control"}</div>
          </div>}
        </div>
        {/* Toggle — always visible: ✕ closes the phone drawer, « collapses to
            the rail, » expands the rail back (the top position means the
            expand control is never scrolled out of reach). */}
        <button type="button"
          onClick={narrow?()=>setMobileOpen(false):toggleCollapsed}
          aria-label={narrow?"Close menu":rail?"Expand sidebar":"Collapse sidebar"}
          title={narrow?"Close menu":rail?"Expand sidebar":"Collapse sidebar"}
          style={navBtnStyle}>{narrow?"✕":rail?"»":"«"}</button>
      </div>
      <div style={{padding:rail?"8px 0":"8px 6px",flex:1,overflowY:"auto"}}>
        {(() => {
          let currentGroup = null;
          return visibleNav.map(n=>{
            if(n.id.startsWith("divider")) return <div key={n.id} style={{height:1,background:C.br,margin:rail?"8px 14px":"10px 10px"}}/>;
            const showHeader = showLabels && n.group && n.group !== currentGroup;
            if(n.group) currentGroup = n.group;
            const badge=n.id==="alerts"?critAlerts:n.id==="approvals"?pendingAppr:0;
            return <div key={n.id}>
              {showHeader && <div style={{fontSize:9,fontFamily:M,color:C.t4,letterSpacing:2,textTransform:"uppercase",padding:"8px 10px 4px"}}>{n.group}</div>}
              <div onClick={()=>goTo(n.id)} title={rail?n.label:undefined} style={{
                display:"flex",alignItems:"center",justifyContent:rail?"center":"flex-start",gap:10,padding:rail?"9px 0":"7px 10px",cursor:"pointer",marginBottom:1,
                background:view===n.id?C.emG:"transparent",borderLeft:view===n.id?`2px solid ${C.em}`:"2px solid transparent",transition:"all .12s",position:"relative",
              }} onMouseEnter={e=>{if(view!==n.id)e.currentTarget.style.background=C.cd}} onMouseLeave={e=>{if(view!==n.id)e.currentTarget.style.background="transparent"}}>
                <span style={{fontSize:13,color:view===n.id?C.em:n.c,fontFamily:SR,position:"relative"}}>
                  {n.icon}
                  {rail&&badge>0&&<span style={{position:"absolute",top:-5,right:-7,width:6,height:6,borderRadius:"50%",background:n.id==="alerts"?C.rd:C.am}}/>}
                </span>
                {showLabels&&<span style={{fontSize:11,fontWeight:view===n.id?600:400,color:view===n.id?C.t1:C.t2,flex:1,fontFamily:F,letterSpacing:.3}}>{n.label}</span>}
                {showLabels&&badge>0&&<span style={{background:n.id==="alerts"?C.rd:C.am,color:C.bg,fontSize:9,fontWeight:700,padding:"1px 6px",fontFamily:M,letterSpacing:.5}}>{badge}</span>}
              </div>
            </div>;
          });
        })()}
      </div>
      {rail
        ? <div style={{padding:"12px 0",borderTop:`1px solid ${C.br}`,display:"flex",justifyContent:"center"}}><Dot c={C.em} p/></div>
        : <div style={{padding:"12px 14px",borderTop:`1px solid ${C.br}`,fontSize:9.5,color:C.t4,fontFamily:M}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}><Dot c={C.em} p/><span style={{color:C.em,fontWeight:600,letterSpacing:1}}>AURORA · ACTIVE</span></div>
            <div style={{fontSize:9,letterSpacing:.5}}>38 Jurisdictions · 17 Modules</div>
            <div style={{marginTop:4,fontSize:8.5,color:C.t4,letterSpacing:1}}>v7.0 · AURORA · EY FRONTIER</div>
          </div>}
    </div>
    {/* Main */}
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{padding:"16px 20px 12px",borderBottom:`1px solid ${C.br}`,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,background:C.s1}}>
        {narrow && <button type="button" onClick={()=>setMobileOpen(true)} aria-label="Open menu" style={{...navBtnStyle,width:34,height:34,fontSize:16}}>☰</button>}
        {/* Eyebrow + title mirror the sidebar brand block (same 16/12 vertical
            padding and the same small-label styling) so the top strip reads as
            one uniform band across the sidebar divider. */}
        <div style={{minWidth:0}}>
          <div style={{fontSize:8,fontFamily:M,color:C.t3,letterSpacing:1.3,lineHeight:1.3,textTransform:"uppercase"}}>{NAV.find(n=>n.id===effectiveView)?.group||"MODULE"}</div>
          <span style={{display:"block",fontSize:14,fontFamily:SR,fontWeight:400,color:C.t1,letterSpacing:.3,lineHeight:1.3,marginTop:1}}>{NAV.find(n=>n.id===effectiveView)?.label||"Today"}</span>
        </div>
        {effectiveView==="onelegal" ? <div style={{flex:1,margin:"0 20px"}}/> : <CommandBar onNavigate={setView}/>}
        <div style={{display:"flex",alignItems:"center",gap:16,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}><Dot c={C.em} p/><span style={{fontSize:9,color:C.em,fontFamily:M,letterSpacing:2,textTransform:"uppercase"}}>LIVE</span></div>
          <span style={{fontSize:10.5,color:C.t3,fontFamily:M,letterSpacing:.5}}>{time.toLocaleTimeString("en-US",{hour12:false})} · {time.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>
          <PreviewRoleSwitcher/>
          <UserBadge/>
        </div>
      </div>
      <PreviewRoleBanner/>
      {effectiveView==="onelegal"
        ? <div style={{flex:1,minHeight:0,overflow:"hidden"}} key={view}><CommandConsole embedded onNavigate={setView}/></div>
        : <div style={{flex:1,overflow:"auto",padding:18}} key={view}><Comp/></div>}
    </div>
  </div>;
}
