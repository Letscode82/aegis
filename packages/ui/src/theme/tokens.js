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

// Light ("Lite") — a clean, professional light palette tuned for long
// reading sessions: a soft cool-gray canvas, crisp white surfaces, one
// confident azure primary (#1B6FD4, RelativityOne/Facebook-family) that
// doubles as the accent, muted semantic colors, and gentle borders. The
// previous neon cyan (#0093D0) is retired — it was doing emphasis, links
// and accents everywhere and read as harsh. This is the default theme.
export const LIGHT_PALETTE = {
  bg: "#F4F6FA", s1: "#FFFFFF", s2: "#EDF1F7", cd: "#FFFFFF", cdH: "#F6F8FC", br: "#E4E8EF", brL: "#CBD3DF",
  bl: "#1B6FD4", blG: "rgba(27,111,212,.10)", tl: "#2C82B8", tlG: "rgba(44,130,184,.10)",
  am: "#B26A00", amG: "rgba(178,106,0,.12)", rd: "#C43D38", rdG: "rgba(196,61,56,.10)",
  gn: "#1E8A57", gnG: "rgba(30,138,87,.10)", pp: "#6A46C0", ppG: "rgba(106,70,192,.10)",
  rs: "#2C82B8", or: "#2C82B8", cy: "#2C82B8", em: "#1B6FD4", emG: "rgba(27,111,212,.13)",
  bone: "#FFFFFF", bone2: "#F4F6FA",
  t1: "#1B2432", t2: "#425061", t3: "#647085", t4: "#98A2B3",
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
