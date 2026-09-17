/**
 * Privacy assessments engine (module #10 — PIA / DPIA / TIA / LIA / AI /
 * vendor). Server-only, chain-sealed.
 *
 * A code-shipped template per assessment type drives a yes/no risk
 * questionnaire; answers score to a risk band deterministically (pure,
 * unit-testable). The lifecycle is DRAFT → IN_REVIEW → APPROVED / REJECTED,
 * every transition audited; final sign-off is the human gate
 * (privacy:dpia:approve, enforced at the route). A PIA screen flags when a
 * full DPIA is required. Optionally links to the RoPA activity it covers.
 */
import { prisma, logAudit, PrivacyAssessmentStatus } from "@aegis/db";

export type AssessmentType = "PIA" | "DPIA" | "TIA" | "LIA" | "AI" | "VENDOR";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "SEVERE";

export interface TemplateQuestion {
  id: string;
  question: string;
  /** Points added to the risk score when answered "yes". 0 = informational. */
  weight: number;
}
export interface AssessmentTemplate {
  type: AssessmentType;
  title: string;
  description: string;
  questions: TemplateQuestion[];
}

const Q = (id: string, question: string, weight: number): TemplateQuestion => ({ id, question, weight });

/** Code-shipped assessment templates. */
export const ASSESSMENT_TEMPLATES: Record<AssessmentType, AssessmentTemplate> = {
  PIA: {
    type: "PIA", title: "Privacy Impact Assessment (screening)",
    description: "Lightweight screen to decide whether a full DPIA is required.",
    questions: [
      Q("large_scale", "Does the processing involve personal data at large scale?", 3),
      Q("special_category", "Does it involve special-category or criminal-offence data?", 4),
      Q("systematic_monitoring", "Does it involve systematic monitoring of individuals?", 3),
      Q("automated_decisions", "Are decisions made about people with legal/significant effect?", 4),
      Q("vulnerable", "Are children or other vulnerable people affected?", 3),
      Q("new_technology", "Does it use novel technology (AI, biometrics, tracking)?", 2),
    ],
  },
  DPIA: {
    type: "DPIA", title: "Data Protection Impact Assessment (GDPR Art. 35)",
    description: "Full assessment of high-risk processing and its safeguards.",
    questions: [
      Q("large_scale", "Large-scale processing of personal data?", 3),
      Q("special_category", "Special-category / criminal-offence data?", 4),
      Q("systematic_monitoring", "Systematic monitoring of a public area or individuals?", 3),
      Q("automated_decisions", "Automated decision-making with legal / significant effect?", 4),
      Q("vulnerable", "Vulnerable data subjects (children, employees, patients)?", 3),
      Q("data_matching", "Matching or combining datasets from different sources?", 2),
      Q("new_technology", "Innovative use of new technology?", 2),
      Q("prevents_rights", "Could the processing prevent people exercising a right or using a service?", 3),
      Q("cross_border", "Does it involve transfers outside the EEA/UK?", 2),
    ],
  },
  TIA: {
    type: "TIA", title: "Transfer Impact Assessment",
    description: "Assesses a cross-border transfer and its safeguards.",
    questions: [
      Q("no_adequacy", "Is the destination country WITHOUT an adequacy decision?", 3),
      Q("govt_access", "Is there a risk of disproportionate government access?", 4),
      Q("no_scc", "Are appropriate safeguards (SCCs/BCRs) NOT yet in place?", 4),
      Q("sensitive_data", "Does the transfer include sensitive personal data?", 3),
      Q("onward_transfer", "Can the importer make onward transfers?", 2),
    ],
  },
  LIA: {
    type: "LIA", title: "Legitimate Interest Assessment",
    description: "Purpose, necessity, and balancing test for legitimate-interest processing.",
    questions: [
      Q("no_clear_purpose", "Is the legitimate interest unclear or not documented?", 3),
      Q("not_necessary", "Could the purpose be achieved a less intrusive way?", 3),
      Q("overrides_rights", "Would a data subject be surprised or object to this use?", 4),
      Q("children", "Does it rely on data about children?", 3),
      Q("no_optout", "Is there no easy way for people to opt out?", 2),
    ],
  },
  AI: {
    type: "AI", title: "AI / Automated-Decision Impact Assessment",
    description: "Risk and governance review of an AI or automated-decision system.",
    questions: [
      Q("legal_effect", "Does the AI make or materially influence decisions about people?", 4),
      Q("no_human_review", "Is there no meaningful human review of the output?", 4),
      Q("bias_risk", "Is there a risk of bias or discriminatory outcomes?", 3),
      Q("not_explainable", "Is the output hard to explain to an affected person?", 2),
      Q("training_provenance", "Is the training-data provenance / lawful basis unclear?", 3),
      Q("sensitive_inputs", "Does it process special-category data as input?", 3),
    ],
  },
  VENDOR: {
    type: "VENDOR", title: "Vendor / Processor Privacy Assessment",
    description: "Privacy-risk review of a third-party processor.",
    questions: [
      Q("no_dpa", "Is a Data Processing Agreement NOT yet signed?", 4),
      Q("subprocessors", "Does the vendor use sub-processors that aren't disclosed?", 3),
      Q("data_offshore", "Is data stored outside the required region?", 3),
      Q("no_certs", "Does the vendor lack recognised security certifications?", 2),
      Q("breach_history", "Has the vendor had a notable breach?", 3),
    ],
  },
};

export interface AssessmentAnswer { questionId: string; question: string; answer: string; weight: number; }
export interface AssessmentMitigation { text: string; owner?: string | null; done?: boolean; }

/** Deterministic risk scoring from yes/no answers. Pure — unit-tested. */
export function scoreAssessment(type: AssessmentType, answers: AssessmentAnswer[]): { riskScore: number; riskLevel: RiskLevel; dpiaRequired: boolean } {
  const tmpl = ASSESSMENT_TEMPLATES[type];
  const maxScore = tmpl.questions.reduce((s, q) => s + q.weight, 0) || 1;
  let score = 0;
  let hardTrigger = false;
  for (const a of answers) {
    if (String(a.answer).toLowerCase() === "yes") {
      score += a.weight;
      if (a.weight >= 4) hardTrigger = true;
    }
  }
  const pct = score / maxScore;
  let riskLevel: RiskLevel = pct >= 0.75 ? "SEVERE" : pct >= 0.5 ? "HIGH" : pct >= 0.25 ? "MEDIUM" : "LOW";
  if (hardTrigger && (riskLevel === "LOW" || riskLevel === "MEDIUM")) riskLevel = "HIGH";
  const dpiaRequired = type === "PIA" ? (riskLevel === "HIGH" || riskLevel === "SEVERE") : false;
  return { riskScore: score, riskLevel, dpiaRequired };
}

export interface AssessmentDTO {
  id: string;
  type: AssessmentType;
  title: string;
  status: string;
  subject: string | null;
  processingActivityId: string | null;
  answers: AssessmentAnswer[];
  mitigations: AssessmentMitigation[];
  riskLevel: RiskLevel | null;
  riskScore: number | null;
  dpiaRequired: boolean | null;
  assignedToUserId: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  createdAt: string;
  updatedAt: string;
  /** Template questions (for the questionnaire UI). */
  template: TemplateQuestion[];
}

interface AssessmentRow {
  id: string; type: AssessmentType | string; title: string; status: string; subject: string | null;
  processingActivityId: string | null; answersJson: unknown; mitigationsJson: unknown;
  riskLevel: string | null; riskScore: number | null; dpiaRequired: boolean | null;
  assignedToUserId: string | null; approvedById: string | null; approvedAt: Date | null;
  approvalNote: string | null; createdAt: Date; updatedAt: Date;
}

async function toDTO(r: AssessmentRow): Promise<AssessmentDTO> {
  const approvedByName = r.approvedById
    ? (await prisma.user.findUnique({ where: { id: r.approvedById }, select: { name: true } }).catch(() => null))?.name ?? null
    : null;
  const type = (ASSESSMENT_TEMPLATES[r.type as AssessmentType] ? r.type : "PIA") as AssessmentType;
  return {
    id: r.id, type, title: r.title, status: r.status, subject: r.subject,
    processingActivityId: r.processingActivityId,
    answers: Array.isArray(r.answersJson) ? (r.answersJson as AssessmentAnswer[]) : [],
    mitigations: Array.isArray(r.mitigationsJson) ? (r.mitigationsJson as AssessmentMitigation[]) : [],
    riskLevel: (r.riskLevel as RiskLevel | null), riskScore: r.riskScore, dpiaRequired: r.dpiaRequired,
    assignedToUserId: r.assignedToUserId, approvedByName, approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
    approvalNote: r.approvalNote, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
    template: ASSESSMENT_TEMPLATES[type].questions,
  };
}

export function getAssessmentTemplates(): AssessmentTemplate[] {
  return Object.values(ASSESSMENT_TEMPLATES);
}

export async function listAssessments(organizationId: string, filter: { type?: string; status?: string } = {}): Promise<AssessmentDTO[]> {
  const where: Record<string, unknown> = { organizationId };
  if (filter.type && ASSESSMENT_TEMPLATES[filter.type as AssessmentType]) where.type = filter.type;
  if (filter.status) where.status = filter.status;
  const rows = await prisma.privacyAssessment.findMany({ where, orderBy: [{ updatedAt: "desc" }] });
  return Promise.all(rows.map((r) => toDTO(r as AssessmentRow)));
}

export async function getAssessment(organizationId: string, id: string): Promise<AssessmentDTO | null> {
  const r = await prisma.privacyAssessment.findFirst({ where: { id, organizationId } });
  return r ? toDTO(r as AssessmentRow) : null;
}

export async function createAssessment(
  organizationId: string,
  input: { type: string; title?: string; subject?: string; processingActivityId?: string },
  actorId: string | null,
): Promise<AssessmentDTO> {
  const type = (ASSESSMENT_TEMPLATES[input.type as AssessmentType] ? input.type : null) as AssessmentType | null;
  if (!type) throw new Error(`Unknown assessment type: ${input.type}`);
  const tmpl = ASSESSMENT_TEMPLATES[type];
  const answers: AssessmentAnswer[] = tmpl.questions.map((q) => ({ questionId: q.id, question: q.question, answer: "", weight: q.weight }));
  const created = await prisma.privacyAssessment.create({
    data: {
      organizationId, type, title: (input.title || tmpl.title).slice(0, 200),
      subject: input.subject ? input.subject.slice(0, 300) : null,
      processingActivityId: input.processingActivityId || null,
      answersJson: answers as never, mitigationsJson: [] as never,
      status: "DRAFT", createdById: actorId,
    },
  });
  await logAudit({
    organizationId, actorId, actorType: actorId ? "USER" : "SYSTEM",
    action: "privacy.assessment.created", resourceType: "PrivacyAssessment", resourceId: created.id,
    afterJson: { type, title: created.title } as never, metadata: { source: "privacy-assessments" } as never,
  });
  return toDTO(created as AssessmentRow);
}

export async function updateAssessment(
  organizationId: string,
  id: string,
  patch: { title?: string; subject?: string; assignedToUserId?: string | null; answers?: AssessmentAnswer[]; mitigations?: AssessmentMitigation[]; processingActivityId?: string | null },
  actorId: string | null,
): Promise<AssessmentDTO> {
  const existing = await prisma.privacyAssessment.findFirst({ where: { id, organizationId } });
  if (!existing) throw new Error("Assessment not found");
  if (existing.status === "APPROVED" || existing.status === "REJECTED") throw new Error("A resolved assessment is immutable.");

  const type = existing.type as AssessmentType;
  const data: Record<string, unknown> = {};
  if (patch.title != null) data.title = String(patch.title).slice(0, 200);
  if (patch.subject !== undefined) data.subject = patch.subject ? String(patch.subject).slice(0, 300) : null;
  if (patch.assignedToUserId !== undefined) data.assignedToUserId = patch.assignedToUserId || null;
  if (patch.processingActivityId !== undefined) data.processingActivityId = patch.processingActivityId || null;
  if (patch.mitigations) data.mitigationsJson = patch.mitigations.slice(0, 100) as never;
  if (patch.answers) {
    const answers = patch.answers.map((a) => ({ questionId: String(a.questionId), question: String(a.question), answer: String(a.answer ?? ""), weight: Number(a.weight) || 0 }));
    data.answersJson = answers as never;
    const scored = scoreAssessment(type, answers);
    data.riskScore = scored.riskScore;
    data.riskLevel = scored.riskLevel;
    data.dpiaRequired = scored.dpiaRequired;
  }
  const updated = await prisma.privacyAssessment.update({ where: { id }, data });
  await logAudit({
    organizationId, actorId, actorType: actorId ? "USER" : "SYSTEM",
    action: "privacy.assessment.updated", resourceType: "PrivacyAssessment", resourceId: id,
    afterJson: { riskLevel: updated.riskLevel, riskScore: updated.riskScore } as never, metadata: { source: "privacy-assessments" } as never,
  });
  return toDTO(updated as AssessmentRow);
}

const TRANSITIONS: Record<string, { from: PrivacyAssessmentStatus[]; to: PrivacyAssessmentStatus; action: string }> = {
  submit: { from: [PrivacyAssessmentStatus.DRAFT], to: PrivacyAssessmentStatus.IN_REVIEW, action: "privacy.assessment.submitted" },
  approve: { from: [PrivacyAssessmentStatus.IN_REVIEW], to: PrivacyAssessmentStatus.APPROVED, action: "privacy.assessment.approved" },
  reject: { from: [PrivacyAssessmentStatus.IN_REVIEW], to: PrivacyAssessmentStatus.REJECTED, action: "privacy.assessment.rejected" },
  reopen: { from: [PrivacyAssessmentStatus.REJECTED, PrivacyAssessmentStatus.IN_REVIEW], to: PrivacyAssessmentStatus.DRAFT, action: "privacy.assessment.reopened" },
};

export async function transitionAssessment(
  organizationId: string,
  id: string,
  action: "submit" | "approve" | "reject" | "reopen",
  actorId: string,
  note?: string,
): Promise<AssessmentDTO> {
  const t = TRANSITIONS[action];
  if (!t) throw new Error(`Unknown action: ${action}`);
  const existing = await prisma.privacyAssessment.findFirst({ where: { id, organizationId } });
  if (!existing) throw new Error("Assessment not found");
  if (!t.from.includes(existing.status as PrivacyAssessmentStatus)) {
    throw new Error(`Cannot ${action} an assessment in ${existing.status}.`);
  }
  const isApprove = action === "approve";
  const updated = await prisma.privacyAssessment.update({
    where: { id },
    data: {
      status: t.to,
      approvedById: isApprove ? actorId : action === "reopen" ? null : existing.approvedById,
      approvedAt: isApprove ? new Date() : action === "reopen" ? null : existing.approvedAt,
      approvalNote: isApprove || action === "reject" ? (note ? note.slice(0, 1000) : null) : existing.approvalNote,
    },
  });
  await logAudit({
    organizationId, actorId, actorType: "USER",
    action: t.action, resourceType: "PrivacyAssessment", resourceId: id,
    beforeJson: { status: existing.status } as never,
    afterJson: { status: t.to, riskLevel: updated.riskLevel, note: note || null } as never,
    metadata: { source: "privacy-assessments" } as never,
  });
  return toDTO(updated as AssessmentRow);
}

export async function deleteAssessment(organizationId: string, id: string, actorId: string): Promise<void> {
  const existing = await prisma.privacyAssessment.findFirst({ where: { id, organizationId } });
  if (!existing) throw new Error("Assessment not found");
  if (existing.status === "APPROVED") throw new Error("An approved assessment cannot be deleted — it is a compliance record.");
  await prisma.privacyAssessment.delete({ where: { id } });
  await logAudit({
    organizationId, actorId, actorType: "USER",
    action: "privacy.assessment.deleted", resourceType: "PrivacyAssessment", resourceId: id,
    beforeJson: { type: existing.type, title: existing.title, status: existing.status } as never,
    metadata: { source: "privacy-assessments" } as never,
  });
}
