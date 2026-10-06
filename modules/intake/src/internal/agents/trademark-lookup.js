// Client-side helper: real trademark knock-out screening behind the
// Trademark Clearance agent. Calls GET /api/intake/trademark-check and
// degrades safely — any failure or empty mark returns status "unavailable"
// (NEVER "clear"), so the agent recommends a formal search rather than a
// false all-clear. Mirrors sanctions-lookup.js.
//
// The server agent worker injects a direct screen (screenTrademark) via
// setTrademarkResolver so a server-created ticket gets a real result
// without a relative fetch (browser-only). Null in the browser → the fetch
// path runs.
let _resolver = null;
export function setTrademarkResolver(fn) { _resolver = fn; }

export async function screenTrademarkMark(mark, classes) {
  const UNAVAILABLE = {
    status: "unavailable",
    conflicts: [],
    screened: 0,
    listAsOf: null,
    note: "Automated trademark screening is unavailable — a formal registry search is required.",
  };
  if (_resolver) {
    try { const d = await _resolver(mark, classes); return d && d.status ? d : UNAVAILABLE; }
    catch { return UNAVAILABLE; }
  }
  try {
    const qs = new URLSearchParams();
    if (mark) qs.set("mark", mark);
    if (Array.isArray(classes) && classes.length) qs.set("classes", classes.join(","));
    const resp = await fetch(`/api/intake/trademark-check?${qs.toString()}`);
    if (!resp.ok) return UNAVAILABLE;
    const data = await resp.json();
    if (!data || !data.status) return UNAVAILABLE;
    return data;
  } catch {
    return UNAVAILABLE;
  }
}
