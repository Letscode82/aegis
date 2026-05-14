import { C, F, M } from "@aegis/ui";

function waitingLabel(ms){
  const s = ms / 1000;
  if (s < 60) return `${Math.round(s)}s`;
  const m = s / 60;
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h/24).toFixed(1)}d`;
}

function PendingRow({ item }){
  const href = `/?view=intake&ticketId=${encodeURIComponent(item.ticketId)}`;
  return <div style={{
    display:"grid",gridTemplateColumns:"1fr auto",gap:14,padding:"12px 14px",
    borderBottom:`1px solid ${C.br}33`,alignItems:"center",
  }}>
    <div style={{minWidth:0}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
        <span style={{fontFamily:M,fontSize:10,color:C.em,letterSpacing:.5}}>{item.ticketId}</span>
        <span style={{fontSize:10,fontFamily:F,color:C.t2}}>· {item.ticketType}</span>
        {item.classification && (
          <span style={{
            fontSize:9,fontFamily:M,color:C.tl,border:`1px solid ${C.tl}55`,
            padding:"1px 6px",borderRadius:2,letterSpacing:.5,
          }}>
            {item.classification}
            {typeof item.confidence === "number" ? ` · ${Math.round(item.confidence*100)}%` : ""}
          </span>
        )}
      </div>
      <div style={{fontSize:11,color:C.t1,lineHeight:1.35,fontFamily:F,marginBottom:3,overflow:"hidden",textOverflow:"ellipsis"}}>{item.description}</div>
      <div style={{fontSize:9.5,fontFamily:M,color:C.t3,letterSpacing:.3}}>
        {item.requesterName} · waiting {waitingLabel(item.waitingMs)}
      </div>
    </div>
    <a href={href} target="_blank" rel="noreferrer" style={{
      padding:"6px 14px",border:`1px solid ${C.em}`,color:C.em,fontSize:9.5,
      fontFamily:M,letterSpacing:1.5,textTransform:"uppercase",cursor:"pointer",
      textDecoration:"none",transition:"all .12s",whiteSpace:"nowrap",
    }}
    onMouseEnter={e=>{e.currentTarget.style.background=C.em;e.currentTarget.style.color=C.bg}}
    onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=C.em}}>
      Review
    </a>
  </div>;
}

export function PendingReviewQueue({ pendingReview }){
  return <div style={{background:C.cd,border:`1px solid ${C.br}`}}>
    <div style={{padding:"12px 14px",borderBottom:`1px solid ${C.br}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <span style={{fontSize:10,fontFamily:M,color:C.am,letterSpacing:2,textTransform:"uppercase"}}>AWAITING · HUMAN · REVIEW</span>
      <span style={{fontSize:9,fontFamily:M,color:C.t4,letterSpacing:1}}>{pendingReview.length} pending</span>
    </div>
    {pendingReview.length === 0 ? (
      <div style={{padding:"20px 14px",fontSize:11,fontFamily:F,color:C.t2,textAlign:"center"}}>
        <span style={{color:C.gn,marginRight:6}}>✓</span>
        All AI recommendations have been reviewed.
      </div>
    ) : (
      pendingReview.map(item => <PendingRow key={item.ticketId} item={item}/>)
    )}
  </div>;
}
