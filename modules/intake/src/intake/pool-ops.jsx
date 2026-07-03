import { useState, useEffect, useCallback } from "react";
import { C, M, SR, Card, Pill, Bar, Dot } from "@aegis/ui";

// ── W2-3 · Pool Ops — utilization, overflow, throughput per tier ─────
//
// The "senior counsel freed for strategic work" evidence view. Reads
// GET /api/intake/pool-ops (pure aggregation over data the routing
// engine already produces): per-member and per-pool utilization, the
// complexity mix each tier is carrying, overflow pressure inside the
// window, and closed-ticket throughput.

const utilColor = (pct) => pct == null ? C.t3 : pct >= 100 ? C.rd : pct >= 70 ? C.am : C.gn;

const sectionLabel = { fontSize: 9.5, fontFamily: M, color: C.t3, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600, marginBottom: 8 };

function Skeleton() {
  return (
    <div>
      {[0, 1].map((i) => (
        <div key={i} style={{ height: 120, background: C.s1, borderRadius: 5, marginBottom: 10, opacity: .5 - i * .15, animation: "fu 1s ease infinite alternate" }} />
      ))}
    </div>
  );
}

function StatBlock({ label, value, color, sub }) {
  return (
    <div style={{ padding: "10px 14px", background: C.s1, borderRadius: 5, minWidth: 110 }}>
      <div style={{ fontSize: 9, color: C.t3, textTransform: "uppercase", letterSpacing: 1, fontFamily: M, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 400, color: color || C.t1, fontFamily: SR, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 9.5, color: C.t4, marginTop: 3, fontFamily: M }}>{sub}</div>}
    </div>
  );
}

function MixChip({ label, count, color }) {
  return (
    <span style={{ fontSize: 9, fontFamily: M, letterSpacing: .8, padding: "2px 7px", borderRadius: 3, textTransform: "uppercase", color, border: `1px solid ${color}55`, opacity: count === 0 ? .35 : 1 }}>
      {label} {count}
    </span>
  );
}

function MemberRow({ m }) {
  const pct = m.utilizationPct;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.br}44`, opacity: m.active ? 1 : .45 }}>
      <div style={{ flex: "0 0 180px", fontSize: 11, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {m.userName || m.userId}
        {!m.active && <span style={{ fontSize: 8.5, color: C.t4, fontFamily: M, marginLeft: 6 }}>INACTIVE</span>}
      </div>
      <div style={{ flex: 1 }}>
        <Bar pct={pct == null ? Math.min(m.openCount * 10, 100) : Math.min(pct, 100)} c={utilColor(pct)} h={5} />
      </div>
      <div style={{ flex: "0 0 110px", textAlign: "right", fontSize: 10.5, fontFamily: M, color: utilColor(pct) }}>
        {m.openCount}{m.capacity > 0 ? ` / ${m.capacity}` : " open"}
        <span style={{ color: C.t4, marginLeft: 6 }}>{pct == null ? "∞ cap" : `${pct}%`}</span>
      </div>
    </div>
  );
}

function TeamCard({ team, d }) {
  const pct = team.utilizationPct;
  return (
    <Card d={d}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontFamily: SR, color: C.t1 }}>{team.name}</span>
            <Pill t={team.strategy === "round_robin" ? "ROUND ROBIN" : "LEAST LOADED"} c={C.tl} />
            {!team.active && <Pill t="INACTIVE" c={C.t3} />}
            {team.overflowInCount > 0 && <Pill t={`${team.overflowInCount} VIA OVERFLOW`} c={C.am} />}
          </div>
          <div style={{ fontSize: 10, color: C.t3, fontFamily: M, marginTop: 4 }}>
            {team.members.length} member{team.members.length === 1 ? "" : "s"}
            {team.overflowTeamName && <span> · overflows to <span style={{ color: C.t1 }}>{team.overflowTeamName}</span></span>}
          </div>
        </div>
        <div style={{ textAlign: "right", minWidth: 120 }}>
          <div style={{ fontSize: 9, color: C.t3, textTransform: "uppercase", letterSpacing: 1.2, fontFamily: M, marginBottom: 2 }}>Utilization</div>
          <div style={{ fontSize: 22, fontFamily: SR, color: utilColor(pct), lineHeight: 1 }}>
            {pct == null ? "—" : `${pct}%`}
          </div>
          <div style={{ fontSize: 9.5, color: C.t4, fontFamily: M, marginTop: 2 }}>
            {team.openTotal} open{team.capacityTotal > 0 ? ` of ${team.capacityTotal} cap` : " · unbounded"}
          </div>
        </div>
      </div>

      {team.members.length === 0
        ? <div style={{ padding: 12, background: C.s1, borderRadius: 5, fontSize: 11, color: C.t3 }}>No members yet — add attorneys on the Teams tab.</div>
        : team.members.map((m) => <MemberRow key={m.userId} m={m} />)}

      <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <span style={{ fontSize: 9, color: C.t4, fontFamily: M, letterSpacing: 1, textTransform: "uppercase" }}>Mix</span>
          <MixChip label="Simple" count={team.complexityMix.simple} color={C.gn} />
          <MixChip label="Standard" count={team.complexityMix.standard} color={C.am} />
          <MixChip label="Complex" count={team.complexityMix.complex} color={C.rd} />
        </div>
        <div style={{ fontSize: 10, fontFamily: M, color: C.t3 }}>
          Routed <span style={{ color: C.t1 }}>{team.routedCount}</span>
          {" · "}Closed 7d <span style={{ color: C.gn }}>{team.closed7d}</span>
          {" · "}30d <span style={{ color: C.gn }}>{team.closed30d}</span>
          {team.overdueCount > 0 && <span> · <span style={{ color: C.rd }}>{team.overdueCount} overdue</span></span>}
          {team.atRiskCount > 0 && <span> · <span style={{ color: C.am }}>{team.atRiskCount} at risk</span></span>}
        </div>
      </div>
    </Card>
  );
}

export function PoolOpsTab() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      setErr(null);
      const r = await fetch("/api/intake/pool-ops?days=30");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setErr(String(e.message || e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err) return (
    <div style={{ padding: 20, background: C.rdG, border: `1px solid ${C.rd}55`, borderRadius: 5, fontSize: 12, color: C.t1 }}>
      Couldn't load pool operations: {err}
      <span onClick={load} style={{ marginLeft: 10, color: C.cy, cursor: "pointer", fontFamily: M, fontSize: 10, letterSpacing: 1 }}>RETRY</span>
    </div>
  );
  if (!data) return <Skeleton />;

  const totals = data.teams.reduce(
    (a, t) => ({
      open: a.open + t.openTotal,
      overflow: a.overflow + t.overflowInCount,
      routed: a.routed + t.routedCount,
      closed7: a.closed7 + t.closed7d,
      overdue: a.overdue + t.overdueCount,
    }),
    { open: 0, overflow: 0, routed: 0, closed7: 0, overdue: 0 },
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={sectionLabel}>Pool operations · last {data.windowDays} days</div>
        <div style={{ fontSize: 9.5, fontFamily: M, color: C.t4, display: "flex", alignItems: "center", gap: 6 }}>
          <Dot c={C.gn} p />Live · <span onClick={load} style={{ color: C.cy, cursor: "pointer", letterSpacing: 1 }}>REFRESH</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <StatBlock label="Open in pools" value={totals.open} color={C.tl} />
        <StatBlock label="Awaiting pickup" value={data.unassignedOpen} color={data.unassignedOpen > 0 ? C.am : C.gn} sub="unassigned queue" />
        <StatBlock label="Routed by rules" value={totals.routed} sub={`last ${data.windowDays}d`} />
        <StatBlock label="Overflow events" value={totals.overflow} color={totals.overflow > 0 ? C.am : C.gn} sub="capacity pressure" />
        <StatBlock label="Closed 7d" value={totals.closed7} color={C.gn} sub="throughput" />
        {totals.overdue > 0 && <StatBlock label="Overdue" value={totals.overdue} color={C.rd} sub="SLA breached" />}
      </div>

      {data.teams.length === 0 ? (
        <div style={{ padding: 28, textAlign: "center", background: C.cd, border: `1px dashed ${C.br}`, borderRadius: 6 }}>
          <div style={{ fontSize: 13, fontFamily: SR, color: C.t1, marginBottom: 6 }}>No pools configured yet</div>
          <div style={{ fontSize: 11, color: C.t3, lineHeight: 1.6 }}>
            Create tiers on the <b>Teams</b> tab (e.g. Tier 1 · Paralegals → Tier 2 · Counsel → Tier 3 · Senior),
            then point Smart Routing rules at them. This dashboard lights up as work flows through the pools.
          </div>
        </div>
      ) : (
        data.teams.map((t, i) => <TeamCard key={t.id} team={t} d={80 + i * 60} />)
      )}
    </div>
  );
}
