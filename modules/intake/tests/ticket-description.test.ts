/**
 * splitTicketDescription — separates the human-authored request lead
 * from appended attached-document text so the Cockpit renders the
 * request, not a wall of contract text. The agent still receives the
 * full concatenated desc; this only governs display.
 */
import { describe, expect, it } from "vitest";
import { splitTicketDescription } from "../src/intake/index.jsx";

describe("splitTicketDescription", () => {
  it("returns the whole string as lead when there is no attachment", () => {
    const { lead, docs } = splitTicketDescription("Need a mutual NDA with Acme.");
    expect(lead).toBe("Need a mutual NDA with Acme.");
    expect(docs).toEqual([]);
  });

  it("splits one attached document out of the description", () => {
    const desc =
      "mutual nda to be reviewed\n\n--- Attached document: CDA Template.docx ---\nCONFIDENTIALITY AND NON-DISCLOSURE AGREEMENT ... long body ...";
    const { lead, docs } = splitTicketDescription(desc);
    expect(lead).toBe("mutual nda to be reviewed");
    expect(docs).toHaveLength(1);
    expect(docs[0]!.name).toBe("CDA Template.docx");
    expect(docs[0]!.text).toContain("CONFIDENTIALITY AND NON-DISCLOSURE");
  });

  it("handles multiple attachments", () => {
    const desc =
      "review both\n\n--- Attached document: A.txt ---\nalpha body\n\n--- Attached document: B.txt ---\nbeta body";
    const { lead, docs } = splitTicketDescription(desc);
    expect(lead).toBe("review both");
    expect(docs.map((d) => d.name)).toEqual(["A.txt", "B.txt"]);
    expect(docs[0]!.text).toBe("alpha body");
    expect(docs[1]!.text).toBe("beta body");
  });

  it("empty lead (upload only) is preserved as empty, docs still extracted", () => {
    const desc = "--- Attached document: only.docx ---\njust the document";
    const { lead, docs } = splitTicketDescription(desc);
    expect(lead).toBe("");
    expect(docs[0]!.text).toBe("just the document");
  });

  it("tolerates null / undefined", () => {
    expect(splitTicketDescription(null as never)).toEqual({ lead: "", docs: [] });
  });
});
