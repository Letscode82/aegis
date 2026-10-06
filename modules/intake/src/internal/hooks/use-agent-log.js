import { useState, useEffect } from "react";
import { loadAgentLog } from "../storage/agent-log";

export function useAgentLog(){
  const[log,setLog]=useState([]);
  useEffect(()=>{
    let mounted=true;
    const load=()=>loadAgentLog().then(l=>{if(mounted)setLog(l);});
    load();
    const t=setInterval(load,5000);
    return()=>{mounted=false;clearInterval(t);};
  },[]);
  return log;
}
