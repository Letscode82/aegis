// AURORA PALETTE — two themes over one token set.
//
// `C` is a LIVE object: every module imports this same reference and reads
// `C.bg` etc. at render time. `applyThemeTokens(name)` mutates `C` in place
// (never replaces it) so the alpha-append idiom `${C.pp}44` keeps working —
// the base accent/semantic tokens stay hex in both palettes. The ThemeProvider
// calls applyThemeTokens + remounts the tree so components re-read the values.

// Dark — the institutional terminal aesthetic (the original default).
export const DARK_PALETTE = {
  bg: "#0B1020", s1: "#111831", s2: "#141C38", cd: "#111831", cdH: "#1A2340", br: "#2A3558", brL: "#3A4670",
  bl: "#6B8EC4", blG: "rgba(107,142,196,.12)", tl: "#6BA4A4", tlG: "rgba(107,164,164,.1)",
  am: "#E0B34A", amG: "rgba(224,179,74,.08)", rd: "#C8463D", rdG: "rgba(200,70,61,.08)",
  gn: "#7FA780", gnG: "rgba(127,167,128,.08)", pp: "#A06C9A", ppG: "rgba(160,108,154,.1)",
  rs: "#E8793B", or: "#E8793B", cy: "#6BA4A4", em: "#E8793B", emG: "rgba(232,121,59,.15)",
  bone: "#F4EFE6", bone2: "#E8E1D3",
  t1: "#F4EFE6", t2: "#C8CDD9", t3: "#8B93AE", t4: "#5A6380",
};

// Light — a RelativityOne-inspired palette: a cool light-gray canvas, crisp
// white surfaces, a confident azure primary (#1268C8) with a cyan accent
// (#0093D0), neutral borders and dark-slate text. This is the default theme.
export const LIGHT_PALETTE = {
  bg: "#F2F4F7", s1: "#FFFFFF", s2: "#EDF1F6", cd: "#FFFFFF", cdH: "#F2F4F7", br: "#E2E6EC", brL: "#CDD4DE",
  bl: "#1268C8", blG: "rgba(18,104,200,.10)", tl: "#0093D0", tlG: "rgba(0,147,208,.10)",
  am: "#C67A00", amG: "rgba(198,122,0,.12)", rd: "#C23934", rdG: "rgba(194,57,52,.10)",
  gn: "#1B8A5A", gnG: "rgba(27,138,90,.10)", pp: "#6B40C7", ppG: "rgba(107,64,199,.10)",
  rs: "#0093D0", or: "#0093D0", cy: "#0093D0", em: "#0093D0", emG: "rgba(0,147,208,.14)",
  bone: "#FFFFFF", bone2: "#F2F4F7",
  t1: "#1A2230", t2: "#3A4453", t3: "#667085", t4: "#98A2B3",
};

export const THEMES = { dark: DARK_PALETTE, light: LIGHT_PALETTE };

// The live token object. Starts on the RelativityOne light theme (default).
export const C = { ...LIGHT_PALETTE };

/** Mutate `C` in place to the named theme. Returns the applied theme name
 *  ("light" — the RelativityOne default — for any unknown name). Safe on
 *  server or client. */
export function applyThemeTokens(name) {
  const palette = THEMES[name] || LIGHT_PALETTE;
  Object.assign(C, palette);
  return THEMES[name] ? name : "light";
}

export const F = `'Inter',system-ui,sans-serif`;
export const M = `'JetBrains Mono','SF Mono',monospace`;
export const SR = `'Fraunces',Georgia,serif`;
