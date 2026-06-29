export const CLAUDE_MODEL="claude-sonnet-4-6";
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
  return JSON.parse(raw);
}

export async function callClaude(prompt,opts={}){
  const {maxTokens=1000,system,timeout=18000}=opts;
  const body={model:CLAUDE_MODEL,max_tokens:maxTokens,messages:[{role:"user",content:prompt}]};
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
  if(status===500&&/not configured/i.test(body)) return "AI service is being configured. Please try again or use the structured form.";
  return "AI assistant is unavailable right now. Please try again or use the structured form.";
}
