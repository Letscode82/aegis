// SK-7 — pure helpers for admin-editable ONE Legal skills.
//
// Org-authored skills (the `Skill` table) merge with the built-in catalog
// (skills.ts) at read time. These functions are pure (no DB, no Next, no
// React) so they can be unit-tested directly and reused on the server. The
// store (skills-store.ts) supplies the rows; the API route serves the merged
// list; the console renders it exactly like the static catalog.

/** The skill action union, shared with skills.ts (SkillAction). */
export const SKILL_ACTIONS = ["route", "research", "prefill"];

/** A slug is a short, stable, url-ish id: lowercase letters, digits, dashes. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

/**
 * Validate + normalise an admin-supplied skill payload. Returns
 * `{ ok, errors, value }`. `value` is the cleaned row ready to persist
 * (unknown keys dropped, types coerced); on `ok:false` it is null.
 */
export function validateSkillInput(input, { partial = false } = {}) {
  const errors = [];
  const o = input && typeof input === "object" ? input : {};
  const str = (v) => (typeof v === "string" ? v.trim() : "");

  const slug = str(o.slug).toLowerCase();
  const label = str(o.label);
  const prompt = str(o.prompt);
  const category = str(o.category);
  const action = str(o.action);
  const description = str(o.description);
  const icon = str(o.icon) || "✦";
  const reviewSkillId = str(o.reviewSkillId) || null;
  const featured = o.featured === true;
  const enabled = o.enabled === undefined ? true : o.enabled !== false;
  const cats = Array.isArray(o.cats) ? o.cats.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim()) : [];

  // In partial (update) mode, only validate the fields that were supplied.
  const has = (k) => Object.prototype.hasOwnProperty.call(o, k);
  if (!partial || has("slug")) { if (!SLUG_RE.test(slug)) errors.push("slug must be 2-64 chars: lowercase letters, digits, dashes"); }
  if (!partial || has("label")) { if (!label) errors.push("label is required"); }
  if (!partial || has("prompt")) { if (!prompt) errors.push("prompt is required"); }
  if (!partial || has("category")) { if (!category) errors.push("category is required"); }
  if (!partial || has("action")) { if (!SKILL_ACTIONS.includes(action)) errors.push(`action must be one of ${SKILL_ACTIONS.join(", ")}`); }

  if (errors.length) return { ok: false, errors, value: null };

  // Build only the fields that were supplied (so updates can be partial).
  const value = {};
  if (!partial || has("slug")) value.slug = slug;
  if (!partial || has("label")) value.label = label;
  if (!partial || has("prompt")) value.prompt = prompt;
  if (!partial || has("category")) value.category = category;
  if (!partial || has("action")) value.action = action;
  if (!partial || has("description")) value.description = description;
  if (!partial || has("icon")) value.icon = icon;
  if (!partial || has("reviewSkillId")) value.reviewSkillId = reviewSkillId;
  if (!partial || has("featured")) value.featured = featured;
  if (!partial || has("enabled")) value.enabled = enabled;
  if (!partial || has("cats")) value.cats = cats;
  return { ok: true, errors: [], value };
}

/** Map a persisted org `Skill` row to the catalog (OneLegalSkill) shape. */
export function orgSkillToCatalog(row) {
  return {
    id: row.slug,
    label: row.label,
    desc: row.description || "",
    icon: row.icon || "✦",
    action: row.action,
    prompt: row.prompt,
    cats: Array.isArray(row.cats) ? row.cats : [],
    category: row.category,
    featured: !!row.featured,
    ...(row.reviewSkillId ? { reviewSkillId: row.reviewSkillId } : {}),
    _source: "org",
  };
}

/**
 * Merge built-in catalog skills with org-authored rows.
 * - An org row whose slug matches a built-in id **overrides** that built-in
 *   (its fields win); `enabled:false` **hides** the built-in.
 * - An org row with a new slug is **added** (unless `enabled:false`).
 * - Built-ins with no matching org row pass through unchanged.
 * Order: built-ins keep their order (overrides in place), then new org skills
 * append in the order given. Pure — returns a new array.
 */
export function mergeSkills(staticSkills, orgRows) {
  const statics = Array.isArray(staticSkills) ? staticSkills : [];
  const rows = Array.isArray(orgRows) ? orgRows : [];
  const bySlug = new Map();
  for (const r of rows) if (r && typeof r.slug === "string") bySlug.set(r.slug, r);

  const out = [];
  const usedOverrides = new Set();
  for (const s of statics) {
    const row = bySlug.get(s.id);
    if (!row) { out.push(s); continue; }
    usedOverrides.add(s.id);
    if (row.enabled === false) continue; // org hid this built-in
    out.push({ ...orgSkillToCatalog(row), _source: "override" });
  }
  // Append net-new, enabled org skills (not overriding a built-in), in order.
  for (const r of rows) {
    if (!r || typeof r.slug !== "string" || !r.slug) continue;
    if (usedOverrides.has(r.slug)) continue;
    if (r.enabled === false) continue;
    out.push(orgSkillToCatalog(r));
  }
  return out;
}
