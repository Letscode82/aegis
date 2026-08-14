/**
 * Minimal, theme-neutral HTML email layout (pure). Inline styles only —
 * email clients strip <style> and external CSS. One card, an optional primary
 * button, and plain paragraphs. Every caller gets a matching text/plain body
 * so the message is deliverable even where HTML is blocked.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface BasicEmailInput {
  /** Pre-header + <h1> line. */
  heading: string;
  /** Body paragraphs (plain text; escaped + <br>-joined). */
  paragraphs: string[];
  /** Optional primary call-to-action. */
  button?: { label: string; url: string } | null;
  /** Small print under the button (e.g. "Link expires 12 Sep 2026"). */
  footnote?: string | null;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

/** Render a basic transactional email to { html, text }. */
export function renderBasicEmail(input: BasicEmailInput): RenderedEmail {
  const paras = input.paragraphs.filter((p) => p != null);
  const htmlParas = paras
    .map((p) => `<p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:#1f2937;">${escapeHtml(p)}</p>`)
    .join("");
  const btn = input.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 16px;"><tr><td style="border-radius:6px;background:#2563eb;">` +
      `<a href="${escapeHtml(input.button.url)}" style="display:inline-block;padding:11px 20px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">${escapeHtml(
        input.button.label,
      )}</a></td></tr></table>`
    : "";
  const foot = input.footnote
    ? `<p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#6b7280;">${escapeHtml(input.footnote)}</p>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;">
<tr><td style="padding:22px 26px;">
<div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#2563eb;font-weight:700;margin-bottom:10px;">AEGIS</div>
<h1 style="margin:0 0 14px;font-size:18px;line-height:1.3;color:#111827;font-weight:600;">${escapeHtml(input.heading)}</h1>
${htmlParas}
${btn}
${foot}
</td></tr>
</table>
<p style="margin:14px 0 0;font-size:11px;color:#9ca3af;">Sent by AEGIS · Legal Operations Platform</p>
</td></tr>
</table>
</body></html>`;

  const textLines: string[] = [input.heading, "", ...paras];
  if (input.button) textLines.push("", `${input.button.label}: ${input.button.url}`);
  if (input.footnote) textLines.push("", input.footnote);
  textLines.push("", "— AEGIS · Legal Operations Platform");

  return { html, text: textLines.join("\n") };
}
