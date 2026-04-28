import { C, F, M, SR, Bar } from "@aegis/ui";

// ── Keyboard chord display ──
export const Kbd=({k,sub,active})=><span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 6px",background:active?C.cy+"22":C.s2,border:`1px solid ${active?C.cy:C.br}`,borderRadius:3,fontSize:9.5,fontFamily:M,color:active?C.cy:C.t2,fontWeight:600,letterSpacing:.2,lineHeight:"14px",minWidth:18,justifyContent:"center"}}>{k}{sub&&<span style={{color:C.t4,fontSize:8.5,marginLeft:2}}>{sub}</span>}</span>;

// ── Confidence tier + badge ──
export const confidenceTier=(c)=>c>=0.90?{tier:"high",c:C.gn,l:"HIGH CONFIDENCE"}:c>=0.70?{tier:"medium",c:C.am,l:"MEDIUM CONFIDENCE"}:{tier:"review",c:C.rd,l:"⚠ REVIEW CAREFULLY"};
export const ConfidenceBadge=({conf})=>{const t=confidenceTier(conf);return <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"3px 8px",background:t.c+"14",border:`1px solid ${t.c}55`,borderRadius:3}}><span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",background:t.c,boxShadow:`0 0 5px ${t.c}80`}}/><span style={{fontSize:9,fontFamily:M,color:t.c,letterSpacing:1,fontWeight:600}}>{t.l}</span><span style={{fontSize:11,fontFamily:M,color:t.c,fontWeight:700}}>{Math.round(conf*100)}%</span></div>;};

// ── Agent badge ──
export const AgentBadge=({agent,size=10})=>agent?<span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"2px 7px",background:C.pp+"18",border:`1px solid ${C.pp}44`,borderRadius:3,fontSize:size-.5,fontFamily:M,color:C.pp,letterSpacing:.8,fontWeight:600}}><span style={{fontSize:size}}>{agent.icon||"◉"}</span>{agent.shortName||agent.name}</span>:null;

// ── Typing indicator ──
export const TypingDots=()=><span style={{display:"inline-flex",alignItems:"center",gap:3,padding:"6px 10px"}}>{[0,1,2].map(i=><span key={i} style={{width:5,height:5,borderRadius:"50%",background:C.cy,display:"inline-block",animation:`typing 1.2s ${i*.18}s infinite ease-in-out`}}/>)}</span>;

// ── Chat bubble — user (C.s1 bg) vs AI (C.cd bg with C.cy left border) ──
export const ChatBubble=({role,children,d=0,streaming,meta})=>{
  const isUser=role==="user";
  return <div style={{display:"flex",justifyContent:isUser?"flex-end":"flex-start",marginBottom:10,animation:`fu .28s ease ${d}ms both`}}>
    <div style={{maxWidth:"78%",padding:"10px 13px",background:isUser?C.s1:C.cd,border:`1px solid ${isUser?C.br:C.br}`,borderLeft:isUser?`1px solid ${C.br}`:`2px solid ${C.cy}`,borderRadius:isUser?"8px 8px 2px 8px":"2px 8px 8px 8px",fontSize:12.5,color:C.t1,lineHeight:1.55,fontFamily:isUser?F:SR,fontWeight:isUser?400:400}}>
      {!isUser&&<div style={{fontSize:8.5,fontFamily:M,color:C.cy,letterSpacing:1.5,textTransform:"uppercase",marginBottom:5,fontWeight:600}}>◎ AEGIS INTAKE COPILOT</div>}
      <div>{children}{streaming&&<span style={{display:"inline-block",width:6,height:12,background:C.cy,marginLeft:3,verticalAlign:"middle",animation:"p 1s infinite"}}/>}</div>
      {meta&&<div style={{fontSize:9,color:C.t4,marginTop:6,fontFamily:M,letterSpacing:.5}}>{meta}</div>}
    </div>
  </div>;
};

// ── Capacity meter — cockpit-only ──
export const CapacityMeter=({current,avg,cap,label})=>{const pct=Math.min(Math.round((current/cap)*100),100);const overloaded=current>avg*1.3;return <div style={{padding:10,background:C.s1,borderRadius:4}}>
  <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:1,fontFamily:M,marginBottom:5,fontWeight:600}}><span>{label||"Your Capacity"}</span><span style={{color:overloaded?C.am:C.t3}}>{current} / {cap}</span></div>
  <Bar pct={pct} c={overloaded?C.am:C.gn} h={5}/>
  <div style={{display:"flex",justifyContent:"space-between",fontSize:8.5,color:C.t4,marginTop:4,fontFamily:M}}><span>Team avg: {avg}</span>{overloaded&&<span style={{color:C.am}}>⚠ {Math.round(((current-avg)/avg)*100)}% over team avg</span>}</div>
</div>;};

// ── Similar-matter compact card ──
export const SimilarMatterCard=({m,onClick})=><div onClick={onClick} style={{padding:10,background:C.s1,borderRadius:4,border:`1px solid ${C.br}55`,cursor:"pointer",transition:"all .12s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.cy+"aa";e.currentTarget.style.background=C.cdH}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.br+"55";e.currentTarget.style.background=C.s1}}>
  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
    <span style={{fontFamily:M,fontSize:9.5,color:C.cy,fontWeight:600}}>{m.id}</span>
    <span style={{fontSize:9,color:C.t4,fontFamily:M}}>{m.similarity}% match</span>
  </div>
  <div style={{fontSize:11,color:C.t1,lineHeight:1.4,marginBottom:4,fontFamily:F}}>{m.desc}</div>
  <div style={{fontSize:9,color:C.t3,fontFamily:M}}>Resolved {m.resolvedDaysAgo}d ago · {m.resolution}</div>
</div>;
