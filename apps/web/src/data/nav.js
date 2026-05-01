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
  // Audit Log is gated to roles carrying audit:read_all (admin + gc by
  // default). AppShell hides this entry for users without it; the
  // server-side check on /api/audit-log is the authoritative gate.
  {id:"audit",label:"Audit Log",icon:"◆",c:C.am,group:"INTELLIGENCE",permission:"audit:read_all"},
  {id:"divider3"},
  {id:"workflows",label:"Workflow Builder",icon:"▷",c:C.tl,group:"PLATFORM"},
  {id:"architecture",label:"Architecture",icon:"▶",c:C.pp,group:"PLATFORM"},
];
