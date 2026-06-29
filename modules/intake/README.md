# @aegis/intake

The Legal Intake module — flagship of the v8 demo. Bulk-moved here in Step 1
without splitting `internal/` vs `api.ts`. Step 5 (PR #5) does that split.

## What lives here today

```
src/
├── intake/index.jsx       Cockpit, New Request, Kanban, SLA, Routing,
│                          Self-Serve, Inbox, Settings — the v8 IntakeView
├── copilot/               Conversational intake engine + similar-matters scorer
├── agents/                NDA, FAQ, vendor-intake, contract-review, trademark,
│                          policy-QA — registry + router + mocks
├── ai-features.jsx        Mission Control briefing, ticket summary, Ask Aurora
│                          chat, Matter risk badge, briefing context builder
├── ai-insight.jsx         AIInsight panel + useAIInsight hook
├── shell/ai-copilot.jsx   "Ask Aurora" floating side panel
├── intake-ui.jsx          Intake-specific atoms (Kbd, ConfidenceBadge, …)
├── intake-kb.js           Self-Service articles (derived from agents/kb.js)
├── email/                 P4a inbound-email ingest → IntakeTicket
├── hooks/                 useTicketStore, useAgentSettings, useCockpitState,
│                          useAgentLog, useKeyboardShortcuts
├── storage/               window.storage polyfill + tickets / conversations /
│                          agent-log / settings / cockpit
└── seed/                  v7.2 + v8 demo seed tickets (cockpit, bulk NDA)
```

## Dependencies
- `@aegis/ui` — Aurora design tokens + shared atoms.
- `@aegis/ai` — Claude client + regex classifier.

## Step 5 will
- Split this tree into `src/internal/**` (private) and `src/ui/**` (private)
  with a single `api.ts` exposing the public surface.
- Add the public functions enumerated in the foundation prompt
  (`getTicketById`, `listTicketsByMatter`, `findSimilarTickets`, …).
- Replace the `window.storage` polyfill calls with `@aegis/db`-backed
  Prisma queries.
- Switch all "create matter from ticket" paths to call `@aegis/matter/api`.

## Until Step 5
- Other modules **do not** import from `@aegis/intake`. There is no `api.ts`
  yet, and the ESLint module-isolation rule will block it.
- `apps/web` is the composition root and is allowed to consume the named
  exports from `src/index.js` directly.
