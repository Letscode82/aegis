/**
 * Controlled DSAR demo dataset (DSAR-DEMO). Creates a *fresh* "Priya Kulkarni"
 * access request at intake (RECEIVED, unverified, no records yet) with the
 * relevance criteria pre-filled — so a demo runs the real steps live (verify →
 * collect → review → deliver) but on deterministic data. The 12 curated
 * records (6 clearly her personal data, 6 noise) are NOT pre-attached: they
 * surface when the reviewer clicks "Search & collect" on the Review tab, via
 * the demo branch in collection.ts, so the automated-collection step is shown
 * rather than faked. Idempotent: re-seeding resets the request to intake.
 * Exposed via an admin route (not the main db:seed) so it applies live.
 */
import { prisma, logAudit } from "@aegis/db";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

const PERSON_ID = "p-ds-priya-demo";
const REQUEST_ID = "dsar-demo-priya";
/** Subject email that triggers the curated demo collection (see collection.ts). */
export const DEMO_SUBJECT_EMAIL = "priya.kulkarni@aegis-demo.example";

export const DEMO_CRITERIA =
  "Records that contain or concern Priya Kulkarni's personal data — her HR / employment record, contact details, benefits and payroll, marketing preferences, and support interactions. Exclude automated group-membership notifications, system/backup logs, and company-wide announcements that do not contain her personal data.";

/** The curated collection returned when "Search & collect" runs for the demo
 *  subject. `sourceType` is a DataSubjectSourceType; first 6 are her personal
 *  data, last 6 are noise. */
export const DEMO_RECORDS: Array<{ sourceType: "MAILBOX" | "ONEDRIVE" | "TEAMS" | "SHAREPOINT"; sourceSystem: string; title: string; excerpt: string }> = [
  { sourceType: "MAILBOX", sourceSystem: "HRIS", title: "Employee record — Priya Kulkarni", excerpt: "Employment record for Priya Kulkarni: job title (VP Engineering), salary band, start date, manager, and emergency contact." },
  { sourceType: "MAILBOX", sourceSystem: "Exchange · priya.kulkarni", title: "Re: Your 2026 benefits enrollment", excerpt: "Priya, this confirms your health and dental benefits enrollment for 2026, including your dependent details." },
  { sourceType: "MAILBOX", sourceSystem: "Exchange · priya.kulkarni", title: "Marketing preferences updated", excerpt: "Priya Kulkarni opted in to the product newsletter and event invitations on 2026-01-15." },
  { sourceType: "MAILBOX", sourceSystem: "Salesforce CRM", title: "Contact record — Priya Kulkarni", excerpt: "Contact: Priya Kulkarni. Work phone, mobile, mailing address, and account activity history." },
  { sourceType: "ONEDRIVE", sourceSystem: "OneDrive · priya.kulkarni", title: "Performance_review_Priya_2025.docx", excerpt: "Annual performance review for Priya Kulkarni: ratings, manager comments, and compensation recommendation." },
  { sourceType: "MAILBOX", sourceSystem: "Zendesk", title: "Support ticket #4821 — account access", excerpt: "Priya Kulkarni reported a login issue. Ticket includes her email, device, IP address, and browser." },
  { sourceType: "MAILBOX", sourceSystem: "Exchange · priya.kulkarni", title: "You've joined the Legal Team Site group", excerpt: "Automated group welcome notification. No substantive personal data beyond the member's email address." },
  { sourceType: "MAILBOX", sourceSystem: "Exchange · priya.kulkarni", title: "You've joined the Contracts Repository group", excerpt: "Automated group welcome notification. No substantive personal data beyond the member's email address." },
  { sourceType: "SHAREPOINT", sourceSystem: "SharePoint", title: "Nightly backup manifest — cluster 7", excerpt: "System log: nightly backup completed, 4.2 TB across 118 databases. No personal data." },
  { sourceType: "TEAMS", sourceSystem: "Teams", title: "All-hands reminder", excerpt: "Company all-hands next Friday at 10:00. Calendar reminder sent to all staff." },
  { sourceType: "MAILBOX", sourceSystem: "Exchange · priya.kulkarni", title: "Office closure — public holiday", excerpt: "The office will be closed Monday for the public holiday. Sent to all employees." },
  { sourceType: "ONEDRIVE", sourceSystem: "OneDrive · priya.kulkarni", title: "Q3_product_roadmap.pptx", excerpt: "Product roadmap deck for Q3. Strategy and timelines; no personal data about any individual." },
];

export interface SeedDemoDsarResult {
  requestId: string;
  records: number;
}

export async function seedDemoDsar(organizationId: string, actor: Actor): Promise<SeedDemoDsarResult> {
  const person = await prisma.person.upsert({
    where: { id: PERSON_ID },
    update: { name: "Priya Kulkarni" },
    create: { id: PERSON_ID, organizationId, type: "DATA_SUBJECT", externalRef: "data-subject:priya-demo", name: "Priya Kulkarni", email: DEMO_SUBJECT_EMAIL, metadata: { jurisdiction: "EU", demo: true } as never },
  });

  const now = new Date();
  await prisma.dataSubjectRequest.upsert({
    where: { id: REQUEST_ID },
    update: {
      status: "RECEIVED", verificationStatus: "UNVERIFIED", verifiedAt: null, verificationMethod: null,
      assignedToUserId: actor.id, relevanceCriteria: DEMO_CRITERIA, completedAt: null, deliveredAt: null, deliveryChannel: null, response: undefined, extendedDeadline: null, holdConflictCount: 0, holdConflictOverrideReason: null,
    },
    create: {
      id: REQUEST_ID, organizationId, requesterPersonId: person.id, requestType: "ACCESS", jurisdiction: "EU", status: "RECEIVED",
      slaDeadline: new Date(now.getTime() + 30 * 86_400_000), verificationStatus: "UNVERIFIED",
      assignedToUserId: actor.id, relevanceCriteria: DEMO_CRITERIA, subjectSummary: "Controlled demo DSAR — Priya Kulkarni access request. Verify identity, then Search & collect on the Review tab to pull the curated record set.", source: "internal",
    },
  });

  // Reset to a clean intake state: no collected records, no data locations,
  // no tokens — the demo walks the real steps from the start.
  await prisma.$transaction([
    prisma.dSARReviewItem.deleteMany({ where: { requestId: REQUEST_ID } }),
    prisma.dSARDataLocation.deleteMany({ where: { requestId: REQUEST_ID } }),
    prisma.dSARAccessToken.deleteMany({ where: { requestId: REQUEST_ID } }),
  ]);

  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "privacy.dsar.demo_seeded", resourceType: "DataSubjectRequest", resourceId: REQUEST_ID,
    afterJson: { records: DEMO_RECORDS.length } as never, metadata: { source: "privacy", demo: true } as never,
  }).catch(() => {});

  return { requestId: REQUEST_ID, records: DEMO_RECORDS.length };
}
