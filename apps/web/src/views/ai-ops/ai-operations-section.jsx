import { useEffect, useState } from "react";
import { C, M } from "@aegis/ui";
import { useCurrentUser } from "@aegis/auth/react";
import { AgentActivityFeed } from "./agent-activity-feed.jsx";
import { AgentScorecard } from "./agent-scorecard.jsx";
import { PendingReviewQueue } from "./pending-review-queue.jsx";

const ENDPOINT = "/api/ai-ops/summary";

// One of these grants visibility — mirrors the API route's permission gate.
// Roles without either (e.g. plain `requester`) never call the endpoint.
function useCanSeeAIOps(){
  const { has, loading } = useCurrentUser();
  if (loading) return { loading: true, allowed: false };
  return { loading: false, allowed: has("intake:read_all_tickets") || has("audit:read_all") };
}

export function AIOperationsSection(){
  const { loading: permLoading, allowed } = useCanSeeAIOps();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (permLoading || !allowed) return;
    let cancelled = false;
    fetch(ENDPOINT, { credentials: "include" })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(json => { if (!cancelled) { setData(json); setError(null); } })
      .catch(err => { if (!cancelled) setError(err); });
    return () => { cancelled = true; };
  }, [permLoading, allowed]);

  // "ago" timestamps need a periodic re-render to stay live without
  // re-fetching the payload. 30s tick is enough for the granularity
  // we display (s / m / h / d).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (permLoading || !allowed) return null;

  return <section style={{marginBottom:20}}>
    <div style={{marginBottom:10}}>
      <div style={{fontSize:10,fontFamily:M,letterSpacing:2.5,color:C.em,textTransform:"uppercase"}}>AI · OPERATIONS</div>
      <div style={{fontSize:11,color:C.t3,fontFamily:M,marginTop:2,letterSpacing:.5}}>
        Agent activity, performance, and the human-review queue.
      </div>
    </div>
    {error && (
      <div style={{background:C.cd,border:`1px solid ${C.rd}55`,padding:"10px 14px",fontSize:10.5,color:C.rd,fontFamily:M,letterSpacing:.3,marginBottom:10}}>
        Couldn’t load AI operations summary. ({String(error.message || error)})
      </div>
    )}
    {!data && !error && (
      <div style={{background:C.cd,border:`1px solid ${C.br}`,padding:"14px",fontSize:10.5,color:C.t3,fontFamily:M,letterSpacing:.5}}>
        Loading agent activity…
      </div>
    )}
    {data && (
      <>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:12,marginBottom:12}}>
          <AgentActivityFeed activity={data.activity} now={now}/>
          <AgentScorecard scorecard={data.scorecard}/>
        </div>
        <PendingReviewQueue pendingReview={data.pendingReview}/>
      </>
    )}
  </section>;
}
