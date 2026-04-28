# @aegis/ui

The Aurora design system. Shared visual primitives used by every module.

## What lives here
- **Theme tokens** (`theme/tokens.js`) — palette `C`, font-families `F` / `M` / `SR`.
- **Global CSS** (`theme/global-css.js`) — keyframes (`p`, `bi`, `fu`, `typing`, `flash`) and base resets.
- **Atoms** (`atoms/ui.jsx`) — `Pill`, `Dot`, `Stat`, `Bar`, `Card`, `SH`, `Row`, `WorkflowSteps`, `ApprovalBadge`, plus the `rc` / `pc` helpers for risk and priority colors.
- **Form atoms** (`atoms/form.jsx`) — `inputStyle`, `FormField`.

## Public API
```js
import { Card, Pill, Dot, C, F, M, CSS } from "@aegis/ui";
```

Always import from the package root (`@aegis/ui`). Deep paths like
`@aegis/ui/src/atoms/ui` are not part of the public surface and may break at
any time.
