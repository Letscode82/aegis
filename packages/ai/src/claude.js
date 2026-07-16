// Valid, current Anthropic model id. "claude-sonnet-4-6" was NOT a real
// model — every call 404'd upstream and the agents degraded to their
// "AI unavailable" fallback even with a valid ANTHROPIC_API_KEY set. The
// server proxy can override this per-deployment via ANTHROPIC_MODEL.
export const CLAUDE_MODEL="claude-sonnet-5";
// Client-side calls go through our serverless proxy (api/claude.js) so the
// Anthropic API key stays on the server and CORS is avoided.
export const CLAUDE_ENDPOINT="/api/claude";

// Optional server-side transport. The browser path POSTs to the relative
// CLAUDE_ENDPOINT, which only resolves in a browser. Server runtimes (the
// intake agent worker) install a transport via setClaudeTransport() that
// calls Anthropic directly with the server-held key — so the SAME agent
// code runs unchanged on the server. Null in the browser (default fetch).
let _serverTransport=null;
export function setClaudeTransport(fn){ _serverTransport=fn; }

// Escape bare control characters (literal newlines / carriage returns /
// tabs) that appear INSIDE a JSON string value. Models frequently emit a
// multi-line "draftedResponse" with real line breaks instead of \n, which
// is invalid JSON and makes JSON.parse throw — the single most common
// reason a Claude-backed agent degrades to "AI unavailable" even though
// the call succeeded. A tiny state machine tracks string context so only
// in-string control chars are escaped; structural whitespace is untouched.
function escapeBareControlChars(s){
  let out="",inStr=false,esc=false;
  for(let i=0;i<s.length;i++){
    const ch=s[i];
    if(esc){ out+=ch; esc=false; continue; }
    if(ch==="\\"){ out+=ch; esc=true; continue; }
    if(ch==='"'){ inStr=!inStr; out+=ch; continue; }
    if(inStr){
      if(ch==="\n"){ out+="\\n"; continue; }
      if(ch==="\r"){ out+="\\r"; continue; }
      if(ch==="\t"){ out+="\\t"; continue; }
    }
    out+=ch;
  }
  return out;
}

// Strip accidental markdown fences, then parse
export function parseJSONLoose(text){
  if(!text) throw new Error("Empty response");
  let raw=text.trim();
  // Strip ```json ... ``` wrappers
  raw=raw.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"");
  // Find first { or [ and last matching brace to salvage output with leading/trailing prose
  const firstBrace=Math.min(...[raw.indexOf("{"),raw.indexOf("[")].filter(i=>i>=0).concat([Infinity]));
  if(firstBrace===Infinity) throw new Error("No JSON structure found");
  const lastClose=Math.max(raw.lastIndexOf("}"),raw.lastIndexOf("]"));
  if(lastClose<firstBrace) throw new Error("Unbalanced JSON");
  raw=raw.slice(firstBrace,lastClose+1);
  try{ return JSON.parse(raw); }
  catch{ return JSON.parse(escapeBareControlChars(raw)); } // repair unescaped newlines etc.
}

export async function callClaude(prompt,opts={}){
  // Floor the token cap and widen the timeout: agents ask for structured
  // JSON, and a cap that's too low truncates the JSON mid-object so
  // JSON.parse throws and the agent degrades to "AI unavailable" even
  // though the call succeeded. Raising the ceiling is free — the model
  // stops when done; the cap only bites when a response would be cut off.
  const {maxTokens=1000,system,timeout=30000}=opts;
  const body={model:CLAUDE_MODEL,max_tokens:Math.max(maxTokens,1500),messages:[{role:"user",content:prompt}]};
  if(system) body.system=system;
  // Server-side: skip the relative-URL fetch and call the injected
  // transport directly (it returns the parsed Anthropic response).
  if(_serverTransport){
    const data=await _serverTransport(body);
    const textBlock=(data&&data.content||[]).find(b=>b.type==="text");
    if(!textBlock) throw new Error("No text block in response");
    return textBlock.text;
  }
  const ctrl=typeof AbortController!=="undefined"?new AbortController():null;
  const timer=ctrl?setTimeout(()=>ctrl.abort(),timeout):null;
  try{
    const resp=await fetch(CLAUDE_ENDPOINT,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body),
      signal:ctrl?ctrl.signal:undefined,
    });
    if(!resp.ok){
      const errBody=await resp.text().catch(()=>"");
      const err=new Error(`Claude API ${resp.status}: ${errBody.slice(0,200)}`);
      err.status=resp.status;
      err.body=errBody;
      throw err;
    }
    const data=await resp.json();
    const textBlock=(data.content||[]).find(b=>b.type==="text");
    if(!textBlock) throw new Error("No text block in response");
    return textBlock.text;
  } finally {
    if(timer) clearTimeout(timer);
  }
}

export async function callClaudeJSON(prompt,opts={}){
  const text=await callClaude(prompt,opts);
  try{ return parseJSONLoose(text); }
  catch(e){
    throw new Error(`JSON parse failed: ${e.message}. Raw (first 300): ${text.slice(0,300)}`);
  }
}

// User-facing translation of an AI call failure. Callers should also
// console.error the raw error for debugging.
export function friendlyAIError(err){
  const status=err&&err.status;
  const body=(err&&err.body)||"";
  if(status===429) return "Too many AI requests right now — please wait a minute.";
  if(status===500&&/not configured/i.test(body)) return "AI service is being configured (ANTHROPIC_API_KEY not set).";
  if(status===401||status===403) return "AI request rejected — the ANTHROPIC_API_KEY is invalid or lacks access.";
  if((status===404||status===400)&&/model/i.test(body)) return "AI model id is invalid — set a valid ANTHROPIC_MODEL (e.g. claude-sonnet-5).";
  if(status===402||/credit|quota|billing/i.test(body)) return "AI account is out of credit / over quota — check Anthropic billing.";
  if(typeof status==="number"&&status>=400) return `AI service error ${status}. Check the model id and API key.`;
  return "AI assistant is unavailable right now. Please try again or use the structured form.";
}
