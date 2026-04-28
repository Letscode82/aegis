import { useState, useEffect, useCallback } from "react";
import { DEFAULT_COCKPIT_STATE, loadCockpitState, saveCockpitState } from "../storage/cockpit-state";

export function useCockpitState(){
  const[state,setState]=useState(DEFAULT_COCKPIT_STATE);
  const[loaded,setLoaded]=useState(false);
  useEffect(()=>{
    loadCockpitState().then(s=>{setState(s);setLoaded(true);});
  },[]);
  const update=useCallback(async(patch)=>{
    const next={...state,...patch};
    setState(next);
    await saveCockpitState(next);
  },[state]);
  const incrementTriaged=useCallback(async()=>{
    const today=new Date().toISOString().slice(0,10);
    const next={...state,triagedToday:(state.triagedDate===today?state.triagedToday:0)+1,triagedDate:today};
    setState(next);
    await saveCockpitState(next);
  },[state]);
  return {state,update,incrementTriaged,loaded};
}
