# AEGIS — Legal Mission Control

Fortune 50 General Counsel platform demo. A single-pane-of-glass cockpit that
unifies intake, matters, contracts, regulatory, spend, governance, and a
Claude-powered intake copilot across 18 modules, built on Vite + React 18.

This is an **interactive demo / product prototype**, not a production system.
Data is seeded in-memory, agents are mocked, and there is no authentication.
See [Known limitations](#known-limitations) below.

---

## Run locally

```bash
npm install
npm run dev     # dev server → http://localhost:5173
npm run build   # production bundle → dist/
npm run preview # preview the production bundle
```

Requires Node 18+ (Vite 5). No environment variables required to run the demo;
the storage layer falls back to `localStorage`, and the Claude integration
short-circuits to mocked responses when no API key is configured.

---

## File structure

```
aegis/
├── index.html                  Vite entry (loads src/main.jsx)
├── vite.config.js              Vite + @vitejs/plugin-react config
├── package.json
├── reference/
│   └── aegis-v7-aurora.jsx     Original v7.2 + v8 monolith (preserved verbatim)
└── src/
    ├── main.jsx                Boot: installs storage polyfill, mounts <App/>
    ├── App.jsx                 Top-level shell: sidebar nav, routing, copilot mount
    ├── theme/                  Design tokens (palette, fonts) + global CSS
    ├── atoms/                  Shared UI primitives (Pill, Dot, Card, form inputs)
    ├── data/                   Static data blocks (cases, contracts, regs, brain, ocm, …)
    ├── storage/                localStorage polyfill + tickets / conversations / agent-log / settings / cockpit
    ├── seed/                   v7.2 + v8 demo seed tickets (cockpit, bulk NDA)
    ├── ai/                     Claude API client + regex-based intake classifier
    ├── agents/                 6 triage agents (NDA, FAQ, vendor-intake, contract-review, trademark, policy-QA) + registry + router
    ├── copilot/                Conversational intake engine + similar-matters scorer
    ├── hooks/                  useTicketStore, useAgentSettings, useCockpitState, useAgentLog, useKeyboardShortcuts
    ├── intake/                 Bundled Legal Intake UI (Cockpit, New Request, Kanban, SLA, Routing, Self-Serve, Inbox)
    ├── views/                  v7.2 module views (v72.jsx) + v8 module views (v8.jsx)
    └── shell/                  AICopilot floating side panel ("Ask Aurora")
```

---

## Modules

Grouped as they appear in the sidebar.

### Executive
| Module | Description |
|---|---|
| **Mission Control** | Firm-wide health dashboard: risk score, open matters, active workstreams, SLA heat. |
| **Today** | Daily brief — priority tasks, flagged approvals, tickers, briefing cards. |
| **Alerts** | Critical + advisory alert feed (regulatory, litigation, cyber, financial). |
| **Approvals** | Pending approvals queue (contracts, spend, policy exceptions, waivers). |

### Operations
| Module | Description |
|---|---|
| **Legal Intake** | Flagship v8 module. Cockpit triage, Copilot-driven New Request intake, Kanban board, SLA timers, routing, self-serve KB, bulk-action inbox, agent settings. |
| **Matter Management** | Portfolio of active matters with filters (type, stage, risk, outside counsel, spend). |
| **Contracts** | CLM pipeline — drafting, redlines, executed, renewals, obligations. |
| **Regulatory** | Horizon-scan of open regulatory proceedings and comment windows. |
| **Outside Counsel** | Firm roster, rate cards, matter allocation, performance heatmap. |
| **Legal Spend** | Budget vs actuals by matter, firm, and category; invoice review queue. |
| **Governance** | Board book, entity structure, delegations, policies, committee cadence. |
| **Cyber Response** | Incident timeline, forensics, regulator notification tracker, playbook runner. |

### Intelligence
| Module | Description |
|---|---|
| **Risk Graph** | Enterprise risk network — node/edge view of entity, matter, and regulatory risk flows. |
| **Scenarios** | What-if simulator for litigation, regulatory, M&A, and crisis scenarios. |
| **Company Brain** | Natural-language query over the firm's cumulative legal knowledge. |
| **Board Pack** | Auto-assembled board report — quarterly metrics, narratives, attachments. |

### Platform
| Module | Description |
|---|---|
| **Workflow Builder** | Visual builder for intake triage, approval, and review workflows. |
| **Architecture** | System diagram — integrations, data flow, agent topology, storage layers. |

---

## Reference monolith

`reference/aegis-v7-aurora.jsx` is the original 5,241-line single-file demo
(v7.2 "Aurora" + v8 "Legal Intake" merged). It is preserved verbatim as the
source of truth for behavior — every module in `src/` was extracted from it
with `const → export const` and explicit imports, nothing more. When in
doubt about a module's intended behavior, consult this file.

---

## Known limitations

This is a demo. In particular:

- **`window.storage` polyfill.** The app calls `window.storage.{get,set,delete}`
  as if it were a first-class browser API. In this demo those calls are shimmed
  to `localStorage` by `src/storage/polyfill.js`, installed before any other
  module runs. All state (tickets, conversations, agent logs, cockpit position)
  is per-browser and survives reloads but not browser-data clears.
- **Mocked agents.** The 6 triage agents (NDA, FAQ, vendor-intake, contract-review,
  trademark, policy-QA) call `callClaudeJSON` against the Anthropic API when a
  key is present. Without a key they fall back to heuristic classification plus
  deterministic mocked responses (`src/agents/mocks.js`) — useful for UI
  walkthroughs, not for real triage.
- **No authentication.** Every user sees the same seeded cockpit as
  "You (Alex Nguyen)". There is no login, no session, no RBAC. All data is
  client-side.
- **Seeded data only.** Matters, contracts, regulators, cyber incidents, brain
  queries, etc. are hand-crafted demo data in `src/data/`. Nothing persists
  beyond the browser.
- **No backend.** API calls to the Claude endpoint go direct from the browser;
  CORS and key handling are out of scope for this demo.
