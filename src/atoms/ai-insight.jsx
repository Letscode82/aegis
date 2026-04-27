import { useState, useEffect, useRef, useCallback } from "react";
import { C, F, M, SR } from "../theme/tokens";
import { callClaude, callClaudeJSON, friendlyAIError } from "../ai/claude";

// Module-scoped session cache. Survives in-app navigation, not page reload.
// Keyed by the caller-supplied `cacheKey` string. Don't burn API tokens
// re-running the same analysis when the user clicks back into a panel.
const CACHE = new Map();

/**
 * Hook that drives an AI panel: fetches once, caches per session, exposes
 * a regenerate handler. Use it to power any "AI thinks about X" view.
 *
 * @template T
 * @param {object} opts
 * @param {string} opts.cacheKey       Unique key. Same key = shared cache entry across components.
 * @param {string} opts.prompt         User-message body sent to Claude.
 * @param {string} [opts.system]       Optional system prompt.
 * @param {"text"|"json"} [opts.parseAs="text"]
 *                                     "json" runs callClaudeJSON; "text" returns raw model text.
 * @param {number} [opts.maxTokens=600]
 * @param {boolean} [opts.autoLoad=true]
 *                                     If true, fetch on mount when cache misses.
 * @returns {{
 *   status: "idle"|"loading"|"success"|"error",
 *   data: T|null,
 *   ts: number|null,
 *   error: Error|null,
 *   run: () => void,
 *   regenerate: () => void
 * }}
 */
export function useAIInsight({ cacheKey, prompt, system, parseAs = "text", maxTokens = 600, autoLoad = true }) {
  const cached = CACHE.get(cacheKey);
  const [state, setState] = useState(() =>
    cached
      ? { status: "success", data: cached.data, ts: cached.ts, error: null }
      : { status: autoLoad ? "loading" : "idle", data: null, ts: null, error: null }
  );

  // Keep latest prompt/system in a ref so callers can pass freshly assembled
  // strings each render without re-triggering the fetch.
  const argsRef = useRef({ prompt, system, parseAs, maxTokens });
  argsRef.current = { prompt, system, parseAs, maxTokens };

  const run = useCallback(async () => {
    setState(s => ({ ...s, status: "loading", error: null }));
    try {
      const { prompt, system, parseAs, maxTokens } = argsRef.current;
      const data = parseAs === "json"
        ? await callClaudeJSON(prompt, { maxTokens, system })
        : await callClaude(prompt, { maxTokens, system });
      const ts = Date.now();
      CACHE.set(cacheKey, { data, ts });
      setState({ status: "success", data, ts, error: null });
    } catch (err) {
      console.error("[ai-insight]", cacheKey, err);
      setState({ status: "error", data: null, ts: null, error: err });
    }
  }, [cacheKey]);

  // Auto-load on mount if requested and we don't already have a cached value.
  useEffect(() => {
    if (autoLoad && !CACHE.has(cacheKey)) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return { ...state, run, regenerate: run };
}

/**
 * Generic AI insight card. Renders the loading / error / success states in
 * a consistent Aurora style (cyan accent + small AI badge), and lets the
 * caller decide how to render the success body via children-as-function or
 * a static node.
 *
 * @param {object} props
 * @param {string} [props.title="AI insight"]
 * @param {{status:string,data:any,ts:number|null,error:Error|null}} props.state  Output of useAIInsight.
 * @param {() => void} [props.onRegenerate]   Click handler for the regenerate button.
 * @param {React.ReactNode | ((data:any) => React.ReactNode)} props.children
 *        Either a node (static) or a function called with `state.data` on success.
 * @param {boolean} [props.compact=false]     Shrinks padding for inline use.
 */
export function AIInsight({ title = "AI insight", state, onRegenerate, children, compact = false }) {
  const { status, data, ts, error } = state;
  const pad = compact ? "10px 12px" : "14px 16px";

  return (
    <div style={{
      border: `1px solid ${C.cy}55`,
      background: `linear-gradient(180deg, ${C.cy}0a, transparent)`,
      borderRadius: 6,
      padding: pad,
      position: "relative",
      animation: "fu .35s ease both",
    }}>
      {/* Header — AI badge, title, regenerate */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: status === "loading" || status === "error" ? 4 : 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 8.5, fontFamily: M, letterSpacing: 1.5, color: C.cy,
            padding: "2px 6px", border: `1px solid ${C.cy}55`, borderRadius: 3,
            textTransform: "uppercase", fontWeight: 700,
          }}>◎ AI</span>
          <span style={{ fontSize: 10, fontFamily: M, letterSpacing: 1.5, color: C.t2, textTransform: "uppercase" }}>{title}</span>
        </div>
        {status === "success" && onRegenerate && (
          <button onClick={onRegenerate} style={{
            background: "transparent", border: `1px solid ${C.br}`, borderRadius: 3,
            padding: "3px 8px", fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1,
            textTransform: "uppercase", cursor: "pointer", transition: "all .12s",
          }}
            onMouseEnter={e => { e.currentTarget.style.color = C.cy; e.currentTarget.style.borderColor = C.cy; }}
            onMouseLeave={e => { e.currentTarget.style.color = C.t3; e.currentTarget.style.borderColor = C.br; }}
          >↻ Regenerate</button>
        )}
      </div>

      {/* Body */}
      {status === "loading" && <AIThinkingDots/>}
      {status === "error" && <AIErrorRow error={error} onRetry={onRegenerate}/>}
      {status === "success" && (
        <div>
          {typeof children === "function" ? children(data) : children}
          {ts && (
            <div style={{ fontSize: 9, fontFamily: M, color: C.t4, marginTop: 10, letterSpacing: .5 }}>
              Generated {new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AIThinkingDots() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", color: C.t3 }}>
      <span style={{ display: "inline-flex", gap: 3 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 5, height: 5, borderRadius: "50%", background: C.cy,
            display: "inline-block",
            animation: `typing 1.2s ${i * 0.18}s infinite ease-in-out`,
          }}/>
        ))}
      </span>
      <span style={{ fontSize: 11, fontFamily: M, letterSpacing: 1, color: C.cy, textTransform: "uppercase" }}>AI thinking…</span>
    </div>
  );
}

function AIErrorRow({ error, onRetry }) {
  const msg = friendlyAIError(error);
  return (
    <div style={{ padding: "6px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.45, flex: 1 }}>{msg}</div>
      {onRetry && (
        <button onClick={onRetry} style={{
          background: "transparent", border: `1px solid ${C.am}55`, borderRadius: 3,
          padding: "3px 8px", fontSize: 9, fontFamily: M, color: C.am, letterSpacing: 1,
          textTransform: "uppercase", cursor: "pointer", flexShrink: 0,
        }}>↻ Retry</button>
      )}
    </div>
  );
}

/**
 * Clear an entry (or everything) from the session cache. Useful in tests
 * and from a "clear cache" debug action.
 * @param {string} [cacheKey] If omitted, clears the whole cache.
 */
export function clearAIInsightCache(cacheKey) {
  if (cacheKey) CACHE.delete(cacheKey);
  else CACHE.clear();
}
