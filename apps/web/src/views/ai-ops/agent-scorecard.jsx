import { C, M, SR } from "@aegis/ui";

function fmtPct(v){
  if (v === null || v === undefined) return "—";
  return `${Math.round(v * 100)}%`;
}

function fmtDuration(ms){
  if (ms === null || ms === undefined) return "—";
  const s = ms / 1000;
  if (s < 60) return `${Math.round(s)}s`;
  const min = s / 60;
  if (min < 60) return `${min.toFixed(1)}m`;
  const h = min / 60;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h/24).toFixed(1)}d`;
}

function fmtCount(n){
  if (n === null || n === undefined) return "—";
  if (n >= 1000) return `${(n/1000).toFixed(1)}k`;
  return String(n);
}

function Metric({ label, value, accent }){
  return <div style={{
    padding:"12px 14px",borderBottom:`1px solid ${C.br}33`,
    display:"flex",flexDirection:"column",gap:2,
  }}>
    <div style={{fontSize:22,fontFamily:SR,fontWeight:400,color:accent||C.t1,lineHeight:1.1}}>{value}</div>
    <div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:2,textTransform:"uppercase"}}>{label}</div>
  </div>;
}

export function AgentScorecard({ scorecard }){
  if (!scorecard) return null;
  return <div style={{background:C.cd,border:`1px solid ${C.br}`,display:"flex",flexDirection:"column"}}>
    <div style={{padding:"12px 14px",borderBottom:`1px solid ${C.br}`}}>
      <span style={{fontSize:10,fontFamily:M,color:C.tl,letterSpacing:2,textTransform:"uppercase"}}>AGENT · SCORECARD</span>
      <div style={{fontSize:9,fontFamily:M,color:C.t4,letterSpacing:.5,marginTop:2}}>Last 30 days</div>
    </div>
    <Metric label="Accuracy"        value={fmtPct(scorecard.accuracy)}      accent={C.gn}/>
    <Metric label="Coverage"        value={fmtPct(scorecard.coverage)}      accent={C.bl}/>
    <Metric label="Avg review time" value={fmtDuration(scorecard.avgReviewTimeMs)} accent={C.tl}/>
    <Metric label="Escalation rate" value={fmtPct(scorecard.escalationRate)} accent={C.am}/>
    <Metric label="Agent events"    value={fmtCount(scorecard.agentEvents)}  accent={C.em}/>
  </div>;
}
