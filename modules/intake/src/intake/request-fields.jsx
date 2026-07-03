import { C, F, M, inputStyle, useIsNarrow } from "@aegis/ui";

// ── W3-3 · Dynamic request-type fields (issue #115) ──────────────────
//
// Renders a request type's configured IntakeRequestFields on the New
// Request form and turns the captured values into agent-readable
// context lines. DRL's 10 contract subtypes / DPIA / notices become
// pure config: an admin defines the fields, this renders them —
// no code change per subtype.

/** "adverse_party" → "Adverse Party" (detail-view fallback when only
 *  the stored key is available). */
export function humanizeKey(key) {
  return String(key || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Required fields with no meaningful value yet (drives canSubmit). */
export function missingRequiredFields(fields, values) {
  return (fields || [])
    .filter((f) => f.required)
    .filter((f) => {
      const v = values?.[f.key];
      if (f.kind === "boolean") return v !== true && v !== false;
      return v === undefined || v === null || String(v).trim() === "";
    })
    .map((f) => f.label || humanizeKey(f.key));
}

/** "Label: value" lines appended to the description so the classifier
 *  and the agent read the structured answers too. */
export function fieldValuesToLines(fields, values) {
  const out = [];
  for (const f of fields || []) {
    const v = values?.[f.key];
    if (v === undefined || v === null || String(v).trim() === "") continue;
    const rendered = f.kind === "boolean" ? (v === true || v === "true" ? "Yes" : "No") : String(v);
    out.push(`${f.label || humanizeKey(f.key)}: ${rendered}`);
  }
  return out;
}

const fieldLabel = { fontSize: 9.5, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3, display: "flex", gap: 4, alignItems: "center" };

function FieldInput({ field, value, onChange }) {
  const common = { ...inputStyle, width: "100%", fontSize: 11 };
  switch (field.kind) {
    case "textarea":
      return <textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={3} style={{ ...common, resize: "vertical", fontFamily: F }} />;
    case "select": {
      const options = Array.isArray(field.options) ? field.options : [];
      return (
        <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={common}>
          <option value="">(select)</option>
          {options.map((o) => {
            const v = typeof o === "string" ? o : o.value;
            const l = typeof o === "string" ? o : (o.label ?? o.value);
            return <option key={v} value={v} style={{ background: C.s1 }}>{l}</option>;
          })}
        </select>
      );
    }
    case "date":
      return <input type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={common} />;
    case "number":
      return <input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={common} />;
    case "boolean":
      return (
        <div onClick={() => onChange(!(value === true || value === "true"))} style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "6px 0" }}>
          <div style={{ width: 32, height: 18, borderRadius: 9, background: value === true || value === "true" ? C.gn : C.br, position: "relative", transition: "background .15s" }}>
            <div style={{ position: "absolute", top: 2, left: value === true || value === "true" ? 16 : 2, width: 14, height: 14, borderRadius: "50%", background: C.bg, transition: "left .15s" }} />
          </div>
          <span style={{ fontSize: 10.5, fontFamily: M, color: C.t2 }}>{value === true || value === "true" ? "Yes" : "No"}</span>
        </div>
      );
    default:
      return <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={common} />;
  }
}

/** The dynamic block the New Request form mounts when a configured
 *  type with fields is selected. Controlled: `values` keyed by
 *  field.key, `onChange(key, value)`. */
export function DynamicFields({ typeName, fields, values, onChange }) {
  const phone = useIsNarrow(640); // W4-3 — one column on phones
  if (!fields || fields.length === 0) return null;
  const sorted = [...fields].sort((a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100));
  return (
    <div style={{ margin: "4px 0 12px", padding: 12, background: C.s1, border: `1px solid ${C.br}`, borderLeft: `3px solid ${C.tl}`, borderRadius: 5 }}>
      <div style={{ fontSize: 9.5, fontFamily: M, color: C.tl, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>
        ▣ {typeName} — details
      </div>
      <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr" : "1fr 1fr", gap: 10 }}>
        {sorted.map((f) => (
          <div key={f.key} style={f.kind === "textarea" ? { gridColumn: "1 / span 2" } : undefined}>
            <div style={fieldLabel}>
              {f.label || humanizeKey(f.key)}
              {f.required && <span style={{ color: C.am }}>*</span>}
            </div>
            <FieldInput field={f} value={values?.[f.key]} onChange={(v) => onChange(f.key, v)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Read-only rendering for the ticket detail view. Values are the
 *  stored requestFieldValuesJson ({key: value}); labels derive from
 *  the key (the canonical shape stays key→value). */
export function RequestFieldValues({ values }) {
  const entries = Object.entries(values || {}).filter(
    ([, v]) => v !== undefined && v !== null && String(v).trim() !== "",
  );
  if (entries.length === 0) return null;
  return (
    <div style={{ marginTop: 10, padding: 11, background: C.s1, borderRadius: 5, borderLeft: `2px solid ${C.tl}` }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: C.t3, marginBottom: 6, letterSpacing: 1, textTransform: "uppercase", fontFamily: M }}>Request details (structured)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 14px" }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ minWidth: 0 }}>
            <div style={{ fontSize: 9, color: C.t4, fontFamily: M, letterSpacing: .8, textTransform: "uppercase" }}>{humanizeKey(k)}</div>
            <div style={{ fontSize: 11.5, color: C.t1, overflowWrap: "break-word" }}>{v === true ? "Yes" : v === false ? "No" : String(v)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
