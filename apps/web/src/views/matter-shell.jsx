/**
 * Matter Management + Audit Log views — Aurora shell wrappers.
 *
 * The matter UI primitives ship in `@aegis/matter/ui` (dashboard,
 * list, detail, create form, audit log). This file wires them into
 * the same Aurora layout the rest of the app uses (eyebrow + serif
 * title + sub-tabs), so navigating from Mission Control to Matter
 * Management to Audit Log feels like one app.
 *
 * Sub-navigation inside the matter section is state-driven, not
 * URL-driven — that matches v72/v8's pattern where each side-nav
 * item is one composite view. Deep links from outside (e.g. the
 * standalone /matter/[id] route) hand off via the URL query string;
 * AppShell reads it on mount to seed the initial sub-state.
 */
import { useState, useEffect } from "react";
import { C, F, M, SR } from "@aegis/ui";
import {
  MatterDashboard,
  MatterListView,
  MatterDetailView,
  MatterCreateForm,
  AuditLogView,
} from "@aegis/matter/ui";

const Eyebrow = ({ kicker, title, em, sub }) => (
  <div style={{ marginBottom: 16 }}>
    <div
      style={{
        fontSize: 10,
        fontFamily: M,
        letterSpacing: 2,
        color: C.em,
        textTransform: "uppercase",
        marginBottom: 4,
      }}
    >
      {kicker}
    </div>
    <div
      style={{
        fontSize: 24,
        fontFamily: SR,
        color: C.t1,
        fontWeight: 400,
        lineHeight: 1.2,
      }}
    >
      {title}{" "}
      <em style={{ color: C.em, fontStyle: "italic" }}>{em}</em>
    </div>
    <div style={{ fontSize: 11, color: C.t3, marginTop: 4, fontFamily: M }}>
      {sub}
    </div>
  </div>
);

const SubTab = ({ active, onClick, children }) => (
  <div
    onClick={onClick}
    style={{
      padding: "8px 14px",
      borderBottom: active ? `2px solid ${C.em}` : "2px solid transparent",
      color: active ? C.em : C.t3,
      fontFamily: M,
      fontSize: 10,
      letterSpacing: 1.5,
      textTransform: "uppercase",
      cursor: "pointer",
      fontWeight: active ? 700 : 500,
      transition: "color .12s",
    }}
  >
    {children}
  </div>
);

// Reads (and continuously syncs) `matterId`, `matterAction`, `intakeTicketId`
// from the URL so deep links land in the right sub-view. The AppShell
// already drove `view=matters` to mount us; we own the rest.
function useMatterDeepLink() {
  const [matterId, setMatterId] = useState(null);
  const [sub, setSub] = useState("dashboard");
  const [intakeTicketId, setIntakeTicketId] = useState(undefined);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const m = p.get("matterId");
    const action = p.get("matterAction");
    const t = p.get("intakeTicketId") ?? undefined;
    if (m) {
      setMatterId(m);
      setSub("detail");
    } else if (action === "list") {
      setSub("list");
    } else if (action === "new") {
      setSub("new");
      if (t) setIntakeTicketId(t);
    } else {
      setSub("dashboard");
    }
  }, []);

  return {
    matterId,
    setMatterId,
    sub,
    setSub,
    intakeTicketId,
    setIntakeTicketId,
  };
}

export function MatterManagementShell() {
  const { matterId, setMatterId, sub, setSub, intakeTicketId } =
    useMatterDeepLink();

  const tabs = [
    { key: "dashboard", label: "Dashboard" },
    { key: "list", label: "All matters" },
    { key: "new", label: "New matter" },
  ];

  return (
    <div style={{ fontFamily: F, color: C.t1 }}>
      <Eyebrow
        kicker="ENTERPRISE · MATTER · MANAGEMENT"
        title="Unified spine for"
        em="litigation, transactions, IP, employment, regulatory, investigations, M&A, and advisory"
        sub="One brain across legal operations · cryptographically chained audit · closeout-gated lifecycle"
      />

      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 14,
          borderBottom: `1px solid ${C.br}55`,
        }}
      >
        {tabs.map((t) => (
          <SubTab
            key={t.key}
            active={sub === t.key}
            onClick={() => {
              setSub(t.key);
              if (t.key !== "detail") setMatterId(null);
            }}
          >
            {t.label}
          </SubTab>
        ))}
        {sub === "detail" && matterId && (
          <SubTab active onClick={() => {}}>
            ◆ Matter detail
          </SubTab>
        )}
      </div>

      {/* The matter UI primitives wrap themselves in their own padding;
          we negate the AppShell's outer padding here so the visual
          rhythm matches the v72/v8 views around them. */}
      <div style={{ margin: "0 -18px -18px" }}>
        {sub === "dashboard" && <MatterDashboard />}
        {sub === "list" && (
          <MatterListView
            onSelect={(id) => {
              setMatterId(id);
              setSub("detail");
            }}
            onCreate={() => setSub("new")}
          />
        )}
        {sub === "new" && (
          <div style={{ padding: 14 }}>
            <MatterCreateForm
              intakeTicketId={intakeTicketId}
              onCreated={(id) => {
                setMatterId(id);
                setSub("detail");
              }}
              onCancel={() => setSub("list")}
            />
          </div>
        )}
        {sub === "detail" && matterId && (
          <MatterDetailView matterId={matterId} />
        )}
        {sub === "detail" && !matterId && (
          <div
            style={{
              padding: 30,
              color: C.t3,
              fontFamily: M,
              fontSize: 11,
            }}
          >
            No matter selected. Pick one from the list tab.
          </div>
        )}
      </div>
    </div>
  );
}

export function AuditLogShell() {
  return (
    <div style={{ fontFamily: F, color: C.t1 }}>
      <Eyebrow
        kicker="INTELLIGENCE · CRYPTOGRAPHIC · LEDGER"
        title="Tamper-evident"
        em="append-only audit chain"
        sub="Per-org SHA-256 chain · Postgres triggers enforce immutability · court-ready PDF export"
      />
      <div style={{ margin: "0 -18px -18px" }}>
        <AuditLogView />
      </div>
    </div>
  );
}
