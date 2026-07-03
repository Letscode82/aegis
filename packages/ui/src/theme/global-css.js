import { C } from "./tokens";

export const CSS=`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap');
@keyframes fu{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
[role="button"]:focus-visible,a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #22D3EE;outline-offset:2px}
@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important;scroll-behavior:auto !important}}
@keyframes sl{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:translateX(0)}}
@keyframes p{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes bi{from{width:0}to{width:var(--w)}}
@keyframes sp{to{transform:rotate(360deg)}}
@keyframes typing{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-2px)}}
@keyframes flash{0%{background:${C.emG}}100%{background:transparent}}
*{scrollbar-width:thin;scrollbar-color:${C.br} transparent;box-sizing:border-box}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${C.br};border-radius:3px}`;
