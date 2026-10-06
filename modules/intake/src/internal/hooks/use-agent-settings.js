import { useState, useEffect, useCallback } from "react";
import { DEFAULT_AGENT_SETTINGS, loadAgentSettings, saveAgentSettings } from "../storage/agent-settings";

export function useAgentSettings(){
  const[settings,setSettings]=useState(DEFAULT_AGENT_SETTINGS);
  const[loaded,setLoaded]=useState(false);
  useEffect(()=>{
    loadAgentSettings().then(s=>{setSettings(s);setLoaded(true);});
  },[]);
  const toggle=useCallback(async(id)=>{
    const next={...settings,[id]:{enabled:!(settings[id]?.enabled!==false)}};
    setSettings(next);
    await saveAgentSettings(next);
  },[settings]);
  return {settings,toggle,loaded};
}
