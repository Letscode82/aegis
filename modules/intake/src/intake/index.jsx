import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { C, F, M, SR, Pill, Dot, Bar, Card, SH, WorkflowSteps, pc, inputStyle, FormField } from "@aegis/ui";
import { classifyIntakeRegex } from "@aegis/ai";
import { useCurrentUser } from "@aegis/auth/react";
import { Kbd, ConfidenceBadge, AgentBadge, TypingDots, ChatBubble, CapacityMeter, SimilarMatterCard } from "../intake-ui";
import { KB_TOPICS, ROUTING_RULES } from "../intake-kb";
import { AGENTS_BY_ID, ALL_AGENTS } from "../agents";
import { COPILOT_INITIAL_STATE, initialAssistantMessage, copilotTurn, mergeState, createCopilotTicket } from "../copilot/engine";
import { findSimilarMatters } from "../copilot/similar-matters";
import { saveConversation } from "../storage/conversations";
import { useTicketStore } from "../hooks/use-ticket-store";
import { useAgentSettings } from "../hooks/use-agent-settings";
import { useCockpitState } from "../hooks/use-cockpit-state";
import { useAgentLog } from "../hooks/use-agent-log";
import { useKeyboardShortcuts } from "../hooks/use-keyboard-shortcuts";
import { TicketSummaryButton, AskAuroraChat } from "../ai-features";

// Type picker gate — shown at top of New Request tab
// Splits simple vs complex request types into Form path vs Copilot path.
const SIMPLE_TYPES=[
  {id:"NDA Request",icon:"◉",hint:"Standard NDA — template fit"},
  {id:"Contract Question",icon:"◈",hint:"FAQ-style lookup"},
  {id:"Vendor Due Diligence",icon:"⬡",hint:"Standard vendor onboarding"},
  {id:"IP Question",icon:"◇",hint:"Trademark / OSS / patent"},
  {id:"Privacy Question",icon:"◎",hint:"DPIA / GDPR question"},
  {id:"Contract Review",icon:"◐",hint:"Known contract type"},
];
const COMPLEX_TYPES=[
  {id:"Employment Issue",icon:"⚠",hint:"Sensitive — HR / Employment matter",sensitive:true},
  {id:"Regulatory",icon:"§",hint:"Novel or evolving regulatory question"},
  {id:"Litigation / Dispute",icon:"⚡",hint:"Potential dispute or claim"},
  {id:"Other",icon:"◌",hint:"Doesn't fit above"},
  {id:"I'm not sure",icon:"?",hint:"Talk it through with me"},
];

function TypePickerGate({onPickSimple,onPickComplex}){
  return <div style={{maxWidth:920,margin:"0 auto"}}>
    <div style={{fontSize:11,fontWeight:600,color:C.cy,letterSpacing:1.8,textTransform:"uppercase",fontFamily:M,marginBottom:8}}>How would you like to file this?</div>
    <div style={{fontSize:16,fontFamily:SR,color:C.t1,lineHeight:1.4,marginBottom:20}}>Pick a <em style={{color:C.cy,fontStyle:"italic"}}>simple request type</em> for the fast structured form, or start a <em style={{color:C.cy,fontStyle:"italic"}}>conversation with the Copilot</em> for complex or ambiguous matters.</div>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:8}}>
      <div style={{background:C.cd,border:`1px solid ${C.br}`,borderLeft:`3px solid ${C.tl}`,borderRadius:6,padding:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div>
            <div style={{fontSize:10,fontFamily:M,color:C.tl,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:3}}>FAST PATH · STRUCTURED FORM</div>
            <div style={{fontSize:14,color:C.t1,fontFamily:SR,lineHeight:1.3}}>When you know exactly what you need</div>
          </div>
          <Pill t="v7.2 FORM" c={C.tl}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
          {SIMPLE_TYPES.map(t=><div key={t.id} onClick={()=>onPickSimple(t.id)} style={{padding:10,border:`1px solid ${C.br}`,borderRadius:4,cursor:"pointer",transition:"all .12s",background:C.s1}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.tl;e.currentTarget.style.background=C.tlG}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.br;e.currentTarget.style.background=C.s1}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}><span style={{fontSize:13,color:C.tl}}>{t.icon}</span><span style={{fontSize:11.5,color:C.t1,fontWeight:600}}>{t.id}</span></div>
            <div style={{fontSize:9.5,color:C.t3,fontFamily:M}}>{t.hint}</div>
          </div>)}
        </div>
      </div>

      <div style={{background:C.cd,border:`1px solid ${C.br}`,borderLeft:`3px solid ${C.em}`,borderRadius:6,padding:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div>
            <div style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:3}}>SMART PATH · COPILOT CHAT</div>
            <div style={{fontSize:14,color:C.t1,fontFamily:SR,lineHeight:1.3}}>When you're not sure what you need</div>
          </div>
          <Pill t="v8 NEW" c={C.em}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
          {COMPLEX_TYPES.map(t=><div key={t.id} onClick={()=>onPickComplex(t.id)} style={{padding:10,border:`1px solid ${t.sensitive?C.am+"66":C.br}`,borderRadius:4,cursor:"pointer",transition:"all .12s",background:C.s1}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.em;e.currentTarget.style.background=C.emG}} onMouseLeave={e=>{e.currentTarget.style.borderColor=t.sensitive?C.am+"66":C.br;e.currentTarget.style.background=C.s1}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}><span style={{fontSize:13,color:t.sensitive?C.am:C.em}}>{t.icon}</span><span style={{fontSize:11.5,color:C.t1,fontWeight:600}}>{t.id}</span></div>
            <div style={{fontSize:9.5,color:C.t3,fontFamily:M}}>{t.hint}</div>
          </div>)}
        </div>
      </div>
    </div>

    <div style={{padding:12,background:C.s1,borderRadius:5,borderLeft:`2px solid ${C.cy}`,fontSize:10.5,color:C.t2,fontFamily:M,lineHeight:1.55,letterSpacing:.2}}>
      <span style={{color:C.cy,fontWeight:600}}>Either path works.</span> You can switch between form and chat at any time — we'll carry your progress across.
    </div>
  </div>;
}

// ══════════════════════════════════════════════════
// CopilotChat — the conversational intake UI
// ══════════════════════════════════════════════════
function CopilotChat({initialType,onFiled,onSwitchToForm,store,settings}){
  // Session-resolved defaults (Phase 1a). The requester name pre-fills
  // from the Auth0-resolved user; the field stays editable so a user
  // filing on behalf of someone else can override.
  const{user:sessionUser}=useCurrentUser();
  const[state,setState]=useState(()=>({...COPILOT_INITIAL_STATE(),requestType:initialType}));
  const[history,setHistory]=useState(()=>[{role:"assistant",content:initialAssistantMessage(initialType),ts:Date.now()}]);
  const[input,setInput]=useState("");
  const[thinking,setThinking]=useState(false);
  const[ready,setReady]=useState(false);
  const[readyReason,setReadyReason]=useState("");
  const[topicSwitchPending,setTopicSwitchPending]=useState(null);
  const[apiError,setApiError]=useState(null);
  const[submitting,setSubmitting]=useState(false);
  const[filedTicket,setFiledTicket]=useState(null);
  const[requesterName,setRequesterName]=useState("");
  const[requesterDept,setRequesterDept]=useState("Product");
  // Backfill requesterName once the session user resolves. Only sets
  // when the field is still empty — user edits stay intact.
  useEffect(()=>{
    if(sessionUser?.name&&!requesterName) setRequesterName(sessionUser.name);
  },[sessionUser,requesterName]);
  const scrollRef=useRef(null);
  const inputRef=useRef(null);

  useEffect(()=>{
    if(scrollRef.current){ scrollRef.current.scrollTop=scrollRef.current.scrollHeight; }
  },[history,thinking]);

  useEffect(()=>{
    if(inputRef.current&&!filedTicket) inputRef.current.focus();
  },[filedTicket,thinking]);

  const send=async()=>{
    if(!input.trim()||thinking||submitting) return;
    const userMsg={role:"user",content:input.trim(),ts:Date.now()};
    const nextHistory=[...history,userMsg];
    setHistory(nextHistory);
    setInput("");
    setThinking(true);
    setApiError(null);

    const result=await copilotTurn({
      history:nextHistory,state,ticketType:initialType,
      requester:requesterName||"(not provided)",
    });

    if(result._error){ setApiError(result._error); }

    const nextState=mergeState(state,result.fieldsExtracted||{});
    // Stamp topic-switch flag into state
    if(result.topicSwitchDetected&&result.topicSwitchTo){ nextState.topicSwitchDetected=true; }
    setState(nextState);

    const assistantMsg={role:"assistant",content:result.message,ts:Date.now(),fieldsExtracted:result.fieldsExtracted};
    setHistory([...nextHistory,assistantMsg]);
    setReady(result.ready);
    setReadyReason(result.readyReason||"");
    if(result.topicSwitchDetected&&result.topicSwitchTo){
      setTopicSwitchPending(result.topicSwitchTo);
    }
    setThinking(false);
  };

  const confirmTopicSwitch=(acceptSwitch)=>{
    if(acceptSwitch){
      // Reset: new conversation around the new topic
      const newType=topicSwitchPending;
      setState({...COPILOT_INITIAL_STATE(),requestType:newType});
      setHistory([{role:"assistant",content:`Got it — switching this over. ${initialAssistantMessage(newType)}`,ts:Date.now()}]);
      setReady(false);setReadyReason("");
    } else {
      // Stay on current topic
      setHistory(h=>[...h,{role:"assistant",content:"Understood — sticking with the original topic. Continue.",ts:Date.now()}]);
    }
    setTopicSwitchPending(null);
  };

  const submit=async(overrideReady)=>{
    if(submitting) return;
    if(!requesterName.trim()){ alert("Please enter your name before submitting."); return; }
    setSubmitting(true);
    try{
      const transcript=history.map(m=>({role:m.role,content:m.content,ts:m.ts,...(m.fieldsExtracted?{fieldsExtracted:m.fieldsExtracted}:{})}));
      const ticket=createCopilotTicket({
        state,transcript,type:initialType,
        requester:requesterName,dept:requesterDept,
        priority:state.urgency==="Emergency"?"Critical":state.urgency==="Urgent"?"High":null,
      });
      const {ticket:saved,agent,recommendation}=await store.addTicketAndRunAgent(ticket);
      await saveConversation(saved.id,transcript);
      setFiledTicket({...saved,_agent:agent,_rec:recommendation});
      if(onFiled) onFiled(saved);
    }catch(e){
      setApiError("Failed to file: "+e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Extracted fields to display in the sidebar (filtering out nulls and meta)
  const visibleFields=Object.entries(state).filter(([k,v])=>v!==null&&v!==""&&!["topicSwitchDetected","sensitiveFlags"].includes(k)&&!(Array.isArray(v)&&v.length===0));

  if(filedTicket){
    return <div style={{maxWidth:820,margin:"0 auto"}}>
      <div style={{background:C.gnG,border:`1px solid ${C.gn}`,borderLeft:`4px solid ${C.gn}`,padding:20,marginBottom:14,animation:"fu .4s ease"}}>
        <div style={{fontSize:11,fontFamily:M,color:C.gn,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>✓ COPILOT INTAKE FILED · PERSISTED</div>
        <div style={{fontSize:20,fontFamily:SR,color:C.t1,marginBottom:4}}>Ticket <span style={{color:C.gn,fontFamily:M}}>{filedTicket.id}</span> filed from conversation</div>
        <div style={{fontSize:12,color:C.t2,lineHeight:1.6}}>
          {filedTicket._agent?<>Routed to <span style={{color:C.pp,fontWeight:600}}>{filedTicket._agent.name}</span> · Recommendation generated ({Math.round((filedTicket._rec?.confidence||0)*100)}% confidence) · </>:<>No matching agent — will land in Cockpit for manual triage · </>}
          Full transcript ({filedTicket.conversation?.length||0} messages) attached to ticket.
        </div>
      </div>
      <Card>
        <div style={{fontSize:11,fontWeight:600,color:C.cy,letterSpacing:1.2,textTransform:"uppercase",fontFamily:M,marginBottom:10}}>What happens next</div>
        <div style={{fontSize:12,color:C.t2,lineHeight:1.7}}>
          Your conversation has been filed as a structured ticket. An attorney will review the agent's recommendation in the Triage Cockpit — every close is a human decision. You'll hear back within your SLA window ({filedTicket.sla}).
        </div>
        <div style={{display:"flex",gap:8,marginTop:14}}>
          <div onClick={()=>window.location.reload()} style={{padding:"9px 16px",border:`1px solid ${C.br}`,color:C.t2,fontSize:10,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase"}}>File Another</div>
        </div>
      </Card>
    </div>;
  }

  return <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14,maxWidth:1100,margin:"0 auto"}}>
    {/* Left: chat */}
    <div>
      <div style={{background:C.cd,border:`1px solid ${C.br}`,borderLeft:`3px solid ${C.em}`,borderRadius:6,padding:12,marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <Dot c={C.em} p/>
            <span style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600}}>INTAKE COPILOT</span>
            <span style={{fontSize:10,color:C.t3,fontFamily:M}}>· Initial type: {initialType}</span>
          </div>
          <div onClick={onSwitchToForm} style={{padding:"4px 10px",border:`1px solid ${C.br}`,color:C.t3,fontSize:9.5,fontFamily:M,letterSpacing:1.2,cursor:"pointer",textTransform:"uppercase"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.tl;e.currentTarget.style.color=C.tl}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.br;e.currentTarget.style.color=C.t3}}>⇄ Switch to form</div>
        </div>
      </div>

      {/* Requester identity — required before submission */}
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:8,marginBottom:10}}>
        <input value={requesterName} onChange={e=>setRequesterName(e.target.value)} placeholder="Your name (required)" style={{...inputStyle,fontSize:11}}/>
        <select value={requesterDept} onChange={e=>setRequesterDept(e.target.value)} style={{...inputStyle,fontSize:11}}>
          {["Product","Engineering","Sales","HR","Finance","Procurement","Marketing","Operations","Legal","Executive"].map(d=><option key={d} value={d} style={{background:C.s1}}>{d}</option>)}
        </select>
      </div>

      <div ref={scrollRef} style={{background:C.cd,border:`1px solid ${C.br}`,borderRadius:6,padding:14,height:440,overflowY:"auto"}}>
        {history.map((m,i)=><ChatBubble key={i} role={m.role} d={i*30} meta={m.fieldsExtracted?`+ extracted: ${Object.keys(m.fieldsExtracted).join(", ")}`:null}>{m.content}</ChatBubble>)}
        {thinking&&<div style={{display:"flex",justifyContent:"flex-start",marginBottom:10}}>
          <div style={{padding:"10px 13px",background:C.cd,border:`1px solid ${C.br}`,borderLeft:`2px solid ${C.cy}`,borderRadius:"2px 8px 8px 8px"}}>
            <div style={{fontSize:8.5,fontFamily:M,color:C.cy,letterSpacing:1.5,textTransform:"uppercase",marginBottom:3,fontWeight:600}}>◎ COPILOT · THINKING</div>
            <TypingDots/>
          </div>
        </div>}
      </div>

      {topicSwitchPending&&<div style={{marginTop:10,padding:12,background:C.amG,border:`1px solid ${C.am}`,borderLeft:`3px solid ${C.am}`,borderRadius:5}}>
        <div style={{fontSize:10,fontFamily:M,color:C.am,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:5}}>⚠ TOPIC SWITCH DETECTED</div>
        <div style={{fontSize:11.5,color:C.t1,lineHeight:1.5,marginBottom:8}}>It looks like the conversation has shifted to <span style={{color:C.am,fontWeight:600}}>{topicSwitchPending}</span>. Want me to file this as a new ticket on that topic instead, or stick with the original?</div>
        <div style={{display:"flex",gap:8}}>
          <div onClick={()=>confirmTopicSwitch(true)} style={{padding:"6px 12px",background:C.am+"22",border:`1px solid ${C.am}`,color:C.am,fontSize:10,fontFamily:M,letterSpacing:1.2,cursor:"pointer",textTransform:"uppercase",fontWeight:600}}>Switch topic · Reset</div>
          <div onClick={()=>confirmTopicSwitch(false)} style={{padding:"6px 12px",border:`1px solid ${C.br}`,color:C.t2,fontSize:10,fontFamily:M,letterSpacing:1.2,cursor:"pointer",textTransform:"uppercase"}}>Stay on topic</div>
        </div>
      </div>}

      {apiError&&<div style={{marginTop:10,padding:10,background:C.rdG,borderLeft:`2px solid ${C.rd}`,fontSize:10.5,color:C.t2,fontFamily:M}}>API: {apiError}</div>}

      <div style={{marginTop:10,display:"flex",gap:8,alignItems:"stretch"}}>
        <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder="Type your message — press Enter to send, Shift+Enter for newline" rows={2} style={{...inputStyle,resize:"none",fontFamily:F,minHeight:52,flex:1}}/>
        <div onClick={send} style={{padding:"0 18px",background:input.trim()&&!thinking?C.cy:C.br,color:input.trim()&&!thinking?C.bg:C.t4,fontSize:11,fontFamily:M,letterSpacing:1.5,cursor:input.trim()&&!thinking?"pointer":"not-allowed",textTransform:"uppercase",fontWeight:600,display:"flex",alignItems:"center",whiteSpace:"nowrap"}}>{thinking?"…":"↵ Send"}</div>
      </div>

      {ready&&!filedTicket&&<div style={{marginTop:12,padding:12,background:C.gnG,border:`1px solid ${C.gn}`,borderLeft:`3px solid ${C.gn}`,borderRadius:5}}>
        <div style={{fontSize:10,fontFamily:M,color:C.gn,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:5}}>✓ COPILOT READY TO FILE</div>
        <div style={{fontSize:11.5,color:C.t2,lineHeight:1.5,marginBottom:8}}>{readyReason||"Enough information captured to file this as a structured ticket."}</div>
        <div style={{display:"flex",gap:8}}>
          <div onClick={()=>submit(true)} style={{padding:"7px 14px",background:C.gn,color:C.bg,fontSize:10.5,fontFamily:M,letterSpacing:1.5,cursor:submitting?"wait":"pointer",textTransform:"uppercase",fontWeight:700}}>{submitting?"Filing…":"→ File Ticket"}</div>
          <div onClick={()=>setReady(false)} style={{padding:"7px 12px",border:`1px solid ${C.br}`,color:C.t2,fontSize:10,fontFamily:M,letterSpacing:1.2,cursor:"pointer",textTransform:"uppercase"}}>Keep chatting</div>
        </div>
      </div>}

      {/* Always-available escape hatch */}
      {!ready&&history.length>2&&!filedTicket&&<div style={{marginTop:10,textAlign:"center"}}>
        <span onClick={()=>submit(false)} style={{fontSize:9.5,fontFamily:M,color:C.t4,letterSpacing:1,cursor:"pointer",textTransform:"uppercase",borderBottom:`1px dashed ${C.t4}`,paddingBottom:1}} onMouseEnter={e=>{e.currentTarget.style.color=C.t2;e.currentTarget.style.borderBottomColor=C.t2}} onMouseLeave={e=>{e.currentTarget.style.color=C.t4;e.currentTarget.style.borderBottomColor=C.t4}}>↳ Submit anyway</span>
      </div>}
    </div>

    {/* Right: state panel */}
    <div>
      <Card style={{position:"sticky",top:12}}>
        <div style={{fontSize:10,fontFamily:M,color:C.cy,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:10,display:"flex",alignItems:"center",gap:6}}><Dot c={C.cy} p/>Conversation State</div>

        {visibleFields.length===0?<div style={{fontSize:10.5,color:C.t4,fontFamily:M,lineHeight:1.55,padding:"10px 0"}}>Fields will appear here as the Copilot extracts them from your messages.</div>:<div style={{display:"flex",flexDirection:"column",gap:7}}>
          {visibleFields.map(([k,v])=>{
            const dispKey=k.replace(/([A-Z])/g," $1").replace(/^./,s=>s.toUpperCase());
            const dispVal=Array.isArray(v)?v.join(", "):String(v);
            return <div key={k} style={{display:"grid",gridTemplateColumns:"1fr 1.4fr",gap:8,padding:"5px 0",borderBottom:`1px solid ${C.br}33`}}>
              <div style={{fontSize:9,color:C.t3,fontFamily:M,letterSpacing:.5,textTransform:"uppercase",fontWeight:600}}>{dispKey}</div>
              <div style={{fontSize:11,color:C.t1,fontFamily:F,wordBreak:"break-word",animation:"flash .8s ease"}}>{dispVal}</div>
            </div>;
          })}
        </div>}

        <div style={{marginTop:14,padding:9,background:C.s1,borderRadius:4,borderLeft:`2px solid ${C.tl}`,fontSize:10,color:C.t3,lineHeight:1.5,fontFamily:M}}>
          <div style={{color:C.tl,fontWeight:600,letterSpacing:.8,marginBottom:3}}>ON SUBMIT</div>
          Full transcript ({history.filter(m=>m.role==="user").length} user msgs) + extracted fields will be filed as a Copilot-sourced ticket. Agent Layer will route it.
        </div>
      </Card>

      <div style={{marginTop:10,padding:10,background:C.s1,borderRadius:4,borderLeft:`2px solid ${C.am}`,fontSize:9.5,color:C.t3,lineHeight:1.55,fontFamily:M}}>
        <div style={{color:C.am,fontWeight:600,marginBottom:3,letterSpacing:.5}}>💡 COPILOT vs FORM</div>
        Copilot is ideal for complex or uncertain intake. For known request types (standard NDA, FAQ), the form is faster. Switch anytime.
      </div>
    </div>
  </div>;
}

// ══════════════════════════════════════════════════
// NewRequestV8 — the wrapper that gates form vs copilot
// ══════════════════════════════════════════════════
// Note: in the standalone demo file, we ship a compact v7-form-compatible version here so the file
// runs alone. On splice, this replaces the existing NewRequestTab — the legacy form body moves
// from v7 (lines 1512–1712) into <LegacyFormInner/> verbatim.
function NewRequestV8({store,goToInbox,goToCockpit,settings,prefillDesc}){
  // If we arrive with a pre-filled description (from "File a ticket" in
  // Ask Aurora), skip the picker and go straight to the legacy form so
  // the user sees their question already in the description box.
  const[mode,setMode]=useState(prefillDesc?"form":"picker");
  const[initialType,setInitialType]=useState(prefillDesc?"Other":null);

  const pickSimple=(type)=>{ setInitialType(type); setMode("form"); };
  const pickComplex=(type)=>{ setInitialType(type); setMode("copilot"); };

  if(mode==="picker"){
    return <TypePickerGate onPickSimple={pickSimple} onPickComplex={pickComplex}/>;
  }

  if(mode==="copilot"){
    return <div>
      <div style={{marginBottom:10}}>
        <span onClick={()=>setMode("picker")} style={{display:"inline-flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:10.5,color:C.cy,padding:"3px 6px",fontFamily:M,letterSpacing:1,textTransform:"uppercase"}}>← Change path</span>
      </div>
      <CopilotChat initialType={initialType} onFiled={(t)=>{/* stays on confirmation */}} onSwitchToForm={()=>{setMode("form");}} store={store} settings={settings}/>
    </div>;
  }

  // mode === "form" — standalone v7-compatible form for the demo file.
  // On splice, this entire function body is replaced by the existing v7 NewRequestTab with the
  // picker + switch wrapped around it.
  return <div>
    <div style={{marginBottom:10}}>
      <span onClick={()=>setMode("picker")} style={{display:"inline-flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:10.5,color:C.cy,padding:"3px 6px",fontFamily:M,letterSpacing:1,textTransform:"uppercase"}}>← Change path</span>
      <span onClick={()=>setMode("copilot")} style={{marginLeft:14,display:"inline-flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:10.5,color:C.em,padding:"3px 6px",fontFamily:M,letterSpacing:1,textTransform:"uppercase"}}>⇄ Switch to Copilot</span>
    </div>
    <LegacyFormInner store={store} initialType={initialType} initialDesc={prefillDesc} goToInbox={goToInbox} settings={settings}/>
  </div>;
}

// ── Compact v7-compatible form for the standalone demo.
//    On integration with aegis-v7-aurora.jsx, this is replaced by the real v7.2 NewRequestTab
//    (lines 1512–1712 in v7), just re-routed through the v8 addTicketAndRunAgent path.
function LegacyFormInner({store,initialType,initialDesc,goToInbox,settings}){
  // Session-resolved default for the requester `from` field. Same
  // pattern as CopilotChat: pre-fill, leave editable. Phase 1a.
  const{user:sessionUser}=useCurrentUser();
  const[form,setForm]=useState({from:"",dept:"Product",type:initialType||"Contract Review",desc:initialDesc||"",attach:0,urgency:"Standard"});
  useEffect(()=>{
    if(sessionUser?.name&&!form.from) setForm(f=>f.from?f:{...f,from:sessionUser.name});
  },[sessionUser,form.from]);
  const[submitted,setSubmitted]=useState(false);
  const[createdTicket,setCreatedTicket]=useState(null);
  const[busy,setBusy]=useState(false);

  const regexTriage=useMemo(()=>classifyIntakeRegex(form.desc,form.dept),[form.desc,form.dept]);

  const submit=async()=>{
    if(!form.from||form.desc.length<10) return;
    setBusy(true);
    const triage=regexTriage||{cat:"General Inquiry",priority:"Medium",team:"Routing Triage",sla:"24 hrs",slaHours:24,rule:"default",conf:55,risk:"Low",note:"Manual triage",hrs:2,source:"fallback"};
    const now=new Date();
    const id="REQ-"+(3700+Math.floor(Math.random()*300));
    const priority=form.urgency==="Emergency — deal blocker"?"Critical":form.urgency==="Urgent — deadline this week"?"High":triage.priority;
    const ticket={
      id,_source:"form",from:form.from,dept:form.dept,type:form.type,priority,
      submitted:now.toISOString().slice(0,16).replace("T"," "),submittedTs:now.getTime(),
      sla:triage.sla,slaHours:triage.slaHours,slaStatus:"On Track",desc:form.desc,
      assigned:"Cockpit Queue",status:"Awaiting Triage",stage:"new",
      seeded:false,attach:form.attach,
      workflow:[{label:"Submitted",done:true},{label:"Agent Analysis",active:true},{label:"Attorney Review"},{label:"Close"}],
      aiTriage:{category:triage.cat,riskFlag:`${triage.risk} — ${triage.note}`,suggestedAssignee:triage.team,estimatedHours:triage.hrs,similarMatters:Math.floor(Math.random()*40)+5,confidence:triage.conf,routingRule:`${triage.rule}: ${triage.cat}`,source:triage.source||"regex"},
      conversation:null,agentRecommendation:null,triagedBy:null,triagedAt:null,triagedAction:null,
    };
    const {ticket:saved,agent,recommendation}=await store.addTicketAndRunAgent(ticket);
    setCreatedTicket({...saved,_agent:agent,_rec:recommendation});
    setSubmitted(true);
    setBusy(false);
  };

  if(submitted&&createdTicket) return <div style={{maxWidth:780,margin:"0 auto"}}>
    <div style={{background:C.gnG,border:`1px solid ${C.gn}`,borderLeft:`4px solid ${C.gn}`,padding:20,marginBottom:14,animation:"fu .4s ease"}}>
      <div style={{fontSize:11,fontFamily:M,color:C.gn,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>✓ REQUEST SUBMITTED · PERSISTED · AGENT PROCESSED</div>
      <div style={{fontSize:20,fontFamily:SR,color:C.t1,marginBottom:4}}>Ticket <span style={{color:C.gn,fontFamily:M}}>{createdTicket.id}</span> filed</div>
      <div style={{fontSize:12,color:C.t2,lineHeight:1.6}}>
        {createdTicket._agent?<>Routed to <span style={{color:C.pp,fontWeight:600}}>{createdTicket._agent.name}</span> · Agent recommendation generated ({Math.round((createdTicket._rec?.confidence||0)*100)}% confidence) · </>:<>No matching agent — will land in Cockpit for manual triage · </>}
        Triage in Cockpit (press g+c from anywhere).
      </div>
    </div>
    <div style={{display:"flex",gap:8}}>
      <div onClick={()=>window.location.reload()} style={{padding:"9px 16px",border:`1px solid ${C.br}`,color:C.t2,fontSize:10,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase"}}>File Another</div>
      <div onClick={goToInbox} style={{padding:"9px 16px",background:C.cy,color:C.bg,fontSize:10,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase",fontWeight:600}}>→ Inbox</div>
    </div>
  </div>;

  return <div style={{maxWidth:780,margin:"0 auto"}}>
    <Card>
      <FormField label="Your Name" required>
        <input value={form.from} onChange={e=>setForm({...form,from:e.target.value})} placeholder="Jane Smith" style={inputStyle}/>
      </FormField>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <FormField label="Department" required>
          <select value={form.dept} onChange={e=>setForm({...form,dept:e.target.value})} style={inputStyle}>
            {["Product","Engineering","Sales","HR","Finance","Procurement","Marketing","Operations","Legal","Executive"].map(d=><option key={d} value={d} style={{background:C.s1}}>{d}</option>)}
          </select>
        </FormField>
        <FormField label="Urgency">
          <select value={form.urgency} onChange={e=>setForm({...form,urgency:e.target.value})} style={inputStyle}>
            {["Standard","Priority","Urgent — deadline this week","Emergency — deal blocker"].map(d=><option key={d} value={d} style={{background:C.s1}}>{d}</option>)}
          </select>
        </FormField>
      </div>
      <FormField label="Request Type" required>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
          {["Contract Review","NDA Request","IP Question","Privacy Question","Trademark Check","Vendor Due Diligence","Contract Question","Legal Question — General","Other"].map(t=>{
            const active=form.type===t;
            return <div key={t} onClick={()=>setForm({...form,type:t})} style={{padding:"7px 8px",border:`1px solid ${active?C.cy:C.br}`,background:active?C.cy+"22":"transparent",cursor:"pointer",fontSize:10,fontFamily:M,letterSpacing:.5,color:active?C.cy:C.t2,textAlign:"center",transition:"all .12s"}}>{t}</div>;
          })}
        </div>
      </FormField>
      <FormField label="Describe your request" required sub="Be specific — regex + Claude triage and agent routing use this">
        <textarea value={form.desc} onChange={e=>setForm({...form,desc:e.target.value})} placeholder="E.g. Mutual NDA for discussions with Acme Corp — 2-year term, Delaware law." rows={5} style={{...inputStyle,resize:"vertical",fontFamily:F,minHeight:100}}/>
      </FormField>
      <div style={{display:"flex",gap:10,marginTop:16,flexWrap:"wrap"}}>
        <div onClick={submit} style={{padding:"11px 22px",background:form.from&&form.desc.length>10&&!busy?C.cy:C.br,color:form.from&&form.desc.length>10&&!busy?C.bg:C.t4,fontSize:11,fontFamily:M,letterSpacing:1.8,cursor:form.from&&form.desc.length>10&&!busy?"pointer":"not-allowed",textTransform:"uppercase",fontWeight:600}}>{busy?"◎ Triaging + Routing to Agent…":"→ Submit · Route to Agent"}</div>
      </div>
      <div style={{marginTop:14,padding:11,background:C.s1,borderRadius:5,borderLeft:`2px solid ${C.em}`,fontSize:10.5,color:C.t2,fontFamily:M,lineHeight:1.55}}>
        <div style={{color:C.em,fontWeight:600,marginBottom:3,letterSpacing:.5}}>v8 FLOW</div>
        On submit: regex triage runs → ticket saved → agent router picks best fit → recommendation generated → ticket lands in Cockpit for attorney review. <span style={{color:C.am}}>Agents never auto-close.</span>
      </div>
    </Card>
  </div>;
}


// ═════════════ s9_cockpit.jsx ═════════════
// ══════════════════════════════════════════════════
// TRIAGE COCKPIT (System 2)
// ══════════════════════════════════════════════════
// Keyboard-first single-ticket focus view. The attorney's home screen.
// Core mental model: one ticket at a time, agent recommendation front-and-center,
// decide in seconds, move on. All shortcuts mirror Gmail/Linear conventions.

// Agent recommendation panel — the right-side card attorneys spend most time on
function AgentRecommendationPanel({ticket,rec,agent,editing,draftEdit,onDraftEdit,onApprove,onEdit,onReject,onEscalate,onSaveEdit,onCancelEdit}){
  if(!rec){
    return <Card style={{background:C.s1,borderLeft:`3px solid ${C.t4}`}}>
      <SH icon="◌" title="NO AGENT RECOMMENDATION" sub="This ticket has no matching agent — manual triage required" c={C.t3}/>
      <div style={{fontSize:11,color:C.t3,lineHeight:1.6,marginTop:10}}>No agent in the registry could handle this ticket. Review the description and route manually via Reassign <Kbd k="r"/>.</div>
    </Card>;
  }

  const action=rec.suggestedAction;
  const actionColor=action==="approve-and-send"?C.gn:action==="escalate"?C.rd:action==="flag-for-review"?C.am:C.cy;
  const actionLabel=action==="approve-and-send"?"APPROVE & SEND":action==="escalate"?"ESCALATE":action==="flag-for-review"?"FLAG FOR REVIEW":action.toUpperCase();

  return <Card style={{background:C.cd,borderLeft:`3px solid ${actionColor}`}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,gap:10}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:10,fontFamily:M,color:C.pp,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:5,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <Dot c={C.pp} p/> AGENT RECOMMENDATION
          {agent&&<AgentBadge agent={agent}/>}
        </div>
        <div style={{fontSize:16,fontFamily:SR,color:C.t1,lineHeight:1.3}}>Recommends <em style={{color:actionColor,fontStyle:"italic"}}>{actionLabel.toLowerCase()}</em></div>
      </div>
      <ConfidenceBadge conf={rec.confidence}/>
    </div>

    {/* Drafted response */}
    <div style={{marginTop:14}}>
      <div style={{fontSize:9.5,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:5,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span>Drafted Response</span>
        {!editing&&rec.draftedResponse&&<span onClick={onEdit} style={{cursor:"pointer",color:C.cy,fontSize:9,letterSpacing:1}}><Kbd k="e"/> edit</span>}
      </div>
      {editing?<>
        <textarea value={draftEdit} onChange={e=>onDraftEdit(e.target.value)} rows={Math.min(Math.max((draftEdit.match(/\n/g)||[]).length+3,5),18)} style={{...inputStyle,width:"100%",fontFamily:SR,fontSize:12,lineHeight:1.55,resize:"vertical",background:C.s2,borderColor:C.cy}}/>
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <div onClick={onSaveEdit} style={{padding:"6px 14px",background:C.gn,color:C.bg,fontSize:9.5,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase",fontWeight:700}}>Save + Approve</div>
          <div onClick={onCancelEdit} style={{padding:"6px 12px",border:`1px solid ${C.br}`,color:C.t2,fontSize:9.5,fontFamily:M,letterSpacing:1.2,cursor:"pointer",textTransform:"uppercase"}}>Cancel</div>
        </div>
      </>:<div style={{background:C.s1,padding:12,borderRadius:4,border:`1px solid ${C.br}`,fontSize:12,color:C.t1,fontFamily:SR,lineHeight:1.6,whiteSpace:"pre-wrap",maxHeight:280,overflowY:"auto"}}>
        {rec.draftedResponse||<span style={{color:C.t4,fontStyle:"italic",fontFamily:M}}>(No drafted response — agent requested escalation or manual routing)</span>}
      </div>}
    </div>

    {/* Reasoning */}
    <div style={{marginTop:12,padding:10,background:C.blG,borderLeft:`2px solid ${C.bl}`,borderRadius:3}}>
      <div style={{fontSize:9,fontFamily:M,color:C.bl,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:4}}>AGENT REASONING</div>
      <div style={{fontSize:11,color:C.t2,lineHeight:1.5,fontFamily:F}}>{rec.reasoning}</div>
    </div>

    {/* Concerns */}
    {rec.concerns&&rec.concerns.length>0&&<div style={{marginTop:10,padding:10,background:C.amG,borderLeft:`2px solid ${C.am}`,borderRadius:3}}>
      <div style={{fontSize:9,fontFamily:M,color:C.am,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:5}}>⚠ CONCERNS ({rec.concerns.length})</div>
      {rec.concerns.map((c,i)=><div key={i} style={{fontSize:11,color:C.t2,lineHeight:1.5,marginBottom:i<rec.concerns.length-1?4:0}}>• {c}</div>)}
    </div>}

    {/* Precedent / source links */}
    {rec.precedentLinks&&rec.precedentLinks.length>0&&<div style={{marginTop:10}}>
      <div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:5}}>SOURCES & PRECEDENTS</div>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {rec.precedentLinks.map((p,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 9px",background:C.s1,borderRadius:3,fontSize:10.5,fontFamily:M,color:C.t2}}>
          <span style={{fontSize:11,color:C.cy}}>◎</span>
          <span style={{color:C.cy,fontWeight:600,letterSpacing:.3}}>{p.id}</span>
          <span style={{color:C.t3}}>—</span>
          <span>{p.title}</span>
        </div>)}
      </div>
    </div>}

    {/* Alternative tone */}
    {rec.alternativeTone&&<div style={{marginTop:10,padding:9,background:C.s2,borderLeft:`2px solid ${C.t3}`,borderRadius:3}}>
      <div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:3}}>ALTERNATIVE TONE</div>
      <div style={{fontSize:11,color:C.t2,lineHeight:1.5,fontFamily:SR,fontStyle:"italic"}}>"{rec.alternativeTone}"</div>
    </div>}

    {/* Action buttons — disabled during edit mode */}
    {!editing&&<div style={{display:"flex",gap:7,marginTop:14,flexWrap:"wrap"}}>
      {action==="approve-and-send"&&<div onClick={onApprove} style={{padding:"9px 14px",background:C.gn,color:C.bg,fontSize:10,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase",fontWeight:700,display:"flex",alignItems:"center",gap:7}}><Kbd k="a" active/> Approve + Send</div>}
      {action==="flag-for-review"&&<div onClick={onApprove} style={{padding:"9px 14px",background:C.am,color:C.bg,fontSize:10,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase",fontWeight:700,display:"flex",alignItems:"center",gap:7}}><Kbd k="a" active/> Approve as-is</div>}
      {action==="escalate"&&<div onClick={onEscalate} style={{padding:"9px 14px",background:C.rd,color:C.bone,fontSize:10,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase",fontWeight:700,display:"flex",alignItems:"center",gap:7}}><Kbd k="a" active/> Escalate</div>}
      {rec.draftedResponse&&<div onClick={onEdit} style={{padding:"9px 14px",border:`1px solid ${C.cy}`,color:C.cy,fontSize:10,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase",fontWeight:600,display:"flex",alignItems:"center",gap:7}}><Kbd k="e"/> Edit Draft</div>}
      <div onClick={onReject} style={{padding:"9px 14px",border:`1px solid ${C.rd}`,color:C.rd,fontSize:10,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase",fontWeight:600,display:"flex",alignItems:"center",gap:7}}><Kbd k="x"/> Reject</div>
    </div>}
  </Card>;
}

// Ticket detail panel — the left side
function TicketDetailPanel({ticket}){
  const[convExpanded,setConvExpanded]=useState(false);
  if(!ticket) return null;
  const conv=ticket.conversation;
  const fromCopilot=ticket._source==="copilot";

  return <div>
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:12}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap",marginBottom:6}}>
            <span style={{fontSize:10,fontFamily:M,color:C.cy,letterSpacing:1.5,fontWeight:600}}>{ticket.id}</span>
            <Pill t={ticket.type} c={C.t2} g={C.s2}/>
            <Pill t={ticket.priority?.toUpperCase()} c={pc(ticket.priority)}/>
            <Pill t={ticket._source==="copilot"?"VIA COPILOT":"VIA FORM"} c={ticket._source==="copilot"?C.em:C.tl}/>
            {ticket.triagedBy&&<Pill t={`TRIAGED → ${ticket.triagedAction?.toUpperCase()}`} c={C.gn}/>}
          </div>
          <div style={{fontSize:16,fontFamily:SR,color:C.t1,lineHeight:1.35,marginBottom:8}}>{ticket.desc}</div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
        <div><div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1.2,textTransform:"uppercase",fontWeight:600,marginBottom:2}}>Requester</div><div style={{fontSize:11,color:C.t1}}>{ticket.from}</div><div style={{fontSize:9.5,color:C.t3,fontFamily:M}}>{ticket.dept}</div></div>
        <div><div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1.2,textTransform:"uppercase",fontWeight:600,marginBottom:2}}>Submitted</div><div style={{fontSize:11,color:C.t1,fontFamily:M}}>{ticket.age||"—"} ago</div><div style={{fontSize:9.5,color:C.t3,fontFamily:M}}>{ticket.submitted}</div></div>
        <div><div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1.2,textTransform:"uppercase",fontWeight:600,marginBottom:2}}>SLA</div><div style={{fontSize:11,color:ticket.slaStatus==="Overdue"?C.rd:ticket.slaStatus==="At Risk"?C.am:C.gn,fontFamily:M,fontWeight:600}}>{ticket.slaStatus} · {ticket.sla}</div><Bar pct={ticket.slaPct||0} c={ticket.slaStatus==="Overdue"?C.rd:ticket.slaStatus==="At Risk"?C.am:C.gn} h={3}/></div>
      </div>

      {ticket.aiTriage&&<div style={{padding:10,background:C.s1,borderRadius:4,borderLeft:`2px solid ${C.cy}`,marginBottom:10}}>
        <div style={{fontSize:9,fontFamily:M,color:C.cy,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:4}}>TRIAGE · {ticket.aiTriage.source?.toUpperCase()}</div>
        <div style={{fontSize:11,color:C.t1,lineHeight:1.5}}><span style={{color:C.t3}}>Category:</span> {ticket.aiTriage.category}</div>
        <div style={{fontSize:11,color:C.t1,lineHeight:1.5}}><span style={{color:C.t3}}>Risk:</span> {ticket.aiTriage.riskFlag}</div>
        <div style={{fontSize:11,color:C.t1,lineHeight:1.5}}><span style={{color:C.t3}}>Suggested:</span> {ticket.aiTriage.suggestedAssignee}</div>
        <div style={{fontSize:10,color:C.t3,fontFamily:M,marginTop:3}}>Confidence {ticket.aiTriage.confidence}% · {ticket.aiTriage.similarMatters} similar matters · {ticket.aiTriage.routingRule}</div>
      </div>}

      {ticket.workflow&&<WorkflowSteps steps={ticket.workflow}/>}

      {/* Copilot conversation — collapsible */}
      {fromCopilot&&conv&&conv.length>0&&<div style={{marginTop:14,borderTop:`1px solid ${C.br}`,paddingTop:12}}>
        <div onClick={()=>setConvExpanded(!convExpanded)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",padding:"4px 0"}}>
          <div style={{fontSize:10,fontFamily:M,color:C.em,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,display:"flex",alignItems:"center",gap:6}}><Dot c={C.em}/>COPILOT TRANSCRIPT ({conv.length} messages)</div>
          <span style={{fontSize:11,color:C.t3,fontFamily:M}}>{convExpanded?"▾ collapse":"▸ expand"}</span>
        </div>
        {convExpanded&&<div style={{marginTop:10,maxHeight:360,overflowY:"auto",padding:8,background:C.s1,borderRadius:4}}>
          {conv.map((m,i)=><ChatBubble key={i} role={m.role} d={i*15} meta={m.fieldsExtracted?`+ extracted: ${Object.keys(m.fieldsExtracted).join(", ")}`:null}>{m.content}</ChatBubble>)}
        </div>}
      </div>}

      {/* AI: Summarize for me */}
      <TicketSummaryButton ticket={ticket}/>
    </Card>
  </div>;
}

// Similar matters panel
function SimilarMattersPanel({currentTicket,allTickets}){
  const matters=useMemo(()=>findSimilarMatters(currentTicket,allTickets,3),[currentTicket,allTickets]);
  return <Card>
    <SH icon="◊" title="Similar Resolved Matters" sub={matters.length?`Top ${matters.length} closest matches`:"No prior matches — fresh territory"} c={C.tl}/>
    {matters.length===0?<div style={{fontSize:11,color:C.t3,padding:"6px 0",fontStyle:"italic",fontFamily:F}}>No resolved matters match this closely. Agent reasoning + manual discretion apply.</div>:
     <div style={{display:"flex",flexDirection:"column",gap:7}}>
      {matters.map(m=><SimilarMatterCard key={m.id} m={m} onClick={()=>{}}/>)}
    </div>}
  </Card>;
}

// Capacity panel
function CapacityPanel({allTickets,attorney}){
  // Current user's open load: tickets assigned to them or in Cockpit queue
  const myLoad=allTickets.filter(t=>t.stage!=="complete"&&t.status!=="Completed"&&t.status!=="Auto-Completed"&&(t.assigned===attorney||t.assigned==="Cockpit Queue"||t.triagedBy===attorney)).length;
  const totalOpen=allTickets.filter(t=>t.stage!=="complete"&&t.status!=="Completed"&&t.status!=="Auto-Completed").length;
  const teamAvg=Math.round(totalOpen/5); // assume 5-attorney team
  return <Card>
    <SH icon="◇" title="Your Capacity" sub="vs team average" c={C.gn}/>
    <CapacityMeter current={myLoad} avg={teamAvg||4} cap={20} label="Open matters"/>
    <div style={{marginTop:10,padding:8,background:C.s1,borderRadius:3,fontSize:10,color:C.t3,lineHeight:1.5,fontFamily:M}}>
      <div style={{color:C.t2,fontWeight:600,marginBottom:2,letterSpacing:.5}}>Suggested assignee</div>
      <div style={{fontSize:10.5,color:C.t1,fontFamily:F}}>{attorney}</div>
    </div>
  </Card>;
}

// Shortcut cheatsheet overlay — shown when user presses ?
function ShortcutCheatsheet({onClose}){
  const groups=[
    {label:"Navigation",items:[
      {k:"j",sub:"/↓",desc:"Next ticket"},{k:"k",sub:"/↑",desc:"Previous ticket"},
      {k:"/",desc:"Focus search"},{k:"Esc",desc:"Close overlay / deselect"},
    ]},
    {label:"Triage Actions",items:[
      {k:"a",desc:"Approve recommendation · send"},
      {k:"e",desc:"Edit drafted response inline"},
      {k:"r",desc:"Reassign to different team"},
      {k:"x",desc:"Reject recommendation"},
      {k:"c",desc:"Manual close (no send)"},
      {k:"s",desc:"Snooze (re-surface later)"},
    ]},
    {label:"Bulk",items:[
      {k:"b",desc:"Toggle bulk mode"},
      {k:"Space",desc:"Select/deselect in bulk mode"},
      {k:"a",desc:"(in bulk) Approve all selected — confirmation first"},
    ]},
    {label:"Help",items:[
      {k:"?",desc:"Show/hide this cheatsheet"},
    ]},
  ];
  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(11,16,32,.88)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",animation:"fu .2s ease"}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.cd,border:`1px solid ${C.br}`,borderLeft:`3px solid ${C.cy}`,borderRadius:8,padding:28,maxWidth:640,width:"90%",maxHeight:"82vh",overflowY:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
        <div>
          <div style={{fontSize:10,fontFamily:M,color:C.cy,letterSpacing:2,textTransform:"uppercase",fontWeight:600,marginBottom:4}}>KEYBOARD SHORTCUTS</div>
          <div style={{fontSize:18,fontFamily:SR,color:C.t1}}>Triage at keyboard speed</div>
        </div>
        <div onClick={onClose} style={{fontSize:18,color:C.t3,cursor:"pointer",padding:"0 8px"}}>✕</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
        {groups.map(g=><div key={g.label}>
          <div style={{fontSize:9.5,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:6,borderBottom:`1px solid ${C.br}`,paddingBottom:4}}>{g.label}</div>
          {g.items.map((it,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0"}}>
            <Kbd k={it.k} sub={it.sub}/>
            <span style={{fontSize:11,color:C.t2,lineHeight:1.4}}>{it.desc}</span>
          </div>)}
        </div>)}
      </div>
      <div style={{marginTop:18,padding:10,background:C.s1,borderLeft:`2px solid ${C.am}`,borderRadius:3,fontSize:10.5,color:C.t2,fontFamily:M,lineHeight:1.55}}>
        <span style={{color:C.am,fontWeight:600}}>Remember:</span> Every action is logged. Agents never auto-close. Your decision is final.
      </div>
    </div>
  </div>;
}

// Bulk confirmation card — shown when attorney presses 'a' in bulk mode
function BulkConfirmCard({selected,tickets,onConfirm,onCancel}){
  const selectedTickets=tickets.filter(t=>selected.includes(t.id));
  const[listExpanded,setListExpanded]=useState(false);
  const byAgent={};
  selectedTickets.forEach(t=>{
    const aid=t.agentRecommendation?.agentId||"no-agent";
    byAgent[aid]=(byAgent[aid]||0)+1;
  });
  return <div style={{position:"fixed",inset:0,background:"rgba(11,16,32,.9)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",animation:"fu .2s ease",padding:20}}>
    <Card style={{maxWidth:560,width:"100%",borderLeft:`4px solid ${C.am}`,background:C.cd}}>
      <div style={{fontSize:10,fontFamily:M,color:C.am,letterSpacing:2,textTransform:"uppercase",fontWeight:600,marginBottom:6}}>⚠ CONFIRM BULK APPROVAL</div>
      <div style={{fontSize:22,fontFamily:SR,color:C.t1,marginBottom:12}}>Approve <span style={{color:C.am}}>{selected.length}</span> recommendation{selected.length===1?"":"s"}?</div>
      <div style={{padding:12,background:C.amG,borderRadius:4,borderLeft:`2px solid ${C.am}`,fontSize:11.5,color:C.t2,lineHeight:1.55,marginBottom:14,fontFamily:F}}>
        You're about to bulk-send responses for all selected tickets. Each will be marked as approved by you, with the agent's drafted response sent to the requester. This action is logged.
      </div>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:9.5,fontFamily:M,color:C.t3,letterSpacing:1.2,textTransform:"uppercase",fontWeight:600,marginBottom:6}}>Breakdown by agent</div>
        {Object.entries(byAgent).map(([aid,count])=>{
          const agent=AGENTS_BY_ID[aid];
          return <div key={aid} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",fontSize:11,color:C.t1}}>
            <span style={{display:"flex",alignItems:"center",gap:6}}>{agent?<AgentBadge agent={agent}/>:<span style={{color:C.t3,fontFamily:M,fontSize:10}}>No agent</span>}</span>
            <span style={{fontFamily:M,color:C.t2}}>{count}</span>
          </div>;
        })}
      </div>
      <div onClick={()=>setListExpanded(!listExpanded)} style={{cursor:"pointer",display:"flex",justifyContent:"space-between",padding:"6px 0",borderTop:`1px solid ${C.br}`,borderBottom:`1px solid ${C.br}`,marginBottom:10,fontSize:10,fontFamily:M,color:C.t3,letterSpacing:1,textTransform:"uppercase"}}>
        <span>List of tickets ({selectedTickets.length})</span>
        <span>{listExpanded?"▾ collapse":"▸ expand"}</span>
      </div>
      {listExpanded&&<div style={{maxHeight:200,overflowY:"auto",marginBottom:12}}>
        {selectedTickets.map(t=><div key={t.id} style={{padding:"5px 0",fontSize:10.5,color:C.t2,fontFamily:M,borderBottom:`1px solid ${C.br}33`}}>
          <span style={{color:C.cy}}>{t.id}</span> · {t.from} · <span style={{color:C.t3}}>{(t.desc||"").slice(0,60)}…</span>
        </div>)}
      </div>}
      <div style={{display:"flex",gap:8}}>
        <div onClick={onConfirm} style={{padding:"10px 18px",background:C.gn,color:C.bg,fontSize:10.5,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase",fontWeight:700,flex:1,textAlign:"center"}}>✓ Approve All {selected.length}</div>
        <div onClick={onCancel} style={{padding:"10px 18px",border:`1px solid ${C.br}`,color:C.t2,fontSize:10.5,fontFamily:M,letterSpacing:1.5,cursor:"pointer",textTransform:"uppercase"}}>Cancel · Esc</div>
      </div>
    </Card>
  </div>;
}

// ══════════════════════════════════════════════════
// CockpitTab — the main component
// ══════════════════════════════════════════════════
function CockpitTab({store,cockpit}){
  // Session-resolved attribution (Phase 1a). cockpit.state.attorney
  // is null on a fresh load; we fall back to the Auth0-resolved
  // user. The server is still authoritative on persisted audit rows
  // (saveTicketsV8 overwrites triagedBy from the session) — this
  // value is for the Cockpit's header + optimistic display.
  const{user:sessionUser}=useCurrentUser();
  const attorney=cockpit.state.attorney||sessionUser?.name||"—";
  const allTickets=store.tickets;

  // Queue: awaiting-triage tickets first (newest first), then already-triaged below
  const queue=useMemo(()=>{
    const awaiting=allTickets.filter(t=>t.stage==="new"&&t.status!=="Snoozed"&&!t.triagedBy).sort((a,b)=>b.submittedTs-a.submittedTs);
    const already=allTickets.filter(t=>t.triagedBy&&t.stage!=="complete").sort((a,b)=>(b.triagedAt||0)-(a.triagedAt||0));
    return [...awaiting,...already];
  },[allTickets]);

  const[pos,setPos]=useState(0);
  const[editing,setEditing]=useState(false);
  const[draftEdit,setDraftEdit]=useState("");
  const[showCheatsheet,setShowCheatsheet]=useState(false);
  const[bulkMode,setBulkMode]=useState(false);
  const[selected,setSelected]=useState([]);
  const[showBulkConfirm,setShowBulkConfirm]=useState(false);
  const[search,setSearch]=useState("");
  const[showSearch,setShowSearch]=useState(false);
  const[toast,setToast]=useState(null);
  const searchRef=useRef(null);

  // Filter by search if active
  const visibleQueue=useMemo(()=>{
    if(!search.trim()) return queue;
    const q=search.toLowerCase();
    return queue.filter(t=>
      t.id.toLowerCase().includes(q)||
      (t.from||"").toLowerCase().includes(q)||
      (t.desc||"").toLowerCase().includes(q)||
      (t.type||"").toLowerCase().includes(q)||
      (t.aiTriage?.category||"").toLowerCase().includes(q));
  },[queue,search]);

  // Keep pos in range as queue changes
  useEffect(()=>{
    if(pos>=visibleQueue.length) setPos(Math.max(0,visibleQueue.length-1));
  },[visibleQueue.length,pos]);

  const current=visibleQueue[pos];

  const showToast=useCallback((msg,tone="gn")=>{
    setToast({msg,tone});
    setTimeout(()=>setToast(null),2400);
  },[]);

  const next=useCallback(()=>setPos(p=>Math.min(p+1,visibleQueue.length-1)),[visibleQueue.length]);
  const prev=useCallback(()=>setPos(p=>Math.max(p-1,0)),[]);

  const approve=useCallback(async()=>{
    if(editing||!current||!current.agentRecommendation) return;
    await store.recordTriageAction(current.id,"approved",{attorney,confidence:current.agentRecommendation.confidence});
    await cockpit.incrementTriaged();
    showToast(`✓ ${current.id} approved + sent`,"gn");
    setTimeout(next,200);
  },[current,editing,attorney,store,cockpit,next,showToast]);

  const reject=useCallback(async()=>{
    if(editing||!current) return;
    await store.recordTriageAction(current.id,"rejected",{attorney,confidence:current.agentRecommendation?.confidence,reason:"Attorney rejected recommendation"});
    await cockpit.incrementTriaged();
    showToast(`✕ ${current.id} rejected — queued for manual`,"rd");
    setTimeout(next,200);
  },[current,editing,attorney,store,cockpit,next,showToast]);

  const manualClose=useCallback(async()=>{
    if(editing||!current) return;
    await store.recordTriageAction(current.id,"manual-close",{attorney,reason:"Manual close — no agent draft sent"});
    await cockpit.incrementTriaged();
    showToast(`✓ ${current.id} manually closed`,"gn");
    setTimeout(next,200);
  },[current,editing,attorney,store,cockpit,next,showToast]);

  const snooze=useCallback(async()=>{
    if(editing||!current) return;
    await store.recordTriageAction(current.id,"snoozed",{attorney});
    showToast(`⏲ ${current.id} snoozed`,"am");
    setTimeout(next,200);
  },[current,editing,attorney,store,next,showToast]);

  const reassign=useCallback(async()=>{
    if(editing||!current) return;
    const team=window.prompt?window.prompt("Reassign to (team name):","Commercial Contracts"):"Commercial Contracts";
    if(!team) return;
    await store.recordTriageAction(current.id,"reassigned",{attorney,patch:{assigned:team,status:"Reassigned"}});
    await cockpit.incrementTriaged();
    showToast(`→ ${current.id} reassigned to ${team}`,"bl");
    setTimeout(next,200);
  },[current,editing,attorney,store,cockpit,next,showToast]);

  const startEdit=useCallback(()=>{
    if(!current?.agentRecommendation?.draftedResponse) return;
    setDraftEdit(current.agentRecommendation.draftedResponse);
    setEditing(true);
  },[current]);
  const cancelEdit=useCallback(()=>{ setEditing(false); setDraftEdit(""); },[]);
  const saveEdit=useCallback(async()=>{
    if(!current) return;
    await store.updateTicket(current.id,{
      agentRecommendation:{...current.agentRecommendation,draftedResponse:draftEdit,edited:true,editedAt:Date.now(),editedBy:attorney},
    });
    await store.recordTriageAction(current.id,"edited-approved",{attorney,confidence:current.agentRecommendation?.confidence});
    await cockpit.incrementTriaged();
    setEditing(false);setDraftEdit("");
    showToast(`✓ ${current.id} edited + sent`,"gn");
    setTimeout(next,200);
  },[current,draftEdit,attorney,store,cockpit,next,showToast]);

  // Bulk mode
  const toggleBulk=useCallback(()=>{ setBulkMode(b=>!b); setSelected([]); },[]);
  const toggleSelected=useCallback((id)=>{
    setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  },[]);
  const bulkApprove=useCallback(async()=>{
    if(selected.length===0) return;
    setShowBulkConfirm(true);
  },[selected]);
  const confirmBulkApprove=useCallback(async()=>{
    await store.bulkApprove(selected,attorney);
    // increment triaged counter per ticket
    for(let i=0;i<selected.length;i++) await cockpit.incrementTriaged();
    showToast(`✓ ${selected.length} tickets bulk-approved`,"gn");
    setShowBulkConfirm(false);setSelected([]);setBulkMode(false);
  },[selected,attorney,store,cockpit,showToast]);

  // Search
  const focusSearch=useCallback(()=>{
    setShowSearch(true);
    setTimeout(()=>searchRef.current?.focus(),30);
  },[]);

  // Keyboard handlers
  useKeyboardShortcuts({
    j:next,ArrowDown:next,
    k:prev,ArrowUp:prev,
    a:bulkMode?bulkApprove:approve,
    e:startEdit,
    r:reassign,
    x:reject,
    c:manualClose,
    s:snooze,
    b:toggleBulk,
    "?":()=>setShowCheatsheet(x=>!x),
    "/":focusSearch,
    Escape:()=>{
      if(showCheatsheet) setShowCheatsheet(false);
      else if(showBulkConfirm) setShowBulkConfirm(false);
      else if(editing) cancelEdit();
      else if(bulkMode){ setBulkMode(false); setSelected([]); }
      else if(showSearch){ setShowSearch(false); setSearch(""); }
    },
    " ":bulkMode&&current?()=>toggleSelected(current.id):null,
  },true);

  const recAgent=current?.agentRecommendation?AGENTS_BY_ID[current.agentRecommendation.agentId]:null;

  return <div style={{position:"relative"}}>
    {showCheatsheet&&<ShortcutCheatsheet onClose={()=>setShowCheatsheet(false)}/>}
    {showBulkConfirm&&<BulkConfirmCard selected={selected} tickets={visibleQueue} onConfirm={confirmBulkApprove} onCancel={()=>setShowBulkConfirm(false)}/>}

    {/* Cockpit header — status bar */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,padding:"10px 14px",background:C.cd,border:`1px solid ${C.br}`,borderLeft:`3px solid ${C.cy}`,borderRadius:6,gap:10,flexWrap:"wrap"}}>
      <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600}}>Queue</div>
          <div style={{fontSize:14,color:C.t1,fontFamily:SR}}>{visibleQueue.length>0?<><span style={{color:C.cy,fontFamily:M,fontWeight:600}}>{pos+1}</span> of {visibleQueue.length}</>:<span style={{color:C.t3}}>Empty</span>}</div>
        </div>
        <div style={{width:1,height:28,background:C.br}}/>
        <div>
          <div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600}}>Triaged today</div>
          <div style={{fontSize:14,color:C.gn,fontFamily:SR,fontWeight:500}}>{cockpit.state.triagedToday}</div>
        </div>
        <div style={{width:1,height:28,background:C.br}}/>
        <div>
          <div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600}}>Attorney</div>
          <div style={{fontSize:12,color:C.t1,fontFamily:M}}>{attorney}</div>
        </div>
      </div>
      <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
        {bulkMode&&<div style={{display:"flex",gap:7,alignItems:"center"}}>
          <Pill t={`BULK · ${selected.length} SELECTED`} c={C.am}/>
          {selected.length>0&&<div onClick={bulkApprove} style={{padding:"5px 10px",background:C.gn,color:C.bg,fontSize:9.5,fontFamily:M,letterSpacing:1.2,cursor:"pointer",textTransform:"uppercase",fontWeight:700}}>→ Approve {selected.length}</div>}
        </div>}
        {showSearch&&<input ref={searchRef} value={search} onChange={e=>setSearch(e.target.value)} placeholder="search id / requester / text" style={{...inputStyle,width:260,fontSize:10.5}}/>}
        <div onClick={()=>setShowCheatsheet(true)} style={{padding:"4px 8px",border:`1px solid ${C.br}`,borderRadius:3,cursor:"pointer",fontSize:10,fontFamily:M,color:C.t3,letterSpacing:.5,display:"flex",alignItems:"center",gap:5}}>{bulkMode?<Kbd k="a"/>:<Kbd k="?"/>} {bulkMode?"bulk approve":"help"}</div>
      </div>
    </div>

    {/* Main view: ticket + right panels */}
    {current?<div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr",gap:14}}>
      <div>
        {bulkMode&&<div onClick={()=>toggleSelected(current.id)} style={{padding:"8px 12px",marginBottom:10,background:selected.includes(current.id)?C.gnG:C.s1,border:`1px solid ${selected.includes(current.id)?C.gn:C.br}`,borderRadius:4,cursor:"pointer",display:"flex",alignItems:"center",gap:10,fontSize:11,fontFamily:M,color:selected.includes(current.id)?C.gn:C.t2,letterSpacing:1,textTransform:"uppercase",fontWeight:600}}>
          <span style={{fontSize:14}}>{selected.includes(current.id)?"☑":"☐"}</span>
          <span>{selected.includes(current.id)?"selected for bulk":"press space to select"}</span>
        </div>}
        <TicketDetailPanel ticket={current}/>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <AgentRecommendationPanel
          ticket={current}
          rec={current.agentRecommendation}
          agent={recAgent}
          editing={editing}
          draftEdit={draftEdit}
          onDraftEdit={setDraftEdit}
          onApprove={approve}
          onEdit={startEdit}
          onReject={reject}
          onEscalate={approve} /* escalate also records as triaged */
          onSaveEdit={saveEdit}
          onCancelEdit={cancelEdit}
        />
        <SimilarMattersPanel currentTicket={current} allTickets={allTickets}/>
        <CapacityPanel allTickets={allTickets} attorney={attorney}/>

        {/* Secondary actions */}
        <Card style={{background:C.s1}}>
          <div style={{fontSize:9.5,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:8}}>Other Actions</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            <div onClick={reassign} style={{padding:"6px 10px",background:C.s2,border:`1px solid ${C.br}`,borderRadius:3,cursor:"pointer",fontSize:10,fontFamily:M,color:C.t2,letterSpacing:.8,display:"flex",alignItems:"center",gap:6}}><Kbd k="r"/> Reassign</div>
            <div onClick={manualClose} style={{padding:"6px 10px",background:C.s2,border:`1px solid ${C.br}`,borderRadius:3,cursor:"pointer",fontSize:10,fontFamily:M,color:C.t2,letterSpacing:.8,display:"flex",alignItems:"center",gap:6}}><Kbd k="c"/> Manual Close</div>
            <div onClick={snooze} style={{padding:"6px 10px",background:C.s2,border:`1px solid ${C.br}`,borderRadius:3,cursor:"pointer",fontSize:10,fontFamily:M,color:C.t2,letterSpacing:.8,display:"flex",alignItems:"center",gap:6}}><Kbd k="s"/> Snooze</div>
            <div onClick={toggleBulk} style={{padding:"6px 10px",background:bulkMode?C.am+"22":C.s2,border:`1px solid ${bulkMode?C.am:C.br}`,borderRadius:3,cursor:"pointer",fontSize:10,fontFamily:M,color:bulkMode?C.am:C.t2,letterSpacing:.8,display:"flex",alignItems:"center",gap:6,fontWeight:bulkMode?600:400}}><Kbd k="b" active={bulkMode}/> Bulk</div>
            <div onClick={focusSearch} style={{padding:"6px 10px",background:C.s2,border:`1px solid ${C.br}`,borderRadius:3,cursor:"pointer",fontSize:10,fontFamily:M,color:C.t2,letterSpacing:.8,display:"flex",alignItems:"center",gap:6}}><Kbd k="/"/> Search</div>
          </div>
        </Card>
      </div>
    </div>:<Card style={{background:C.gnG,borderLeft:`3px solid ${C.gn}`,padding:32,textAlign:"center"}}>
      <div style={{fontSize:26,fontFamily:SR,color:C.t1,marginBottom:6}}>{search?"No matches":"Queue empty"}</div>
      <div style={{fontSize:12,color:C.t2,lineHeight:1.55,fontFamily:F,marginBottom:4}}>{search?"Try a different search term.":"No tickets awaiting triage. Inbox zero."}</div>
      <div style={{fontSize:10,color:C.t3,fontFamily:M,letterSpacing:.8}}>Triaged today: <span style={{color:C.gn,fontWeight:600}}>{cockpit.state.triagedToday}</span></div>
    </Card>}

    {/* Navigation hint bar — sticky bottom */}
    {current&&<div style={{marginTop:14,padding:"9px 14px",background:C.s1,borderRadius:4,border:`1px solid ${C.br}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,fontSize:10,fontFamily:M,color:C.t3,letterSpacing:.5}}>
      <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{display:"flex",gap:5,alignItems:"center"}}><Kbd k="j"/><Kbd k="k"/> navigate</span>
        <span style={{display:"flex",gap:5,alignItems:"center"}}><Kbd k="a"/> approve</span>
        <span style={{display:"flex",gap:5,alignItems:"center"}}><Kbd k="e"/> edit</span>
        <span style={{display:"flex",gap:5,alignItems:"center"}}><Kbd k="x"/> reject</span>
        <span style={{display:"flex",gap:5,alignItems:"center"}}><Kbd k="b"/> bulk</span>
        <span style={{display:"flex",gap:5,alignItems:"center"}}><Kbd k="?"/> all shortcuts</span>
      </div>
      <div>keyboard-first · press <Kbd k="?"/> anytime</div>
    </div>}

    {/* Toast */}
    {toast&&<div style={{position:"fixed",bottom:28,right:28,padding:"12px 18px",background:C.cd,border:`1px solid ${C[toast.tone]}`,borderLeft:`3px solid ${C[toast.tone]}`,borderRadius:5,fontSize:11.5,color:C.t1,fontFamily:M,letterSpacing:.3,zIndex:90,animation:"fu .2s ease",boxShadow:`0 4px 20px rgba(0,0,0,.4)`}}>{toast.msg}</div>}
  </div>;
}


// ═════════════ s10_agent_settings.jsx ═════════════
// ══════════════════════════════════════════════════
// AGENT SETTINGS PANEL
// ══════════════════════════════════════════════════
// Modal that shows: per-agent on/off toggle, today's activity stats, audit log viewer.

function AgentSettingsPanel({onClose,settings,toggle,log}){
  const[tab,setTab]=useState("agents"); // "agents" | "log"

  // Derive today's stats
  const stats=useMemo(()=>{
    const todayStart=new Date();todayStart.setHours(0,0,0,0);
    const todayLog=log.filter(e=>e.ts>=todayStart.getTime());
    return {
      recs:todayLog.filter(e=>e.type==="recommendation-generated").length,
      approved:todayLog.filter(e=>e.type==="attorney-approved"||e.type==="attorney-edited-approved").length,
      rejected:todayLog.filter(e=>e.type==="attorney-rejected").length,
      bulk:todayLog.filter(e=>e.type==="attorney-bulk-approve").reduce((n,e)=>n+(e.count||0),0),
      errors:todayLog.filter(e=>e.type==="agent-error").length,
      autoClosed:0, // v8 rule: agents never auto-close
    };
  },[log]);

  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(11,16,32,.88)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",animation:"fu .2s ease",padding:20}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.cd,border:`1px solid ${C.br}`,borderLeft:`3px solid ${C.pp}`,borderRadius:8,maxWidth:820,width:"100%",maxHeight:"88vh",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <div style={{padding:"18px 22px",borderBottom:`1px solid ${C.br}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{fontSize:10,fontFamily:M,color:C.pp,letterSpacing:2,textTransform:"uppercase",fontWeight:600,marginBottom:4}}>AGENT LAYER</div>
          <div style={{fontSize:20,fontFamily:SR,color:C.t1}}>Agent settings &amp; audit</div>
        </div>
        <div onClick={onClose} style={{fontSize:18,color:C.t3,cursor:"pointer",padding:"0 8px"}}>✕</div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",borderBottom:`1px solid ${C.br}`,padding:"0 22px"}}>
        {[["agents","Agents"],["log","Audit Log"]].map(([id,label])=>{
          const active=tab===id;
          return <div key={id} onClick={()=>setTab(id)} style={{padding:"10px 14px",fontSize:10,fontFamily:M,letterSpacing:1.5,textTransform:"uppercase",cursor:"pointer",color:active?C.pp:C.t3,borderBottom:`2px solid ${active?C.pp:"transparent"}`,fontWeight:600,marginBottom:-1}}>{label}</div>;
        })}
      </div>

      {/* Body */}
      <div style={{padding:"18px 22px",overflowY:"auto",flex:1}}>
        {tab==="agents"?<>
          {/* Today's activity */}
          <div style={{marginBottom:18}}>
            <div style={{fontSize:9.5,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:8}}>Today's activity</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
              {[
                {l:"Recommendations",v:stats.recs,c:C.pp},
                {l:"Approved",v:stats.approved+stats.bulk,c:C.gn},
                {l:"Rejected",v:stats.rejected,c:C.rd},
                {l:"Auto-Closed",v:stats.autoClosed,c:C.t3,note:"by design"},
              ].map((s,i)=><div key={i} style={{padding:10,background:C.s1,borderRadius:4,borderLeft:`2px solid ${s.c}`}}>
                <div style={{fontSize:9,fontFamily:M,color:C.t3,letterSpacing:1.2,textTransform:"uppercase",fontWeight:600,marginBottom:3}}>{s.l}</div>
                <div style={{fontSize:24,fontFamily:SR,color:s.c,fontWeight:400,lineHeight:1}}>{s.v}</div>
                {s.note&&<div style={{fontSize:8.5,color:C.t4,fontFamily:M,marginTop:2,fontStyle:"italic"}}>{s.note}</div>}
              </div>)}
            </div>
            {stats.errors>0&&<div style={{marginTop:8,padding:8,background:C.rdG,borderLeft:`2px solid ${C.rd}`,fontSize:10.5,color:C.t2,fontFamily:M}}>⚠ {stats.errors} agent error{stats.errors===1?"":"s"} today — check audit log.</div>}
          </div>

          {/* Agent toggles */}
          <div style={{fontSize:9.5,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:10}}>Agents</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {ALL_AGENTS.map(agent=>{
              const enabled=settings[agent.id]?.enabled!==false;
              return <div key={agent.id} style={{padding:12,background:C.s1,border:`1px solid ${C.br}`,borderLeft:`2px solid ${enabled?C.gn:C.t4}`,borderRadius:4}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:6}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                      <span style={{fontSize:14,color:C.pp}}>{agent.icon}</span>
                      <div style={{fontSize:12,color:C.t1,fontWeight:600,fontFamily:F}}>{agent.name}</div>
                    </div>
                    <div style={{fontSize:10,color:C.t3,lineHeight:1.4,fontFamily:F}}>{agent.description}</div>
                  </div>
                  <div onClick={()=>toggle(agent.id)} style={{width:36,height:20,background:enabled?C.gn:C.br,borderRadius:10,position:"relative",cursor:"pointer",transition:"background .15s",flexShrink:0}}>
                    <div style={{width:16,height:16,background:enabled?C.bg:C.t3,borderRadius:"50%",position:"absolute",top:2,left:enabled?18:2,transition:"left .15s"}}/>
                  </div>
                </div>
                <div style={{fontSize:9,fontFamily:M,color:enabled?C.gn:C.t4,letterSpacing:1,textTransform:"uppercase",fontWeight:600,marginTop:6}}>{enabled?"● ENABLED":"○ DISABLED"}</div>
              </div>;
            })}
          </div>

          <div style={{marginTop:16,padding:11,background:C.amG,borderLeft:`2px solid ${C.am}`,borderRadius:3,fontSize:10.5,color:C.t2,lineHeight:1.6,fontFamily:M}}>
            <span style={{color:C.am,fontWeight:600,letterSpacing:.5}}>v8 SAFETY RULE:</span> Agents <span style={{color:C.am,fontWeight:600}}>never auto-close tickets</span>. They produce recommendations. Every close is attorney-initiated, logged, and reversible.
          </div>
        </>:<>
          {/* Audit log viewer */}
          <div style={{fontSize:9.5,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:10}}>Recent activity ({log.length} total)</div>
          {log.length===0?<div style={{fontSize:11,color:C.t3,fontStyle:"italic",padding:"20px 0",textAlign:"center"}}>No agent activity yet.</div>:<div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:420,overflowY:"auto"}}>
            {log.slice(0,50).map((e,i)=><LogRow key={i} e={e}/>)}
          </div>}
        </>}
      </div>
    </div>
  </div>;
}

function LogRow({e}){
  const when=new Date(e.ts);
  const whenStr=when.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"});
  const types={
    "recommendation-generated":{icon:"◉",c:C.pp,label:"Agent generated recommendation"},
    "attorney-approved":{icon:"✓",c:C.gn,label:"Attorney approved"},
    "attorney-edited-approved":{icon:"✎",c:C.cy,label:"Attorney edited + approved"},
    "attorney-rejected":{icon:"✕",c:C.rd,label:"Attorney rejected"},
    "attorney-reassigned":{icon:"→",c:C.bl,label:"Attorney reassigned"},
    "attorney-manual-close":{icon:"✓",c:C.gn,label:"Attorney manual-closed"},
    "attorney-snoozed":{icon:"⏲",c:C.am,label:"Attorney snoozed"},
    "attorney-bulk-approve":{icon:"✓✓",c:C.gn,label:`Bulk-approved (${e.count||0})`},
    "no-agent-match":{icon:"◌",c:C.t3,label:"No agent matched"},
    "agent-error":{icon:"⚠",c:C.rd,label:"Agent error"},
  };
  const style=types[e.type]||{icon:"·",c:C.t3,label:e.type};
  return <div style={{display:"flex",alignItems:"flex-start",gap:10,padding:"7px 9px",background:C.s1,borderRadius:3,fontSize:10.5,fontFamily:M,color:C.t2,borderLeft:`2px solid ${style.c}`}}>
    <span style={{fontSize:11,color:style.c,fontFamily:M,width:18,textAlign:"center",flexShrink:0}}>{style.icon}</span>
    <div style={{flex:1,minWidth:0}}>
      <div style={{color:C.t1}}>{style.label}{e.ticketId?<> · <span style={{color:C.cy}}>{e.ticketId}</span></>:null}{e.ticketIds?<> · {e.ticketIds.length} tickets</>:null}{e.agentId?<> · <span style={{color:C.pp}}>{AGENTS_BY_ID[e.agentId]?.shortName||e.agentId}</span></>:null}</div>
      {(e.confidence!=null||e.reason||e.error)&&<div style={{fontSize:9.5,color:C.t3,marginTop:2}}>{e.confidence!=null&&<>conf {Math.round(e.confidence*100)}% · </>}{e.attorney&&<>by {e.attorney} · </>}{e.reason&&<>{e.reason}</>}{e.error&&<span style={{color:C.rd}}>{e.error}</span>}</div>}
    </div>
    <span style={{color:C.t4,fontSize:9.5,flexShrink:0}}>{whenStr}</span>
  </div>;
}



// ══════════════════════════════════════════════════
// v7.2 Preserved Sub-tabs: Inbox + Detail
// (Operate on v8 store — agent fields render gracefully when present)
// ══════════════════════════════════════════════════
function InboxTab({store,sel,setSel}){
  const[flt,setFlt]=useState("all");
  const tickets=store.tickets;
  const req=sel!==null?tickets.find(t=>t.id===sel):null;
  if(req) return <IntakeDetail req={req} store={store} onBack={()=>setSel(null)}/>;

  const filters=[
    {id:"all",l:"All",n:tickets.length,c:C.bl},
    {id:"overdue",l:"SLA Breached",n:tickets.filter(r=>r.slaStatus==="Overdue").length,c:C.rd},
    {id:"risk",l:"At Risk",n:tickets.filter(r=>r.slaStatus==="At Risk").length,c:C.am},
    {id:"review",l:"In Review",n:tickets.filter(r=>r.stage==="review").length,c:C.tl},
    {id:"auto",l:"Auto-Completed",n:tickets.filter(r=>r.status==="Auto-Completed").length,c:C.gn},
    {id:"new",l:"New (You)",n:tickets.filter(r=>!r.seeded).length,c:C.pp},
  ];
  const filtered=flt==="all"?tickets:flt==="overdue"?tickets.filter(r=>r.slaStatus==="Overdue"):flt==="risk"?tickets.filter(r=>r.slaStatus==="At Risk"):flt==="review"?tickets.filter(r=>r.stage==="review"):flt==="auto"?tickets.filter(r=>r.status==="Auto-Completed"):tickets.filter(r=>!r.seeded);

  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:14}}>
      {[{l:"Today's Requests",v:tickets.length,c:C.bl},
        {l:"Auto-Resolved",v:tickets.filter(r=>r.status==="Auto-Completed").length,c:C.gn,sub:tickets.length?Math.round(tickets.filter(r=>r.status==="Auto-Completed").length/tickets.length*100)+"% deflection":"—"},
        {l:"In Flight",v:tickets.filter(r=>r.stage==="review"||r.stage==="assigned").length,c:C.tl},
        {l:"SLA Breached",v:tickets.filter(r=>r.slaStatus==="Overdue").length,c:C.rd,sub:"Auto-escalated"},
        {l:"Avg Response",v:"3.2h",c:C.am,sub:"↓ 18% MoM"}].map((s,i)=>
        <div key={i} style={{padding:14,background:C.cd,border:`1px solid ${C.br}`,animation:`fu .25s ease ${i*40}ms both`}}>
          <div style={{fontSize:10,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>{s.l}</div>
          <div style={{fontSize:28,fontFamily:SR,fontWeight:400,color:s.c,lineHeight:1}}>{s.v}</div>
          {s.sub&&<div style={{fontSize:9.5,color:C.t4,marginTop:3,fontFamily:M}}>{s.sub}</div>}
        </div>)}
    </div>

    <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
      {filters.map(f=>{
        const active=flt===f.id;
        return <div key={f.id} onClick={()=>setFlt(f.id)} style={{padding:"5px 11px",border:`1px solid ${active?f.c:C.br}`,background:active?f.c+"18":"transparent",cursor:"pointer",transition:"all .15s",fontFamily:M,fontSize:10,letterSpacing:1,textTransform:"uppercase",color:active?f.c:C.t2}}>{f.l} <span style={{color:C.t3,marginLeft:4}}>{f.n}</span></div>;
      })}
    </div>

    <Card>
      <div style={{display:"grid",gridTemplateColumns:"75px 115px 95px 1fr 70px 130px 85px 95px",padding:"8px 10px",fontSize:9,fontWeight:600,color:C.t3,letterSpacing:1.2,textTransform:"uppercase",fontFamily:M,borderBottom:`1px solid ${C.br}`}}>
        <span>ID</span><span>Requester</span><span>Type</span><span>Description</span><span>Priority</span><span>SLA</span><span>Status</span><span>Assignee</span>
      </div>
      {filtered.length===0?<div style={{padding:"40px 10px",textAlign:"center",color:C.t4,fontSize:11,fontFamily:M}}>No tickets match this filter.</div>:filtered.map((r,i)=><div key={r.id} onClick={()=>setSel(r.id)} style={{display:"grid",gridTemplateColumns:"75px 115px 95px 1fr 70px 130px 85px 95px",padding:"10px 10px",borderBottom:`1px solid ${C.br}22`,cursor:"pointer",animation:`fu .25s ease ${i*25}ms both`,fontSize:11,alignItems:"center",background:r.slaStatus==="Overdue"?C.rdG:r.slaStatus==="At Risk"?C.amG:"transparent",transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=C.cdH} onMouseLeave={e=>e.currentTarget.style.background=r.slaStatus==="Overdue"?C.rdG:r.slaStatus==="At Risk"?C.amG:"transparent"}>
        <span style={{fontFamily:M,color:r.seeded?C.cy:C.pp,fontWeight:600,fontSize:10}}>{r.id}</span>
        <div><div style={{color:C.t1,fontWeight:500,fontSize:11}}>{r.from}</div><div style={{color:C.t4,fontSize:9}}>{r.dept}</div></div>
        <Pill t={r.type} c={C.pp}/>
        <span style={{color:C.t2,fontSize:10.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.desc.substring(0,70)}{r.desc.length>70?"…":""}</span>
        <Pill t={r.priority} c={pc(r.priority)}/>
        <div><div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:10,color:r.slaStatus==="Overdue"?C.rd:r.slaStatus==="At Risk"?C.am:C.gn,fontWeight:600,fontFamily:M,minWidth:40}}>{r.age}</span><div style={{flex:1,height:3,background:C.br,borderRadius:2,overflow:"hidden"}}><div style={{width:`${Math.min(r.slaPct,100)}%`,height:"100%",background:r.slaPct>100?C.rd:r.slaPct>70?C.am:C.gn}}/></div></div><div style={{fontSize:8.5,color:C.t4,marginTop:2,fontFamily:M}}>of {r.sla}</div></div>
        <Pill t={r.status} c={r.status==="Auto-Completed"?C.gn:r.status.includes("Escalated")?C.rd:r.status==="Triage"?C.am:C.tl}/>
        <span style={{fontSize:9.5,color:C.t3}}>{r.assigned}</span>
      </div>)}
    </Card>
  </div>;
}

// ── Detail view (with working quick-actions) ─────────
function IntakeDetail({req,store,onBack}){
  const advance=()=>{
    const stages=["new","triage","assigned","review","complete"];
    const idx=stages.indexOf(req.stage);
    if(idx<stages.length-1){
      const nextStage=stages[idx+1];
      const wf=req.workflow.map((s,i)=>i<=idx+1?{...s,done:i<=idx,active:i===idx+1&&nextStage!=="complete"}:{...s,done:false,active:false});
      if(nextStage==="complete") wf.forEach(s=>{s.done=true;s.active=false});
      store.updateTicket(req.id,{stage:nextStage,status:nextStage==="complete"?"Completed":nextStage==="review"?"In Review":nextStage==="assigned"?"Assigned":"Triage",workflow:wf});
    }
  };
  const escalate=()=>{
    store.updateTicket(req.id,{status:"Escalated to GC",priority:"Critical",assigned:"Mark Williams, GC + "+req.assigned});
  };
  const complete=()=>{
    const wf=req.workflow.map(s=>({...s,done:true,active:false}));
    store.updateTicket(req.id,{stage:"complete",status:"Completed",workflow:wf});
  };

  return <div>
    <div onClick={onBack} style={{display:"inline-flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:11,color:C.cy,marginBottom:12,padding:"3px 6px",fontFamily:M,letterSpacing:1}} onMouseEnter={e=>e.currentTarget.style.background=C.cy+"18"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>← Back to Inbox</div>

    <div style={{background:C.cd,border:`1px solid ${C.br}`,borderLeft:`3px solid ${pc(req.priority)}`,padding:18,marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:20}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
            <span style={{fontFamily:M,fontSize:11,color:C.cy,fontWeight:600,letterSpacing:.5}}>{req.id}</span>
            <Pill t={req.priority} c={pc(req.priority)}/>
            <Pill t={req.type} c={C.pp}/>
            <Pill t={req.status} c={req.status==="Auto-Completed"||req.status==="Completed"?C.gn:req.status.includes("Escalated")?C.rd:C.tl}/>
            {!req.seeded&&<Pill t="YOU CREATED" c={C.pp}/>}
          </div>
          <div style={{fontSize:16,fontWeight:400,color:C.t1,fontFamily:SR,lineHeight:1.35,marginBottom:8}}>{req.desc}</div>
          <div style={{fontSize:11,color:C.t3,fontFamily:M}}>From <span style={{color:C.t1}}>{req.from}</span> · {req.dept} · Submitted {req.submitted} · Assigned to <span style={{color:C.tl}}>{req.assigned}</span></div>
        </div>
        <div style={{textAlign:"right",minWidth:130}}>
          <div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:1.5,fontFamily:M,marginBottom:4}}>SLA {req.slaStatus}</div>
          <div style={{fontSize:22,fontWeight:400,color:req.slaStatus==="Overdue"?C.rd:req.slaStatus==="At Risk"?C.am:C.gn,fontFamily:SR,lineHeight:1}}>{req.age}</div>
          <div style={{fontSize:10,color:C.t4,marginTop:2,fontFamily:M}}>of {req.sla} window</div>
          <div style={{marginTop:8}}><Bar pct={req.slaPct} c={req.slaPct>100?C.rd:req.slaPct>70?C.am:C.gn} h={5}/></div>
          <div style={{fontSize:9.5,color:C.t4,marginTop:3,fontFamily:M}}>{req.slaPct}% elapsed</div>
        </div>
      </div>
    </div>

    <div style={{fontSize:11,fontWeight:600,color:C.cy,marginBottom:6,letterSpacing:1,textTransform:"uppercase",fontFamily:M}}>Request Workflow</div>
    <WorkflowSteps steps={req.workflow}/>

    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14,marginTop:14}}>
      <Card d={100}>
        <div style={{fontSize:11,fontWeight:600,color:C.tl,marginBottom:10,letterSpacing:1.2,fontFamily:M,textTransform:"uppercase",display:"flex",justifyContent:"space-between"}}>
          <span>◎ AI Triage Analysis</span>
          <span style={{fontSize:9,color:req.aiTriage.source==="claude"?C.em:C.t4,fontFamily:M,letterSpacing:1}}>{req.aiTriage.source==="claude"?"CLAUDE LLM":req.aiTriage.source==="regex"?"REGEX CLASSIFIER":"FALLBACK"}</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:12}}>
          <div style={{padding:10,background:C.s1,borderRadius:5}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:.8,fontWeight:600,marginBottom:3,fontFamily:M}}>Category</div><div style={{fontSize:11.5,fontWeight:600,color:C.t1}}>{req.aiTriage.category}</div></div>
          <div style={{padding:10,background:C.s1,borderRadius:5}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:.8,fontWeight:600,marginBottom:3,fontFamily:M}}>Est Hours</div><div style={{fontSize:20,fontWeight:400,color:C.tl,fontFamily:SR}}>{req.aiTriage.estimatedHours}</div></div>
          <div style={{padding:10,background:C.s1,borderRadius:5}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:.8,fontWeight:600,marginBottom:3,fontFamily:M}}>Similar</div><div style={{fontSize:20,fontWeight:400,color:C.bl,fontFamily:SR}}>{req.aiTriage.similarMatters||"—"}</div></div>
          <div style={{padding:10,background:C.s1,borderRadius:5}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:.8,fontWeight:600,marginBottom:3,fontFamily:M}}>Confidence</div><div style={{fontSize:20,fontWeight:400,color:req.aiTriage.confidence>90?C.gn:C.am,fontFamily:SR}}>{req.aiTriage.confidence}%</div></div>
        </div>
        <div style={{padding:11,background:req.aiTriage.riskFlag.startsWith("Critical")?C.rdG:req.aiTriage.riskFlag.startsWith("None")?C.gnG:C.amG,borderRadius:5,borderLeft:`3px solid ${req.aiTriage.riskFlag.startsWith("Critical")?C.rd:req.aiTriage.riskFlag.startsWith("None")?C.gn:C.am}`,marginBottom:10}}>
          <div style={{fontSize:9,fontWeight:600,color:C.t3,marginBottom:3,letterSpacing:1,textTransform:"uppercase",fontFamily:M}}>Risk Assessment</div>
          <div style={{fontSize:11.5,color:C.t1,lineHeight:1.5}}>{req.aiTriage.riskFlag}</div>
        </div>
        <div style={{padding:10,background:C.s1,borderRadius:5,borderLeft:`2px solid ${C.cy}`}}>
          <div style={{fontSize:9,fontWeight:600,color:C.t3,marginBottom:3,letterSpacing:1,textTransform:"uppercase",fontFamily:M}}>Routing Rule Applied</div>
          <div style={{fontSize:11,color:C.t1,fontFamily:M}}>{req.aiTriage.routingRule}</div>
        </div>
      </Card>

      <Card d={150}>
        <div style={{fontSize:11,fontWeight:600,color:C.am,marginBottom:10,letterSpacing:1.2,fontFamily:M,textTransform:"uppercase"}}>⚡ Quick Actions</div>
        {[
          {l:req.stage==="complete"?"✓ Completed":"Advance Stage",c:C.bl,i:"→",fn:advance,disabled:req.stage==="complete"},
          {l:"Escalate to GC",c:C.rd,i:"⚡",fn:escalate,disabled:req.status==="Escalated to GC"},
          {l:"Mark Complete",c:C.gn,i:"✓",fn:complete,disabled:req.stage==="complete"},
        ].map((a,i)=><div key={i} onClick={a.disabled?null:a.fn} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 11px",background:C.s1,borderRadius:4,cursor:a.disabled?"not-allowed":"pointer",marginBottom:6,border:`1px solid ${C.br}`,transition:"all .15s",opacity:a.disabled?.4:1}} onMouseEnter={e=>{if(a.disabled)return;e.currentTarget.style.borderColor=a.c;e.currentTarget.style.background=a.c+"18"}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.br;e.currentTarget.style.background=C.s1}}>
          <span style={{fontSize:13,color:a.c,width:18,textAlign:"center"}}>{a.i}</span>
          <span style={{fontSize:11,color:C.t1,flex:1}}>{a.l}</span>
        </div>)}
        <div style={{marginTop:12,padding:10,background:C.s1,borderRadius:4,borderLeft:`2px solid ${C.tl}`}}>
          <div style={{fontSize:9,color:C.tl,textTransform:"uppercase",letterSpacing:1.2,fontFamily:M,marginBottom:4}}>Changes Persist</div>
          <div style={{fontSize:10,color:C.t2,lineHeight:1.5}}>Every action updates the ticket store. Refresh the page — your changes are still here.</div>
        </div>
      </Card>
    </div>
  </div>;
}

// ── New Request Form (wired with real AI + persistence) ──

// ══════════════════════════════════════════════════
// v7.2 Preserved Sub-tabs: Kanban · SLA · Routing · Self-Service
// ══════════════════════════════════════════════════
function KanbanTab({store}){
  const[dragging,setDragging]=useState(null);
  const tickets=store.tickets;
  const stages=[
    {id:"new",label:"New",c:C.bl,desc:"Just submitted"},
    {id:"triage",label:"AI Triage",c:C.am,desc:"Being classified"},
    {id:"assigned",label:"Assigned",c:C.pp,desc:"Owner notified"},
    {id:"review",label:"In Review",c:C.tl,desc:"Active work"},
    {id:"complete",label:"Complete",c:C.gn,desc:"Resolved"},
  ];

  const onDrop=async(stageId)=>{
    if(!dragging) return;
    const ticket=tickets.find(t=>t.id===dragging);
    if(!ticket||ticket.stage===stageId){ setDragging(null); return; }
    const stageIdx=stages.findIndex(s=>s.id===stageId);
    const wf=ticket.workflow.map((s,i)=>({
      ...s,
      done:i<stageIdx,
      active:i===stageIdx&&stageId!=="complete",
    }));
    if(stageId==="complete") wf.forEach(s=>{s.done=true;s.active=false});
    const statusMap={new:"Triage",triage:"Triage",assigned:"Assigned",review:"In Review",complete:"Completed"};
    await store.updateTicket(dragging,{stage:stageId,status:statusMap[stageId],workflow:wf});
    setDragging(null);
  };

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <div style={{fontSize:11,color:C.t3,fontFamily:M,letterSpacing:.5}}>Drag cards between columns — changes persist to the ticket store · {tickets.length} active matters</div>
      <div style={{display:"flex",gap:8,fontSize:10,fontFamily:M,color:C.t4,letterSpacing:1,textTransform:"uppercase"}}>
        <span><Dot c={C.gn}/> On Track</span>
        <span><Dot c={C.am}/> At Risk</span>
        <span><Dot c={C.rd}/> Breached</span>
      </div>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,height:"calc(100vh - 330px)",minHeight:520}}>
      {stages.map((stage,si)=>{
        const col=tickets.filter(it=>it.stage===stage.id);
        return <div key={stage.id} onDragOver={e=>e.preventDefault()} onDrop={()=>onDrop(stage.id)} style={{background:C.s1,border:`1px solid ${C.br}`,borderTop:`3px solid ${stage.c}`,borderRadius:"0 0 6px 6px",display:"flex",flexDirection:"column",overflow:"hidden",animation:`fu .25s ease ${si*50}ms both`}}>
          <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.br}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:stage.c,fontFamily:M,letterSpacing:1.2,textTransform:"uppercase"}}>{stage.label}</div>
              <div style={{fontSize:9,color:C.t4,marginTop:1}}>{stage.desc}</div>
            </div>
            <div style={{padding:"2px 8px",background:stage.c+"22",color:stage.c,fontSize:11,fontFamily:M,fontWeight:700,borderRadius:3}}>{col.length}</div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:8,display:"flex",flexDirection:"column",gap:7}}>
            {col.length===0?<div style={{fontSize:10,color:C.t4,textAlign:"center",padding:"30px 8px",fontFamily:M,letterSpacing:.5}}>— empty —</div>:col.map((it,i)=><div key={it.id} draggable onDragStart={()=>setDragging(it.id)} onDragEnd={()=>setDragging(null)} style={{padding:10,background:C.cd,border:`1px solid ${C.br}`,borderLeft:`3px solid ${pc(it.priority)}`,borderRadius:4,cursor:"grab",opacity:dragging===it.id?.4:1,transition:"opacity .15s,border-color .15s",animation:`fu .2s ease ${i*30}ms both`}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.brL} onMouseLeave={e=>e.currentTarget.style.borderColor=C.br}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <span style={{fontSize:9,color:it.seeded?C.cy:C.pp,fontFamily:M,fontWeight:600,letterSpacing:.5}}>{it.id}</span>
                <Dot c={it.slaStatus==="Overdue"?C.rd:it.slaStatus==="At Risk"?C.am:C.gn} p={it.slaStatus!=="On Track"}/>
              </div>
              <div style={{fontSize:10.5,color:C.t1,lineHeight:1.4,marginBottom:6,fontWeight:500,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{it.desc}</div>
              <div style={{display:"flex",gap:4,marginBottom:5,flexWrap:"wrap"}}>
                <Pill t={it.priority} c={pc(it.priority)}/>
                <Pill t={it.type} c={C.pp}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:9,color:C.t4,fontFamily:M,borderTop:`1px solid ${C.br}33`,paddingTop:5,marginTop:3}}>
                <span style={{color:C.t3}}>{it.from.split(",")[0]}</span>
                <span style={{color:it.slaStatus==="Overdue"?C.rd:it.slaStatus==="At Risk"?C.am:C.gn,fontWeight:600}}>{it.age}</span>
              </div>
            </div>)}
          </div>
          <div style={{padding:"6px 10px",borderTop:`1px solid ${C.br}`,fontSize:9,color:C.t4,fontFamily:M,display:"flex",justifyContent:"space-between"}}>
            <span>{col.filter(c=>c.priority==="Critical").length} critical</span>
            <span>{col.length} total</span>
          </div>
        </div>;
      })}
    </div>
  </div>;
}

// ── SLA Dashboard (computed live from store) ─────────
function SLATab({store}){
  const tickets=store.tickets;
  const totalActive=tickets.length;
  const onTrack=tickets.filter(t=>t.slaStatus==="On Track").length;
  const atRisk=tickets.filter(t=>t.slaStatus==="At Risk").length;
  const breached=tickets.filter(t=>t.slaStatus==="Overdue").length;
  const overallSla=totalActive?Math.round(onTrack/totalActive*100):100;

  // Compute per-team from live tickets
  const teamMap={};
  tickets.forEach(t=>{
    const team=t.assigned.split(",")[0].replace(/AI Auto-.*/,"AI Auto-Resolve");
    if(!teamMap[team]) teamMap[team]={team,active:0,onTrack:0,atRisk:0,breached:0,totalHours:0};
    teamMap[team].active++;
    teamMap[team].totalHours+=t.slaPct/100*t.slaHours;
    if(t.slaStatus==="Overdue") teamMap[team].breached++;
    else if(t.slaStatus==="At Risk") teamMap[team].atRisk++;
    else teamMap[team].onTrack++;
  });
  const teams=Object.values(teamMap).map(t=>({
    ...t,
    avgResp:t.active?(t.totalHours/t.active).toFixed(1)+"h":"—",
    slaMet:t.active?Math.round(t.onTrack/t.active*100):100,
  })).sort((a,b)=>b.active-a.active);

  // Mock 24h burndown (could be persisted separately in future)
  const burndown=[95,94,92,88,85,89,93,96,94,91,88,85,89,92,94,93,91,89,87,88,90,92,94,overallSla];

  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
      {[
        {l:"Overall SLA Met",v:overallSla+"%",c:overallSla>=95?C.gn:overallSla>=90?C.am:C.rd,sub:"Target: 95%"},
        {l:"Active Matters",v:totalActive,c:C.bl,sub:`Across ${teams.length} teams`},
        {l:"At-Risk Count",v:atRisk,c:C.am,sub:">70% SLA elapsed"},
        {l:"Breached",v:breached,c:C.rd,sub:"Auto-escalated"},
      ].map((s,i)=><div key={i} style={{padding:14,background:C.cd,border:`1px solid ${C.br}`,animation:`fu .25s ease ${i*40}ms both`}}>
        <div style={{fontSize:10,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>{s.l}</div>
        <div style={{fontSize:32,fontFamily:SR,fontWeight:400,color:s.c,lineHeight:1}}>{s.v}</div>
        <div style={{fontSize:10,color:C.t4,marginTop:4,fontFamily:M}}>{s.sub}</div>
      </div>)}
    </div>

    <Card d={50} style={{marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:600,color:C.tl,marginBottom:10,letterSpacing:1.2,fontFamily:M,textTransform:"uppercase",display:"flex",justifyContent:"space-between"}}>
        <span>◷ SLA Compliance — Last 24 Hours</span>
        <span style={{fontSize:10,color:C.t4}}>Rolling · updates with store</span>
      </div>
      <div style={{display:"flex",alignItems:"flex-end",gap:3,height:120,marginBottom:8}}>
        {burndown.map((v,i)=>{
          const color=v>=95?C.gn:v>=90?C.am:C.rd;
          return <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
            <div style={{width:"100%",height:`${v}%`,background:color,borderRadius:"2px 2px 0 0",animation:`bi .6s ease ${i*25}ms both`,"--w":`${v}%`,opacity:.85}}/>
            <div style={{fontSize:8,color:C.t4,fontFamily:M}}>{i%4===0?(i<10?"0"+i:i)+"h":""}</div>
          </div>;
        })}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:9.5,color:C.t4,fontFamily:M,letterSpacing:.5,borderTop:`1px solid ${C.br}33`,paddingTop:8}}>
        <span>24h ago</span><span style={{color:C.gn}}>▬ SLA Target 95%</span><span>Now ({overallSla}%)</span>
      </div>
    </Card>

    <Card d={100}>
      <div style={{fontSize:11,fontWeight:600,color:C.bl,marginBottom:12,letterSpacing:1.2,fontFamily:M,textTransform:"uppercase"}}>▤ SLA by Team · Live from store</div>
      <div style={{display:"grid",gridTemplateColumns:"1.4fr 70px 70px 70px 70px 90px 1fr",padding:"8px 10px",fontSize:9,fontWeight:600,color:C.t3,letterSpacing:1.2,textTransform:"uppercase",fontFamily:M,borderBottom:`1px solid ${C.br}`,marginBottom:4}}>
        <span>Team</span><span>Active</span><span style={{color:C.gn}}>On Track</span><span style={{color:C.am}}>At Risk</span><span style={{color:C.rd}}>Breached</span><span>Avg Resp</span><span>SLA Met</span>
      </div>
      {teams.length===0?<div style={{padding:"30px 10px",textAlign:"center",color:C.t4,fontSize:11,fontFamily:M}}>No tickets in store.</div>:teams.map((t,i)=><div key={t.team} style={{display:"grid",gridTemplateColumns:"1.4fr 70px 70px 70px 70px 90px 1fr",padding:"10px 10px",borderBottom:`1px solid ${C.br}22`,fontSize:11,alignItems:"center",animation:`fu .25s ease ${i*25}ms both`}}>
        <span style={{color:C.t1,fontWeight:500}}>{t.team}</span>
        <span style={{fontFamily:M,color:C.bl,fontWeight:600}}>{t.active}</span>
        <span style={{fontFamily:M,color:C.gn}}>{t.onTrack}</span>
        <span style={{fontFamily:M,color:t.atRisk>0?C.am:C.t4}}>{t.atRisk}</span>
        <span style={{fontFamily:M,color:t.breached>0?C.rd:C.t4,fontWeight:t.breached>0?700:400}}>{t.breached}</span>
        <span style={{fontFamily:M,color:C.t2,fontSize:10.5}}>{t.avgResp}</span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{flex:1,height:5,background:C.br,borderRadius:3,overflow:"hidden"}}><div style={{width:`${t.slaMet}%`,height:"100%",background:t.slaMet>=95?C.gn:t.slaMet>=90?C.am:C.rd,animation:"bi .8s ease both","--w":`${t.slaMet}%`}}/></div>
          <span style={{fontSize:10,fontFamily:M,color:t.slaMet>=95?C.gn:t.slaMet>=90?C.am:C.rd,fontWeight:600,minWidth:30}}>{t.slaMet}%</span>
        </div>
      </div>)}
    </Card>

    {(atRisk>0||breached>0)&&<Card d={150} style={{marginTop:14}}>
      <div style={{fontSize:11,fontWeight:600,color:C.rd,marginBottom:10,letterSpacing:1.2,fontFamily:M,textTransform:"uppercase"}}>⚠ Active Breaches & At-Risk Matters</div>
      {tickets.filter(r=>r.slaStatus==="Overdue"||r.slaStatus==="At Risk").map((r,i)=><div key={r.id} style={{padding:"10px 12px",background:r.slaStatus==="Overdue"?C.rdG:C.amG,borderRadius:4,marginBottom:6,borderLeft:`3px solid ${r.slaStatus==="Overdue"?C.rd:C.am}`,animation:`fu .25s ease ${i*40}ms both`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontFamily:M,fontSize:10,color:C.cy,fontWeight:600}}>{r.id}</span>
            <Pill t={r.priority} c={pc(r.priority)}/>
            <span style={{fontSize:11,color:C.t1,fontWeight:500}}>{r.type}</span>
          </div>
          <div style={{fontSize:11,color:r.slaStatus==="Overdue"?C.rd:C.am,fontFamily:M,fontWeight:700}}>{r.slaPct}% of SLA · {r.age}</div>
        </div>
        <div style={{fontSize:10.5,color:C.t2,lineHeight:1.5}}>{r.desc.substring(0,110)}{r.desc.length>110?"…":""}</div>
        <div style={{fontSize:9.5,color:C.t4,marginTop:4,fontFamily:M}}>Assigned: {r.assigned} · From: {r.from} ({r.dept})</div>
      </div>)}
    </Card>}
  </div>;
}

// ── Smart Routing (static rules — could also live in storage later) ──
function RoutingTab(){
  const[selRule,setSelRule]=useState(null);
  const totalAuto=ROUTING_RULES.reduce((a,r)=>a+r.matches*r.autoPct/100,0);
  const totalMatches=ROUTING_RULES.reduce((a,r)=>a+r.matches,0);

  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
      {[
        {l:"Active Rules",v:ROUTING_RULES.filter(r=>r.enabled).length,c:C.cy,sub:`of ${ROUTING_RULES.length} total`},
        {l:"Matches (30d)",v:totalMatches,c:C.bl,sub:"Auto-routed"},
        {l:"Auto-Resolved",v:Math.round(totalAuto),c:C.gn,sub:`${Math.round(totalAuto/totalMatches*100)}% of matches`},
        {l:"Routing Accuracy",v:"96.8%",c:C.tl,sub:"Validated by attorneys"},
      ].map((s,i)=><div key={i} style={{padding:14,background:C.cd,border:`1px solid ${C.br}`,animation:`fu .25s ease ${i*40}ms both`}}>
        <div style={{fontSize:10,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>{s.l}</div>
        <div style={{fontSize:32,fontFamily:SR,fontWeight:400,color:s.c,lineHeight:1}}>{s.v}</div>
        <div style={{fontSize:10,color:C.t4,marginTop:4,fontFamily:M}}>{s.sub}</div>
      </div>)}
    </div>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      <Card>
        <div style={{fontSize:11,fontWeight:600,color:C.cy,marginBottom:12,letterSpacing:1.2,fontFamily:M,textTransform:"uppercase"}}>◈ Routing Rules</div>
        {ROUTING_RULES.map((r,i)=><div key={r.id} onClick={()=>setSelRule(r)} style={{padding:"10px 12px",background:selRule?.id===r.id?C.cdH:C.s1,border:`1px solid ${selRule?.id===r.id?C.cy:C.br}`,borderLeft:`3px solid ${r.enabled?C.gn:C.t4}`,borderRadius:4,marginBottom:6,cursor:"pointer",animation:`fu .2s ease ${i*25}ms both`,transition:"all .15s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontFamily:M,fontSize:10,color:C.cy,fontWeight:700,letterSpacing:.5}}>{r.id}</span>
              {r.autoPct===100&&<Pill t="AUTO" c={C.gn}/>}
              {r.autoPct>0&&r.autoPct<100&&<Pill t={`${r.autoPct}% AUTO`} c={C.am}/>}
              {r.autoPct===0&&<Pill t="HUMAN" c={C.bl}/>}
            </div>
            <span style={{fontSize:9.5,color:C.t4,fontFamily:M}}>{r.matches} matches</span>
          </div>
          <div style={{fontSize:11,color:C.t1,fontWeight:500,lineHeight:1.4,marginBottom:3}}>{r.cond}</div>
          <div style={{fontSize:10,color:C.t3,fontFamily:M}}>→ {r.action}</div>
        </div>)}
      </Card>

      <div>
        {selRule?<Card d={0} style={{borderLeft:`3px solid ${C.cy}`}}>
          <div style={{fontSize:11,fontWeight:600,color:C.cy,marginBottom:10,letterSpacing:1.2,fontFamily:M,textTransform:"uppercase"}}>Rule Detail · {selRule.id}</div>
          <div style={{padding:12,background:C.s1,borderRadius:4,marginBottom:10}}>
            <div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:1,fontFamily:M,marginBottom:4}}>When</div>
            <div style={{fontSize:12,color:C.t1,fontFamily:M,lineHeight:1.5}}>{selRule.cond}</div>
          </div>
          <div style={{padding:12,background:C.tlG,borderRadius:4,marginBottom:10,borderLeft:`2px solid ${C.tl}`}}>
            <div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:1,fontFamily:M,marginBottom:4}}>Then</div>
            <div style={{fontSize:12,color:C.t1,fontWeight:600,marginBottom:3}}>{selRule.action}</div>
            <div style={{fontSize:11,color:C.tl,fontFamily:M}}>Assigned to: {selRule.assignee}</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            <div style={{padding:10,background:C.s1,borderRadius:4,textAlign:"center"}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:1,fontFamily:M,marginBottom:3}}>Matches</div><div style={{fontSize:20,color:C.bl,fontFamily:SR,fontWeight:400}}>{selRule.matches}</div></div>
            <div style={{padding:10,background:C.s1,borderRadius:4,textAlign:"center"}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:1,fontFamily:M,marginBottom:3}}>Automated</div><div style={{fontSize:20,color:C.gn,fontFamily:SR,fontWeight:400}}>{selRule.autoPct}%</div></div>
            <div style={{padding:10,background:C.s1,borderRadius:4,textAlign:"center"}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:1,fontFamily:M,marginBottom:3}}>Status</div><div style={{fontSize:14,color:selRule.enabled?C.gn:C.t4,fontFamily:M,fontWeight:700,paddingTop:3}}>{selRule.enabled?"ACTIVE":"PAUSED"}</div></div>
          </div>
        </Card>:<Card>
          <div style={{fontSize:11,fontWeight:600,color:C.tl,marginBottom:12,letterSpacing:1.2,fontFamily:M,textTransform:"uppercase"}}>◉ Routing Flow</div>
          <div style={{padding:14,background:C.s1,borderRadius:5}}>
            {[
              {l:"Request arrives",desc:"Form submission",c:C.bl},
              {l:"Regex Classifier",desc:"Instant · free · covers 60% with ≥90% confidence",c:C.tl},
              {l:"Claude Fallback",desc:"When regex confidence < 90%, real LLM classifies",c:C.em},
              {l:"Deflection Check",desc:"KB hit? → auto-answer, no ticket",c:C.gn},
              {l:"Routing Decision",desc:"Auto-resolve · team assign · escalate",c:C.am},
              {l:"Persist + SLA Start",desc:"Ticket saved to window.storage · clock starts",c:C.pp},
            ].map((s,i)=><div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",paddingBottom:i<5?12:0,position:"relative"}}>
              <div style={{width:24,height:24,borderRadius:"50%",background:s.c+"22",border:`1px solid ${s.c}`,color:s.c,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,fontFamily:M,flexShrink:0,position:"relative",zIndex:1}}>{i+1}</div>
              {i<5&&<div style={{position:"absolute",left:12,top:24,bottom:0,width:1,background:C.br}}/>}
              <div style={{flex:1,paddingTop:2}}>
                <div style={{fontSize:12,color:C.t1,fontWeight:600}}>{s.l}</div>
                <div style={{fontSize:10.5,color:C.t3,marginTop:2}}>{s.desc}</div>
              </div>
            </div>)}
          </div>
          <div style={{fontSize:10,color:C.t4,marginTop:10,fontFamily:M,letterSpacing:.5,textAlign:"center"}}>Select a rule from the left to see details</div>
        </Card>}
      </div>
    </div>
  </div>;
}

// ── Self-Service (static KB) ─────────────────────────
function SelfServeTab({onFileTicket}){
  const[q,setQ]=useState("");
  const[sel,setSel]=useState(null);
  const results=useMemo(()=>{
    if(!q) return KB_TOPICS;
    const qq=q.toLowerCase();
    return KB_TOPICS.filter(t=>t.q.toLowerCase().includes(qq)||t.cat.toLowerCase().includes(qq)||t.answer.toLowerCase().includes(qq));
  },[q]);

  const totalResolved=KB_TOPICS.reduce((a,t)=>a+t.resolved,0);
  const avgDefl=Math.round(KB_TOPICS.reduce((a,t)=>a+t.deflectionRate,0)/KB_TOPICS.length);

  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
      {[
        {l:"KB Articles",v:KB_TOPICS.length,c:C.tl,sub:"AI-maintained"},
        {l:"Questions Resolved",v:totalResolved.toLocaleString(),c:C.gn,sub:"Last 90 days"},
        {l:"Avg Deflection",v:avgDefl+"%",c:C.cy,sub:"No legal ticket needed"},
        {l:"Hours Saved",v:"1,247",c:C.am,sub:"Attorney time · 90d"},
      ].map((s,i)=><div key={i} style={{padding:14,background:C.cd,border:`1px solid ${C.br}`,animation:`fu .25s ease ${i*40}ms both`}}>
        <div style={{fontSize:10,fontFamily:M,color:C.t3,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>{s.l}</div>
        <div style={{fontSize:32,fontFamily:SR,fontWeight:400,color:s.c,lineHeight:1}}>{s.v}</div>
        <div style={{fontSize:10,color:C.t4,marginTop:4,fontFamily:M}}>{s.sub}</div>
      </div>)}
    </div>

    {/* Ask Aurora — AI chat above the static FAQ list */}
    <AskAuroraChat onFileTicket={onFileTicket}/>

    <Card style={{marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:600,color:C.tl,marginBottom:10,letterSpacing:1.2,fontFamily:M,textTransform:"uppercase"}}>◎ Ask Before You Ticket</div>
      <div style={{position:"relative"}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search the legal knowledge base — try 'nda', 'sanctions', 'payment terms'..." style={{...inputStyle,fontSize:13,padding:"12px 14px 12px 38px"}}/>
        <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:15,color:C.t4}}>🔍</span>
      </div>
      <div style={{fontSize:10,color:C.t4,marginTop:6,fontFamily:M,letterSpacing:.5}}>{results.length} article{results.length===1?"":"s"} · Aurora AI reads your query and returns the best match</div>
    </Card>

    <div style={{display:"grid",gridTemplateColumns:sel?"1fr 1.3fr":"1fr",gap:14}}>
      <Card>
        <div style={{fontSize:11,fontWeight:600,color:C.cy,marginBottom:12,letterSpacing:1.2,fontFamily:M,textTransform:"uppercase"}}>▤ Top Articles</div>
        {results.length===0?<div style={{padding:"30px 10px",textAlign:"center",color:C.t4,fontSize:11,fontFamily:M}}>No matches — submit a legal ticket instead →</div>:results.map((t,i)=><div key={i} onClick={()=>setSel(t)} style={{padding:"11px 12px",background:sel===t?C.cdH:C.s1,border:`1px solid ${sel===t?C.tl:C.br}`,borderRadius:4,marginBottom:6,cursor:"pointer",animation:`fu .2s ease ${i*30}ms both`,transition:"all .15s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <Pill t={t.cat} c={C.pp}/>
            <span style={{fontSize:9.5,color:C.gn,fontFamily:M,fontWeight:600}}>{t.deflectionRate}% deflection</span>
          </div>
          <div style={{fontSize:12,color:C.t1,fontWeight:600,marginBottom:3,lineHeight:1.4}}>{t.q}</div>
          <div style={{fontSize:9.5,color:C.t4,fontFamily:M,letterSpacing:.3}}>Resolved {t.resolved.toLocaleString()}× · Source: {t.owner}</div>
        </div>)}
      </Card>

      {sel&&<Card d={0} style={{borderLeft:`3px solid ${C.tl}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:600,color:C.tl,letterSpacing:1.2,fontFamily:M,textTransform:"uppercase"}}>◎ Article Detail</div>
          <span onClick={()=>setSel(null)} style={{fontSize:14,color:C.t4,cursor:"pointer"}}>✕</span>
        </div>
        <Pill t={sel.cat} c={C.pp}/>
        <div style={{fontSize:17,color:C.t1,fontWeight:400,fontFamily:SR,marginTop:8,marginBottom:12,lineHeight:1.3}}>{sel.q}</div>
        <div style={{padding:14,background:C.gnG,borderRadius:4,borderLeft:`3px solid ${C.gn}`,marginBottom:12}}>
          <div style={{fontSize:9,color:C.gn,textTransform:"uppercase",letterSpacing:1.5,fontFamily:M,marginBottom:5,fontWeight:600}}>Answer</div>
          <div style={{fontSize:12,color:C.t1,lineHeight:1.65}}>{sel.answer}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
          <div style={{padding:10,background:C.s1,borderRadius:4,textAlign:"center"}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:1,fontFamily:M,marginBottom:3}}>Resolved</div><div style={{fontSize:18,color:C.gn,fontFamily:SR,fontWeight:400}}>{sel.resolved.toLocaleString()}</div></div>
          <div style={{padding:10,background:C.s1,borderRadius:4,textAlign:"center"}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:1,fontFamily:M,marginBottom:3}}>Deflection</div><div style={{fontSize:18,color:C.cy,fontFamily:SR,fontWeight:400}}>{sel.deflectionRate}%</div></div>
          <div style={{padding:10,background:C.s1,borderRadius:4,textAlign:"center"}}><div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:1,fontFamily:M,marginBottom:3}}>Source</div><div style={{fontSize:10,color:C.t1,fontFamily:M,paddingTop:4,lineHeight:1.3}}>{sel.owner}</div></div>
        </div>
      </Card>}
    </div>
  </div>;
}

// ══════════════════════════════════════════════════
// MAIN MODULE — IntakeView (merged v7.2 + v8)
// v8 tabs: Cockpit, NewRequest
// v7.2 tabs preserved: Inbox, Kanban, SLA, Routing, Self-Service
// ══════════════════════════════════════════════════
export function IntakeView(){
  const[tab,setTab]=useState("cockpit"); // default to Cockpit — v8 showcase
  const[sel,setSel]=useState(null);      // used by Inbox tab for drill-in
  const[showSettings,setShowSettings]=useState(false);
  const[prefillDesc,setPrefillDesc]=useState(""); // pre-fill from Ask Aurora "File a ticket"

  const agentSettingsHook=useAgentSettings();
  const store=useTicketStore(agentSettingsHook.settings);
  const cockpit=useCockpitState();
  const log=useAgentLog();

  const tabs=[
    {id:"inbox",label:"Inbox",icon:"◉"},
    {id:"new",label:"New Request",icon:"＋",v8:true},
    {id:"cockpit",label:"Triage Cockpit",icon:"⌘",v8:true},
    {id:"kanban",label:"Kanban",icon:"◱"},
    {id:"sla",label:"SLA Dashboard",icon:"◔"},
    {id:"routing",label:"Smart Routing",icon:"⚯",count:ROUTING_RULES.length},
    {id:"selfserve",label:"Self-Service",icon:"◈",count:KB_TOPICS.length},
  ];

  const awaiting=store.tickets.filter(t=>t.stage==="new"&&!t.triagedBy&&t.status!=="Snoozed").length;

  if(store.loading) return <div style={{padding:40,textAlign:"center",color:C.t3,fontFamily:M,fontSize:12,letterSpacing:1}}>
    ◎ LOADING AEGIS LEGAL INTAKE v8 …
  </div>;

  return <div>
    {showSettings&&<AgentSettingsPanel onClose={()=>setShowSettings(false)} settings={agentSettingsHook.settings} toggle={agentSettingsHook.toggle} log={log}/>}

    {/* Aurora eyebrow + title */}
    <div style={{marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:20,flexWrap:"wrap"}}>
      <div>
        <div style={{fontSize:10,fontFamily:M,letterSpacing:2,color:C.cy,textTransform:"uppercase",marginBottom:4}}>OPERATIONS · LEGAL · INTAKE v8</div>
        <div style={{fontSize:24,fontFamily:SR,color:C.t1,fontWeight:400,lineHeight:1.2}}>Mission control for every legal request — <em style={{color:C.cy,fontStyle:"italic"}}>triaged, drafted, resolved</em></div>
        <div style={{fontSize:11,color:C.t3,marginTop:4,fontFamily:M}}>Intake Copilot · Triage Cockpit · Agent Layer · persistent store · hybrid AI triage</div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
        {awaiting>0&&<Pill t={`${awaiting} AWAITING TRIAGE`} c={C.am}/>}
        <div style={{fontSize:9.5,fontFamily:M,color:C.gn,letterSpacing:1,textTransform:"uppercase",display:"flex",alignItems:"center",gap:5}}><Dot c={C.gn} p/>Storage · Synced</div>
        <div onClick={()=>setShowSettings(true)} title="Agent settings" style={{padding:"5px 10px",border:`1px solid ${C.br}`,color:C.t2,fontSize:9,fontFamily:M,letterSpacing:1,cursor:"pointer",textTransform:"uppercase",display:"flex",alignItems:"center",gap:5,transition:"all .12s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.pp;e.currentTarget.style.color=C.pp}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.br;e.currentTarget.style.color=C.t2}}>⚙ Agents</div>
        <div onClick={()=>{if(window.confirm("Reset all intake data (tickets, agent log, cockpit state, Copilot transcripts)?"))store.resetToSeed()}} style={{padding:"5px 10px",border:`1px solid ${C.br}`,color:C.t3,fontSize:9,fontFamily:M,letterSpacing:1,cursor:"pointer",textTransform:"uppercase"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.am;e.currentTarget.style.color=C.am}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.br;e.currentTarget.style.color=C.t3}}>↻ Reset Demo</div>
      </div>
    </div>

    {/* Tab bar */}
    <div style={{display:"flex",gap:2,marginBottom:14,borderBottom:`1px solid ${C.br}`,overflowX:"auto",flexWrap:"wrap"}}>
      {tabs.map(t=>{
        const active=tab===t.id;
        return <div key={t.id} onClick={()=>{setTab(t.id);setSel(null)}} style={{padding:"8px 14px",borderBottom:`2px solid ${active?C.cy:"transparent"}`,cursor:"pointer",transition:"all .15s",fontFamily:M,fontSize:10.5,letterSpacing:1.2,textTransform:"uppercase",color:active?C.cy:C.t3,fontWeight:active?600:400,display:"flex",alignItems:"center",gap:6,marginBottom:-1,whiteSpace:"nowrap"}} onMouseEnter={e=>{if(!active)e.currentTarget.style.color=C.t1}} onMouseLeave={e=>{if(!active)e.currentTarget.style.color=C.t3}}>
          <span style={{fontSize:12}}>{t.icon}</span>{t.label}
          {t.v8&&<Pill t="v8" c={C.em}/>}
          {t.count!==undefined&&<span style={{fontSize:9,padding:"1px 5px",background:active?C.cy+"22":C.br+"44",color:active?C.cy:C.t3,borderRadius:2,fontFamily:M}}>{t.count}</span>}
          {t.id==="cockpit"&&awaiting>0&&<span style={{fontSize:9,color:C.am,fontFamily:M,fontWeight:700}}>·{awaiting}</span>}
        </div>;
      })}
    </div>

    {/* v8 tabs */}
    {tab==="cockpit"&&<CockpitTab store={store} cockpit={cockpit}/>}
    {tab==="new"&&<NewRequestV8 store={store} goToInbox={()=>setTab("inbox")} goToCockpit={()=>setTab("cockpit")} settings={agentSettingsHook.settings} prefillDesc={prefillDesc}/>}

    {/* v7.2 preserved tabs */}
    {tab==="inbox"&&<InboxTab store={store} sel={sel} setSel={setSel}/>}
    {tab==="kanban"&&<KanbanTab store={store}/>}
    {tab==="sla"&&<SLATab store={store}/>}
    {tab==="routing"&&<RoutingTab/>}
    {tab==="selfserve"&&<SelfServeTab onFileTicket={(draft)=>{setPrefillDesc(draft||"");setTab("new");}}/>}
  </div>;
}


// ══════════════════════════════════════════════════
