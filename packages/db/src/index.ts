/**
 * @aegis/db — Prisma client + shared queries.
 *
 * Public surface for every module that needs data access. Modules MUST
 * NOT bypass this package (no `new PrismaClient()` elsewhere; no raw SQL).
 *
 * Exports:
 *   - prisma                 process-wide PrismaClient singleton
 *   - logAudit               write an AuditLog row (Differentiator #3)
 *   - getCurrentOrganization stub until Step 3 wires Auth0
 *   - getCurrentUser         stub until Step 3 wires Auth0
 *   - Prisma                 generated namespace (types, JSON helpers)
 *   - All generated model + enum types
 */

export { prisma } from "./client.js";
export { logAudit, type LogAuditInput, type AuditActorType } from "./audit.js";
export {
  getCurrentOrganization,
  getCurrentUser,
  type CurrentUser,
  type CurrentOrganization,
} from "./context.js";

// Re-export the generated Prisma namespace + enum types so callers don't
// have to depend on @prisma/client directly. Keeps the module-isolation
// rule clean: modules import @aegis/db, never @prisma/client.
export {
  Prisma,
  CounterpartyType,
  PersonType,
  DocumentOwnerType,
  ObligationSourceType,
  ObligationStatus,
  MatterType,
  MatterStatus,
  MatterPartyRole,
  LegalHoldStatus,
  PreservationDataSource,
  IntakeSource,
  IntakeStatus,
  AgentRecommendationStatus,
  ConversationRole,
  VendorType,
  InvoiceStatus,
  InvoiceLineStatus,
  BudgetScope,
  DSARRequestType,
  DSARStatus,
  DSARVerificationStatus,
  ConsentMechanism,
  PrivacyIncidentSeverity,
  PrivacyIncidentStatus,
} from "@prisma/client";

// Generated model types (Organization, User, Matter, IntakeTicket, etc.).
// Re-exported so consumers see them as the package's own types.
export type {
  Organization,
  User,
  Role,
  AuditLog,
  Notification,
  Counterparty,
  Person,
  Document,
  Obligation,
  Event,
  Tag,
  Tagging,
  Matter,
  MatterParty,
  MatterTimeline,
  MatterTag,
  LegalHold,
  HoldNotice,
  HoldAttestation,
  PreservationOrder,
  IntakeTicket,
  AgentRecommendation,
  IntakeConversation,
  Vendor,
  Invoice,
  InvoiceLineItem,
  Budget,
  Timekeeper,
  DataSubjectRequest,
  DSARDataLocation,
  ConsentRecord,
  DataProcessingActivity,
  PrivacyIncident,
  UserPreference,
} from "@prisma/client";
