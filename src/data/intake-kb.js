export const KB_TOPICS=[
{q:"Can I share this document with a vendor?",cat:"Disclosure",resolved:847,deflectionRate:94,owner:"Playbook § 3.1",answer:"Yes, if the vendor has a signed NDA on file (check Brain) and the document is not marked Highly Confidential. For Highly Confidential, use the clean-room workflow."},
{q:"What's our standard MSA payment term?",cat:"Contract FAQ",resolved:612,deflectionRate:99,owner:"Playbook § 2.4",answer:"Net 45 from receipt of invoice. Net 30 only if counterparty offers ≥2% prompt-pay discount. Anything shorter requires VP Finance approval."},
{q:"Do I need legal review for a standard NDA?",cat:"NDA",resolved:1241,deflectionRate:98,owner:"Playbook § 1.2",answer:"No. Use the Self-Serve NDA generator — it picks the right template (mutual / one-way / evaluation) and auto-fills counterparty info from Salesforce. Only escalate if there are non-standard clauses."},
{q:"When does our vendor contract with [X] expire?",cat:"Contract Query",resolved:534,deflectionRate:100,owner:"Contract Registry",answer:"Ask Aurora — the AI reads the contract registry and returns expiry, renewal terms, and current notice period in one click."},
{q:"Is this vendor on any sanctions list?",cat:"Compliance",resolved:389,deflectionRate:96,owner:"Sanctions Screen",answer:"Paste the vendor legal name into the Sanctions Screen widget — checks OFAC, EU, UK, UN lists in real time. Results < 5 seconds."},
{q:"What's our data retention period for customer data?",cat:"Privacy FAQ",resolved:287,deflectionRate:100,owner:"Privacy Notice § 7",answer:"7 years from contract termination, except EU customers (3 years under contract, then 2 years for warranty). Financial records: 10 years per SOX."},
];

export const ROUTING_RULES=[
{id:"RULE-0",cond:"Type = NDA (standard) OR Informational lookup",action:"Auto-draft / auto-answer",assignee:"AI Agent",autoPct:100,matches:231,enabled:true},
{id:"RULE-1",cond:"Harassment / discrimination + respondent = VP+",action:"Escalate to GC",assignee:"GC + Employment Lead",autoPct:0,matches:8,enabled:true},
{id:"RULE-2",cond:"Debt / finance > €100M OR $100M",action:"Finance Legal review",assignee:"Finance Legal + GC",autoPct:0,matches:14,enabled:true},
{id:"RULE-3",cond:"IP / open-source / trademark / patent",action:"Route to IP Team",assignee:"David Park, IP Lead",autoPct:30,matches:72,enabled:true},
{id:"RULE-4",cond:"EU regulatory AND (client-facing OR external statement)",action:"EU Counsel + GC approval",assignee:"Elena Kraft + GC",autoPct:0,matches:19,enabled:true},
{id:"RULE-5",cond:"Vendor DD AND high-risk jurisdiction",action:"Enhanced due diligence",assignee:"Compliance Team",autoPct:15,matches:38,enabled:true},
{id:"RULE-6",cond:"Privacy / DPIA / personal data",action:"Privacy Team review",assignee:"Privacy Team",autoPct:25,matches:54,enabled:true},
{id:"RULE-7",cond:"Contract > $500K",action:"Commercial + GDPR check",assignee:"Maria Chen, Commercial",autoPct:0,matches:27,enabled:true},
{id:"RULE-8",cond:"Sanctions jurisdiction match",action:"Hold + escalate",assignee:"Compliance + GC",autoPct:0,matches:3,enabled:true},
];
