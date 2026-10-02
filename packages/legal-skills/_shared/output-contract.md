# AEGIS Output Contract

Every skill returns human-readable Markdown in this order. When the caller sets `format: json`, return the same content as the JSON object below so AEGIS can render findings, push actions to Tasks, and update the Risk Graph.

## Markdown order

1. **Bottom line** — 1–3 sentences: the answer, overall rating, and the single most important action.
2. **Findings** — table or list, highest severity first.
3. **Actions** — who does what by when.
4. **Assumptions & gaps** — facts assumed, documents not seen, law flagged `[verify current]`.
5. **Sources** — documents (with pinpoints) and authorities relied on.

Skills may add sections (e.g. a redline, a draft letter, a chronology table) between Findings and Actions.

## JSON shape

```json
{
  "skill": "contracts/contract-review",
  "skill_version": "1.0.0",
  "matter_id": "MAT-2026-0142",
  "bottom_line": "Do not sign as drafted: uncapped data-breach indemnity (S1).",
  "overall": "S1",
  "findings": [
    {
      "id": "F1",
      "severity": "S1",
      "likelihood": null,
      "category": "liability",
      "title": "Uncapped indemnity for data breach",
      "location": "cl. 14.2",
      "evidence": "Supplier shall indemnify ... without limitation",
      "analysis": "Carve-out from the cap at cl. 15.1 makes our exposure unlimited.",
      "recommendation": "Cap at 2x annual fees or a fixed super-cap.",
      "proposed_text": "…",
      "authority": [],
      "confidence": "high"
    }
  ],
  "actions": [
    { "owner": "Commercial counsel", "action": "Send cl. 14–15 redline", "due": "2026-10-09", "blocking": true }
  ],
  "assumptions": ["We are the customer.", "Indian law governs."],
  "gaps": ["Schedule 3 (Security) not provided."],
  "sources": [
    { "type": "document", "ref": "MSA_v3.docx", "pinpoint": "cl. 14.2" },
    { "type": "authority", "ref": "Indian Contract Act 1872, s.73", "verified": false }
  ],
  "escalation": { "required": true, "to": "Head of Commercial", "reason": "S1 finding" },
  "review": { "risk_tier": "review-required", "status": "draft" }
}
```

## Field rules

- `severity`: `S1`–`S4` or `Info` (see `severity-scale.md`). `likelihood`: `likely` | `possible` | `remote` | `null`.
- `confidence`: `high` (clear text / settled law), `medium` (interpretation needed), `low` (missing facts or unsettled law).
- `evidence`: quote ≤25 words from the source, or `null` when the finding is an absence.
- `authority[].verified`: `true` only if checked against a current source in this run.
- `due`: ISO date when derivable; otherwise omit rather than guess.
