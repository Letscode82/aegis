// Mock registry lookups.
//
// mockPriorNDACheck was removed in Intake P2b — the NDA agent now does a
// real Counterparty lookup via /api/intake/counterparty-check. The
// sanctions mock below is the next to go (real OFAC screening).
export function mockSanctionsCheck(counterparty,jurisdiction){
  const name=(counterparty||"").toLowerCase();
  if(/iran|north korea|crimea/.test((jurisdiction||"").toLowerCase())) return {clear:false,flags:["Jurisdiction on restricted list"]};
  if(/huawei|zte|sberbank/.test(name)) return {clear:false,flags:["Entity appears on OFAC SDN / sectoral lists"]};
  return {clear:true,checkedLists:["OFAC","EU Consolidated","UK OFSI","UN","Refinitiv World-Check"]};
}
