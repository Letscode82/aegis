import { C, F, M } from "../theme/tokens";

// ── Shared UI Atoms ──
export const Pill=({t,c,g})=><span style={{display:"inline-flex",padding:"2px 7px",borderRadius:4,fontSize:9.5,fontWeight:600,fontFamily:M,color:c,background:g||`${c}18`,letterSpacing:.3,lineHeight:"16px"}}>{t}</span>;

export const Dot=({c,p:pu})=><span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",background:c,boxShadow:`0 0 5px ${c}80`,animation:pu?"p 2s infinite":"none",flexShrink:0}}/>;

export const Stat=({l,v,c=C.t1,s})=><div style={{textAlign:"center"}}><div style={{fontSize:s?16:22,fontWeight:700,color:c,fontFamily:M,lineHeight:1}}>{v}</div><div style={{fontSize:9.5,color:C.t3,marginTop:3}}>{l}</div></div>;

export const Bar=({pct,c,d=0,h=4})=><div style={{height:h,background:C.br,borderRadius:h/2,overflow:"hidden"}}><div style={{"--w":`${Math.min(pct,100)}%`,height:"100%",background:c,borderRadius:h/2,animation:`bi .8s ease ${d}ms both`}}/></div>;

export const Card=({children,style:s={},d=0,onClick:oc})=><div onClick={oc} style={{background:C.cd,border:`1px solid ${C.br}`,borderRadius:8,padding:14,animation:`fu .35s ease ${d}ms both`,transition:"border-color .15s,background .15s",cursor:oc?"pointer":"default",...s}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.brL;if(oc)e.currentTarget.style.background=C.cdH}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.br;e.currentTarget.style.background=C.cd}}>{children}</div>;

export const SH=({icon:ic,title:ti,sub:su,c=C.bl})=><div style={{marginBottom:14}}><div style={{display:"flex",alignItems:"center",gap:7,marginBottom:su?2:0}}><span style={{fontSize:15}}>{ic}</span><span style={{fontSize:12,fontWeight:700,letterSpacing:1.2,color:c,textTransform:"uppercase",fontFamily:F}}>{ti}</span></div>{su&&<div style={{fontSize:10.5,color:C.t3,marginLeft:26}}>{su}</div>}</div>;

export const rc=r=>r==="Critical"?C.rd:r==="High"?C.am:r==="Medium"?C.or:C.gn;
export const pc=p=>p==="Critical"?C.rd:p==="High"?C.am:p==="Medium"?C.bl:C.gn;

export const Row=({cols,cells,header,i=0})=><div style={{display:"grid",gridTemplateColumns:cols,gap:0,padding:"7px 10px",fontSize:header?9.5:11.5,fontWeight:header?600:400,color:header?C.t3:C.t1,background:header?C.s1:"transparent",borderBottom:`1px solid ${C.br}22`,fontFamily:header?F:F,letterSpacing:header?1:0,textTransform:header?"uppercase":"none",animation:header?"none":`fu .25s ease ${i*30}ms both`}}>{cells.map((cell,j)=><div key={j} style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",...(cell.s||{})}}>{cell.v}</div>)}</div>;

// ── Step Workflow Component ──
export const WorkflowSteps=({steps})=><div style={{display:"flex",gap:2,marginTop:10}}>{steps.map((s,i)=><div key={i} style={{flex:1,position:"relative"}}><div style={{padding:"6px 4px",borderRadius:5,background:s.done?C.gnG:s.active?C.amG:`${C.br}44`,border:`1px solid ${s.done?C.gn:s.active?C.am:C.br}33`,textAlign:"center"}}><div style={{fontSize:9,fontWeight:600,color:s.done?C.gn:s.active?C.am:C.t4}}>{s.done?"✓":s.active?"⏳":"○"}</div><div style={{fontSize:8.5,color:C.t2,marginTop:2,lineHeight:1.2}}>{s.label}</div></div>{i<steps.length-1&&<div style={{position:"absolute",right:-4,top:"50%",transform:"translateY(-50%)",fontSize:8,color:C.t4}}>→</div>}</div>)}</div>;

// ── Approval Badge ──
export const ApprovalBadge=({status})=>{const m={Approved:{c:C.gn,i:"✓"},Pending:{c:C.am,i:"⏳"},Rejected:{c:C.rd,i:"✗"},Escalated:{c:C.or,i:"⚡"}};const s=m[status]||m.Pending;return <Pill t={`${s.i} ${status}`} c={s.c}/>;};
