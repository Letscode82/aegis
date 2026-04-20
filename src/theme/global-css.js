import { C } from "./tokens";

export const CSS=`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap');
@keyframes fu{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
@keyframes sl{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:translateX(0)}}
@keyframes p{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes bi{from{width:0}to{width:var(--w)}}
@keyframes sp{to{transform:rotate(360deg)}}
*{scrollbar-width:thin;scrollbar-color:${C.br} transparent;box-sizing:border-box}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${C.br};border-radius:3px}`;
