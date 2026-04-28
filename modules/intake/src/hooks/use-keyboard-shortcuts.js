import { useEffect, useRef } from "react";

export function useKeyboardShortcuts(handlers,enabled=true){
  const handlersRef=useRef(handlers);
  handlersRef.current=handlers;
  useEffect(()=>{
    if(!enabled||typeof document==="undefined") return;
    const onKeydown=(e)=>{
      // Skip when typing in inputs/textareas/selects/contenteditable
      const tn=e.target?.tagName;
      if(tn==="INPUT"||tn==="TEXTAREA"||tn==="SELECT") return;
      if(e.target?.isContentEditable) return;
      // Skip modifier-key combos (cmd/ctrl/alt) except for handlers that explicitly want them
      if(e.metaKey||e.ctrlKey||e.altKey) return;

      // Build key string: handle arrows + letter keys
      let k=e.key;
      if(k==="ArrowDown") k="ArrowDown";
      else if(k==="ArrowUp") k="ArrowUp";
      else k=k.length===1?k.toLowerCase():k;

      const h=handlersRef.current[k];
      if(h){ e.preventDefault(); h(e); }
    };
    document.addEventListener("keydown",onKeydown);
    return()=>document.removeEventListener("keydown",onKeydown);
  },[enabled]);
}
