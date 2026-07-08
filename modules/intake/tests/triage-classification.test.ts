/**
 * Triage classification must key on the ticket TYPE + typed request +
 * the document TITLE/preamble — never the deep document body, whose
 * incidental clause keywords misroute the ticket. Regression for a CDA
 * upload that classified as "IP / Trademark / OSS" because its body
 * contained "breach" (skipping the NDA rule) and "trademark" (matching
 * the IP rule).
 */
import { describe, expect, it } from "vitest";
import { classifyIntakeRegex } from "@aegis/ai";

// A realistic CDA body: title up top, "breach" in a mid clause, and an
// IP-terms list in the confidential-information definition — the exact
// shape that tripped the classifier.
const CDA_BODY = `MUTUAL CONFIDENTIALITY AND NON-DISCLOSURE AGREEMENT

This Confidentiality and Non-Disclosure Agreement is entered into between
Dr. Reddy's Laboratories Ltd. and the Counterparty for the Purpose of
evaluating a potential business relationship.

1. Confidential Information includes all patents, trademarks, copyrights,
   trade secrets and other intellectual property disclosed by either party.

5. Each Party shall be responsible for any breach of this Agreement by its
   Representatives and Affiliates.`;

// Mirrors the New Request form: TYPE + typed description + the
// document TITLE (first non-empty line, capped) — never the deep body.
function classifyText(type: string, desc: string, docBody: string): string {
  const title = (docBody.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || "").slice(0, 160);
  return [type, desc, title].filter(Boolean).join("\n");
}

describe("triage classification — document-body pollution", () => {
  it("BUG SHAPE: classifying the full CDA body misroutes to IP/Trademark", () => {
    // Documents the defect: the deep body's 'breach' skips the NDA rule
    // and 'trademark' matches the IP rule.
    expect(classifyIntakeRegex(CDA_BODY, "Product")?.cat).toBe("IP / Trademark / OSS");
  });

  it("FIX: type + typed request + title/preamble classifies the CDA as NDA", () => {
    const text = classifyText("CDA Request", "Review and suggest", CDA_BODY);
    expect(classifyIntakeRegex(text, "Product")?.cat).toBe("NDA — Standard");
  });

  it("a bare 'CDA Request' / 'NDA Request' type classifies as NDA with no doc", () => {
    expect(classifyIntakeRegex(classifyText("CDA Request", "please review", ""), "Legal")?.cat).toBe("NDA — Standard");
    expect(classifyIntakeRegex(classifyText("NDA Request", "mutual nda", ""), "Legal")?.cat).toBe("NDA — Standard");
  });

  it("a genuine NDA-breach DISPUTE still routes away from NDA-standard (typed 'breach' wins)", () => {
    const text = classifyText("Legal Question — General", "The counterparty is in breach of our NDA and we may litigate", "");
    // 'breach' in the typed request keeps it out of the auto-draft NDA lane.
    expect(classifyIntakeRegex(text, "Legal")?.cat).not.toBe("NDA — Standard");
  });

  it("a real trademark request still classifies as IP/Trademark", () => {
    const text = classifyText("Trademark Check", 'Clearance for "Zephyrion" trademark in US and EU', "");
    expect(classifyIntakeRegex(text, "Marketing")?.cat).toBe("IP / Trademark / OSS");
  });
});
