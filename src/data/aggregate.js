import { CASES } from "./cases";
import { CONTRACTS } from "./contracts";
import { REGULATIONS } from "./regulations";
import { LITIGATIONS } from "./litigations";
import { COMPLIANCE_INV } from "./compliance";
import { SPEND_FIRMS } from "./spend";
import { GOVERNANCE } from "./governance";

export const ALL_APPROVALS=[
...CASES.flatMap(c=>c.approvals.filter(a=>a.status==="Pending").map(a=>({...a,module:"Cases",ref:c.id,context:c.title.split("—")[0]}))),
...CONTRACTS.flatMap(c=>c.approvals.filter(a=>a.status==="Pending").map(a=>({...a,module:"Contracts",ref:c.id,context:c.vendor}))),
...REGULATIONS.flatMap(r=>r.approvals.filter(a=>a.status==="Pending").map(a=>({...a,module:"Regulatory",ref:r.id,context:r.name.split("—")[0]}))),
...LITIGATIONS.flatMap(l=>l.approvals.filter(a=>a.status==="Pending").map(a=>({...a,module:"Litigation",ref:l.id,context:l.title.split("—")[0]}))),
...COMPLIANCE_INV.flatMap(c=>c.approvals.filter(a=>a.status==="Pending").map(a=>({...a,module:"Compliance",ref:c.id,context:c.title}))),
...SPEND_FIRMS.flatMap(f=>f.approvals.filter(a=>a.status==="Pending").map(a=>({...a,module:"Spend",ref:f.name,context:f.name}))),
...GOVERNANCE.flatMap(g=>g.approvals.filter(a=>a.status==="Pending").map(a=>({...a,module:"Governance",ref:g.entity,context:g.entity}))),
];

export const ALL_ALERTS=[
...CASES.flatMap(c=>c.alerts.map(a=>({...a,module:"Cases",ref:c.id}))),
...CONTRACTS.flatMap(c=>c.alerts.map(a=>({...a,module:"Contracts",ref:c.id}))),
...REGULATIONS.flatMap(r=>r.alerts.map(a=>({...a,module:"Regulatory",ref:r.id}))),
...LITIGATIONS.flatMap(l=>l.alerts.map(a=>({...a,module:"Litigation",ref:l.id}))),
...COMPLIANCE_INV.flatMap(c=>c.alerts.map(a=>({...a,module:"Compliance",ref:c.id}))),
].sort((a,b)=>(a.sev==="critical"?0:a.sev==="warning"?1:2)-(b.sev==="critical"?0:b.sev==="warning"?1:2));
