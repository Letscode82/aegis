# ONE Legal — Word add-in (PR E)

Brings the **Review** and **Negotiate** verbs into Microsoft Word, where
counsel already redline paper. The add-in is a thin Office.js task pane over
services that already exist — it persists nothing, so the human accepting a
tracked change in Word remains the governance gate (the same posture as
`redlineClause`). The authoritative, chain-sealed review runs against a
persisted `Contract` in the app (PR C).

## Surface

| Piece | Path | Notes |
|---|---|---|
| Task pane | `/addin` (Next page) | Loads `office.js`, reads the selection (or whole body), renders graded findings. |
| Document grade | `POST /api/addin/review` | `{ text, contractType?, perspective? }` → extract clauses + grade vs the resolved playbook. Stateless. `contracts:read_all`. |
| Clause redline | `POST /api/addin/redline` | `{ original, instruction, clauseType? }` → rewrite on our standard + track-changes segments. Degrades to a no-op without Claude. `contracts:read_all`. |
| Health probe | `GET /api/addin/health` | Unauthenticated connectivity check (mirrors `_health`). |
| Manifest | `public/addin/manifest.xml` | Office add-in manifest (task-pane type). |

Auth is the user's own session cookie: the task pane is served from the same
origin as `/api/addin/*`, so the Review/Redline calls authenticate exactly like
the in-app surfaces. No new token system.

## Install (sideload)

1. Deploy the app. Replace every `https://ONELEGAL_BASE_URL` in
   `public/addin/manifest.xml` with the deployment's HTTPS origin
   (e.g. `https://app.onelegal.example`). Office requires absolute HTTPS URLs.
2. Add the two icons `public/addin/icon-32.png` and `icon-80.png` (any brand
   mark; the manifest references them).
3. In Word: **Home → Add-ins → More Add-ins → My Add-ins → Upload My Add-in**,
   pick the edited `manifest.xml`.
4. Click **ONE Legal → Review** on the Home ribbon to open the pane.

## Flow

1. Select the clause(s) to check (or select nothing to grade the whole
   document).
2. **Review selection against playbook** → the pane lists each off-playbook or
   missing clause with our-position language.
3. **Insert as tracked change** drops our language at the selection with
   track-changes on, so it lands in Word's Review pane for accept/reject.

Grading works in any Office host (and in a browser for a quick check); the
tracked-change insertion requires Microsoft Word.
