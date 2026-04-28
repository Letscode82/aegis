-- CreateEnum
CREATE TYPE "CounterpartyType" AS ENUM ('COMPANY', 'INDIVIDUAL', 'LAW_FIRM', 'REGULATOR', 'OTHER');

-- CreateEnum
CREATE TYPE "PersonType" AS ENUM ('EMPLOYEE', 'EXTERNAL_COUNSEL', 'CUSTODIAN', 'DATA_SUBJECT', 'COUNTERPARTY_CONTACT');

-- CreateEnum
CREATE TYPE "DocumentOwnerType" AS ENUM ('MATTER', 'CONTRACT', 'DSAR', 'COMPLIANCE', 'BOARD', 'INTAKE');

-- CreateEnum
CREATE TYPE "ObligationSourceType" AS ENUM ('CONTRACT', 'REGULATION', 'POLICY', 'PRIVACY_LAW');

-- CreateEnum
CREATE TYPE "ObligationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'MET', 'BREACHED', 'WAIVED');

-- CreateEnum
CREATE TYPE "MatterType" AS ENUM ('TRANSACTIONAL', 'LITIGATION', 'REGULATORY_INVESTIGATION', 'ADVISORY', 'IP', 'EMPLOYMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "MatterStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MatterPartyRole" AS ENUM ('LEAD_ATTORNEY', 'ATTORNEY', 'PARALEGAL', 'CLIENT_CONTACT', 'CUSTODIAN', 'EXPERT_WITNESS', 'OPPOSING_COUNSEL', 'OTHER');

-- CreateEnum
CREATE TYPE "LegalHoldStatus" AS ENUM ('DRAFT', 'ISSUED', 'RELEASED');

-- CreateEnum
CREATE TYPE "PreservationDataSource" AS ENUM ('EMAIL', 'FILES', 'CHAT', 'ERP', 'OTHER');

-- CreateEnum
CREATE TYPE "IntakeSource" AS ENUM ('FORM', 'COPILOT', 'EMAIL', 'SLACK', 'API');

-- CreateEnum
CREATE TYPE "IntakeStatus" AS ENUM ('AWAITING_TRIAGE', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'ESCALATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AgentRecommendationStatus" AS ENUM ('PENDING', 'APPROVED', 'EDITED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ConversationRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "VendorType" AS ENUM ('LAW_FIRM', 'COURT_REPORTER', 'EXPERT_WITNESS', 'ALSP', 'OTHER');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PAID');

-- CreateEnum
CREATE TYPE "InvoiceLineStatus" AS ENUM ('PENDING', 'FLAGGED', 'ACCEPTED', 'REDUCED');

-- CreateEnum
CREATE TYPE "BudgetScope" AS ENUM ('MATTER', 'DEPARTMENT', 'ANNUAL');

-- CreateEnum
CREATE TYPE "DSARRequestType" AS ENUM ('ACCESS', 'CORRECTION', 'ERASURE', 'PORTABILITY', 'OBJECT', 'RESTRICT_PROCESSING');

-- CreateEnum
CREATE TYPE "DSARStatus" AS ENUM ('RECEIVED', 'VERIFYING', 'IN_PROGRESS', 'AWAITING_REVIEW', 'FULFILLED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "DSARVerificationStatus" AS ENUM ('UNVERIFIED', 'IN_PROGRESS', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "ConsentMechanism" AS ENUM ('EXPLICIT', 'LEGITIMATE_INTEREST', 'CONTRACT', 'LEGAL_OBLIGATION', 'VITAL_INTEREST', 'PUBLIC_TASK');

-- CreateEnum
CREATE TYPE "PrivacyIncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "PrivacyIncidentStatus" AS ENUM ('REPORTED', 'INVESTIGATING', 'CONTAINED', 'RESOLVED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'DEMO',
    "region" TEXT NOT NULL DEFAULT 'US',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'USER',
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counterparty" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CounterpartyType" NOT NULL,
    "country" TEXT,
    "parentId" TEXT,
    "sanctionsScreenedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Counterparty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "PersonType" NOT NULL,
    "userId" TEXT,
    "externalRef" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentDocumentId" TEXT,
    "ownerType" "DocumentOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "encryptedAt" TIMESTAMP(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Obligation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceType" "ObligationSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "recurrence" TEXT,
    "ownerId" TEXT,
    "status" "ObligationStatus" NOT NULL DEFAULT 'OPEN',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Obligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "actorId" TEXT,
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "indexedForSearch" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tagging" (
    "id" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "taggedType" TEXT NOT NULL,
    "taggedId" TEXT NOT NULL,

    CONSTRAINT "Tagging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Matter" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "MatterType" NOT NULL,
    "status" "MatterStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "leadAttorneyId" TEXT,
    "counterpartyId" TEXT,
    "parentMatterId" TEXT,
    "costCenterId" TEXT,
    "description" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Matter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatterParty" (
    "id" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" "MatterPartyRole" NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatterParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatterTimeline" (
    "id" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "MatterTimeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatterTag" (
    "id" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "MatterTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalHold" (
    "id" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" "LegalHoldStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "issuedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoldNotice" (
    "id" TEXT NOT NULL,
    "holdId" TEXT NOT NULL,
    "custodianId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "attestationCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HoldNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoldAttestation" (
    "id" TEXT NOT NULL,
    "holdId" TEXT NOT NULL,
    "custodianId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "attestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responseJson" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "HoldAttestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreservationOrder" (
    "id" TEXT NOT NULL,
    "holdId" TEXT NOT NULL,
    "dataSource" "PreservationDataSource" NOT NULL,
    "dataSourceRef" TEXT NOT NULL,
    "preservationTier" TEXT NOT NULL,
    "ITConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreservationOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeTicket" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "matterId" TEXT,
    "source" "IntakeSource" NOT NULL DEFAULT 'FORM',
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" "IntakeStatus" NOT NULL DEFAULT 'AWAITING_TRIAGE',
    "stage" TEXT NOT NULL DEFAULT 'new',
    "description" TEXT NOT NULL,
    "department" TEXT,
    "assignedTo" TEXT,
    "slaHours" INTEGER NOT NULL,
    "slaStatus" TEXT NOT NULL,
    "aiTriageJson" JSONB,
    "workflowJson" JSONB NOT NULL DEFAULT '[]',
    "triagedBy" TEXT,
    "triagedAt" TIMESTAMP(3),
    "triagedAction" TEXT,
    "agentProcessedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRecommendation" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "suggestedAction" TEXT NOT NULL,
    "draftedResponse" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "concerns" JSONB NOT NULL DEFAULT '[]',
    "citations" JSONB NOT NULL DEFAULT '[]',
    "shortFormReply" TEXT,
    "status" "AgentRecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeConversation" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "role" "ConversationRole" NOT NULL,
    "content" TEXT NOT NULL,
    "fieldsExtracted" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "VendorType" NOT NULL,
    "counterpartyId" TEXT,
    "ratesCard" JSONB NOT NULL DEFAULT '{}',
    "performanceScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'SUBMITTED',
    "ledesData" JSONB,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLineItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "timekeeperId" TEXT,
    "hours" DOUBLE PRECISION NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceLineStatus" NOT NULL DEFAULT 'PENDING',
    "flaggedReason" TEXT,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scope" "BudgetScope" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "allocatedAmount" DOUBLE PRECISION NOT NULL,
    "spentAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Timekeeper" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "defaultRate" DOUBLE PRECISION NOT NULL,
    "blendedRate" DOUBLE PRECISION,

    CONSTRAINT "Timekeeper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSubjectRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requesterPersonId" TEXT NOT NULL,
    "requestType" "DSARRequestType" NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "status" "DSARStatus" NOT NULL DEFAULT 'RECEIVED',
    "slaDeadline" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "verificationStatus" "DSARVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSubjectRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DSARDataLocation" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "found" BOOLEAN NOT NULL DEFAULT false,
    "redactionsRequired" BOOLEAN NOT NULL DEFAULT false,
    "retrievedAt" TIMESTAMP(3),

    CONSTRAINT "DSARDataLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dataSubjectPersonId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "mechanism" "ConsentMechanism" NOT NULL,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataProcessingActivity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lawfulBasis" TEXT NOT NULL,
    "dataTypes" JSONB NOT NULL DEFAULT '[]',
    "retentionPeriodDays" INTEGER NOT NULL,
    "dataSubjectCategories" JSONB NOT NULL DEFAULT '[]',
    "systems" JSONB NOT NULL DEFAULT '[]',
    "transferredCountries" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataProcessingActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyIncident" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "severity" "PrivacyIncidentSeverity" NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL,
    "reportedAt" TIMESTAMP(3),
    "affectedRecordsCount" INTEGER NOT NULL DEFAULT 0,
    "status" "PrivacyIncidentStatus" NOT NULL DEFAULT 'REPORTED',
    "regulatorNotified" BOOLEAN NOT NULL DEFAULT false,
    "mitigationSteps" JSONB NOT NULL DEFAULT '[]',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivacyIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Organization_name_idx" ON "Organization"("name");

-- CreateIndex
CREATE INDEX "Role_organizationId_idx" ON "Role"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organizationId_name_key" ON "Role"("organizationId", "name");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_organizationId_email_key" ON "User"("organizationId", "email");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_timestamp_idx" ON "AuditLog"("organizationId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_resourceType_resourceId_idx" ON "AuditLog"("organizationId", "resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_actorId_idx" ON "AuditLog"("organizationId", "actorId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_action_idx" ON "AuditLog"("organizationId", "action");

-- CreateIndex
CREATE INDEX "Notification_organizationId_recipientId_readAt_idx" ON "Notification"("organizationId", "recipientId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_organizationId_createdAt_idx" ON "Notification"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Counterparty_organizationId_name_idx" ON "Counterparty"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Counterparty_organizationId_type_idx" ON "Counterparty"("organizationId", "type");

-- CreateIndex
CREATE INDEX "Counterparty_parentId_idx" ON "Counterparty"("parentId");

-- CreateIndex
CREATE INDEX "Person_organizationId_email_idx" ON "Person"("organizationId", "email");

-- CreateIndex
CREATE INDEX "Person_organizationId_externalRef_idx" ON "Person"("organizationId", "externalRef");

-- CreateIndex
CREATE INDEX "Person_organizationId_type_idx" ON "Person"("organizationId", "type");

-- CreateIndex
CREATE INDEX "Person_userId_idx" ON "Person"("userId");

-- CreateIndex
CREATE INDEX "Document_organizationId_ownerType_ownerId_idx" ON "Document"("organizationId", "ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "Document_organizationId_uploadedAt_idx" ON "Document"("organizationId", "uploadedAt" DESC);

-- CreateIndex
CREATE INDEX "Document_parentDocumentId_idx" ON "Document"("parentDocumentId");

-- CreateIndex
CREATE INDEX "Obligation_organizationId_status_dueDate_idx" ON "Obligation"("organizationId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Obligation_organizationId_sourceType_sourceId_idx" ON "Obligation"("organizationId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "Obligation_organizationId_ownerId_idx" ON "Obligation"("organizationId", "ownerId");

-- CreateIndex
CREATE INDEX "Event_organizationId_occurredAt_idx" ON "Event"("organizationId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "Event_organizationId_sourceType_sourceId_idx" ON "Event"("organizationId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "Event_organizationId_type_idx" ON "Event"("organizationId", "type");

-- CreateIndex
CREATE INDEX "Event_organizationId_indexedForSearch_idx" ON "Event"("organizationId", "indexedForSearch");

-- CreateIndex
CREATE INDEX "Tag_organizationId_idx" ON "Tag"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_organizationId_category_name_key" ON "Tag"("organizationId", "category", "name");

-- CreateIndex
CREATE INDEX "Tagging_taggedType_taggedId_idx" ON "Tagging"("taggedType", "taggedId");

-- CreateIndex
CREATE UNIQUE INDEX "Tagging_tagId_taggedType_taggedId_key" ON "Tagging"("tagId", "taggedType", "taggedId");

-- CreateIndex
CREATE INDEX "Matter_organizationId_status_idx" ON "Matter"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Matter_organizationId_type_idx" ON "Matter"("organizationId", "type");

-- CreateIndex
CREATE INDEX "Matter_organizationId_openedAt_idx" ON "Matter"("organizationId", "openedAt" DESC);

-- CreateIndex
CREATE INDEX "Matter_counterpartyId_idx" ON "Matter"("counterpartyId");

-- CreateIndex
CREATE INDEX "Matter_parentMatterId_idx" ON "Matter"("parentMatterId");

-- CreateIndex
CREATE INDEX "Matter_leadAttorneyId_idx" ON "Matter"("leadAttorneyId");

-- CreateIndex
CREATE INDEX "MatterParty_matterId_idx" ON "MatterParty"("matterId");

-- CreateIndex
CREATE INDEX "MatterParty_personId_idx" ON "MatterParty"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "MatterParty_matterId_personId_role_key" ON "MatterParty"("matterId", "personId", "role");

-- CreateIndex
CREATE INDEX "MatterTimeline_matterId_idx" ON "MatterTimeline"("matterId");

-- CreateIndex
CREATE UNIQUE INDEX "MatterTimeline_matterId_eventId_key" ON "MatterTimeline"("matterId", "eventId");

-- CreateIndex
CREATE INDEX "MatterTag_matterId_idx" ON "MatterTag"("matterId");

-- CreateIndex
CREATE INDEX "MatterTag_tagId_idx" ON "MatterTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "MatterTag_matterId_tagId_key" ON "MatterTag"("matterId", "tagId");

-- CreateIndex
CREATE INDEX "LegalHold_organizationId_status_idx" ON "LegalHold"("organizationId", "status");

-- CreateIndex
CREATE INDEX "LegalHold_matterId_idx" ON "LegalHold"("matterId");

-- CreateIndex
CREATE INDEX "HoldNotice_holdId_idx" ON "HoldNotice"("holdId");

-- CreateIndex
CREATE INDEX "HoldNotice_custodianId_idx" ON "HoldNotice"("custodianId");

-- CreateIndex
CREATE UNIQUE INDEX "HoldNotice_holdId_custodianId_key" ON "HoldNotice"("holdId", "custodianId");

-- CreateIndex
CREATE INDEX "HoldAttestation_holdId_idx" ON "HoldAttestation"("holdId");

-- CreateIndex
CREATE INDEX "HoldAttestation_custodianId_idx" ON "HoldAttestation"("custodianId");

-- CreateIndex
CREATE INDEX "PreservationOrder_holdId_idx" ON "PreservationOrder"("holdId");

-- CreateIndex
CREATE INDEX "PreservationOrder_dataSource_idx" ON "PreservationOrder"("dataSource");

-- CreateIndex
CREATE INDEX "IntakeTicket_organizationId_status_idx" ON "IntakeTicket"("organizationId", "status");

-- CreateIndex
CREATE INDEX "IntakeTicket_organizationId_priority_idx" ON "IntakeTicket"("organizationId", "priority");

-- CreateIndex
CREATE INDEX "IntakeTicket_organizationId_submittedAt_idx" ON "IntakeTicket"("organizationId", "submittedAt" DESC);

-- CreateIndex
CREATE INDEX "IntakeTicket_requesterId_idx" ON "IntakeTicket"("requesterId");

-- CreateIndex
CREATE INDEX "IntakeTicket_matterId_idx" ON "IntakeTicket"("matterId");

-- CreateIndex
CREATE INDEX "AgentRecommendation_ticketId_createdAt_idx" ON "AgentRecommendation"("ticketId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AgentRecommendation_status_idx" ON "AgentRecommendation"("status");

-- CreateIndex
CREATE INDEX "AgentRecommendation_reviewedBy_idx" ON "AgentRecommendation"("reviewedBy");

-- CreateIndex
CREATE INDEX "IntakeConversation_ticketId_timestamp_idx" ON "IntakeConversation"("ticketId", "timestamp");

-- CreateIndex
CREATE INDEX "Vendor_organizationId_type_idx" ON "Vendor"("organizationId", "type");

-- CreateIndex
CREATE INDEX "Vendor_organizationId_name_idx" ON "Vendor"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Vendor_counterpartyId_idx" ON "Vendor"("counterpartyId");

-- CreateIndex
CREATE INDEX "Invoice_vendorId_idx" ON "Invoice"("vendorId");

-- CreateIndex
CREATE INDEX "Invoice_matterId_idx" ON "Invoice"("matterId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_submittedAt_idx" ON "Invoice"("submittedAt" DESC);

-- CreateIndex
CREATE INDEX "InvoiceLineItem_invoiceId_idx" ON "InvoiceLineItem"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_timekeeperId_idx" ON "InvoiceLineItem"("timekeeperId");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_status_idx" ON "InvoiceLineItem"("status");

-- CreateIndex
CREATE INDEX "Budget_organizationId_scope_idx" ON "Budget"("organizationId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_organizationId_scope_scopeId_period_key" ON "Budget"("organizationId", "scope", "scopeId", "period");

-- CreateIndex
CREATE INDEX "Timekeeper_vendorId_idx" ON "Timekeeper"("vendorId");

-- CreateIndex
CREATE INDEX "Timekeeper_personId_idx" ON "Timekeeper"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "Timekeeper_vendorId_personId_key" ON "Timekeeper"("vendorId", "personId");

-- CreateIndex
CREATE INDEX "DataSubjectRequest_organizationId_status_idx" ON "DataSubjectRequest"("organizationId", "status");

-- CreateIndex
CREATE INDEX "DataSubjectRequest_organizationId_slaDeadline_idx" ON "DataSubjectRequest"("organizationId", "slaDeadline");

-- CreateIndex
CREATE INDEX "DataSubjectRequest_requesterPersonId_idx" ON "DataSubjectRequest"("requesterPersonId");

-- CreateIndex
CREATE INDEX "DSARDataLocation_requestId_idx" ON "DSARDataLocation"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "DSARDataLocation_requestId_system_dataType_key" ON "DSARDataLocation"("requestId", "system", "dataType");

-- CreateIndex
CREATE INDEX "ConsentRecord_organizationId_dataSubjectPersonId_idx" ON "ConsentRecord"("organizationId", "dataSubjectPersonId");

-- CreateIndex
CREATE INDEX "ConsentRecord_organizationId_withdrawnAt_idx" ON "ConsentRecord"("organizationId", "withdrawnAt");

-- CreateIndex
CREATE INDEX "DataProcessingActivity_organizationId_idx" ON "DataProcessingActivity"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "DataProcessingActivity_organizationId_name_key" ON "DataProcessingActivity"("organizationId", "name");

-- CreateIndex
CREATE INDEX "PrivacyIncident_organizationId_status_idx" ON "PrivacyIncident"("organizationId", "status");

-- CreateIndex
CREATE INDEX "PrivacyIncident_organizationId_severity_idx" ON "PrivacyIncident"("organizationId", "severity");

-- CreateIndex
CREATE INDEX "PrivacyIncident_organizationId_discoveredAt_idx" ON "PrivacyIncident"("organizationId", "discoveredAt" DESC);

-- CreateIndex
CREATE INDEX "UserPreference_userId_idx" ON "UserPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key_key" ON "UserPreference"("userId", "key");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Counterparty" ADD CONSTRAINT "Counterparty_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Counterparty" ADD CONSTRAINT "Counterparty_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Counterparty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_parentDocumentId_fkey" FOREIGN KEY ("parentDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tagging" ADD CONSTRAINT "Tagging_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_parentMatterId_fkey" FOREIGN KEY ("parentMatterId") REFERENCES "Matter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatterParty" ADD CONSTRAINT "MatterParty_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatterParty" ADD CONSTRAINT "MatterParty_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatterTimeline" ADD CONSTRAINT "MatterTimeline_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatterTimeline" ADD CONSTRAINT "MatterTimeline_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatterTag" ADD CONSTRAINT "MatterTag_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatterTag" ADD CONSTRAINT "MatterTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldNotice" ADD CONSTRAINT "HoldNotice_holdId_fkey" FOREIGN KEY ("holdId") REFERENCES "LegalHold"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldNotice" ADD CONSTRAINT "HoldNotice_custodianId_fkey" FOREIGN KEY ("custodianId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldAttestation" ADD CONSTRAINT "HoldAttestation_holdId_fkey" FOREIGN KEY ("holdId") REFERENCES "LegalHold"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldAttestation" ADD CONSTRAINT "HoldAttestation_custodianId_fkey" FOREIGN KEY ("custodianId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreservationOrder" ADD CONSTRAINT "PreservationOrder_holdId_fkey" FOREIGN KEY ("holdId") REFERENCES "LegalHold"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeTicket" ADD CONSTRAINT "IntakeTicket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeTicket" ADD CONSTRAINT "IntakeTicket_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeTicket" ADD CONSTRAINT "IntakeTicket_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRecommendation" ADD CONSTRAINT "AgentRecommendation_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "IntakeTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeConversation" ADD CONSTRAINT "IntakeConversation_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "IntakeTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_timekeeperId_fkey" FOREIGN KEY ("timekeeperId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timekeeper" ADD CONSTRAINT "Timekeeper_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timekeeper" ADD CONSTRAINT "Timekeeper_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSubjectRequest" ADD CONSTRAINT "DataSubjectRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSubjectRequest" ADD CONSTRAINT "DataSubjectRequest_requesterPersonId_fkey" FOREIGN KEY ("requesterPersonId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DSARDataLocation" ADD CONSTRAINT "DSARDataLocation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DataSubjectRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_dataSubjectPersonId_fkey" FOREIGN KEY ("dataSubjectPersonId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataProcessingActivity" ADD CONSTRAINT "DataProcessingActivity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyIncident" ADD CONSTRAINT "PrivacyIncident_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
