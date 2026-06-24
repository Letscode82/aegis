// ── Internal policy library (Policy Q&A agent) ──
// First trigger match wins; existing entries stay first. Sensitive
// employment matters (harassment / discrimination / retaliation) are
// escalated by the agent BEFORE this lookup runs, so every entry here
// is informational/procedural by design — nothing that should be
// attorney-investigated. Expanded in Intake P2b from 5 → 21.
export const POLICY_LIBRARY=[
  {triggers:[/byod|personal.{0,5}device|personal.{0,5}phone/],policy:"BYOD Policy § 8.3",answer:"Managers may not unilaterally require personal devices. Employees may opt-in to BYOD; otherwise company issues work device (5 business days). CA/EU employees entitled to reimbursement per Lab. Code § 2802."},
  {triggers:[/m&a|merger|acquisition|data.{0,5}room|diligence.{0,10}share/],policy:"M&A Confidentiality Policy § 5.2",answer:"Data Room → Confidential: executed M&A NDA. Financial models → 'Highly Confidential': clean-team protocol. Send via secure data room, track access logs."},
  {triggers:[/travel.{0,5}(reimburs|expense)|per.{0,5}diem/],policy:"Travel & Expense Policy § 3",answer:"Per diem varies by location tier. Receipts required over $25. Entertainment requires pre-approval. See T&E portal for rates."},
  {triggers:[/remote.{0,5}work|work.{0,5}from.{0,5}home|hybrid.{0,5}policy/],policy:"Remote Work Policy § 6",answer:"Hybrid default: 3 days in-office, 2 remote. Full-remote requires role + manager approval. Cross-border remote (different tax jurisdiction) requires Legal + Tax approval."},
  {triggers:[/data.{0,5}retention|how long.{0,5}keep|delete.{0,5}(customer|user)/],policy:"Data Retention Policy § 2",answer:"7 years post-termination for customer data. EU: 3 years + 2 years warranty. Financial: 10 years per SOX. Personal access requests honored per GDPR/CCPA."},

  // ── Governance / compliance ──
  {triggers:[/conflict.{0,5}of.{0,5}interest|outside.{0,5}(activity|board)|related.{0,5}party/],policy:"Conflicts of Interest Policy § 2",answer:"Disclose any outside board seat, investment in a competitor/vendor, or financial interest in a transaction you touch. File via the COI portal; Legal + your manager review. When in doubt, disclose — non-disclosure is the violation, not the conflict."},
  {triggers:[/gift|entertainment|hospitality|meal.{0,5}(client|vendor)/],policy:"Gifts & Entertainment Policy § 4",answer:"Gifts under $100 are generally acceptable; over $100 require manager + Legal approval and logging. NEVER give anything of value to a government official without Legal sign-off (FCPA). No cash/cash-equivalents."},
  {triggers:[/fcpa|anti.{0,5}brib|anti.{0,5}corrupt|government.{0,5}official|foreign.{0,5}official|facilitation.{0,5}payment/],policy:"Anti-Bribery / FCPA Policy § 1",answer:"Zero tolerance. No payment or thing of value to any government official to obtain/retain business. This covers third parties acting on our behalf — vet agents/distributors. Facilitation payments are prohibited even where locally tolerated. Report any request immediately."},
  {triggers:[/whistleblow|report.{0,5}(misconduct|wrongdoing)|ethics.{0,5}hotline|speak.{0,5}up/],policy:"Whistleblower Policy § 1",answer:"Report suspected misconduct via the anonymous Ethics Hotline (24/7) or to Legal/Compliance directly. Retaliation against good-faith reporters is strictly prohibited and itself a terminable offense. Reports are handled confidentially."},
  {triggers:[/code.{0,5}of.{0,5}conduct|business.{0,5}ethics|acceptable.{0,5}behavior/],policy:"Code of Conduct § 1",answer:"All employees and contractors must follow the Code of Conduct: act with integrity, avoid conflicts, protect confidential information, comply with law, and report concerns. Annual attestation is mandatory."},
  {triggers:[/insider.{0,5}trading|material.{0,5}non.{0,5}public|\bmnpi\b|trading.{0,5}window|blackout.{0,5}period/],policy:"Insider Trading Policy § 3",answer:"Do not trade on, or share, material non-public information (MNPI). Designated insiders may only trade during open windows after pre-clearance. Tipping is prohibited. When unsure whether info is material, treat it as MNPI and ask Legal."},

  // ── Information security / data ──
  {triggers:[/data.{0,5}classif|confidential.{0,5}(level|tier|marking)|highly.{0,5}confidential|public.{0,5}vs.{0,5}internal/],policy:"Data Classification Policy § 2",answer:"Four tiers: Public, Internal, Confidential, Highly Confidential. Confidential = customer/business data (need-to-know). Highly Confidential = source code, financials, personal-sensitive data (clean-room, encryption at rest + in transit). Label documents accordingly."},
  {triggers:[/password|\bmfa\b|2fa|multi.{0,5}factor|credential.{0,5}(policy|requirement)/],policy:"Access & Authentication Policy § 5",answer:"MFA is mandatory on all corporate and SaaS accounts. Use the company password manager; no shared or reused credentials. Report suspected credential compromise to Security immediately."},
  {triggers:[/acceptable.{0,5}use|\baup\b|personal.{0,5}use.{0,5}(device|system)|company.{0,5}(equipment|system).{0,5}use/],policy:"Acceptable Use Policy § 2",answer:"Company systems are for business use; incidental personal use is permitted if it doesn't interfere with work or violate policy. No unlawful, harassing, or infringing content. Activity on company systems may be monitored per local law."},
  {triggers:[/incident.{0,5}(report|response)|data.{0,5}breach|security.{0,5}incident|suspected.{0,5}breach/],policy:"Incident Response Policy § 1",answer:"Report any suspected security or data incident to Security/Legal within 1 hour of discovery — do not investigate or remediate alone. Preserve evidence. Legal assesses breach-notification obligations (often 72-hour clocks under GDPR/state laws)."},
  {triggers:[/legal.{0,5}hold|litigation.{0,5}hold|preservation.{0,5}(notice|obligation)|do.{0,5}not.{0,5}delete/],policy:"Legal Hold Policy § 1",answer:"When litigation or an investigation is reasonably anticipated, the duty to preserve attaches. If you receive a hold notice, stop deleting anything in scope (email, files, chats) and acknowledge. Suspend auto-deletion. Contact Legal before disposing of any potentially relevant material."},

  // ── IP / employment-procedural ──
  {triggers:[/ip.{0,5}assignment|invention.{0,5}assignment|who.{0,5}owns.{0,5}(my|employee).{0,5}(work|invention)|proprietary.{0,5}information.{0,5}agreement|\bpiaa\b|\bpiia\b/],policy:"Employee IP Assignment Policy § 1",answer:"Inventions created within the scope of employment, or using company resources, are assigned to the company under your signed PIIA. Document prior inventions in the PIIA exhibit. Side projects on personal time/resources that don't relate to company business may remain yours — disclose if unsure."},
  {triggers:[/moonlight|side.{0,5}(gig|business|project)|outside.{0,5}employ|second.{0,5}job/],policy:"Outside Activities Policy § 3",answer:"Outside work is allowed if it doesn't compete with the company, use company resources/IP, or impair your duties. Disclose and get manager approval for anything in an adjacent industry. See the IP assignment policy for ownership of side-project inventions."},
  {triggers:[/social.{0,5}media|post.{0,5}(about|on).{0,5}(linkedin|twitter)|public.{0,5}statement.{0,5}company/],policy:"Social Media Policy § 2",answer:"You may share publicly available company content; do not disclose confidential info, financial results, or unannounced products. Make clear personal opinions are your own. Only authorized spokespeople speak for the company to press."},
  {triggers:[/expense.{0,5}(approv|threshold|limit)|spend.{0,5}approv|purchase.{0,5}(approv|authority)|signing.{0,5}authority|delegation.{0,5}of.{0,5}authority/],policy:"Delegation of Authority § 4",answer:"Approval thresholds: managers up to $5K, directors up to $25K, VPs up to $100K, C-suite above. Contracts that bind the company require Legal review regardless of dollar value. Never split a purchase to avoid a threshold."},
];

export function matchPolicy(text){
  const t=(text||"").toLowerCase();
  for(const p of POLICY_LIBRARY){
    if(p.triggers.some(re=>re.test(t))) return p;
  }
  return null;
}
