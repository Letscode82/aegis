/**
 * JobsAdmin — manual triggers for Legal Hold maintenance jobs
 * (sub-PR 4c.1, Item 6). Defensibility-snapshot and snapshot-cleanup
 * are pg-boss-ready services; until the worker runtime ships, admins
 * can run them on demand here. External schedulers (Vercel Cron,
 * GitHub Actions) hit the same /api/admin/jobs/... endpoints.
 *
 * Permission: admin:manage_users (matches the existing endpoint gate).
 */
import React, { useCallback, useEffect, useState } from "react";
import { Card, SH, C, F, M, useToast } from "@aegis/ui";

interface JobMeta {
  defensibilitySnapshotLastRun: string | null;
  snapshotCleanupLastRun: string | null;
  m365DeviceCodeLastSession: string | null;
}

type JobKind = "snapshot" | "cleanup" | "m365-device-code";

export const JobsAdmin: React.FC = () => {
  const toast = useToast();
  const [meta, setMeta] = useState<JobMeta | null>(null);
  const [running, setRunning] = useState<null | JobKind>(null);

  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/legal-hold/jobs/meta");
      if (r.ok) setMeta((await r.json()) as JobMeta);
    } catch {
      // Non-fatal — meta is informational only.
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function runJob(kind: JobKind) {
    setRunning(kind);
    const endpoint =
      kind === "snapshot"
        ? "/api/admin/jobs/defensibility-snapshot"
        : kind === "cleanup"
          ? "/api/admin/jobs/defensibility-cleanup"
          : "/api/admin/jobs/m365-device-code-cleanup";
    try {
      const r = await fetch(endpoint, { method: "POST" });
      const body = (await r.json().catch(() => ({}))) as {
        written?: number;
        skipped?: number;
        attempted?: number;
        deletedCount?: number;
        error?: string;
      };
      if (!r.ok) {
        toast.error(`Job failed: ${body.error ?? `HTTP ${r.status}`}`);
        return;
      }
      if (kind === "snapshot") {
        toast.success(
          `Snapshot job ran — ${body.written ?? 0} written, ${body.skipped ?? 0} skipped (${body.attempted ?? 0} active holds)`,
        );
      } else if (kind === "cleanup") {
        toast.success(
          `Cleanup job ran — ${body.deletedCount ?? 0} snapshot(s) thinned`,
        );
      } else {
        toast.success(
          `Device Code cleanup ran — ${body.deletedCount ?? 0} expired session(s) pruned`,
        );
      }
      await reload();
    } catch (e) {
      toast.error(`Job failed: ${String(e)}`);
    } finally {
      setRunning(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14, padding: 14, fontFamily: F, color: C.t1 }}>
      <Card>
        <SH
          icon="⚙"
          title="Legal Hold maintenance jobs"
          sub="Manual triggers for the pg-boss-ready services. External schedulers hit the same endpoints."
        />

        <JobRow
          title="Defensibility Snapshots"
          description="Computes one snapshot per active hold. Runs daily automatically once a worker runtime is configured; you can also trigger manually."
          lastRun={meta?.defensibilitySnapshotLastRun ?? null}
          running={running === "snapshot"}
          onRun={() => runJob("snapshot")}
          ctaLabel="Run snapshot now"
        />

        <JobRow
          title="Snapshot Cleanup"
          description="Thins snapshots older than 90 days to one per ISO week."
          lastRun={meta?.snapshotCleanupLastRun ?? null}
          running={running === "cleanup"}
          onRun={() => runJob("cleanup")}
          ctaLabel="Run cleanup now"
        />

        <JobRow
          title="M365 Device Code Session Cleanup"
          description="Deletes expired/completed Device Code OAuth sessions older than 24 hours from the M365DeviceCodeSession table. Rows are tiny so this is opportunistic cleanup."
          lastRun={meta?.m365DeviceCodeLastSession ?? null}
          running={running === "m365-device-code"}
          onRun={() => runJob("m365-device-code")}
          ctaLabel="Run cleanup now"
        />
      </Card>
    </div>
  );
};

const JobRow: React.FC<{
  title: string;
  description: string;
  lastRun: string | null;
  running: boolean;
  ctaLabel: string;
  onRun: () => void;
}> = ({ title, description, lastRun, running, ctaLabel, onRun }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: 16,
      alignItems: "center",
      padding: "14px 0",
      borderBottom: `1px solid ${C.brL}`,
    }}
  >
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, color: C.t1, marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontSize: 11, color: C.t3, lineHeight: 1.5 }}>{description}</div>
      <div style={{ marginTop: 6, fontSize: 11, fontFamily: M, color: C.t3 }}>
        Last run:{" "}
        <span style={{ color: C.t1 }}>
          {lastRun ? new Date(lastRun).toISOString().replace("T", " ").slice(0, 16) : "Never"}
        </span>
      </div>
    </div>
    <button
      type="button"
      onClick={onRun}
      disabled={running}
      style={{
        background: C.bl,
        border: "none",
        color: C.bg,
        padding: "8px 16px",
        borderRadius: 4,
        fontFamily: F,
        fontWeight: 700,
        fontSize: 11,
        cursor: running ? "wait" : "pointer",
        opacity: running ? 0.6 : 1,
        letterSpacing: 0.5,
        textTransform: "uppercase",
      }}
    >
      {running ? "Running…" : ctaLabel}
    </button>
  </div>
);
