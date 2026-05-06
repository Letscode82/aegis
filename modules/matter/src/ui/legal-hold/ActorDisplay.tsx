/**
 * ActorDisplay — single source of truth for rendering an actor
 * (USER / SYSTEM / AGENT) across the timeline modal, custodian
 * acknowledgment metadata block, notice "issued by" line, and the
 * audit-log surface.
 *
 * Pair with `useActorResolver(matterId, holdId, inputs)` — the hook
 * batches lookups for everything visible in one POST and gives back
 * a `Map<key, ResolvedActorDTO>` that this component reads from.
 *
 * Variants:
 *   USER   → "Marcus Reid · Admin" with role chip on the right
 *   SYSTEM → "🤖 SYSTEM" gray-blue, no chip
 *   AGENT  → "🤖 AEGIS Agent" with model name chip when 4d wires it
 *
 * The underlying actorId is exposed via the `title` (hover) attribute
 * for forensic deep-dives, but never visible by default.
 */
import React, { useEffect, useMemo, useState } from "react";
import { C, F, M } from "@aegis/ui";

export interface ResolvedActorDTO {
  key: string;
  id: string | null;
  type: string;
  displayName: string;
  roleLabel: string | null;
  unknown: boolean;
}

export function actorKey(
  actorId: string | null | undefined,
  actorType: string,
): string {
  return `${actorType}:${actorId ?? ""}`;
}

export interface ActorDisplayProps {
  actorId: string | null;
  actorType: string;
  /** Map produced by `useActorResolver`. */
  lookup: Map<string, ResolvedActorDTO>;
  /** Compact: single-line, no chip — used in dense timeline rows. */
  compact?: boolean;
}

const SYSTEM_COLOR = C.tl;
const AGENT_COLOR = C.pp;

export const ActorDisplay: React.FC<ActorDisplayProps> = ({
  actorId,
  actorType,
  lookup,
  compact,
}) => {
  const k = actorKey(actorId, actorType);
  const r = lookup.get(k);

  if (!r) {
    // Fallback while the lookup is in flight — render the raw type
    // so the layout doesn't reflow when names land.
    return (
      <span
        title={actorId ?? "no actor"}
        style={{
          fontFamily: M,
          fontSize: compact ? 9 : 10,
          color: C.t4,
          letterSpacing: 0.3,
        }}
      >
        {actorType}…
      </span>
    );
  }

  if (r.type === "SYSTEM") {
    return (
      <span
        title={r.id ?? undefined}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontFamily: M,
          fontSize: compact ? 9.5 : 10.5,
          color: SYSTEM_COLOR,
          letterSpacing: 0.3,
        }}
      >
        🤖 <span>SYSTEM</span>
      </span>
    );
  }

  if (r.type === "AGENT") {
    return (
      <span
        title={r.id ?? undefined}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontFamily: F,
          fontSize: compact ? 10 : 11,
          color: AGENT_COLOR,
        }}
      >
        🤖 <span style={{ fontWeight: 600 }}>{r.displayName}</span>
        {r.roleLabel && !compact && (
          <Chip color={AGENT_COLOR} label={r.roleLabel} />
        )}
      </span>
    );
  }

  // USER (or unknown fallback)
  return (
    <span
      title={r.id ?? undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: F,
        fontSize: compact ? 10 : 11,
        color: r.unknown ? C.t4 : C.t1,
      }}
    >
      <span style={{ fontWeight: r.unknown ? 400 : 600 }}>
        {r.displayName}
      </span>
      {r.roleLabel && !compact && <Chip color={C.t3} label={r.roleLabel} />}
    </span>
  );
};

const Chip: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span
    style={{
      fontFamily: M,
      fontSize: 9,
      color,
      background: `${color}1f`,
      border: `1px solid ${color}55`,
      padding: "1px 6px",
      borderRadius: 8,
      letterSpacing: 0.3,
      textTransform: "uppercase",
    }}
  >
    {label}
  </span>
);

/**
 * Batch-resolves actors for a hold. The hook accepts a stable list
 * of `(actorId, actorType)` inputs (typically derived from a
 * timeline / audit-row response) and POSTs them once to
 * `/api/matter/[id]/holds/[holdId]/actors`. Re-fires when the input
 * set changes by content.
 */
export function useActorResolver(
  matterId: string,
  holdId: string,
  inputs: Array<{ actorId: string | null; actorType: string }>,
): Map<string, ResolvedActorDTO> {
  const [lookup, setLookup] = useState<Map<string, ResolvedActorDTO>>(
    () => new Map(),
  );

  // Stable signature so the effect doesn't fire every render when
  // the parent passes a new array reference with the same content.
  const sig = useMemo(
    () =>
      Array.from(
        new Set(inputs.map((i) => actorKey(i.actorId, i.actorType))),
      )
        .sort()
        .join("|"),
    [inputs],
  );

  useEffect(() => {
    if (!sig) return;
    let alive = true;
    fetch(`/api/matter/${matterId}/holds/${holdId}/actors`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        inputs: inputs.map((i) => ({
          actorId: i.actorId,
          actorType: i.actorType,
        })),
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { resolved?: ResolvedActorDTO[] } | null) => {
        if (!alive || !d?.resolved) return;
        setLookup(new Map(d.resolved.map((r) => [r.key, r])));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // `inputs` is intentionally not in the deps array — `sig` is its
    // content-derived signature and refires when content changes,
    // avoiding the new-array-every-render thrash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matterId, holdId, sig]);

  return lookup;
}
