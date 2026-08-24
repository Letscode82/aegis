/**
 * @aegis/ui — Aurora design system
 *
 * Public surface for shared UI primitives across the AEGIS monorepo.
 * Modules and apps consume from here. Do not deep-import internal files.
 */

// Theme tokens
export { C, F, M, SR, applyThemeTokens, THEMES, DARK_PALETTE, LIGHT_PALETTE } from "./theme/tokens.js";
export { CSS } from "./theme/global-css.js";

// Runtime theme toggle (Blue dark ↔ Facebook Lite).
export { ThemeProvider, useTheme } from "./Theme";

// Atoms — display
export {
  Pill,
  Dot,
  Stat,
  Bar,
  Card,
  SH,
  Row,
  WorkflowSteps,
  ApprovalBadge,
  rc,
  pc,
  pressable,
} from "./atoms/ui.jsx";

// Atoms — forms
export { inputStyle, FormField } from "./atoms/form.jsx";

// Toast / snackbar (sub-PR 4c.4)
export { ToastProvider, useToast } from "./Toast";

// Sparkline (sub-PR 4c.5) — reusable trend visualisation.
export { Sparkline } from "./Sparkline";

// Stepper — crisp horizontal step indicator for guided multi-step flows.
export { Stepper } from "./Stepper";

// PanelBoundary (W4-1) — contained error boundary for one panel.
export { PanelBoundary } from "./PanelBoundary";

// useIsNarrow (W4-3) — responsive breakpoint hook.
export { useIsNarrow } from "./useIsNarrow";
