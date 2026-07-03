/**
 * Browser error reporter (W4-5). Uncaught errors, unhandled promise
 * rejections, and PanelBoundary catches post to /api/client-errors as
 * structured server-side log events. Fire-and-forget, throttled to 10
 * reports per page load so an error loop can't self-DDoS.
 */

declare global {
  interface Window {
    __aegisReportError?: (err: unknown, source?: string) => void;
    __aegisErrorReporterInstalled?: boolean;
  }
}

const MAX_REPORTS_PER_LOAD = 10;

export function installClientErrorReporter(): void {
  if (typeof window === "undefined" || window.__aegisErrorReporterInstalled) return;
  window.__aegisErrorReporterInstalled = true;
  let sent = 0;

  const report = (err: unknown, source: string) => {
    if (sent >= MAX_REPORTS_PER_LOAD) return;
    sent += 1;
    const e = err instanceof Error ? err : new Error(String(err ?? "unknown"));
    try {
      void fetch("/api/client-errors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          message: e.message,
          stack: e.stack ?? null,
          source,
          url: window.location.pathname + window.location.search,
        }),
      });
    } catch {
      /* reporting must never throw */
    }
  };

  window.addEventListener("error", (ev) => report(ev.error ?? ev.message, "window.onerror"));
  window.addEventListener("unhandledrejection", (ev) => report(ev.reason, "unhandledrejection"));
  // PanelBoundary (W4-1) calls this when it contains a render crash.
  window.__aegisReportError = (err, source) => report(err, source ?? "panel-boundary");
}
