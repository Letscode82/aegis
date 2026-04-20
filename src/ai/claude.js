export const CLAUDE_MODEL="claude-sonnet-4-20250514";
export const CLAUDE_ENDPOINT="https://api.anthropic.com/v1/messages";

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
      throw new Error(`Claude API ${resp.status}: ${errBody.slice(0,200)}`);
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
