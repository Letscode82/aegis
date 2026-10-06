import { useState, useEffect, useCallback } from "react";
import { C, F, M, Card, inputStyle, useToast } from "@aegis/ui";

// ── Track 1 · Activity 4 — delivery / work panel ─────────────────────
//
// Surfaces the item-1/2 work-tracking backend on the ticket: a delivery
// workStatus (distinct from the triage status), the people assigned with
// a role, and the sub-tasks that make up the work. Reads/writes
// /api/intake/tickets/[id]/{delivery,assignments,tasks,work-status}.

const WORK_STATUS_OPTIONS = ["Not started", "In progress", "Blocked", "Delivered"];
const TASK_STATUS = [
  { value: "open", label: "Open", c: C.t3 },
  { value: "in_progress", label: "In progress", c: C.bl },
  { value: "blocked", label: "Blocked", c: C.rd },
  { value: "done", label: "Done", c: C.gn },
];
const taskMeta = (s) => TASK_STATUS.find((t) => t.value === s) || TASK_STATUS[0];

const label = { fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600, marginBottom: 6 };

export function WorkPanel({ ticket }) {
  const toast = useToast();
  const [delivery, setDelivery] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [err, setErr] = useState(null);
  const [addUser, setAddUser] = useState("");
  const [addRole, setAddRole] = useState("support");
  const [newTask, setNewTask] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/intake/tickets/${encodeURIComponent(ticket.id)}/delivery`);
      if (r.status === 403) { setErr("forbidden"); return; }
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Load failed (HTTP ${r.status})`);
      setDelivery(d.delivery); setErr(null);
    } catch (e) { setErr(String(e.message || e)); }
  }, [ticket.id]);

  useEffect(() => { setDelivery(null); load(); }, [load]);
  useEffect(() => {
    let on = true;
    fetch("/api/intake/assignees").then((r) => r.json()).then((d) => { if (on) setAssignees(d.assignees || []); }).catch(() => {});
    return () => { on = false; };
  }, []);

  const call = async (url, method, body) => {
    try {
      const r = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Failed (HTTP ${r.status})`);
      if (d.delivery) setDelivery(d.delivery); else load();
    } catch (e) { toast.error(String(e.message || e)); }
  };

  const base = `/api/intake/tickets/${encodeURIComponent(ticket.id)}`;
  const setStatus = (v) => call(`${base}/work-status`, "PUT", { workStatus: v || null });
  const addAssignment = () => { if (!addUser) return; call(`${base}/assignments`, "POST", { userId: addUser, role: addRole }); setAddUser(""); };
  const removeAssignment = (id) => call(`${base}/assignments/${id}`, "DELETE");
  const addTaskItem = () => { if (!newTask.trim()) return; call(`${base}/tasks`, "POST", { title: newTask.trim() }); setNewTask(""); };
  const cycleTask = (t) => {
    const order = ["open", "in_progress", "blocked", "done"];
    const nextStatus = order[(order.indexOf(t.status) + 1) % order.length];
    call(`${base}/tasks/${t.id}`, "PUT", { status: nextStatus });
  };
  const removeTask = (id) => call(`${base}/tasks/${id}`, "DELETE");
  // W3-5 — minutes-per-task quick entry (server audits each log and
  // rolls the minutes into the Pool Ops effort-per-tier view).
  const logEffort = (t, minutes) => call(`${base}/tasks/${t.id}`, "PUT", { logEffortMinutes: minutes });
  const fmtEffort = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);
  const nameFor = (userId) => assignees.find((a) => a.id === userId)?.name || userId;

  if (err === "forbidden") return null; // caller lacks read_all — hide the panel
  return (
    <Card style={{ background: C.s1 }}>
      <div style={label}>Delivery &amp; work</div>
      {err && err !== "forbidden" && <div style={{ fontSize: 10.5, color: C.rd, fontFamily: M, marginBottom: 8 }}>{err}</div>}
      {delivery === null && !err ? (
        <div style={{ fontSize: 10.5, color: C.t3, fontFamily: M }}>◎ loading…</div>
      ) : delivery && (
        <>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: .8, marginBottom: 3 }}>Work status</div>
            <select value={delivery.workStatus || ""} onChange={(e) => setStatus(e.target.value)} style={{ ...inputStyle, width: "100%", fontSize: 11 }}>
              <option value="">(unset)</option>
              {WORK_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: .8, marginBottom: 4 }}>Assignees ({delivery.assignments.length})</div>
          {delivery.assignments.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 7px", background: C.s2, borderRadius: 4, marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: C.t1, flex: 1 }}>{nameFor(a.userId)}</span>
              <span style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: .5 }}>{a.role}</span>
              <span onClick={() => removeAssignment(a.id)} title="Remove" style={{ fontSize: 12, color: C.t3, cursor: "pointer" }}>✕</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 5, marginTop: 4, marginBottom: 12 }}>
            <select value={addUser} onChange={(e) => setAddUser(e.target.value)} style={{ ...inputStyle, flex: 1, fontSize: 10.5 }}>
              <option value="">+ assignee…</option>
              {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input value={addRole} onChange={(e) => setAddRole(e.target.value)} title="Role" style={{ ...inputStyle, width: 78, fontSize: 10.5 }} />
            <div onClick={addAssignment} style={{ padding: "6px 9px", background: C.bl, color: C.bg, fontSize: 9.5, fontFamily: M, fontWeight: 700, borderRadius: 3, cursor: "pointer", letterSpacing: .8 }}>Add</div>
          </div>

          <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: .8, marginBottom: 4 }}>Tasks ({delivery.tasks.length})</div>
          {delivery.tasks.map((t) => {
            const m = taskMeta(t.status);
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 7px", background: C.s2, borderRadius: 4, marginBottom: 4 }}>
                <span onClick={() => cycleTask(t)} title="Click to advance status" style={{ fontSize: 8.5, fontFamily: M, color: m.c, border: `1px solid ${m.c}66`, borderRadius: 3, padding: "1px 5px", cursor: "pointer", letterSpacing: .5, textTransform: "uppercase", whiteSpace: "nowrap" }}>{m.label}</span>
                <span style={{ fontSize: 11, color: t.status === "done" ? C.t3 : C.t1, flex: 1, textDecoration: t.status === "done" ? "line-through" : "none" }}>{t.title}</span>
                {t.effortMinutes > 0 && <span title="Logged effort" style={{ fontSize: 9, fontFamily: M, color: C.tl, whiteSpace: "nowrap" }}>⏱ {fmtEffort(t.effortMinutes)}</span>}
                {[15, 30, 60].map((mins) => (
                  <span key={mins} onClick={() => logEffort(t, mins)} title={`Log ${mins} minutes on this task`} style={{ fontSize: 8.5, fontFamily: M, color: C.t3, border: `1px solid ${C.br}`, borderRadius: 3, padding: "1px 4px", cursor: "pointer", whiteSpace: "nowrap" }} onMouseEnter={(e) => { e.currentTarget.style.color = C.tl; e.currentTarget.style.borderColor = C.tl; }} onMouseLeave={(e) => { e.currentTarget.style.color = C.t3; e.currentTarget.style.borderColor = C.br; }}>+{mins === 60 ? "1h" : mins + "m"}</span>
                ))}
                <span onClick={() => removeTask(t.id)} title="Remove" style={{ fontSize: 12, color: C.t3, cursor: "pointer" }}>✕</span>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
            <input value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addTaskItem(); }} placeholder="+ add a task…" style={{ ...inputStyle, flex: 1, fontSize: 10.5 }} />
            <div onClick={addTaskItem} style={{ padding: "6px 9px", background: C.bl, color: C.bg, fontSize: 9.5, fontFamily: M, fontWeight: 700, borderRadius: 3, cursor: "pointer", letterSpacing: .8 }}>Add</div>
          </div>
        </>
      )}
    </Card>
  );
}
