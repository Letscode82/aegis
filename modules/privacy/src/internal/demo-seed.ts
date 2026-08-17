/**
 * Controlled DSAR demo dataset (DSAR-DEMO). Creates a "Priya Kulkarni" access
 * request pre-loaded with ~12 realistic records — 6 that clearly contain her
 * personal data and 6 that are noise (group notifications, backups, all-hands)
 * — so a demo can run the exact same steps every time: Run AI review → validate
 * → Accept all → deliver, with sensible recall/precision, without depending on
 * live tenant collection. Idempotent: re-seeding resets the request + records.
 * Exposed via an admin route (not the main db:seed) so it applies to a live
 * environment.
 */
import { prisma, logAudit } from "@aegis/db";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

const PERSON_ID = "p-ds-priya-demo";
const REQUEST_ID = "dsar-demo-priya";

const CRITERIA =
  "Records that contain or concern Priya Kulkarni's personal data — her HR / employment record, contact details, benefits and payroll, marketing preferences, and support interactions. Exclude automated group-membership notifications, system/backup logs, and company-wide announcements that do not contain her personal data.";

// title | sourceSystem | excerpt ; the first 6 are her personal data, last 6 noise.
const RECORDS: Array<{ system: string; type: string; title: string; excerpt: string }> = [
  { system: "HRIS", type: "MAILBOX", title: "Employee record — Priya Kulkarni", excerpt: "Employment record for Priya Kulkarni: job title (VP Engineering), salary band, start date, manager, and emergency contact." },
  { system: "Exchange · priya.kulkarni", type: "MAILBOX", title: "Re: Your 2026 benefits enrollment", excerpt: "Priya, this confirms your health and dental benefits enrollment for 2026, including your dependent details." },
  { system: "Exchange · priya.kulkarni", type: "MAILBOX", title: "Marketing preferences updated", excerpt: "Priya Kulkarni opted in to the product newsletter and event invitations on 2026-01-15." },
  { system: "Salesforce CRM", type: "MAILBOX", title: "Contact record — Priya Kulkarni", excerpt: "Contact: Priya Kulkarni. Work phone, mobile, mailing address, and account activity history." },
  { system: "OneDrive · priya.kulkarni", type: "ONEDRIVE", title: "Performance_review_Priya_2025.docx", excerpt: "Annual performance review for Priya Kulkarni: ratings, manager comments, and compensation recommendation." },
  { system: "Zendesk", type: "MAILBOX", title: "Support ticket #4821 — account access", excerpt: "Priya Kulkarni reported a login issue. Ticket includes her email, device, IP address, and browser." },
  { system: "Exchange · priya.kulkarni", type: "MAILBOX", title: "You've joined the Legal Team Site group", excerpt: "Automated group welcome notification. No substantive personal data beyond the member's email address." },
  { system: "Exchange · priya.kulkarni", type: "MAILBOX", title: "You've joined the Contracts Repository group", excerpt: "Automated group welcome notification. No substantive personal data beyond the member's email address." },
  { system: "SharePoint", type: "SHAREPOINT", title: "Nightly backup manifest — cluster 7", excerpt: "System log: nightly backup completed, 4.2 TB across 118 databases. No personal data." },
  { system: "Teams", type: "TEAMS", title: "All-hands reminder", excerpt: "Company all-hands next Friday at 10:00. Calendar reminder sent to all staff." },
  { system: "Exchange · priya.kulkarni", type: "MAILBOX", title: "Office closure — public holiday", excerpt: "The office will be closed Monday for the public holiday. Sent to all employees." },
  { system: "OneDrive · priya.kulkarni", type: "ONEDRIVE", title: "Q3_product_roadmap.pptx", excerpt: "Product roadmap deck for Q3. Strategy and timelines; no personal data about any individual." },
];

const LOCATIONS = [
  { system: "Exchange Online", dataType: "email" },
  { system: "HRIS", dataType: "employment" },
  { system: "Salesforce CRM", dataType: "contact-info" },
];

export interface SeedDemoDsarResult {
  requestId: string;
  records: number;
}

export async function seedDemoDsar(organizationId: string, actor: Actor): Promise<SeedDemoDsarResult> {
  const person = await prisma.person.upsert({
    where: { id: PERSON_ID },
    update: { name: "Priya Kulkarni" },
    create: { id: PERSON_ID, organizationId, type: "DATA_SUBJECT", externalRef: "data-subject:priya-demo", name: "Priya Kulkarni", email: "priya.kulkarni@aegis-demo.example", metadata: { jurisdiction: "EU", demo: true } as never },
  });

  const now = new Date();
  await prisma.dataSubjectRequest.upsert({
    where: { id: REQUEST_ID },
    update: {
      status: "IN_PROGRESS", verificationStatus: "VERIFIED", verifiedAt: now, verificationMethod: "employee-verified",
      assignedToUserId: actor.id, relevanceCriteria: CRITERIA, completedAt: null, deliveredAt: null, deliveryChannel: null, response: undefined, holdConflictCount: 0, holdConflictOverrideReason: null,
    },
    create: {
      id: REQUEST_ID, organizationId, requesterPersonId: person.id, requestType: "ACCESS", jurisdiction: "EU", status: "IN_PROGRESS",
      slaDeadline: new Date(now.getTime() + 29 * 86_400_000), verificationStatus: "VERIFIED", verifiedAt: now, verificationMethod: "employee-verified",
      assignedToUserId: actor.id, relevanceCriteria: CRITERIA, subjectSummary: "Controlled demo DSAR — Priya Kulkarni access request with a mixed record set for the AI relevance review.", source: "internal",
    },
  });

  // Reset the record set so the demo starts clean (all PENDING, no AI verdict).
  await prisma.dSARReviewItem.deleteMany({ where: { requestId: REQUEST_ID } });
  await prisma.dSARReviewItem.createMany({
    data: RECORDS.map((r) => ({ organizationId, requestId: REQUEST_ID, sourceSystem: r.system, title: r.title, excerpt: r.excerpt })),
  });

  for (const l of LOCATIONS) {
    await prisma.dSARDataLocation.upsert({
      where: { requestId_system_dataType: { requestId: REQUEST_ID, system: l.system, dataType: l.dataType } },
      update: {}, create: { requestId: REQUEST_ID, system: l.system, dataType: l.dataType, found: true, redactionsRequired: false },
    });
  }

  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "privacy.dsar.demo_seeded", resourceType: "DataSubjectRequest", resourceId: REQUEST_ID,
    afterJson: { records: RECORDS.length } as never, metadata: { source: "privacy", demo: true } as never,
  }).catch(() => {});

  return { requestId: REQUEST_ID, records: RECORDS.length };
}
