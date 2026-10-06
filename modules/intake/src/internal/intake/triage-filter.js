// Awaiting-triage predicate — shared by the Cockpit queue and the
// header pill so the two counts can never disagree. A ticket is
// awaiting triage until an attorney acts on it (`triagedBy`),
// regardless of whether the agent has already attached its
// recommendation. Post-P1b, the create path lands tickets at
// stage="assigned" once the agent returns (new → triage → assigned),
// so filtering on stage==="new" alone silently dropped every
// live-created ticket from the Cockpit.
export function isAwaitingTriage(t){
  return (t.stage==="new"||t.stage==="assigned")&&!t.triagedBy&&t.status!=="Snoozed";
}
