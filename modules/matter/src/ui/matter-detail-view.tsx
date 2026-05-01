/**
 * MatterDetailView — header card + tabbed panels.
 *
 * Tabs: Overview, Team, Tasks, Timeline, Legal Hold (placeholder for 4b),
 * Spend (stub), Audit, M365 (placeholder for 4c).
 *
 * Each panel fetches its own slice. The header card pulls everything
 * else from /api/matter/{id}. Status transitions and close-out happen
 * via dialog actions surfaced in the header.
 */
import React, { useEffect, useState } from "react";
import { Card, Pill, SH, C, F, M } from "@aegis/ui";
import type {
  MatterDTO,
  MatterPartyDTO,
  MatterTaskDTO,
  TimelineEntryDTO,
  ChecklistItemDTO,
  MatterStatus,
} from "./types";
import { LegalHoldPanel } from "./legal-hold-panel";

type TabKey =
  | "overview"
  | "team"
  | "tasks"
  | "timeline"
  | "hold"
  | "spend"
  | "audit"
  | "m365";

const TAB_LABELS: Record<TabKey, string> = {
  overview: "Overview",
  team: "Team",
  tasks: "Tasks",
  timeline: "Timeline",
  hold: "Legal Hold",
  spend: "Spend",
  audit: "Audit",
  m365: "M365",
};

const STATUS_COLOR: Record<MatterStatus, string> = {
  DRAFT: C.t3,
  OPEN: C.bl,
  ACTIVE: C.gn,
  STAYED: C.am,
  CLOSED: C.t4,
  ARCHIVED: C.t4,
};

export interface MatterDetailViewProps {
  matterId: string;
  endpoint?: string;
  onChange?: () => void;
}

export const MatterDetailView: React.FC<MatterDetailViewProps> = ({
  matterId,
  endpoint = "/api/matter",
  onChange,
}) => {
  const [matter, setMatter] = useState<MatterDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch(`${endpoint}/${matterId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((m: MatterDTO) => alive && setMatter(m))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [endpoint, matterId, refreshKey]);

  function refresh() {
    setRefreshKey((k) => k + 1);
    onChange?.();
  }

  if (error) {
    return (
      <Card>
        <div style={{ color: C.rd, fontSize: 12, fontFamily: M }}>
          Failed to load matter: {error}
        </div>
      </Card>
    );
  }

  if (!matter) {
    return (
      <Card>
        <div style={{ color: C.t3, fontSize: 12, fontFamily: M }}>Loading…</div>
      </Card>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14, padding: 14 }}>
      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 14,
          }}
        >
          <div>
            <div style={{ fontFamily: M, fontSize: 10, color: C.t3 }}>
              {matter.matterNumber ?? "(draft)"}  ·  {matter.type}
            </div>
            <div
              style={{
                fontFamily: F,
                fontWeight: 700,
                fontSize: 18,
                color: C.t1,
                marginTop: 4,
              }}
            >
              {matter.title}
            </div>
            {matter.description && (
              <div style={{ fontSize: 12, color: C.t2, marginTop: 6, maxWidth: 720 }}>
                {matter.description}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <Pill t={matter.status} c={STATUS_COLOR[matter.status]} />
            <StatusActions matter={matter} endpoint={endpoint} onChanged={refresh} />
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 8,
            marginTop: 14,
            fontFamily: M,
            fontSize: 10.5,
            color: C.t3,
          }}
        >
          <div>
            <div style={{ color: C.t4, fontSize: 9 }}>JURISDICTION</div>
            <div style={{ color: C.t1 }}>{matter.jurisdiction ?? "—"}</div>
          </div>
          <div>
            <div style={{ color: C.t4, fontSize: 9 }}>EST. VALUE</div>
            <div style={{ color: C.t1 }}>
              {matter.estimatedValue != null ? `$${matter.estimatedValue.toLocaleString()}` : "—"}
            </div>
          </div>
          <div>
            <div style={{ color: C.t4, fontSize: 9 }}>EST. DURATION</div>
            <div style={{ color: C.t1 }}>
              {matter.estimatedDurationDays != null ? `${matter.estimatedDurationDays} days` : "—"}
            </div>
          </div>
          <div>
            <div style={{ color: C.t4, fontSize: 9 }}>OPENED</div>
            <div style={{ color: C.t1 }}>
              {new Date(matter.openedAt).toISOString().slice(0, 10)}
            </div>
          </div>
        </div>
      </Card>

      <div style={{ display: "flex", gap: 4 }}>
        {(Object.keys(TAB_LABELS) as TabKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            style={{
              background: tab === k ? C.cd : "transparent",
              border: `1px solid ${tab === k ? C.brL : C.br}`,
              color: tab === k ? C.t1 : C.t3,
              padding: "6px 12px",
              borderRadius: 5,
              fontFamily: F,
              fontSize: 11,
              fontWeight: tab === k ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {TAB_LABELS[k]}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewPanel matter={matter} />}
      {tab === "team" && <TeamPanel matterId={matterId} />}
      {tab === "tasks" && <TasksPanel matterId={matterId} onChanged={refresh} />}
      {tab === "timeline" && <TimelinePanel matterId={matterId} />}
      {tab === "hold" && <LegalHoldPanel matterId={matterId} />}
      {tab === "spend" && <SpendPanel matterId={matterId} />}
      {tab === "audit" && <AuditPanel matterId={matterId} />}
      {tab === "m365" && <M365Panel />}
    </div>
  );
};

// ── Status actions ────────────────────────────────────────────────

const StatusActions: React.FC<{
  matter: MatterDTO;
  endpoint: string;
  onChanged: () => void;
}> = ({ matter, endpoint, onChanged }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function transition(to: MatterStatus) {
    setBusy(to);
    setError(null);
    try {
      const resp = await fetch(`${endpoint}/${matter.id}/transition`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function close() {
    setBusy("CLOSED");
    setError(null);
    try {
      const resp = await fetch(`${endpoint}/${matter.id}/close`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  const actions: Array<{ label: string; status: MatterStatus; isClose?: boolean }> = [];
  if (matter.status === "DRAFT") actions.push({ label: "Open", status: "OPEN" });
  if (matter.status === "OPEN") {
    actions.push({ label: "Activate", status: "ACTIVE" });
    actions.push({ label: "Close", status: "CLOSED", isClose: true });
  }
  if (matter.status === "ACTIVE") {
    actions.push({ label: "Stay", status: "STAYED" });
    actions.push({ label: "Close", status: "CLOSED", isClose: true });
  }
  if (matter.status === "STAYED") {
    actions.push({ label: "Resume", status: "ACTIVE" });
    actions.push({ label: "Close", status: "CLOSED", isClose: true });
  }
  if (matter.status === "CLOSED") actions.push({ label: "Archive", status: "ARCHIVED" });

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={() => (a.isClose ? close() : transition(a.status))}
          disabled={busy === a.status}
          style={{
            background: "transparent",
            border: `1px solid ${C.br}`,
            color: C.t1,
            padding: "3px 9px",
            borderRadius: 4,
            fontSize: 10,
            fontFamily: F,
            cursor: "pointer",
          }}
        >
          {busy === a.status ? "…" : a.label}
        </button>
      ))}
      {error && (
        <span style={{ color: C.rd, fontSize: 10, fontFamily: M }}>{error}</span>
      )}
    </div>
  );
};

// ── Overview ──────────────────────────────────────────────────────

const OverviewPanel: React.FC<{ matter: MatterDTO }> = ({ matter }) => {
  return (
    <Card>
      <SH icon="📋" title="Closeout checklist" />
      <div style={{ display: "grid", gap: 6 }}>
        {matter.closeoutChecklistJson.length === 0 && (
          <div style={{ color: C.t3, fontSize: 11, fontFamily: M }}>
            No closeout items configured for this matter type.
          </div>
        )}
        {matter.closeoutChecklistJson.map((item: ChecklistItemDTO) => (
          <div
            key={item.key}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontSize: 11,
              color: C.t1,
              fontFamily: F,
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                border: `1px solid ${item.completed ? C.gn : C.br}`,
                background: item.completed ? C.gnG : "transparent",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                color: C.gn,
              }}
            >
              {item.completed ? "✓" : ""}
            </span>
            <span>
              {item.label}{" "}
              {item.required && (
                <span
                  style={{
                    fontSize: 9,
                    color: C.am,
                    fontFamily: M,
                    marginLeft: 4,
                  }}
                >
                  required
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
};

// ── Team panel ────────────────────────────────────────────────────

const TeamPanel: React.FC<{ matterId: string }> = ({ matterId }) => {
  const [parties, setParties] = useState<MatterPartyDTO[] | null>(null);
  useEffect(() => {
    fetch(`/api/matter/${matterId}/parties`)
      .then((r) => r.json())
      .then(setParties)
      .catch(() => setParties([]));
  }, [matterId]);
  return (
    <Card>
      <SH icon="👥" title="Team" />
      {!parties && <div style={{ color: C.t3, fontSize: 11 }}>Loading…</div>}
      {parties && parties.length === 0 && (
        <div style={{ color: C.t3, fontSize: 11 }}>No team members assigned yet.</div>
      )}
      {parties && parties.length > 0 && (
        <div style={{ display: "grid", gap: 4 }}>
          {parties.map((p) => (
            <div
              key={p.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 140px 100px",
                fontSize: 11,
                padding: "4px 8px",
                color: C.t1,
                fontFamily: F,
                borderBottom: `1px solid ${C.br}22`,
              }}
            >
              <div>{p.personName ?? p.personId}</div>
              <div style={{ fontFamily: M, color: C.t3, fontSize: 10 }}>{p.role}</div>
              <div style={{ fontFamily: M, color: C.t3, fontSize: 10 }}>
                {new Date(p.addedAt).toISOString().slice(0, 10)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

// ── Tasks panel ───────────────────────────────────────────────────

const TasksPanel: React.FC<{ matterId: string; onChanged: () => void }> = ({
  matterId,
  onChanged,
}) => {
  const [tasks, setTasks] = useState<MatterTaskDTO[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  function reload() {
    fetch(`/api/matter/${matterId}/tasks`)
      .then((r) => r.json())
      .then(setTasks)
      .catch(() => setTasks([]));
  }

  useEffect(() => {
    reload();
    // We deliberately reload only when matterId changes; reload reference
    // is stable enough for our needs.
  }, [matterId]);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      await fetch(`/api/matter/${matterId}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      setNewTitle("");
      reload();
      onChanged();
    } finally {
      setAdding(false);
    }
  }

  async function complete(id: string) {
    await fetch(`/api/matter/tasks/${id}/complete`, { method: "POST" });
    reload();
    onChanged();
  }

  return (
    <Card>
      <SH icon="✅" title="Tasks" />
      <form onSubmit={addTask} style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New task title…"
          style={{
            flex: 1,
            background: C.s1,
            border: `1px solid ${C.br}`,
            padding: "5px 9px",
            borderRadius: 4,
            color: C.t1,
            fontFamily: M,
            fontSize: 11,
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={adding || !newTitle.trim()}
          style={{
            background: newTitle.trim() ? C.bl : C.br,
            border: "none",
            color: C.bg,
            padding: "5px 14px",
            fontSize: 10.5,
            fontFamily: F,
            fontWeight: 700,
            borderRadius: 4,
            cursor: newTitle.trim() ? "pointer" : "default",
          }}
        >
          Add
        </button>
      </form>
      {!tasks && <div style={{ color: C.t3, fontSize: 11 }}>Loading…</div>}
      {tasks && tasks.length === 0 && (
        <div style={{ color: C.t3, fontSize: 11 }}>No tasks yet.</div>
      )}
      {tasks && tasks.length > 0 && (
        <div style={{ display: "grid", gap: 4 }}>
          {tasks.map((t) => (
            <div
              key={t.id}
              style={{
                display: "grid",
                gridTemplateColumns: "20px 1fr 100px 100px",
                gap: 8,
                alignItems: "center",
                padding: "4px 8px",
                fontSize: 11,
                color: t.status === "DONE" ? C.t4 : C.t1,
                textDecoration: t.status === "DONE" ? "line-through" : "none",
                borderBottom: `1px solid ${C.br}22`,
                fontFamily: F,
              }}
            >
              <button
                type="button"
                disabled={t.status === "DONE"}
                onClick={() => complete(t.id)}
                title={t.status === "DONE" ? "Done" : "Mark complete"}
                style={{
                  background: "transparent",
                  border: `1px solid ${t.status === "DONE" ? C.gn : C.br}`,
                  color: t.status === "DONE" ? C.gn : C.t3,
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  fontSize: 10,
                  cursor: t.status === "DONE" ? "default" : "pointer",
                }}
              >
                {t.status === "DONE" ? "✓" : ""}
              </button>
              <span>{t.title}</span>
              <span style={{ fontFamily: M, fontSize: 10, color: C.t4 }}>{t.source}</span>
              <span style={{ fontFamily: M, fontSize: 10, color: C.t4 }}>
                {t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

// ── Timeline panel ────────────────────────────────────────────────

const TimelinePanel: React.FC<{ matterId: string }> = ({ matterId }) => {
  const [entries, setEntries] = useState<TimelineEntryDTO[] | null>(null);
  useEffect(() => {
    fetch(`/api/matter/${matterId}/timeline`)
      .then((r) => r.json())
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [matterId]);
  return (
    <Card>
      <SH icon="🕒" title="Timeline" />
      {!entries && <div style={{ color: C.t3, fontSize: 11 }}>Loading…</div>}
      {entries && entries.length === 0 && (
        <div style={{ color: C.t3, fontSize: 11 }}>No timeline events yet.</div>
      )}
      {entries && entries.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {entries.map((ev) => (
            <div
              key={ev.id}
              style={{
                display: "grid",
                gridTemplateColumns: "150px 100px 1fr",
                gap: 8,
                fontSize: 11,
                color: C.t1,
                fontFamily: F,
                padding: "4px 0",
                borderBottom: `1px solid ${C.br}22`,
              }}
            >
              <div style={{ fontFamily: M, color: C.t3, fontSize: 10 }}>
                {new Date(ev.occurredAt).toISOString().replace("T", " ").slice(0, 16)}
              </div>
              <div style={{ fontFamily: M, color: C.tl, fontSize: 10 }}>{ev.type}</div>
              <div>{ev.summary}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

// ── Spend stub ────────────────────────────────────────────────────

const SpendPanel: React.FC<{ matterId: string }> = ({ matterId }) => {
  const [data, setData] = useState<{
    budgetAllocated: number;
    spentToDate: number;
    source: string;
  } | null>(null);
  useEffect(() => {
    fetch(`/api/matter/${matterId}/cost-basis`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ budgetAllocated: 0, spentToDate: 0, source: "stub" }));
  }, [matterId]);
  return (
    <Card>
      <SH icon="💰" title="Spend" sub={data?.source === "stub" ? "Stub data — Spend module wires in Step 6" : undefined} />
      {!data && <div style={{ color: C.t3, fontSize: 11 }}>Loading…</div>}
      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <div style={{ fontSize: 10, color: C.t3, fontFamily: F }}>Budget allocated</div>
            <div style={{ fontFamily: M, fontSize: 18, color: C.am }}>
              ${data.budgetAllocated.toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.t3, fontFamily: F }}>Spent to date</div>
            <div style={{ fontFamily: M, fontSize: 18, color: C.or }}>
              ${data.spentToDate.toLocaleString()}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

// ── Audit panel (matter-scoped) ───────────────────────────────────

interface MatterAuditEntry {
  chainPosition: string;
  timestamp: string;
  action: string;
  contentHash: string;
}

const AuditPanel: React.FC<{ matterId: string }> = ({ matterId }) => {
  const [entries, setEntries] = useState<MatterAuditEntry[] | null>(null);
  useEffect(() => {
    fetch(`/api/matter/${matterId}/audit`)
      .then((r) => r.json())
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [matterId]);
  return (
    <Card>
      <SH icon="🔐" title="Audit (matter-scoped)" sub="Cryptographically chained" />
      {!entries && <div style={{ color: C.t3, fontSize: 11 }}>Loading…</div>}
      {entries && entries.length === 0 && (
        <div style={{ color: C.t3, fontSize: 11 }}>No audit entries.</div>
      )}
      {entries && entries.length > 0 && (
        <div style={{ display: "grid", gap: 4 }}>
          {entries.map((e) => (
            <div
              key={e.chainPosition}
              style={{
                display: "grid",
                gridTemplateColumns: "60px 150px 1fr 200px",
                gap: 8,
                fontSize: 10.5,
                color: C.t1,
                fontFamily: M,
                padding: "3px 0",
                borderBottom: `1px solid ${C.br}22`,
              }}
            >
              <div style={{ color: C.t4 }}>#{e.chainPosition}</div>
              <div style={{ color: C.t3 }}>
                {new Date(e.timestamp).toISOString().replace("T", " ").slice(0, 16)}
              </div>
              <div style={{ color: C.tl }}>{e.action}</div>
              <div style={{ color: C.t4, fontSize: 9 }}>{e.contentHash.slice(0, 16)}…</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

// ── M365 placeholder ───────────────────────────────────────────────

const M365Panel: React.FC = () => (
  <Card>
    <SH icon="📁" title="Microsoft 365" sub="Coming in 4c" />
    <div style={{ color: C.t3, fontSize: 11.5, fontFamily: F, lineHeight: 1.4 }}>
      Auto-provisioned SharePoint site, Teams channel, and inbox-rule for this matter
      will appear here once 4c lands. The interface is wired today; the Graph API
      implementation is mocked behind it.
    </div>
  </Card>
);
