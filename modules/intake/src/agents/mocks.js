// Mock registry lookups — in prod, these would call the real ContractAI / Sanctions / Policy APIs
export function mockPriorNDACheck(counterparty){
  const has=(counterparty||"").toLowerCase();
  if(has.includes("acme")) return {found:true,ndaId:"NDA-2026-02-14-ACME",expires:"2028-02-14",note:"Active mutual NDA on file — consider reusing."};
  return {found:false,note:"No prior NDA on file with this counterparty."};
}
export function mockSanctionsCheck(counterparty,jurisdiction){
  const name=(counterparty||"").toLowerCase();
  if(/iran|north korea|crimea/.test((jurisdiction||"").toLowerCase())) return {clear:false,flags:["Jurisdiction on restricted list"]};
  if(/huawei|zte|sberbank/.test(name)) return {clear:false,flags:["Entity appears on OFAC SDN / sectoral lists"]};
  return {clear:true,checkedLists:["OFAC","EU Consolidated","UK OFSI","UN","Refinitiv World-Check"]};
}
