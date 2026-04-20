// ── Minimal KB (mirrors v7.2 KB_TOPICS) ──
export const AGENT_KB=[
  {q:"Can I share this document with a vendor?",triggers:[/share|disclose|send.*document/],answer:"Yes, if the vendor has a signed NDA on file (check Brain) and the document is not marked Highly Confidential. For Highly Confidential, use the clean-room workflow.",source:"Playbook § 3.1"},
  {q:"What's our standard MSA payment term?",triggers:[/payment.{0,10}term|net.{0,3}(30|45|60)/],answer:"Net 45 from receipt of invoice. Net 30 only if counterparty offers ≥2% prompt-pay discount. Anything shorter requires VP Finance approval.",source:"Playbook § 2.4"},
  {q:"Do I need legal review for a standard NDA?",triggers:[/\bnda\b|non.{0,3}disclosure/],answer:"No. Use the Self-Serve NDA generator — it picks the right template (mutual/one-way/evaluation) and auto-fills counterparty info. Only escalate if there are non-standard clauses.",source:"Playbook § 1.2"},
  {q:"When does our vendor contract with [X] expire?",triggers:[/\bexpir|renewal.{0,10}date|when.{0,10}(does|will).{0,20}expire/],answer:"Aurora reads the contract registry and returns expiry, renewal terms, and current notice period.",source:"Contract Registry"},
  {q:"Is this vendor on any sanctions list?",triggers:[/sanction|ofac|denied party/],answer:"Paste vendor legal name into the Sanctions Screen widget — checks OFAC, EU, UK, UN lists in real time.",source:"Sanctions Screen"},
  {q:"What's our data retention period for customer data?",triggers:[/retention|retain.*data|how long.*keep/],answer:"7 years from contract termination, except EU (3 years + 2 years warranty). Financial records: 10 years per SOX.",source:"Privacy Notice § 7"},
];

export function matchAgentKB(text){
  const t=(text||"").toLowerCase();
  for(const item of AGENT_KB){
    if(item.triggers.some(re=>re.test(t))) return item;
  }
  return null;
}
