import { C, F, M, SR } from "./theme/tokens.js";
import { useIsNarrow } from "./useIsNarrow.js";

/**
 * ReviewCockpit — the shared Relativity-style review shell.
 *
 * A three-pane workspace: a queue on the left, a document/record viewer in
 * the center, and a coding/decision panel on the right, under a slim top bar
 * (title · progress · back) and an optional keyboard legend footer. Every
 * track is bounded with `minmax(0, …)` so long content truncates instead of
 * blowing the layout out horizontally.
 *
 * It is purely presentational: the caller supplies the three panes as nodes
 * and wires navigation with `useReviewKeyboard`. Any review surface (invoice
 * review, eDiscovery coding, intake triage, contract clauses) mounts the same
 * shell with its own item type, viewer and decision actions — one interface,
 * many review types.
 *
 * Below `stackAt` px the three panes stack vertically (queue → viewer →
 * coding) so it stays usable on a phone.
 */
export function ReviewCockpit({
  title,
  subtitle,
  badge,
  onBack,
  progress, // { done, total, label? }
  legend, // [{ keys:[".."], label:".." }]
  queue,
  viewer,
  coding,
  leftWidth = 320,
  rightWidth = 360,
  stackAt = 1024,
}) {
  const narrow = useIsNarrow(stackAt);
  const pct =
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  const paneBorder = `1px solid ${C.br}`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        background: C.bg,
        fontFamily: F,
        color: C.t1,
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "10px 16px",
          borderBottom: paneBorder,
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Close review"
            style={{
              background: "transparent",
              border: paneBorder,
              color: C.t2,
              fontFamily: M,
              fontSize: 10,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              padding: "5px 10px",
              borderRadius: 4,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            ← Esc
          </button>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily: SR,
              fontSize: 16,
              color: C.t1,
              lineHeight: 1.1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: 10.5,
                color: C.t3,
                fontFamily: M,
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
        {progress && progress.total > 0 && (
          <div style={{ flexShrink: 0, textAlign: "right", minWidth: 110 }}>
            <div
              style={{
                fontSize: 9,
                fontFamily: M,
                color: C.t3,
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              {progress.label || "Reviewed"} {progress.done}/{progress.total}
            </div>
            <div
              style={{
                height: 5,
                width: 110,
                background: C.s1,
                borderRadius: 3,
                overflow: "hidden",
                marginTop: 3,
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: C.gn,
                  transition: "width .25s",
                }}
              />
            </div>
          </div>
        )}
        {badge && <div style={{ flexShrink: 0 }}>{badge}</div>}
      </div>

      {/* Panes */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: narrow
            ? "minmax(0, 1fr)"
            : `${leftWidth}px minmax(0, 1fr) ${rightWidth}px`,
          gridAutoRows: narrow ? "auto" : undefined,
        }}
      >
        <section
          aria-label="Review queue"
          style={{
            borderRight: narrow ? "none" : paneBorder,
            borderBottom: narrow ? paneBorder : "none",
            overflowY: "auto",
            minWidth: 0,
            maxHeight: narrow ? 320 : "none",
          }}
        >
          {queue}
        </section>
        <section
          aria-label="Record viewer"
          style={{ overflowY: "auto", minWidth: 0 }}
        >
          {viewer}
        </section>
        <section
          aria-label="Decision panel"
          style={{
            borderLeft: narrow ? "none" : paneBorder,
            borderTop: narrow ? paneBorder : "none",
            overflowY: "auto",
            minWidth: 0,
          }}
        >
          {coding}
        </section>
      </div>

      {/* Keyboard legend */}
      {legend && legend.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            padding: "6px 16px",
            borderTop: paneBorder,
            flexShrink: 0,
            fontFamily: M,
            fontSize: 9.5,
            color: C.t4,
            letterSpacing: 0.3,
          }}
        >
          {legend.map((b, i) => (
            <span key={i} style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
              <kbd
                style={{
                  background: C.s1,
                  border: `1px solid ${C.br}`,
                  borderRadius: 3,
                  padding: "1px 5px",
                  color: C.t2,
                  fontSize: 9,
                }}
              >
                {b.keys[0]}
              </kbd>
              {b.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
