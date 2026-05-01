/**
 * Type declarations for @aegis/ui.
 *
 * The atoms ship as JS today (the v8 demo's Aurora primitives, ported
 * verbatim into a workspace package in Step 1). These declarations
 * mirror the actual prop shapes so consumers can typecheck under
 * strict + noUncheckedIndexedAccess. When the package migrates to TS,
 * delete this file and let the source export its own types.
 */
import type { CSSProperties, MouseEventHandler, ReactNode } from "react";

/** Aurora palette tokens. Spelt out so token lookups stay typed `string`. */
export const C: {
  bg: string;
  s1: string;
  s2: string;
  cd: string;
  cdH: string;
  br: string;
  brL: string;
  bl: string;
  blG: string;
  tl: string;
  tlG: string;
  am: string;
  amG: string;
  rd: string;
  rdG: string;
  gn: string;
  gnG: string;
  pp: string;
  ppG: string;
  rs: string;
  or: string;
  cy: string;
  em: string;
  emG: string;
  bone: string;
  bone2: string;
  t1: string;
  t2: string;
  t3: string;
  t4: string;
};

export const F: string;
export const M: string;
export const SR: string;
export const CSS: string;

export const Card: React.FC<{
  children?: ReactNode;
  style?: CSSProperties;
  d?: number;
  onClick?: MouseEventHandler<HTMLDivElement>;
}>;

export const Pill: React.FC<{ t: ReactNode; c: string; g?: string }>;
export const Dot: React.FC<{ c: string; p?: boolean }>;
export const Stat: React.FC<{
  l: ReactNode;
  v: ReactNode;
  c?: string;
  s?: number | boolean;
}>;
export const Bar: React.FC<{ pct: number; c: string; d?: number; h?: number }>;
export const SH: React.FC<{
  icon: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  c?: string;
}>;
export const Row: React.FC<{
  cols: string;
  cells: Array<{ v: ReactNode; s?: CSSProperties }>;
  header?: boolean;
  i?: number;
}>;
export const WorkflowSteps: React.FC<{
  steps: Array<{ label: string; done?: boolean; active?: boolean }>;
}>;
export const ApprovalBadge: React.FC<{ status: string }>;
export const FormField: React.FC<{ label: string; children?: ReactNode }>;
export const inputStyle: CSSProperties;
export const rc: (r: string) => string;
export const pc: (p: string) => string;
