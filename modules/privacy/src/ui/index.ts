/**
 * @aegis/privacy/ui — the DSAR surfaces mounted by apps/web.
 *   DsarView          — internal command center (list + dashboard + workspace).
 *   DsarPortalStatus  — public login-less status/delivery tracker.
 *   DsarPortalIntake  — public self-service request form.
 */
export { DsarView } from "./dsar-view.jsx";
export { PrivacyShell } from "./privacy-shell.jsx";
export { AssessmentsView } from "./assessments-view.jsx";
export { RopaView } from "./ropa-view.jsx";
export { IncidentsView } from "./incidents-view.jsx";
export { ConsentView } from "./consent-view.jsx";
export { RetentionView, TransfersView, AiSystemsView } from "./records-views.jsx";
export { DpasView, ObligationsView } from "./crosslink-views.jsx";
export { DsarPortalStatus, DsarPortalIntake } from "./dsar-portal.jsx";
export { DsarReviewWorkspace } from "./DsarReviewWorkspace";
