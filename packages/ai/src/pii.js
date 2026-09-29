/**
 * PII detection + redaction (SEC1).
 *
 * Deterministic, dependency-free guardrail for scrubbing common PII from text
 * before it leaves the tenant for the model. Conservative patterns (low false
 * positive) for the identifiers a legal-ops corpus most often leaks: email,
 * US SSN, formatted payment-card numbers, phone numbers, and IPv4 addresses.
 *
 * Pure functions — usable server-side in the /api/claude proxy (opt-in via
 * AEGIS_PII_REDACTION) and by any caller that wants to detect/scrub before an
 * embedding or an external send. Not a compliance-grade DLP engine; it is a
 * pragmatic first-pass guard that degrades safely (off by default).
 */

// Order matters: email before phone (so an email's digits aren't mis-scored),
// card before phone, phone before the loose IPv4 check.
export const PII_PATTERNS = [
  { type: "email", replacement: "[REDACTED_EMAIL]", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { type: "ssn", replacement: "[REDACTED_SSN]", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: "card", replacement: "[REDACTED_CARD]", re: /\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{4}\b/g },
  { type: "phone", replacement: "[REDACTED_PHONE]", re: /(?:\+?1[-.\s]?)?\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g },
  { type: "ipv4", replacement: "[REDACTED_IP]", re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g },
];

/** Count PII matches by type without mutating the text. */
export function detectPII(text) {
  const s = typeof text === "string" ? text : "";
  const matches = {};
  let total = 0;
  for (const { type, re } of PII_PATTERNS) {
    const m = s.match(new RegExp(re.source, re.flags));
    if (m && m.length) {
      matches[type] = m.length;
      total += m.length;
    }
  }
  return { matches, total };
}

/** Replace detected PII with typed placeholders. Returns {redacted, matches, total}. */
export function redactPII(text) {
  let s = typeof text === "string" ? text : "";
  const matches = {};
  let total = 0;
  for (const { type, replacement, re } of PII_PATTERNS) {
    let count = 0;
    s = s.replace(new RegExp(re.source, re.flags), () => {
      count += 1;
      return replacement;
    });
    if (count) {
      matches[type] = count;
      total += count;
    }
  }
  return { redacted: s, matches, total };
}

/**
 * Redact PII in-place across an Anthropic Messages request body (system +
 * messages[].content, whether string or content-block array). Returns the same
 * object plus the total number of redactions. Used by the proxy when
 * AEGIS_PII_REDACTION is enabled.
 */
export function redactMessagesBody(parsed) {
  let total = 0;
  const scrub = (v) => {
    const { redacted, total: n } = redactPII(v);
    total += n;
    return redacted;
  };
  if (parsed && typeof parsed === "object") {
    if (typeof parsed.system === "string") parsed.system = scrub(parsed.system);
    else if (Array.isArray(parsed.system)) {
      for (const b of parsed.system) if (b && typeof b === "object" && typeof b.text === "string") b.text = scrub(b.text);
    }
    if (Array.isArray(parsed.messages)) {
      for (const msg of parsed.messages) {
        if (!msg || typeof msg !== "object") continue;
        if (typeof msg.content === "string") msg.content = scrub(msg.content);
        else if (Array.isArray(msg.content)) {
          for (const b of msg.content) if (b && typeof b === "object" && typeof b.text === "string") b.text = scrub(b.text);
        }
      }
    }
  }
  return { parsed, total };
}

/** True when proxy-level PII redaction is switched on. */
export function isPIIRedactionEnabled() {
  const v = typeof process !== "undefined" && process.env ? process.env.AEGIS_PII_REDACTION : "";
  return v === "1" || v === "true" || v === "on";
}
