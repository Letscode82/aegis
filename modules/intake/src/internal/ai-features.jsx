// AI-powered features bolted into existing views. Each one is a small,
// self-contained component that uses the shared `AIInsight` (atoms/ai-insight)
// or talks to /api/claude directly via callClaude{,JSON} for cases that
// don't fit the one-shot insight pattern (currently: only the chat).

import { useState, useMemo, useRef, useEffect } from "react";
import { C, F, M, SR, Pill, Card } from "@aegis/ui";
import { AIInsight, useAIInsight } from "./ai-insight";
import { callClaudeJSON, friendlyAIError } from "@aegis/ai";

// ════════════════════════════════════════════════════════════════════
// FEATURE 1 — Mission Control daily briefing
// ════════════════════════════════════════════════════════════════════

const BRIEFING_SYSTEM = `You are AEGIS, the General Counsel's AI briefing assistant. Generate a concise morning briefing in 3-4 short paragraphs. Cover: (1) headline status of the legal department this morning, (2) the 2-3 things that need GC attention today and why, (3) anything trending in the wrong direction. Tone: confident, brief, like a chief of staff. No bullet points. No preamble like "Good morning". Start directly with substance.`;

function buildBriefingPrompt(ctx) {
  return `Today: ${ctx.dateLabel}.
New tickets in last 24h: ${ctx.newTickets}.
Overdue / SLA-breached items: ${ctx.overdue}.
Escalated to GC: ${ctx.escalated}.
Critical alerts open: ${ctx.criticalAlerts}.
Pending approvals: ${ctx.pendingApprovals}.
Top priorities today:
${ctx.topPriorities.map((t, i) => `${i + 1}. ${t}`).join("\n")}
Domain posture (0-100): ${ctx.domains.map(d => `${d.name} ${d.score}`).join(" · ")}.
Composite enterprise posture: ${ctx.posture}/100.

Write the briefing now.`;
}

/**
 * @param {object} props
 * @param {object} props.context  Aggregated stats for the briefing prompt.
 */
export function MissionControlBriefing({ context }) {
  const cacheKey = `briefing:${context.dateLabel}`;
  const prompt = buildBriefingPrompt(context);

  const insight = useAIInsight({
    cacheKey,
    prompt,
    system: BRIEFING_SYSTEM,
    parseAs: "text",
    maxTokens: 700,
    autoLoad: true, // First-visit auto-load per spec
  });

  return (
    <div style={{ marginBottom: 18 }}>
      <AIInsight title="Brief me · This morning" state={insight} onRegenerate={insight.regenerate}>
        {(text) => (
          <div style={{
            fontFamily: SR, fontSize: 13.5, color: C.t1, lineHeight: 1.65,
            whiteSpace: "pre-wrap", letterSpacing: .1,
          }}>{text}</div>
        )}
      </AIInsight>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// FEATURE 2 — Cockpit "Summarize for me" on a ticket
// ════════════════════════════════════════════════════════════════════

const TICKET_SUMMARY_SYSTEM = `You are AEGIS, helping an attorney quickly understand a legal request. Summarize this ticket in exactly three sentences: (1) what the requester needs, (2) the legal/business context that makes it interesting or risky, (3) the suggested next action. Be precise. No fluff. No "In summary".`;

function buildTicketSummaryPrompt(ticket) {
  const conv = (ticket.conversation || []).slice(0, 8)
    .map(m => `${m.role.toUpperCase()}: ${(m.content || "").slice(0, 300)}`).join("\n");
  return `Ticket ID: ${ticket.id}
Type: ${ticket.type || "Unknown"}
Priority: ${ticket.priority || "Unknown"}
Requester: ${ticket.from || "Unknown"} (${ticket.dept || "no dept"})
Subject / Description: ${ticket.desc || "(none)"}
${ticket.aiTriage ? `Triage category: ${ticket.aiTriage.category}; risk: ${ticket.aiTriage.riskFlag}; suggested: ${ticket.aiTriage.suggestedAssignee}` : ""}
${conv ? `Copilot transcript (truncated):\n${conv}` : ""}

Write the three-sentence summary now.`;
}

/**
 * Toggleable "Summarize for me" panel rendered below a ticket detail card.
 *
 * @param {object} props
 * @param {object} props.ticket
 */
export function TicketSummaryButton({ ticket }) {
  const [open, setOpen] = useState(false);
  if (!ticket) return null;

  return (
    <div style={{ marginTop: 12 }}>
      {!open ? (
        <button onClick={() => setOpen(true)} style={{
          background: "transparent", border: `1px solid ${C.cy}55`, borderRadius: 4,
          padding: "6px 12px", fontSize: 10, fontFamily: M, color: C.cy, letterSpacing: 1.2,
          textTransform: "uppercase", cursor: "pointer", transition: "all .12s",
        }}
          onMouseEnter={e => { e.currentTarget.style.background = `${C.cy}18`; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
        >◎ Summarize for me</button>
      ) : (
        <TicketSummaryPanel ticket={ticket}/>
      )}
    </div>
  );
}

function TicketSummaryPanel({ ticket }) {
  const cacheKey = `ticket-summary:${ticket.id}`;
  const insight = useAIInsight({
    cacheKey,
    prompt: buildTicketSummaryPrompt(ticket),
    system: TICKET_SUMMARY_SYSTEM,
    parseAs: "text",
    maxTokens: 350,
    autoLoad: true,
  });

  return (
    <AIInsight title="AI summary" state={insight} onRegenerate={insight.regenerate} compact>
      {(text) => (
        <div style={{
          // Monospace per spec — "for clarity"
          fontFamily: M, fontSize: 11.5, color: C.t1, lineHeight: 1.6,
          whiteSpace: "pre-wrap", letterSpacing: .1,
        }}>{text}</div>
      )}
    </AIInsight>
  );
}

// ════════════════════════════════════════════════════════════════════
// FEATURE 3 — Self-Service "Ask Aurora" chat
// ════════════════════════════════════════════════════════════════════
//
// This one DOES NOT use AIInsight directly — chat is multi-turn, so it
// needs its own state machine. It still goes through callClaudeJSON
// (same proxy, same friendlyAIError on failure), and visually echoes
// the AIInsight aesthetic so the demo feels coherent.

const ASK_AURORA_KB = `Sample legal KB (use as background, not exhaustive):
- Standard NDA: MNDA-v4.2 template; 2-yr mutual confidentiality, Delaware law. Reusable for most counterparties.
- Sharing a contract with a vendor: OK if it's our standard template; flag for review if redlined or non-standard.
- Email retention: 7 years for finance, 4 years for general business, indefinite for active legal-hold custodians.
- BYOD: allowed with MDM enrollment; corp data must be containerized; reset on offboarding.
- M&A engagement: any deal over $50M requires GC sign-off and outside counsel from the approved panel.
- Travel approvals: only required for Russia, Belarus, Iran, North Korea, Syria, Cuba, or any country on OFAC SDN list.
- Remote work in new country: requires HR + tax review if >30 days; legal review if >90 days.
- Vendor onboarding: requires DPA v3.1, sanctions screen, anti-bribery attestation.
- Trademark question: route to IP team; we file via the approved IP firm panel.
- OSS license: MIT/Apache/BSD ok by default; GPL/AGPL requires legal review.
- Standard contract terms: Net-30, 12-mo term, auto-renew with 60-day opt-out.
- DPIA needed if processing special-category personal data, large-scale monitoring, or high-risk AI.
- Litigation hold notice: must be ack'd within 5 business days; non-ack escalates to GC.
- Data export to outside the EU: requires SCCs + transfer impact assessment.
- Subpoena response: do not respond directly; route to Litigation team within 24h.
- Settlement authority: GC can approve up to $5M; >$5M requires CEO and Board approval.
- Whistleblower complaint: route to Compliance Investigations; do not discuss with reporter further.
- Insider trading: trading windows close T-3 weeks before earnings; blackout list updated quarterly.
- Open-records / FOIA request: route to Government Affairs first.
- Records destruction: must follow retention schedule; never destroy if any litigation hold attaches.`;

const ASK_AURORA_SYSTEM = `You are Aurora, AEGIS's self-service legal assistant. Answer the user's question clearly and concisely (2-3 paragraphs max).
${ASK_AURORA_KB}

If you're confident, give the direct answer. If the question requires actual legal judgment or is sensitive (employment issues, litigation, regulatory matters, anything involving named individuals), do NOT attempt to answer — set "decline" to true and explain briefly that this needs an attorney's review.

Always include a disclaimer at the end of any direct answer: "This is general guidance, not legal advice."

Respond with ONLY this JSON:
{"answer": "your answer text (or empty string if declining)", "decline": false, "declineReason": "(only if decline=true) one-line why an attorney should look", "ticketDraft": "(only if decline=true) one-line description suitable for pre-filling a ticket"}`;

/**
 * Multi-turn chat shown above the FAQ list in Self-Service.
 * Each user turn fires one /api/claude call; responses are not cached
 * across questions because each is unique.
 *
 * @param {object} props
 * @param {(draft:string) => void} [props.onFileTicket]
 *        Called with a draft ticket description when Aurora declines and
 *        the user clicks "File a ticket".
 */
export function AskAuroraChat({ onFileTicket }) {
  /** @type {[Array<{role:string, content:string, decline?:boolean, ticketDraft?:string}>, Function]} */
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    const next = [...messages, { role: "user", content: q }];
    setMessages(next);
    setBusy(true);

    try {
      // Send the conversation context as a flattened transcript so a
      // single-shot prompt is easy to produce JSON from.
      const transcript = next.map(m => `${m.role === "user" ? "USER" : "AURORA"}: ${m.content}`).join("\n");
      const result = await callClaudeJSON(
        `Conversation so far:\n${transcript}\n\nNow respond to the latest USER turn as Aurora.`,
        { maxTokens: 600, system: ASK_AURORA_SYSTEM }
      );
      const reply = result.decline
        ? {
            role: "aurora",
            content: result.declineReason || "This needs an attorney's review. I'd recommend filing a ticket — I can help you do that.",
            decline: true,
            ticketDraft: result.ticketDraft || q,
          }
        : { role: "aurora", content: result.answer || "(no answer)" };
      setMessages(m => [...m, reply]);
    } catch (e) {
      console.error("[ask-aurora]", e);
      setMessages(m => [...m, { role: "aurora", content: friendlyAIError(e), error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      border: `1px solid ${C.cy}55`,
      background: `linear-gradient(180deg, ${C.cy}0a, transparent)`,
      borderRadius: 6,
      padding: "14px 16px",
      marginBottom: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{
          fontSize: 8.5, fontFamily: M, letterSpacing: 1.5, color: C.cy,
          padding: "2px 6px", border: `1px solid ${C.cy}55`, borderRadius: 3,
          textTransform: "uppercase", fontWeight: 700,
        }}>◎ AI</span>
        <span style={{ fontSize: 13, fontFamily: SR, color: C.t1 }}>
          Have a quick legal question? <em style={{ color: C.cy, fontStyle: "italic" }}>Ask Aurora.</em>
        </span>
      </div>

      {messages.length > 0 && (
        <div ref={scrollRef} style={{
          maxHeight: 280, overflowY: "auto", padding: 8,
          background: C.s1, borderRadius: 4, marginBottom: 10,
        }}>
          {messages.map((m, i) => (
            <ChatRow key={i} msg={m} onFileTicket={onFileTicket}/>
          ))}
          {busy && <ChatRow msg={{ role: "aurora", content: "" }} thinking/>}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={busy ? "Aurora is thinking…" : "Ask anything: \"What's our standard NDA term?\""}
          disabled={busy}
          style={{
            flex: 1, padding: "10px 12px", fontSize: 12, fontFamily: F, color: C.t1,
            background: C.s1, border: `1px solid ${C.br}`, borderRadius: 4, outline: "none",
          }}
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          style={{
            padding: "8px 14px", fontSize: 10, fontFamily: M, letterSpacing: 1.2,
            color: busy || !input.trim() ? C.t4 : C.bg,
            background: busy || !input.trim() ? C.s1 : C.cy,
            border: `1px solid ${busy || !input.trim() ? C.br : C.cy}`,
            borderRadius: 4, cursor: busy || !input.trim() ? "not-allowed" : "pointer",
            textTransform: "uppercase", fontWeight: 700,
          }}
        >Send</button>
      </div>
    </div>
  );
}

function ChatRow({ msg, thinking, onFileTicket }) {
  const isUser = msg.role === "user";
  return (
    <div style={{
      display: "flex", justifyContent: isUser ? "flex-end" : "flex-start",
      marginBottom: 10, animation: "fu .25s ease both",
    }}>
      <div style={{
        maxWidth: "82%",
        padding: "9px 12px",
        background: isUser ? C.cd : C.cd,
        border: `1px solid ${C.br}`,
        borderLeft: isUser ? `1px solid ${C.br}` : `2px solid ${C.cy}`,
        borderRadius: isUser ? "8px 8px 2px 8px" : "2px 8px 8px 8px",
        fontSize: 12, color: msg.error ? C.am : C.t1, lineHeight: 1.55,
        fontFamily: isUser ? F : SR,
      }}>
        {!isUser && (
          <div style={{
            fontSize: 8.5, fontFamily: M, color: C.cy, letterSpacing: 1.5,
            textTransform: "uppercase", marginBottom: 5, fontWeight: 700,
          }}>◎ AURORA</div>
        )}
        {thinking ? (
          <span style={{ display: "inline-flex", gap: 3 }}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{
                width: 5, height: 5, borderRadius: "50%", background: C.cy,
                display: "inline-block",
                animation: `typing 1.2s ${i * 0.18}s infinite ease-in-out`,
              }}/>
            ))}
          </span>
        ) : (
          <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
        )}
        {!isUser && !thinking && !msg.error && !msg.decline && (
          <div style={{ fontSize: 9.5, color: C.t4, marginTop: 6, fontStyle: "italic" }}>
            This is general guidance, not legal advice.
          </div>
        )}
        {msg.decline && onFileTicket && (
          <button
            onClick={() => onFileTicket(msg.ticketDraft)}
            style={{
              marginTop: 8, padding: "5px 10px", fontSize: 10, fontFamily: M,
              letterSpacing: 1.2, color: C.bg, background: C.cy,
              border: `1px solid ${C.cy}`, borderRadius: 4, cursor: "pointer",
              textTransform: "uppercase", fontWeight: 700,
            }}
          >→ File a ticket</button>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// FEATURE 4 — Matter risk scoring
// ════════════════════════════════════════════════════════════════════

const RISK_SYSTEM = `You are AEGIS, scoring legal matter risk. Output JSON only, no prose. Schema: { score: 'Low' | 'Medium' | 'High' | 'Critical', reasoning: 'one sentence' }. Consider: financial exposure, regulatory implications, counterparty risk, jurisdictional complexity, time pressure. Default to Medium when uncertain.`;

function buildRiskPrompt(matter) {
  return `Matter ID: ${matter.id}
Title: ${matter.title}
Type: ${matter.type}
Status: ${matter.status}
Priority: ${matter.priority}
Court / Jurisdiction: ${matter.court || "(unspecified)"}
Counsel: ${matter.counsel || "(none)"}${matter.partner ? ` (${matter.partner})` : ""}
Estimated exposure: ${matter.exposure || "(unspecified)"}
Next deadline: ${matter.nextDl || "(none)"} — ${matter.nextAct || ""}

Score it now (JSON only).`;
}

const RISK_COLORS = {
  Low: { c: "#33C48E", dots: 1 },     // green
  Medium: { c: "#E8A33B", dots: 2 },  // amber
  High: { c: "#E8793B", dots: 3 },    // orange
  Critical: { c: "#E83B3B", dots: 4 },// red
};

function riskMeta(score) {
  return RISK_COLORS[score] || RISK_COLORS.Medium;
}

/**
 * Inline risk badge for matter cards. Auto-fetches once per matter.id, cached.
 * Renders nothing while loading on the inline variant — the badge appears
 * when the score arrives. On error, renders a faint "—" so the layout
 * doesn't shift.
 *
 * @param {object} props
 * @param {object} props.matter
 * @param {boolean} [props.detailed=false]  If true, also shows the reasoning.
 */
export function MatterRiskBadge({ matter, detailed = false }) {
  const cacheKey = `risk:${matter.id}`;
  const insight = useAIInsight({
    cacheKey,
    prompt: buildRiskPrompt(matter),
    system: RISK_SYSTEM,
    parseAs: "json",
    maxTokens: 120,
    autoLoad: true,
  });

  const { status, data } = insight;
  if (status === "loading" || status === "idle") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1,
      }}>
        <span style={{ display: "inline-flex", gap: 2 }}>
          {[0, 1, 2].map(i => (
            <span key={i} style={{
              width: 4, height: 4, borderRadius: "50%", background: C.t4,
              display: "inline-block",
              animation: `typing 1.2s ${i * 0.18}s infinite ease-in-out`,
            }}/>
          ))}
        </span>
        <span>AI scoring</span>
      </span>
    );
  }
  if (status === "error" || !data || !data.score) {
    return <span style={{ fontSize: 9, fontFamily: M, color: C.t4 }}>—</span>;
  }

  const meta = riskMeta(data.score);
  const dots = (
    <span style={{ display: "inline-flex", gap: 3 }}>
      {[0, 1, 2, 3].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: "50%",
          background: i < meta.dots ? meta.c : `${C.br}88`,
          boxShadow: i < meta.dots ? `0 0 4px ${meta.c}66` : "none",
        }}/>
      ))}
    </span>
  );

  if (!detailed) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "2px 7px", border: `1px solid ${meta.c}55`, borderRadius: 3,
        background: `${meta.c}10`,
      }} title={data.reasoning}>
        <span style={{ fontSize: 8.5, fontFamily: M, letterSpacing: 1.5, color: C.cy, fontWeight: 700 }}>AI</span>
        {dots}
        <span style={{ fontSize: 10, fontFamily: M, color: meta.c, fontWeight: 700, letterSpacing: .5 }}>
          {data.score.toUpperCase()}
        </span>
      </span>
    );
  }

  // Detailed view: full insight card with reasoning.
  return (
    <AIInsight title="Risk score" state={insight} onRegenerate={insight.regenerate} compact>
      {(d) => {
        const meta2 = riskMeta(d.score);
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ display: "inline-flex", gap: 4 }}>
              {[0, 1, 2, 3].map(i => (
                <span key={i} style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: i < meta2.dots ? meta2.c : `${C.br}88`,
                  boxShadow: i < meta2.dots ? `0 0 6px ${meta2.c}66` : "none",
                }}/>
              ))}
            </span>
            <div>
              <div style={{ fontSize: 14, fontFamily: SR, color: meta2.c, letterSpacing: .5 }}>
                {d.score} risk
              </div>
              <div style={{ fontSize: 11, color: C.t2, marginTop: 2, lineHeight: 1.45 }}>
                {d.reasoning}
              </div>
            </div>
          </div>
        );
      }}
    </AIInsight>
  );
}

// ════════════════════════════════════════════════════════════════════
// Helpers — Mission Control briefing context assembly
// ════════════════════════════════════════════════════════════════════

/**
 * Assemble the briefing context object from ambient data on the page.
 * Pure function — no React hooks. Caller passes in the cross-cutting
 * aggregates (alerts, approvals, cases) alongside its own KPI data so
 * this module does not need to reach across the dependency graph.
 *
 * @param {object} input
 * @param {Array<{name:string,score:number}>} input.domains
 * @param {number} input.posture
 * @param {Array<{sev:string}>} input.alerts
 * @param {Array<unknown>} input.approvals
 * @param {Array<{priority:string,title:string,exposure:string}>} input.cases
 * @returns {object}
 */
export function buildBriefingContext({ domains, posture, alerts, approvals, cases }) {
  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const criticalAlerts = alerts.filter(a => a.sev === "critical").length;
  const pendingApprovals = approvals.length;
  const topPriorities = cases
    .filter(c => c.priority === "Critical" || c.priority === "High")
    .slice(0, 3)
    .map(c => `${c.title.split("—")[0].trim()} — exposure ${c.exposure}`);
  // Demo data — these would be wired to the ticket store in a real app.
  const newTickets = 7;
  const overdue = 3;
  const escalated = 2;
  return { dateLabel, newTickets, overdue, escalated, criticalAlerts, pendingApprovals, topPriorities, domains, posture };
}
