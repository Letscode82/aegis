import { cloneElement, isValidElement } from "react";
import { C, F, M } from "../theme/tokens";

export const inputStyle={width:"100%",padding:"9px 11px",background:C.s1,border:`1px solid ${C.br}`,borderRadius:4,color:C.t1,fontSize:11.5,fontFamily:F,outline:"none",transition:"border-color .15s"};

// W4-4 — the visible label is associated programmatically: a single
// input/select/textarea child gets aria-label={label} (+ aria-required)
// unless it already carries one. Screen readers announce the field.
function withLabel(children, label, required) {
  if (!isValidElement(children)) return children;
  const t = children.type;
  if (t !== "input" && t !== "select" && t !== "textarea") return children;
  if (children.props["aria-label"]) return children;
  return cloneElement(children, {
    "aria-label": label,
    ...(required ? { "aria-required": true } : {}),
  });
}

export function FormField({label,sub,required,children}){return <div style={{marginBottom:12}}><div style={{fontSize:9.5,color:C.t3,textTransform:"uppercase",letterSpacing:1.5,fontFamily:M,marginBottom:5,fontWeight:600}}>{label}{required&&<span style={{color:C.rd,marginLeft:3}}>*</span>}</div>{withLabel(children,label,required)}{sub&&<div style={{fontSize:9.5,color:C.t4,marginTop:3,fontFamily:M}}>{sub}</div>}</div>;}
