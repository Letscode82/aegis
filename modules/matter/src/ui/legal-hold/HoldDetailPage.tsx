/**
 * HoldDetailPage — single-page workspace for one legal hold.
 *
 * Replaces the previous 6-tab layout. Three zones, top-to-bottom:
 *   1. HoldHeaderStrip      ID + status + jurisdictions + title +
 *                           scope + defensibility badge + primary
 *                           action (Issue / Release / etc.)
 *   2. HoldStatusRow        three structured-count lines reading
 *                           from the workspace-summary endpoint
 *   3. Body grid            CustodiansPanel (dominant left) plus
 *                           a right rail of three cards
 *                           (DefensibilityRailCard /
 *                           TimelineRailCard / NoticesRailCard).
 *
 * Below 1024px the rail collapses underneath the panel.
 *
 * No new mutation endpoints — Issue / Release reuse the existing
 * /api/matter/[id]/holds/[holdId]/{issue,release} routes and the
 * cards reuse /scorecard, /timeline, /notices, /summary.
 */
import React, { useEffect, useState } from "react";
import { Card, C, F, M } from "@aegis/ui";
import { HoldHeaderStrip } from "./HoldHeaderStrip";
import { HoldStatusRow } from "./HoldStatusRow";
import { CustodiansPanel } from "./CustodiansPanel";
import { DefensibilityRailCard } from "./DefensibilityRailCard";
import { TimelineRailCard } from "./TimelineRailCard";
import { TimelineFullStreamModal } from "./TimelineFullStreamModal";
import { NoticesRailCard } from "./NoticesRailCard";
import { NoticeViewerModal } from "./NoticeViewerModal";
import type {
  HoldDefensibilityScoreDTO,
  HoldEventDTO,
  HoldWorkspaceSummaryDTO,
} from "./types";

export interface HoldDetailPageProps {
  matterId: string;
  holdId: string;
  endpoint?: string;
  onBack?: () => void;
}

/**
 * Resolves the current user's permission strings via the auth
 * endpoint without taking a build-time dependency on @aegis/auth —
 * the permission strings (`matter:legal_hold:issue`, …) are a
 * stable interface that survives the auth SDK swap.
 */
function useHoldPermissions() {
  const [perms, setPerms] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/current-user", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { user?: { permissions?: string[] } } | null) => {
        if (!alive) return;
        setPerms(new Set(d?.user?.permissions ?? []));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return {
    canIssue: perms.has("matter:legal_hold:issue"),
    canRelease: perms.has("matter:legal_hold:release"),
  };
}

function useIsWide(minPx: number): boolean {
  const [wide, setWide] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia(`(min-width: ${minPx}px)`).matches;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(min-width: ${minPx}px)`);
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [minPx]);
  return wide;
}

export const HoldDetailPage: React.FC<HoldDetailPageProps> = ({
  matterId,
  holdId,
  endpoint = "/api/matter",
  onBack,
}) => {
  const baseUrl = `${endpoint}/${matterId}/holds/${holdId}`;
  const wide = useIsWide(1024);
  const { canIssue, canRelease } = useHoldPermissions();

  const [summary, setSummary] = useState<HoldWorkspaceSummaryDTO | null>(null);
  const [score, setScore] = useState<HoldDefensibilityScoreDTO | null>(null);
  const [events, setEvents] = useState<HoldEventDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [highlightEventId, setHighlightEventId] = useState<string | null>(null);
  const [noticeViewerOpen, setNoticeViewerOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`${baseUrl}/summary`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d: HoldWorkspaceSummaryDTO) => alive && setSummary(d))
      .catch((e) => alive && setError(String(e)));
    fetch(`${baseUrl}/scorecard`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((s: HoldDefensibilityScoreDTO) => alive && setScore(s))
      .catch(() => undefined);
    fetch(`${baseUrl}/timeline`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((rows: HoldEventDTO[]) => alive && setEvents(rows))
      .catch(() => alive && setEvents([]));
    return () => {
      alive = false;
    };
  }, [baseUrl, reloadKey]);

  function reload() {
    setReloadKey((k) => k + 1);
  }

  async function onIssue() {
    setBusy(true);
    try {
      const r = await fetch(`${baseUrl}/issue`, { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRelease() {
    const reason = window.prompt("Release reason:");
    if (!reason) return;
    setBusy(true);
    try {
      const r = await fetch(`${baseUrl}/release`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ releaseReason: reason }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (error && !summary) {
    return (
      <Card>
        <div style={{ color: C.rd, fontSize: 12, fontFamily: M }}>{error}</div>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card>
        <div style={{ color: C.t3, fontSize: 12, fontFamily: M }}>
          Loading hold workspace…
        </div>
      </Card>
    );
  }

  const railCards = (
    <>
      <DefensibilityRailCard
        matterId={matterId}
        holdId={holdId}
        score={score}
      />
      <TimelineRailCard
        events={events}
        onOpenStream={() => {
          setHighlightEventId(null);
          setTimelineOpen(true);
        }}
      />
      <NoticesRailCard
        matterId={matterId}
        holdId={holdId}
        canMutate={canIssue}
        onOpenViewer={() => setNoticeViewerOpen(true)}
      />
    </>
  );

  return (
    <div style={{ display: "grid", gap: 14, padding: 14 }}>
      {onBack && (
        <span
          onClick={onBack}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onBack();
            }
          }}
          style={{
            fontSize: 10,
            color: C.t3,
            fontFamily: M,
            cursor: "pointer",
            letterSpacing: 1,
            textTransform: "uppercase",
            justifySelf: "start",
          }}
        >
          ← Back to matter
        </span>
      )}

      <HoldHeaderStrip
        hold={summary.hold}
        defensibilityScore={score?.score ?? null}
        custodianCount={summary.counts.custodians}
        onIssue={onIssue}
        onRelease={onRelease}
        busy={busy}
        canIssue={canIssue}
        canRelease={canRelease}
      />

      <HoldStatusRow
        summary={summary}
        onOpenLastActivity={
          events && events.length > 0
            ? () => {
                // Timeline endpoint sorts newest-first, so the head
                // row IS the most-recent event — pre-highlight it.
                const head = events[0];
                if (head) setHighlightEventId(head.id);
                setTimelineOpen(true);
              }
            : undefined
        }
      />

      {noticeViewerOpen && (
        <NoticeViewerModal
          matterId={matterId}
          holdId={holdId}
          onClose={() => setNoticeViewerOpen(false)}
        />
      )}

      {timelineOpen && events && (
        <TimelineFullStreamModal
          matterId={matterId}
          holdId={holdId}
          events={events}
          highlightEventId={highlightEventId}
          onClose={() => setTimelineOpen(false)}
        />
      )}

      {error && (
        <Card>
          <div style={{ color: C.rd, fontSize: 11, fontFamily: M }}>{error}</div>
        </Card>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: wide ? "1fr 320px" : "1fr",
          gap: 14,
          alignItems: "start",
        }}
      >
        <CustodiansPanel
          matterId={matterId}
          holdId={holdId}
          canMutate={canIssue}
          canRelease={canRelease}
          onChange={reload}
          onSendReminders={() => {
            // 4c.2 surfaces the affordance; the actual escalation
            // run is wired through the existing pg-boss reminder
            // worker (see internal/legal-hold/services/escalation.ts)
            // and the bulk-reminder HTTP route lands with that worker.
          }}
        />
        <div style={{ display: "grid", gap: 14 }}>{railCards}</div>
      </div>

      <div
        style={{
          fontSize: 9.5,
          color: C.t4,
          fontFamily: F,
          textAlign: "center",
          paddingTop: 4,
          letterSpacing: 0.4,
        }}
      >
        Twin-recorded with the chain-sealed AuditLog · v
        {summary.hold.id.slice(0, 8)}
      </div>
    </div>
  );
};
