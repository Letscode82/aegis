import { descriptionLead } from "../intake/ticket-desc";

export function tokenize(t){
  return (t||"").toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(w=>w.length>3&&!["with","that","from","this","need","have","the","and","for","are","was","will","our"].includes(w));
}

export function findSimilarMatters(ticket,allTickets,limit=3){
  // Tokenize the human-authored LEAD only — never the appended
  // document body, whose 10k+ chars of boilerplate create spurious
  // overlap with unrelated tickets (a CDA surfacing as a "match" for
  // an employment-retaliation request).
  const myWords=new Set(tokenize(descriptionLead(ticket.desc)));
  const myCat=ticket.aiTriage?.category||"";
  const myType=ticket.type||"";
  const scored=allTickets
    .filter(t=>t.id!==ticket.id&&(t.stage==="complete"||t.status==="Auto-Completed"||t.status==="Completed"||t.triagedAction==="approved"))
    .map(t=>{
      const otherWords=tokenize(descriptionLead(t.desc));
      const overlap=otherWords.filter(w=>myWords.has(w)).length;
      let score=0;
      if((t.aiTriage?.category||"")===myCat&&myCat) score+=3;
      if((t.type||"")===myType&&myType) score+=2;
      score+=Math.min(overlap,5);
      return {t,score,overlap};
    })
    // A real match shares the category/type OR has meaningful lead
    // overlap (>=2 words). A single incidental word is not a match.
    .filter(x=>x.score>=3||(x.overlap>=2&&x.score>=2))
    .sort((a,b)=>b.score-a.score)
    .slice(0,limit);

  const now=Date.now();
  return scored.map(({t,score})=>({
    id:t.id,
    desc:(t.desc||"").slice(0,100)+((t.desc||"").length>100?"…":""),
    similarity:Math.min(Math.round((score/10)*100),99),
    resolvedDaysAgo:Math.max(1,Math.floor((now-(t.submittedTs||now))/86400000)),
    resolution:t.status==="Auto-Completed"?"Auto-resolved":t.triagedAction==="approved"?`Approved via ${t.triagedBy||"Cockpit"}`:t.status||"Resolved",
    category:t.aiTriage?.category||t.type,
    assigned:t.assigned,
  }));
}
