// ── Notice Management Agent — deterministic extraction core ─────────
//
// (GC Suite Working Architecture, Agent 9.) A missed or mis-computed
// deadline is the platform's highest-severity failure, so deadline
// extraction is DETERMINISTIC code, not LLM output: every deadline the
// agent reports carries the exact source text it was parsed from, so
// the approver verifies with one glance. Claude drafts the situation
// brief and the acknowledgment; it never invents dates.
//
// Pure — no DB, no network, receipt time injected for testability.

const MONTHS={january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11,
  jan:0,feb:1,mar:2,apr:3,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11};

const DAY_MS=24*60*60*1000;

/** Add N days (calendar or business) to a timestamp. */
function addDays(ts,days,business){
  if(!business) return ts+days*DAY_MS;
  let d=new Date(ts),left=days;
  while(left>0){
    d=new Date(d.getTime()+DAY_MS);
    const dow=d.getUTCDay();
    if(dow!==0&&dow!==6) left-=1;
  }
  return d.getTime();
}

/**
 * Extract every deadline from notice text.
 * Returns [{sourceText, deadlineTs, kind:"explicit"|"computed", days?, business?}],
 * sorted soonest first. Explicit dates in the past (relative to
 * receivedTs) are kept — an already-lapsed deadline is the most urgent
 * signal there is — flagged with lapsed:true.
 */
export function extractDeadlines(text,receivedTs){
  const t=String(text||"");
  const found=[];
  const seen=new Set();
  const push=(sourceText,deadlineTs,extra={})=>{
    if(!Number.isFinite(deadlineTs)) return;
    const key=`${Math.round(deadlineTs/DAY_MS)}`;
    if(seen.has(key)) return;
    seen.add(key);
    found.push({sourceText:sourceText.trim().slice(0,140),deadlineTs,lapsed:deadlineTs<receivedTs,...extra});
  };

  // 1. "Month D, YYYY" / "Month D YYYY" / "D Month YYYY"
  const re1=/\b(january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi;
  let m;
  while((m=re1.exec(t))){
    const mo=MONTHS[m[1].toLowerCase()];
    push(context(t,m.index),Date.UTC(Number(m[3]),mo,Number(m[2]),23,59),{kind:"explicit"});
  }
  const re2=/\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\.?,?\s+(\d{4})\b/gi;
  while((m=re2.exec(t))){
    const mo=MONTHS[m[2].toLowerCase()];
    push(context(t,m.index),Date.UTC(Number(m[3]),mo,Number(m[1]),23,59),{kind:"explicit"});
  }
  // 2. ISO / slash dates: 2026-08-01, 08/01/2026 (treated month-first),
  //    01/08/2026 ambiguous — both captured via month-first rule + note.
  const re3=/\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while((m=re3.exec(t))){
    push(context(t,m.index),Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]),23,59),{kind:"explicit"});
  }
  const re4=/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
  while((m=re4.exec(t))){
    const a=Number(m[1]),b=Number(m[2]);
    const [mo,day]=a<=12?[a,b]:[b,a];
    if(mo>=1&&mo<=12&&day>=1&&day<=31)
      push(context(t,m.index),Date.UTC(Number(m[3]),mo-1,day,23,59),{kind:"explicit",ambiguous:a<=12&&b<=12&&a!==b});
  }
  // 3. Computed periods: "within 30 days", "no later than 10 business
  //    days", "15 days of receipt/of this letter/hereof", "cure within…"
  const re5=/\b(?:within|no later than|not later than|in the next)\s+(\d{1,3})\s+(business\s+|calendar\s+)?days?\b(?:\s+(?:of|from|after)\s+(?:receipt|the date of this (?:letter|notice)|service|hereof))?/gi;
  while((m=re5.exec(t))){
    const days=Number(m[1]);
    const business=/business/i.test(m[2]||"");
    if(days>0&&days<=400)
      push(context(t,m.index),addDays(receivedTs,days,business),{kind:"computed",days,business});
  }
  const re6=/\b(\d{1,3})[- ]day\s+(?:cure|notice|response|objection)\s+period\b/gi;
  while((m=re6.exec(t))){
    const days=Number(m[1]);
    if(days>0&&days<=400)
      push(context(t,m.index),addDays(receivedTs,days,false),{kind:"computed",days,business:false});
  }

  return found.sort((a,b)=>a.deadlineTs-b.deadlineTs);
}

/** ±60 chars of context around a match — the citation the approver reads. */
function context(text,index){
  const start=Math.max(0,index-40);
  const end=Math.min(text.length,index+100);
  return (start>0?"…":"")+text.slice(start,end)+(end<text.length?"…":"");
}

/**
 * Notice taxonomy → urgency (doc order: regulatory > statutory >
 * breach/termination > demand > informational).
 */
export function classifyNotice(text){
  const t=String(text||"").toLowerCase();
  if(/regulator|regulatory (?:notice|inquiry|action)|show.{0,3}cause|\bsebi\b|\bsec\b|\bfda\b|\bcci\b|\brbi\b|data protection (?:board|authority)|information commissioner|consent order/.test(t))
    return {category:"regulatory",urgency:1,label:"Regulatory"};
  if(/statut(?:e|ory)|limitation period|prescribed period|section \d+.{0,30}(?:act|code)|legal requirement to respond/.test(t))
    return {category:"statutory",urgency:2,label:"Statutory"};
  if(/breach|default|terminat|cure period|remedy (?:the|this|such) (?:breach|default)|suspension of (?:services|performance)/.test(t))
    return {category:"breach_termination",urgency:3,label:"Breach / Termination"};
  if(/demand|payment due|amount owed|invoice.{0,20}overdue|cease.{0,3}and.{0,3}desist|remit|settle/.test(t))
    return {category:"demand",urgency:4,label:"Demand"};
  return {category:"informational",urgency:5,label:"Informational"};
}

/**
 * SLA sized to the shortest extracted deadline (doc), with honest
 * floors/ceilings: at least 4h (never an impossible clock), at most
 * the fallback when nothing was extracted. Lapsed deadlines → floor.
 */
export function slaHoursForDeadlines(deadlines,receivedTs,fallbackHours=24){
  if(!deadlines||deadlines.length===0) return fallbackHours;
  const soonest=deadlines[0];
  const hours=Math.floor((soonest.deadlineTs-receivedTs)/(60*60*1000));
  if(hours<=0) return 4; // already lapsed — immediate attention
  return Math.max(4,Math.min(hours,fallbackHours*30));
}
