/**
 * Sample contract templates (CTR-18) — a good-size, ready-to-use MSA (plus a
 * short mutual NDA) for the template library, so testing / demo doesn't require
 * pasting a document. Idempotent: upsertTemplate upserts on (org, key), so
 * seeding twice just refreshes. Exposed through an admin route rather than the
 * main seed so it can be applied to a live environment without a full re-seed.
 *
 * Bodies use {{counterparty.name}} / {{contract.governingLaw}} placeholders the
 * author flow fills; unresolved placeholders render verbatim for the drafter.
 */
import { upsertTemplate, type TemplateKind } from "./templates";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

const MSA_BODY = `MASTER SERVICES AGREEMENT

This Master Services Agreement ("Agreement") is entered into as of the Effective Date by and between BrightWave Analytics, Inc., a Delaware corporation ("Provider"), and {{counterparty.name}} ("Customer"). Provider and Customer are each a "Party" and together the "Parties."

1. DEFINITIONS.
1.1 "Confidential Information" means any non-public information disclosed by one Party to the other that is designated as confidential or that reasonably should be understood to be confidential given its nature and the circumstances of disclosure.
1.2 "Deliverables" means the reports, software, models, and other materials Provider delivers to Customer under an Order Form or Statement of Work ("SOW").
1.3 "Services" means the analytics, hosting, and professional services described in an Order Form or SOW.

2. SERVICES.
2.1 Provider will perform the Services described in each Order Form or SOW in a professional and workmanlike manner. Each Order Form is governed by this Agreement.
2.2 Customer will provide Provider with the access, data, and cooperation reasonably required to perform the Services.

3. FEES AND PAYMENT.
3.1 Customer will pay the fees set out in each Order Form. Unless otherwise stated, fees are invoiced monthly in arrears.
3.2 Payment is due within thirty (30) days of the invoice date (Net 30). Undisputed amounts not paid when due accrue interest at 1.5% per month.
3.3 Fees are exclusive of taxes; Customer is responsible for all applicable sales, use, and value-added taxes.

4. TERM AND TERMINATION.
4.1 Term. This Agreement begins on the Effective Date and continues for an initial term of twelve (12) months.
4.2 Auto-Renewal. This Agreement automatically renews for successive twelve (12) month terms unless either Party gives written notice of non-renewal at least ninety (90) days before the end of the then-current term.
4.3 Termination for Cause. Either Party may terminate this Agreement or any Order Form for the other Party's uncured material breach on thirty (30) days' written notice.
4.4 Effect of Termination. Upon termination, Customer will pay all fees accrued through the effective date of termination.

5. CONFIDENTIALITY.
5.1 Each Party will protect the other Party's Confidential Information using at least reasonable care and will use it solely to perform this Agreement.
5.2 The confidentiality obligations survive for three (3) years after termination, except that trade secrets remain protected for as long as they remain trade secrets.

6. INTELLECTUAL PROPERTY.
6.1 Each Party retains all right, title, and interest in its pre-existing intellectual property.
6.2 Upon full payment, Provider assigns to Customer all right, title, and interest in the Deliverables created specifically for Customer, excluding Provider's pre-existing materials and any generally applicable tools, which Provider licenses to Customer on a non-exclusive, perpetual basis.

7. WARRANTIES.
7.1 Each Party warrants that it has the authority to enter into this Agreement.
7.2 Provider warrants that the Services will materially conform to the applicable SOW. EXCEPT AS EXPRESSLY STATED, THE SERVICES ARE PROVIDED "AS IS" AND PROVIDER DISCLAIMS ALL OTHER WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.

8. INDEMNIFICATION.
8.1 Each Party will indemnify, defend, and hold the other harmless from third-party claims arising out of the indemnifying Party's breach of this Agreement or negligence, subject to prompt notice and control of the defense.

9. LIMITATION OF LIABILITY.
9.1 EXCEPT FOR PAYMENT OBLIGATIONS AND BREACH OF CONFIDENTIALITY, NEITHER PARTY WILL BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES.
9.2 EACH PARTY'S TOTAL AGGREGATE LIABILITY UNDER THIS AGREEMENT IS CAPPED AT THE FEES PAID OR PAYABLE IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.

10. DATA PROTECTION.
10.1 Provider will process Customer personal data only to provide the Services and in accordance with the Data Processing Addendum, if any.
10.2 Provider will maintain administrative, physical, and technical safeguards designed to protect Customer Data.

11. ASSIGNMENT.
11.1 Neither Party may assign this Agreement without the other Party's prior written consent, except to a successor in connection with a merger, acquisition, or sale of substantially all of its assets.

12. GOVERNING LAW; DISPUTES.
12.1 This Agreement is governed by the laws of {{contract.governingLaw}}, without regard to its conflict-of-laws rules.
12.2 The Parties will attempt to resolve any dispute through good-faith negotiation before commencing litigation in the courts located in the governing jurisdiction.

13. GENERAL.
13.1 Entire Agreement. This Agreement, together with all Order Forms and SOWs, is the entire agreement between the Parties and supersedes all prior agreements on its subject matter.
13.2 Notices. Notices must be in writing and are effective on receipt.
13.3 Counterparts. This Agreement may be executed in counterparts, including by electronic signature, each of which is an original.

IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.`;

const NDA_BODY = `MUTUAL NON-DISCLOSURE AGREEMENT

This Mutual Non-Disclosure Agreement ("Agreement") is entered into as of the Effective Date between BrightWave Analytics, Inc. and {{counterparty.name}} (each a "Party").

1. PURPOSE. The Parties wish to explore a potential business relationship and, in connection with that purpose, may disclose Confidential Information to each other.
2. CONFIDENTIAL INFORMATION. "Confidential Information" means non-public information disclosed by one Party ("Discloser") to the other ("Recipient") that is marked confidential or that reasonably should be understood to be confidential.
3. OBLIGATIONS. Recipient will (a) use Confidential Information solely for the Purpose, (b) protect it with at least reasonable care, and (c) not disclose it to any third party except to its personnel who need to know and are bound by confidentiality obligations no less protective than these.
4. EXCLUSIONS. Confidential Information does not include information that is or becomes public through no fault of Recipient, was known to Recipient without obligation, or is independently developed.
5. TERM. This Agreement continues for two (2) years from the Effective Date; confidentiality obligations survive for three (3) years after disclosure.
6. NO LICENSE. No license or other right is granted except the limited right to use Confidential Information for the Purpose.
7. GOVERNING LAW. This Agreement is governed by the laws of {{contract.governingLaw}}.`;

export interface SampleTemplateSpec {
  key: string;
  name: string;
  kind: TemplateKind;
  description: string;
  body: string;
}

export const SAMPLE_CONTRACT_TEMPLATES: SampleTemplateSpec[] = [
  { key: "msa-standard", name: "Master Services Agreement (standard)", kind: "CONTRACT", description: "Full MSA on our paper — analytics / professional services, protective standard positions.", body: MSA_BODY },
  { key: "mutual-nda", name: "Mutual NDA", kind: "NDA", description: "Short two-way confidentiality agreement.", body: NDA_BODY },
];

/** Upsert the sample templates for an org. Idempotent. */
export async function seedSampleTemplates(organizationId: string, actor: Actor) {
  const seeded: Array<{ key: string; name: string }> = [];
  for (const t of SAMPLE_CONTRACT_TEMPLATES) {
    const dto = await upsertTemplate(
      organizationId,
      { key: t.key, name: t.name, kind: t.kind, body: t.body, description: t.description },
      actor,
    );
    seeded.push({ key: dto.key, name: dto.name });
  }
  return { seeded: seeded.length, templates: seeded };
}
