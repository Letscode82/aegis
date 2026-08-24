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

// Light — a Facebook-style palette (FB blue #1877F2, #F0F2F5 page, white cards).
export const LIGHT_PALETTE = {
  bg: "#F0F2F5", s1: "#FFFFFF", s2: "#F7F8FA", cd: "#FFFFFF", cdH: "#F0F2F5", br: "#DADDE1", brL: "#CED0D4",
  bl: "#1877F2", blG: "rgba(24,119,242,.10)", tl: "#039BE5", tlG: "rgba(3,155,229,.10)",
  am: "#F7B928", amG: "rgba(247,185,40,.12)", rd: "#FA383E", rdG: "rgba(250,56,62,.10)",
  gn: "#31A24C", gnG: "rgba(49,162,76,.10)", pp: "#8B46FF", ppG: "rgba(139,70,255,.10)",
  rs: "#F5533D", or: "#F5533D", cy: "#039BE5", em: "#F5533D", emG: "rgba(245,83,61,.12)",
  bone: "#FFFFFF", bone2: "#F0F2F5",
  t1: "#050505", t2: "#1C1E21", t3: "#65676B", t4: "#8A8D91",
};

export const THEMES = { dark: DARK_PALETTE, light: LIGHT_PALETTE };

// The live token object. Starts on dark (the SSR-safe default).
export const C = { ...DARK_PALETTE };

/** Mutate `C` in place to the named theme. Returns the applied theme name
 *  ("dark" for any unknown name). Safe to call on server or client. */
export function applyThemeTokens(name) {
  const palette = THEMES[name] || DARK_PALETTE;
  Object.assign(C, palette);
  return THEMES[name] ? name : "dark";
}

export const F = `'Inter',system-ui,sans-serif`;
export const M = `'JetBrains Mono','SF Mono',monospace`;
export const SR = `'Fraunces',Georgia,serif`;
