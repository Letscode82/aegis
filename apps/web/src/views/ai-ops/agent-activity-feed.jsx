import { C, F, M, Dot } from "@aegis/ui";

// Color + label for each action in the activity feed.
// Keep this synced with ACTIVITY_ACTIONS in @aegis/intake/ai-ops.
const ACTION_META = {
  "intake.ticket.created":              { dot: C.bl, verb: "Classified",           tone: "create"   },
  "intake.recommendation.approved":     { dot: C.gn, verb: "Approved",             tone: "approve"  },
  "intake.recommendation.edited_approved":{ dot: C.pp, verb: "Edited + approved",  tone: "approve"  },
  "intake.recommendation.rejected":     { dot: C.rd, verb: "Rejected",             tone: "reject"   },
  "intake.recommendation.reassigned":   { dot: C.tl, verb: "Reassigned",           tone: "neutral"  },
  "intake.recommendation.snoozed":      { dot: C.t3, verb: "Snoozed",              tone: "neutral"  },
  "intake.recommendation.manual_close": { dot: C.t3, verb: "Manually closed",      tone: "neutral"  },
  "intake.ticket.escalated":            { dot: C.am, verb: "Escalated",            tone: "warn"     },
  "intake.ticket.closed":               { dot: C.t3, verb: "Closed",               tone: "neutral"  },
};

function relativeTime(iso, now){
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now - t);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function Pill({ children, c }){
  return <span style={{
    fontSize:9,fontFamily:M,letterSpacing:.5,color:c,border:`1px solid ${c}55`,
    padding:"1px 6px",borderRadius:2,whiteSpace:"nowrap",
  }}>{children}</span>;
}

function ActivityRow({ e, now }){
  const meta = ACTION_META[e.action] || { dot: C.t3, verb: e.action };
  const href = `/?view=intake&ticketId=${encodeURIComponent(e.ticketId)}`;
  return <a href={href} target="_blank" rel="noreferrer" style={{
    display:"flex",alignItems:"center",gap:10,padding:"8px 10px",
    borderBottom:`1px solid ${C.br}33`,textDecoration:"none",color:"inherit",
    transition:"background .12s",
  }}
  onMouseEnter={ev=>{ev.currentTarget.style.background=C.cd}}
  onMouseLeave={ev=>{ev.currentTarget.style.background="transparent"}}>
    <Dot c={meta.dot} p={meta.tone==="warn"||meta.tone==="reject"}/>
    <span style={{fontSize:10.5,color:C.t1,flex:1,fontFamily:F,lineHeight:1.35}}>
      <span style={{color:C.t2}}>{meta.verb}</span>{" "}
      <span style={{fontFamily:M,color:C.em,letterSpacing:.3}}>{e.ticketId}</span>
      {e.ticketType && <span style={{color:C.t3}}> · {e.ticketType}</span>}
      {e.ticketTitle && <span style={{color:C.t3}}> — {e.ticketTitle}</span>}
    </span>
    {typeof e.confidence === "number" && (
      <Pill c={C.tl}>{Math.round(e.confidence * 100)}%</Pill>
    )}
    <span style={{
      fontSize:9.5,fontFamily:M,color:C.t3,letterSpacing:.5,minWidth:110,textAlign:"right",
    }}>
      {e.actorName} · {relativeTime(e.timestamp, now)}
    </span>
  </a>;
}

export function AgentActivityFeed({ activity, now }){
  return <div style={{background:C.cd,border:`1px solid ${C.br}`,padding:0,display:"flex",flexDirection:"column"}}>
    <div style={{padding:"12px 14px",borderBottom:`1px solid ${C.br}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <Dot c={C.em} p/>
        <span style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:2,textTransform:"uppercase"}}>LIVE · AGENT · ACTIVITY</span>
      </div>
      <span style={{fontSize:9,fontFamily:M,color:C.t4,letterSpacing:1}}>{activity.length} events</span>
    </div>
    {activity.length === 0 ? (
      <div style={{padding:"24px 14px",textAlign:"center"}}>
        <div style={{fontSize:11,fontFamily:F,color:C.t2,marginBottom:6}}>No AI activity in the last 24h.</div>
        <div style={{fontSize:10,fontFamily:M,color:C.t4,letterSpacing:.5}}>
          File a test ticket via the Intake module to see the agent loop in motion.
        </div>
      </div>
    ) : (
      <div style={{maxHeight:480,overflowY:"auto"}}>
        {activity.map(e => <ActivityRow key={e.id} e={e} now={now}/>)}
      </div>
    )}
  </div>;
}
