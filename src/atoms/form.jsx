import { C, F, M } from "../theme/tokens";

export const inputStyle={width:"100%",padding:"9px 11px",background:C.s1,border:`1px solid ${C.br}`,borderRadius:4,color:C.t1,fontSize:11.5,fontFamily:F,outline:"none",transition:"border-color .15s"};

export function FormField({label,sub,required,children}){return <div style={{marginBottom:12}}><div style={{fontSize:9.5,color:C.t3,textTransform:"uppercase",letterSpacing:1.5,fontFamily:M,marginBottom:5,fontWeight:600}}>{label}{required&&<span style={{color:C.rd,marginLeft:3}}>*</span>}</div>{children}{sub&&<div style={{fontSize:9.5,color:C.t4,marginTop:3,fontFamily:M}}>{sub}</div>}</div>;}
