// Shared ticket-description parsing.
//
// The New Request form appends the full extracted text of every
// uploaded document to `desc` (marker "--- Attached document: NAME
// ---") so the classifier and the agent can read it. But that full
// body must not leak into surfaces meant for the human-authored
// request: the Cockpit display, the triage router, and the
// similar-matters matcher all key on the LEAD, never the document
// body (whose incidental keywords cause misclassification and
// spurious "similar matter" overlap).

export function splitTicketDescription(desc) {
  const s = String(desc || "");
  const marker = /\n*--- Attached document: (.+?) ---\n/g;
  const matches = [...s.matchAll(marker)];
  if (matches.length === 0) return { lead: s.trim(), docs: [] };
  const lead = s.slice(0, matches[0].index).trim();
  const docs = matches.map((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : s.length;
    return { name: m[1], text: s.slice(start, end).trim() };
  });
  return { lead, docs };
}

// The human-authored request only — the classification/matching signal.
export function descriptionLead(desc) {
  return splitTicketDescription(desc).lead;
}
