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
  rs: "#4599FF", or: "#4599FF", cy: "#6BA4A4", em: "#4599FF", emG: "rgba(69,153,255,.15)",
  bone: "#F4EFE6", bone2: "#E8E1D3",
  t1: "#F4EFE6", t2: "#C8CDD9", t3: "#8B93AE", t4: "#5A6380",
};

// Light ("Lite") — a crisp Facebook-family blue-and-white palette for a
// fresh, familiar feel: the cool #F0F2F5 canvas and white surfaces FB
// uses, one confident #1877F2 primary that doubles as the accent (active
// nav sits on its soft #E7F0FF tint), FB's neutral text ramp
// (#050505 → #65676B → #8A8D91) and its #CED0D4 dividers. Semantic colors
// are tuned for contrast on white. This is the default theme.
export const LIGHT_PALETTE = {
  bg: "#F0F2F5", s1: "#FFFFFF", s2: "#E7F0FF", cd: "#FFFFFF", cdH: "#F2F7FF", br: "#CED0D4", brL: "#BCC0C4",
  bl: "#1877F2", blG: "rgba(24,119,242,.10)", tl: "#0866FF", tlG: "rgba(8,102,255,.10)",
  am: "#C77700", amG: "rgba(199,119,0,.12)", rd: "#D7262D", rdG: "rgba(215,38,45,.10)",
  gn: "#2A7D4F", gnG: "rgba(42,125,79,.10)", pp: "#6A46C0", ppG: "rgba(106,70,192,.10)",
  rs: "#1877F2", or: "#1877F2", cy: "#1877F2", em: "#1877F2", emG: "rgba(24,119,242,.12)",
  bone: "#FFFFFF", bone2: "#F0F2F5",
  t1: "#050505", t2: "#65676B", t3: "#8A8D91", t4: "#B0B3B8",
};

export const THEMES = { dark: DARK_PALETTE, light: LIGHT_PALETTE };

// The live token object. Starts on the Lite light theme (the default).
export const C = { ...LIGHT_PALETTE };

/** Mutate `C` in place to the named theme. Returns the applied theme name
 *  ("light" — the Lite default — for any unknown name). Safe on
 *  server or client. */
export function applyThemeTokens(name) {
  const palette = THEMES[name] || LIGHT_PALETTE;
  Object.assign(C, palette);
  return THEMES[name] ? name : "light";
}

export const F = `'Inter',system-ui,sans-serif`;
export const M = `'JetBrains Mono','SF Mono',monospace`;
export const SR = `'Fraunces',Georgia,serif`;
