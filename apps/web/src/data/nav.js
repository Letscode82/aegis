import { C } from "@aegis/ui";

export const NAV=[
  {id:"mission",label:"Mission Control",icon:"◎",c:C.em,group:"EXECUTIVE"},
  {id:"today",label:"Today",icon:"◉",c:C.bl,group:"EXECUTIVE"},
  {id:"alerts",label:"Alerts",icon:"▲",c:C.rd,group:"EXECUTIVE"},
  {id:"approvals",label:"Approvals",icon:"✓",c:C.am,group:"EXECUTIVE"},
  {id:"divider1"},
  {id:"intake",label:"Legal Intake",icon:"◆",c:C.cy,group:"OPERATIONS"},
  {id:"matters",label:"Matter Management",icon:"▣",c:C.bl,group:"OPERATIONS"},
  {id:"contracts",label:"Contracts",icon:"▤",c:C.bl,group:"OPERATIONS"},
  {id:"regulatory",label:"Regulatory",icon:"▥",c:C.tl,group:"OPERATIONS"},
  {id:"ocm",label:"Outside Counsel",icon:"▦",c:C.am,group:"OPERATIONS"},
  {id:"spend",label:"Legal Spend",icon:"▧",c:C.am,group:"OPERATIONS"},
  {id:"governance",label:"Governance",icon:"▨",c:C.cy,group:"OPERATIONS"},
  {id:"cyber",label:"Cyber Response",icon:"▩",c:C.rd,group:"OPERATIONS"},
  {id:"divider2"},
  {id:"graph",label:"Risk Graph",icon:"◈",c:C.em,group:"INTELLIGENCE"},
  {id:"scenarios",label:"Scenarios",icon:"◉",c:C.em,group:"INTELLIGENCE"},
  {id:"brain",label:"Company Brain",icon:"◎",c:C.tl,group:"INTELLIGENCE"},
  {id:"board",label:"Board Pack",icon:"◇",c:C.pp,group:"INTELLIGENCE"},
  {id:"divider3"},
  {id:"workflows",label:"Workflow Builder",icon:"▷",c:C.tl,group:"PLATFORM"},
  {id:"architecture",label:"Architecture",icon:"▶",c:C.pp,group:"PLATFORM"},
  {id:"divider4"},
  // PLATFORM admin tools — each entry is permission-gated. AppShell
  // hides any entry whose `permission` the current user lacks; if all
  // three hide, the entire ADMIN group header doesn't render.
  // Server-side checks on /api/admin/* and /api/audit-log are the
  // authoritative gates.
  {id:"users",label:"Users",icon:"◈",c:C.bl,group:"ADMIN",permission:"admin:manage_users"},
  {id:"roles",label:"Roles",icon:"◆",c:C.pp,group:"ADMIN",permission:"admin:manage_roles"},
  {id:"audit",label:"Audit Log",icon:"◇",c:C.am,group:"ADMIN",permission:"audit:read_all"},
];

// ── Deployment profile ───────────────────────────────────────────────
// A single client may license only Intake. The "intake" profile keeps the
// whole platform running underneath (agents, M365 email polling,
// ticket→matter auto-spawn, the audit chain) but shows ONLY the Intake
// surface plus the admin tools Intake needs (Users / Roles / Audit Log,
// still permission-gated). Set NEXT_PUBLIC_AEGIS_PROFILE=intake.
// Default "full" renders every module nav entry as before.
export const INTAKE_PROFILE_VIEWS = new Set(["intake", "users", "roles", "audit"]);

export function resolveProfile() {
  const p =
    (typeof process !== "undefined" &&
      process.env &&
      process.env.NEXT_PUBLIC_AEGIS_PROFILE) ||
    "full";
  return p === "intake" ? "intake" : "full";
}

/** NAV entries for a profile. Dividers are kept here; AppShell already
 * drops the ones left dangling after filtering. */
export function navForProfile(profile) {
  if (profile !== "intake") return NAV;
  return NAV.filter((n) => n.id.startsWith("divider") || INTAKE_PROFILE_VIEWS.has(n.id));
}
