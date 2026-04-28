export const POLICY_LIBRARY=[
  {triggers:[/byod|personal.{0,5}device|personal.{0,5}phone/],policy:"BYOD Policy § 8.3",answer:"Managers may not unilaterally require personal devices. Employees may opt-in to BYOD; otherwise company issues work device (5 business days). CA/EU employees entitled to reimbursement per Lab. Code § 2802."},
  {triggers:[/m&a|merger|acquisition|data.{0,5}room|diligence.{0,10}share/],policy:"M&A Confidentiality Policy § 5.2",answer:"Data Room → Confidential: executed M&A NDA. Financial models → 'Highly Confidential': clean-team protocol. Send via secure data room, track access logs."},
  {triggers:[/travel.{0,5}(reimburs|expense)|per.{0,5}diem/],policy:"Travel & Expense Policy § 3",answer:"Per diem varies by location tier. Receipts required over $25. Entertainment requires pre-approval. See T&E portal for rates."},
  {triggers:[/remote.{0,5}work|work.{0,5}from.{0,5}home|hybrid.{0,5}policy/],policy:"Remote Work Policy § 6",answer:"Hybrid default: 3 days in-office, 2 remote. Full-remote requires role + manager approval. Cross-border remote (different tax jurisdiction) requires Legal + Tax approval."},
  {triggers:[/data.{0,5}retention|how long.{0,5}keep|delete.{0,5}(customer|user)/],policy:"Data Retention Policy § 2",answer:"7 years post-termination for customer data. EU: 3 years + 2 years warranty. Financial: 10 years per SOX. Personal access requests honored per GDPR/CCPA."},
];

export function matchPolicy(text){
  const t=(text||"").toLowerCase();
  for(const p of POLICY_LIBRARY){
    if(p.triggers.some(re=>re.test(t))) return p;
  }
  return null;
}
