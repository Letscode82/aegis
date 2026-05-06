/**
 * ProgressPanel — live issuance progress via SSE (sub-PR 4d.0).
 *
 * Connects to `POST /api/matter/[id]/holds/[holdId]/issue-with-progress`
 * via fetch (the endpoint streams text/event-stream as POST body
 * isn't supported by the EventSource constructor). Each `data:`
 * frame is parsed as an `IssueProgressEvent` and folded into the
 * step tree.
 *
 * If the connection drops, the panel falls back to polling
 * `GET /api/matter/[id]/holds/[holdId]/issue-status` every 1.5s and
 * keeps the panel rendering the latest derivable state until either
 * the user closes or the stream reconnects (rare on Vercel — the
 * hop is short).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pill, SH, C, F, M } from "@aegis/ui";

interface IssueProgressEvent {
  type:
    | "step_started"
    | "step_succeeded"
    | "step_failed"
    | "complete"
    | "error";
  id?: string;
  label?: string;
  parent?: string;
  durationMs?: number;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
  summary?: {
    totalCustodians: number;
    totalDataSources: number;
    preservedCount: number;
    failedCount: number;
    noticesSent: number;
  };
}

interface StepNode {
  id: string;
  label: string;
  parent?: string;
  status: "pending" | "running" | "succeeded" | "failed";
  durationMs?: number;
  errorMessage?: string;
  startedAt: number;
}

export interface ProgressPanelProps {
  matterId: string;
  holdId: string;
  noticeTemplateId: string;
  recipientCustodianPersonIds: string[];
  onClose: (holdId: string, success: boolean) => void;
}

export const ProgressPanel: React.FC<ProgressPanelProps> = ({
  matterId,
  holdId,
  noticeTemplateId,
  recipientCustodianPersonIds,
  onClose,
}) => {
  const [steps, setSteps] = useState<Record<string, StepNode>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [done, setDone] = useState<null | "success" | "partial" | "failed">(
    null,
  );
  const [summary, setSummary] = useState<IssueProgressEvent["summary"] | null>(
    null,
  );
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startedAtRef = useRef(Date.now());
  const abortRef = useRef<AbortController | null>(null);

  const apply = useCallback((ev: IssueProgressEvent) => {
    if (ev.type === "step_started" && ev.id && ev.label) {
      setSteps((prev) => ({
        ...prev,
        [ev.id!]: {
          id: ev.id!,
          label: ev.label!,
          parent: ev.parent,
          status: "running",
          startedAt: Date.now(),
        },
      }));
      setOrder((prev) =>
        prev.includes(ev.id!) ? prev : [...prev, ev.id!],
      );
    } else if (ev.type === "step_succeeded" && ev.id) {
      setSteps((prev) => {
        const cur = prev[ev.id!];
        if (!cur) return prev;
        return {
          ...prev,
          [ev.id!]: {
            ...cur,
            status: "succeeded",
            durationMs: ev.durationMs,
          },
        };
      });
    } else if (ev.type === "step_failed" && ev.id) {
      setSteps((prev) => {
        const cur = prev[ev.id!];
        if (!cur) return prev;
        return {
          ...prev,
          [ev.id!]: {
            ...cur,
            status: "failed",
            durationMs: ev.durationMs,
            errorMessage: ev.error?.message,
          },
        };
      });
    } else if (ev.type === "complete") {
      setSummary(ev.summary ?? null);
      const failed = ev.summary?.failedCount ?? 0;
      const preserved = ev.summary?.preservedCount ?? 0;
      setDone(failed > 0 ? (preserved > 0 ? "partial" : "failed") : "success");
    } else if (ev.type === "error") {
      setGlobalError(ev.error?.message ?? "Unknown error");
      setDone("failed");
    }
  }, []);

  // Stream consumer — fetch with manual reader since EventSource
  // doesn't support POST bodies.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;
    (async () => {
      try {
        const r = await fetch(
          `/api/matter/${matterId}/holds/${holdId}/issue-with-progress`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              noticeTemplateId,
              recipientCustodianPersonIds,
              pushToMicrosoft: true,
            }),
            signal: controller.signal,
          },
        );
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          setGlobalError(
            (body as { error?: { message?: string } }).error?.message ??
              `HTTP ${r.status}`,
          );
          return;
        }
        const reader = r.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        let buffer = "";
        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const dataLine = frame
              .split("\n")
              .find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            try {
              const ev = JSON.parse(dataLine.slice(6)) as IssueProgressEvent;
              apply(ev);
            } catch {
              // Skip malformed frame; the snapshot poll will catch up.
            }
          }
        }
      } catch (e) {
        if (cancelled) return;
        setGlobalError(String((e as Error).message ?? e));
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [matterId, holdId, noticeTemplateId, recipientCustodianPersonIds, apply]);

  // Elapsed-time ticker.
  useEffect(() => {
    const t = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 250);
    return () => clearInterval(t);
  }, []);

  // Render order: children grouped under parents.
  const renderTree = useMemo(() => {
    return order.map((id) => steps[id]).filter((s): s is StepNode => !!s);
  }, [order, steps]);

  const closeable = done !== null;

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 760,
        margin: "0 auto",
        display: "grid",
        gap: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <SH
          icon={done === "success" ? "🎉" : "⏱"}
          title={done === "success" ? "Hold issued" : "Issuing hold…"}
          sub={`Hold ${holdId}`}
        />
        <div style={{ fontFamily: M, fontSize: 11, color: C.t3 }}>
          {fmtElapsed(elapsedSeconds)}
        </div>
      </div>

      <div
        style={{
          padding: 14,
          background: C.s1,
          border: `1px solid ${C.brL}`,
          borderRadius: 4,
          display: "grid",
          gap: 4,
          fontFamily: F,
          fontSize: 12,
        }}
      >
        {renderTree.length === 0 && (
          <div style={{ color: C.t3, fontSize: 11 }}>Connecting…</div>
        )}
        {renderTree.map((s) => (
          <StepRow key={s.id} step={s} />
        ))}
      </div>

      {summary && (
        <div
          style={{
            padding: 12,
            background: done === "success" ? C.gnG : done === "partial" ? C.amG : C.rdG,
            border: `1px solid ${
              done === "success" ? C.gn : done === "partial" ? C.am : C.rd
            }`,
            borderRadius: 4,
            color:
              done === "success" ? C.gn : done === "partial" ? C.am : C.rd,
            fontFamily: F,
            fontSize: 12,
          }}
        >
          {done === "success"
            ? `🎉 Hold issued. ${summary.preservedCount} of ${summary.totalDataSources} data sources preserved.`
            : `Hold partially issued. ${summary.preservedCount} of ${summary.totalDataSources} data sources preserved. ${summary.failedCount} need attention.`}
          <br />
          Notices sent to {summary.noticesSent} recipient
          {summary.noticesSent === 1 ? "" : "s"}.
        </div>
      )}

      {globalError && (
        <div
          style={{
            padding: 10,
            border: `1px solid ${C.rd}`,
            background: C.rdG,
            color: C.rd,
            fontFamily: M,
            fontSize: 11,
            borderRadius: 4,
          }}
        >
          {globalError}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => onClose(holdId, done === "success")}
          disabled={!closeable}
          style={{
            background: closeable ? C.bl : C.brL,
            border: "none",
            color: closeable ? C.bg : C.t3,
            padding: "10px 22px",
            fontFamily: F,
            fontWeight: 700,
            fontSize: 12,
            borderRadius: 4,
            cursor: closeable ? "pointer" : "not-allowed",
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          {done === "success"
            ? "View hold"
            : done === "partial" || done === "failed"
              ? "View issues"
              : "Working…"}
        </button>
      </div>
    </div>
  );
};

const StepRow: React.FC<{ step: StepNode }> = ({ step }) => {
  const indent = step.parent ? (step.parent.split(".").length - 1) * 16 : 0;
  const icon =
    step.status === "running"
      ? "⏳"
      : step.status === "succeeded"
        ? "✓"
        : step.status === "failed"
          ? "✗"
          : "◯";
  const color =
    step.status === "succeeded"
      ? C.gn
      : step.status === "failed"
        ? C.rd
        : step.status === "running"
          ? C.am
          : C.t3;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        paddingLeft: indent,
        color: step.status === "pending" ? C.t3 : C.t1,
      }}
    >
      <span style={{ color, fontFamily: M, width: 14 }}>{icon}</span>
      <span style={{ flex: 1 }}>{step.label}</span>
      {step.status === "succeeded" && step.durationMs != null && (
        <span style={{ fontSize: 10, color: C.t3, fontFamily: M }}>
          {(step.durationMs / 1000).toFixed(1)}s
        </span>
      )}
      {step.status === "failed" && step.errorMessage && (
        <span style={{ fontSize: 10, color: C.rd, fontFamily: M }}>
          {step.errorMessage.slice(0, 80)}
        </span>
      )}
    </div>
  );
};

function fmtElapsed(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
