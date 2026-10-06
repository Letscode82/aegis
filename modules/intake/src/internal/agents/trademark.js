import { buildRec, buildDegradedRec } from "./build-rec";
import { screenTrademarkMark } from "./trademark-lookup";
import { callClaudeJSON, friendlyAIError } from "@aegis/ai";

// Trademark Clearance agent — now backed by a REAL knock-out screen.
//
// The proposed mark is screened against the TrademarkMark reference table
// (USPTO / EUIPO / bootstrap) using deterministic phonetic (Soundex),
// visual (Levenshtein), and NICE-class similarity — the same first pass a
// clearance paralegal runs. Claude then INTERPRETS the real conflict list
// into a clearance memo (it does not invent conflicts). This mirrors the
// Vendor agent's real OFAC screening: the deterministic screen is the
// evidence; the LLM writes the narrative.
//
// A knock-out screen is a preliminary pass — it can miss common-law marks
// and near-misses — so the memo ALWAYS requires a formal USPTO/EUIPO/WIPO
// clearance + counsel sign-off before any naming commitment.

// Best-effort NICE-class extraction: explicit "class 9" / "classes 9, 42".
function extractClasses(desc) {
  const out = new Set();
  const re = /\bclass(?:es)?\s+((?:\d{1,2})(?:\s*[,&and]+\s*\d{1,2})*)/gi;
  let m;
  while ((m = re.exec(desc || ""))) {
    for (const n of m[1].split(/[^\d]+/)) {
      const v = parseInt(n, 10);
      if (v >= 1 && v <= 45) out.add(v);
    }
  }
  return [...out];
}

function conflictLine(c) {
  const cls = c.classes && c.classes.length ? ` (class ${c.classes.join("/")})` : "";
  const overlap = c.classOverlap ? "" : " — different field of use";
  return `${c.wordMark}${cls} · ${Math.round(c.score * 100)}% ${c.basis.join("+")}${c.status === "DEAD" ? " · DEAD" : ""}${overlap}`;
}

export const TrademarkAgent = {
  id: "trademark-agent",
  name: "Trademark Clearance Agent",
  shortName: "Trademark",
  icon: "◇",
  description:
    "Real knock-out trademark screening: matches the proposed mark against the registered-marks table (phonetic + visual + NICE-class), then drafts a clearance memo interpreting the conflicts. Always recommends a formal registry search before any naming commitment.",
  productionReady: true,

  canHandle(ticket) {
    const cat = (ticket.aiTriage?.category || "").toLowerCase();
    const type = (ticket.type || "").toLowerCase();
    const d = (ticket.desc || "").toLowerCase();
    return /trademark/.test(cat) || /trademark/.test(type) || /trademark.{0,5}(clear|check|search)/.test(d);
  },

  async process(ticket) {
    const name = (ticket.from || "").split(" ")[0] || "there";
    const nameMatch = (ticket.desc || "").match(/['"]([^'"]{2,40})['"]/);
    const proposedName = nameMatch ? nameMatch[1] : null;
    const classes = extractClasses(ticket.desc);
    const jurs = (ticket.desc || "").match(/\b(US|USA|United States|EU|Europe|UK|China|Japan|Canada|Australia|India|Global|worldwide)\b/gi) || [];

    if (!proposedName) {
      return buildRec(this.id, {
        confidence: 0.3,
        suggestedAction: "flag-for-review",
        draftedResponse: `Hi ${name},\n\nTo run a trademark clearance screen I need the exact mark you want to clear. Please reply with the proposed mark in quotes (e.g. "AURORA") and the goods/services it will cover, and I'll run a knock-out screen and route to IP counsel.\n\n— AEGIS Trademark Clearance`,
        reasoning: "No quoted mark found — cannot screen without the exact wording.",
        concerns: ["Ask the requester to quote the exact proposed mark and describe the goods/services."],
        precedentLinks: [{ id: "TM-CLEARANCE-PLAYBOOK", title: "Trademark Clearance Playbook" }],
      });
    }

    // ── REAL knock-out screen (deterministic) ───────────────────────────
    const screen = await screenTrademarkMark(proposedName, classes);
    const conflicts = screen.conflicts || [];
    const hasIdentical = conflicts.some((c) => c.basis.includes("identical") && c.status !== "DEAD");
    const screenSummary =
      screen.status === "conflict"
        ? `CONFLICTS (${conflicts.length}, screened ${screen.screened} marks${screen.listAsOf ? `, data as of ${screen.listAsOf.slice(0, 10)}` : ""}):\n${conflicts.slice(0, 8).map((c) => "• " + conflictLine(c)).join("\n")}`
        : screen.status === "clear"
          ? `No knock-out conflicts against ${screen.screened} screened marks. ${screen.note}`
          : `Screening ${screen.status}: ${screen.note}`;

    try {
      const prompt = `You are the Trademark Clearance Agent for AEGIS Legal. A DETERMINISTIC knock-out screen has already run against the registered-marks reference set — do NOT invent or contradict its results; interpret them. You still do not have the full registry, so a formal USPTO/EUIPO/WIPO search by counsel remains mandatory.

TICKET:
- Requester: ${ticket.from} (${ticket.dept})
- Proposed mark: "${proposedName}"
- Goods/services + NICE classes: ${classes.length ? classes.join(", ") : "[not stated — assume broad overlap]"}
- Jurisdictions mentioned: ${jurs.length ? [...new Set(jurs.map((j) => j.toUpperCase()))].join(", ") : "[not stated]"}

KNOCK-OUT SCREEN RESULT (authoritative — cite as given):
${screenSummary}

Write a clearance memo that:
1. States the screen outcome plainly (identical/similar marks found, or none in the screened set).
2. For each material conflict, notes the similarity basis (phonetic/visual/contains) and whether the field of use overlaps.
3. Assesses distinctiveness of "${proposedName}" (fanciful/arbitrary/suggestive/descriptive/generic).
4. Gives a recommendation: HIGH-RISK / RECONSIDER when there are strong same-class conflicts, otherwise PROCEED-TO-FORMAL-SEARCH.
5. Always states a formal registry clearance search + counsel sign-off are required before adoption.

Respond with ONLY this JSON:
{"draftedResponse":"clearance memo to the requester, \\n line breaks, 150-230 words","alternativeTone":"one-line summary","confidence":0.0-1.0,"reasoning":"one-line basis","concerns":["formal registry search + counsel sign-off required","...conflicts/risks"]}`;

      const result = await callClaudeJSON(prompt, { maxTokens: 750 });
      const confidence = typeof result.confidence === "number" ? result.confidence : 0.6;
      // Strong conflict → never auto-send; clean + confident clear → memo can send.
      const suggestedAction = !hasIdentical && screen.status === "clear" && confidence >= 0.8 ? "approve-and-send" : "flag-for-review";
      const concerns = Array.isArray(result.concerns) ? result.concerns : [];
      if (screen.status === "conflict") {
        concerns.unshift(`Knock-out screen found ${conflicts.length} potential conflict(s): ${conflicts.slice(0, 4).map((c) => c.wordMark).join(", ")}${conflicts.length > 4 ? "…" : ""}.`);
      }
      if (screen.status === "unavailable") {
        concerns.unshift("⚠ Automated screen did NOT run (no/stale reference data) — do not treat as cleared.");
      }
      if (!concerns.some((c) => /formal|registry|counsel|search/i.test(c))) {
        concerns.push("Formal USPTO/EUIPO/WIPO registry search + counsel sign-off required before any naming commitment.");
      }
      return buildRec(this.id, {
        confidence,
        suggestedAction,
        draftedResponse: result.draftedResponse,
        reasoning: result.reasoning || `Knock-out screen (${screen.status}) + AI clearance memo.`,
        concerns,
        precedentLinks: [{ id: "TM-CLEARANCE-PLAYBOOK", title: "Trademark Clearance Playbook" }],
        alternativeTone: result.alternativeTone || null,
      });
    } catch (e) {
      console.error("[agent:trademark] callClaudeJSON failed:", e);
      // Degraded path KEEPS the deterministic screen — its value never
      // depended on Claude (same discipline as the Vendor agent).
      const fallback = `Hi ${name},\n\nKnock-out screen for "${proposedName}"${classes.length ? ` (class ${classes.join("/")})` : ""}:\n\n${screenSummary}\n\nOur AI assistant is temporarily unavailable, so this is the raw screen result. Next step: IP counsel runs a formal USPTO/EUIPO/WIPO clearance search before any naming commitment.\n\n— AEGIS Trademark Clearance`;
      return buildDegradedRec(this.id, {
        draftedResponse: fallback,
        reasoning: `Knock-out screen completed (${screen.status}); Claude unavailable for the memo — screen result surfaced for counsel review.`,
        concerns: [
          friendlyAIError(e),
          screen.status === "conflict" ? `${conflicts.length} potential conflict(s) found — see screen result.` : "Screen produced; interpret with counsel.",
          "Formal registry search + counsel sign-off required before any naming commitment.",
        ],
        precedentLinks: [{ id: "TM-CLEARANCE-PLAYBOOK", title: "Trademark Clearance Playbook" }],
      });
    }
  },
};
