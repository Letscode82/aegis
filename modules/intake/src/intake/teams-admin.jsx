import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR, Card, inputStyle } from "@aegis/ui";

// ── Track 1 · Activity 1 — Teams / pools admin surface ───────────────
//
// Surfaces the item-5 routing-tier backend: pools (IntakeTeam) with a
// load-balancing strategy + overflow, and members with a capacity. All
// reads/writes go through /api/admin/intake/teams/* (gated
// admin:manage_users). DRL's competency/seniority tiers are just pools
// configured here.

const STRATEGIES = [
  { value: "least_loaded", label: "Least loaded" },
  { value: "round_robin", label: "Round robin" },
];

function useTeams() {
  const [teams, setTeams] = useState(null);
  const [error, setError] = useState(null);
  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/intake/teams");
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Load failed (HTTP ${r.status})`);
      setTeams(d.teams || []);
      setError(null);
    } catch (e) {
      setError(String(e.message || e));
      setTeams([]);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { teams, error, reload };
}

const label = { fontSize: 9.5, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 };
const btn = (bg) => ({ padding: "5px 11px", background: bg, color: C.bg, fontSize: 9.5, fontFamily: M, letterSpacing: 1.2, cursor: "pointer", textTransform: "uppercase", fontWeight: 700, borderRadius: 3, border: "none" });

function PoolForm({ initial, teams, onCancel, onSaved }) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name || "");
  const [key, setKey] = useState(initial?.key || "");
  const [strategy, setStrategy] = useState(initial?.strategy || "least_loaded");
  const [overflowTeamId, setOverflowTeamId] = useState(initial?.overflowTeamId || "");
  const [sortOrder, setSortOrder] = useState(initial?.sortOrder ?? 100);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    if (!name.trim()) { setErr("Pool name is required."); return; }
    setBusy(true); setErr(null);
    try {
      const body = { name, key: key || undefined, strategy, overflowTeamId: overflowTeamId || null, sortOrder: Number(sortOrder) || 100 };
      const r = await fetch(isEdit ? `/api/admin/intake/teams/${initial.id}` : "/api/admin/intake/teams", {
        method: isEdit ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Save failed (HTTP ${r.status})`);
      onSaved();
    } catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(false); }
  };

  const overflowChoices = (teams || []).filter((t) => !isEdit || t.id !== initial.id);
  return (
    <Card style={{ marginBottom: 12, borderLeft: `3px solid ${C.cy}` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.cy, letterSpacing: 1.2, fontFamily: M, textTransform: "uppercase", marginBottom: 12 }}>{isEdit ? "Edit pool" : "New pool"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><div style={label}>Name</div><input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="Contracts — Senior" /></div>
        <div><div style={label}>Key {isEdit ? "" : "(auto from name if blank)"}</div><input value={key} onChange={(e) => setKey(e.target.value)} style={inputStyle} placeholder="contracts-senior" /></div>
        <div><div style={label}>Strategy</div>
          <select value={strategy} onChange={(e) => setStrategy(e.target.value)} style={inputStyle}>
            {STRATEGIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div><div style={label}>Overflow pool</div>
          <select value={overflowTeamId} onChange={(e) => setOverflowTeamId(e.target.value)} style={inputStyle}>
            <option value="">(none)</option>
            {overflowChoices.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div><div style={label}>Sort order</div><input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} style={inputStyle} /></div>
      </div>
      {err && <div style={{ marginTop: 10, padding: "7px 11px", background: C.rdG, borderLeft: `3px solid ${C.rd}`, borderRadius: 4, fontSize: 11, color: C.t1, fontFamily: M }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={save} disabled={busy} style={{ ...btn(C.cy), opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : isEdit ? "Save pool" : "Create pool"}</button>
        <button onClick={onCancel} style={{ ...btn(C.s1), color: C.t2 }}>Cancel</button>
      </div>
    </Card>
  );
}

function MemberRow({ teamId, member, canManage, onChanged }) {
  const [busy, setBusy] = useState(false);
  const act = async (method, body) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/intake/teams/${teamId}/members/${member.id}`, {
        method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Failed (HTTP ${r.status})`);
      onChanged();
    } catch (e) { alert(String(e.message || e)); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", background: C.s1, borderRadius: 4, marginBottom: 4, opacity: member.active ? 1 : 0.55 }}>
      <span style={{ fontSize: 11, color: C.t1, flex: 1 }}>{member.userName || member.userId}</span>
      <span style={{ fontSize: 9.5, fontFamily: M, color: C.t3 }}>cap {member.capacity === 0 ? "∞" : member.capacity}</span>
      {canManage && <>
        <span onClick={() => !busy && act("PUT", { active: !member.active })} title={member.active ? "Deactivate" : "Activate"} style={{ fontSize: 9, fontFamily: M, color: member.active ? C.gn : C.t4, cursor: "pointer", letterSpacing: 1 }}>{member.active ? "ACTIVE" : "OFF"}</span>
        <span onClick={() => !busy && act("DELETE")} title="Remove member" style={{ fontSize: 12, color: C.t3, cursor: "pointer" }}>✕</span>
      </>}
    </div>
  );
}

function AddMember({ teamId, assignees, existingUserIds, onAdded }) {
  const [userId, setUserId] = useState("");
  const [capacity, setCapacity] = useState(0);
  const [busy, setBusy] = useState(false);
  const options = (assignees || []).filter((a) => !existingUserIds.includes(a.id));
  const add = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/intake/teams/${teamId}/members`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, capacity: Number(capacity) || 0 }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Failed (HTTP ${r.status})`);
      setUserId(""); setCapacity(0); onAdded();
    } catch (e) { alert(String(e.message || e)); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
      <select value={userId} onChange={(e) => setUserId(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
        <option value="">+ Add member…</option>
        {options.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.roleName || "user"}</option>)}
      </select>
      <input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} title="Max concurrent open tickets (0 = unlimited)" style={{ ...inputStyle, width: 70 }} />
      <button onClick={add} disabled={busy || !userId} style={{ ...btn(C.bl), opacity: busy || !userId ? 0.5 : 1 }}>Add</button>
    </div>
  );
}

export function TeamsTab({ canManage }) {
  const { teams, error, reload } = useTeams();
  const [assignees, setAssignees] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    fetch("/api/intake/assignees").then((r) => r.json()).then((d) => setAssignees(d.assignees || [])).catch(() => {});
  }, []);

  const del = async (t) => {
    if (!window.confirm(`Delete pool "${t.name}"? Routing rules pointing at it will be cleared.`)) return;
    try {
      const r = await fetch(`/api/admin/intake/teams/${t.id}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Delete failed (HTTP ${r.status})`);
      reload();
    } catch (e) { alert(String(e.message || e)); }
  };

  if (teams === null && !error) return <div style={{ padding: 40, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12, letterSpacing: 1 }}>◎ Loading pools…</div>;
  if (error) return <Card style={{ borderLeft: `3px solid ${C.rd}` }}><div style={{ fontSize: 12, color: C.t2, fontFamily: F }}>Couldn't load pools: {error}</div></Card>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontFamily: SR, color: C.t1 }}>Teams &amp; pools</div>
          <div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, marginTop: 2 }}>Routing pools with load-balancing + overflow. Route-to-pool rules pick the least-loaded (or next round-robin) member.</div>
        </div>
        {canManage && !creating && <button onClick={() => { setCreating(true); setEditing(null); }} style={btn(C.cy)}>+ New pool</button>}
      </div>

      {creating && <PoolForm teams={teams} onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}

      {teams.length === 0 && !creating && <div style={{ padding: "24px 0", textAlign: "center", color: C.t4, fontSize: 11, fontFamily: M }}>No pools yet.{canManage && <> Click <span style={{ color: C.cy, fontWeight: 600 }}>+ NEW POOL</span> to add the first tier.</>}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {teams.map((t) => (
          editing === t.id
            ? <PoolForm key={t.id} initial={t} teams={teams} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
            : <Card key={t.id} style={{ borderLeft: `3px solid ${t.active ? C.gn : C.t4}`, opacity: t.active ? 1 : 0.7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 13, color: C.t1, fontWeight: 600 }}>{t.name}</div>
                  <div style={{ fontSize: 9.5, fontFamily: M, color: C.t3, marginTop: 2 }}>{t.key} · {t.strategy === "round_robin" ? "round robin" : "least loaded"}{t.overflowTeamName ? ` · overflow → ${t.overflowTeamName}` : ""}</div>
                </div>
                {canManage && <div style={{ display: "flex", gap: 8 }}>
                  <span onClick={() => { setEditing(t.id); setCreating(false); }} title="Edit pool" style={{ fontSize: 11, color: C.t3, cursor: "pointer" }}>✎</span>
                  <span onClick={() => del(t)} title="Delete pool" style={{ fontSize: 12, color: C.t3, cursor: "pointer" }}>✕</span>
                </div>}
              </div>
              <div style={{ ...label, marginTop: 6 }}>Members ({t.members.length})</div>
              {t.members.length === 0 && <div style={{ fontSize: 10.5, color: C.t4, fontFamily: M, padding: "4px 0" }}>No members — this pool can't take tickets yet.</div>}
              {t.members.map((m) => <MemberRow key={m.id} teamId={t.id} member={m} canManage={canManage} onChanged={reload} />)}
              {canManage && <AddMember teamId={t.id} assignees={assignees} existingUserIds={t.members.map((m) => m.userId)} onAdded={reload} />}
            </Card>
        ))}
      </div>
    </div>
  );
}
