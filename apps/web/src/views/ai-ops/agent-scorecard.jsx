import { C, M, SR } from "@aegis/ui";
import { formatPercent, formatCount, formatDuration } from "./format.js";

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
    <Metric label="Accuracy"        value={formatPercent(scorecard.accuracy)}      accent={C.gn}/>
    <Metric label="Coverage"        value={formatPercent(scorecard.coverage)}      accent={C.bl}/>
    <Metric label="Avg review time" value={formatDuration(scorecard.avgReviewTimeMs)} accent={C.tl}/>
    <Metric label="Escalation rate" value={formatPercent(scorecard.escalationRate)} accent={C.am}/>
    <Metric label="Agent events"    value={formatCount(scorecard.agentEvents)}  accent={C.em}/>
  </div>;
}
