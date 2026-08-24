/**
 * ThemeProvider + toggle — runtime Blue(dark) ↔ Facebook-Lite(light) switch.
 *
 * The token object `C` is shared and read at render time everywhere, so
 * switching themes = mutate `C` in place (applyThemeTokens) + remount the tree
 * so every component re-reads the new values. The choice persists in
 * localStorage. A floating pill toggle is rendered so the control is available
 * on every page without wiring each header.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
// eslint-disable-next-line import/no-unresolved
import { C, F, applyThemeTokens } from "./theme/tokens.js";

export type ThemeName = "dark" | "light";
const STORAGE_KEY = "aegis.theme";

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  toggle: () => void;
}
const ThemeContext = createContext<ThemeContextValue>({ theme: "dark", setTheme: () => {}, toggle: () => {} });

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

function paintBody(): void {
  if (typeof document !== "undefined" && document.body) {
    document.body.style.background = C.bg;
    document.body.style.color = C.t1;
  }
}

export const ThemeProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeName>("dark");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let saved: ThemeName = "dark";
    try {
      const s = window.localStorage.getItem(STORAGE_KEY);
      if (s === "light" || s === "dark") saved = s;
    } catch {
      /* storage disabled — dark default */
    }
    applyThemeTokens(saved);
    paintBody();
    setThemeState(saved);
    setHydrated(true);
  }, []);

  const setTheme = useCallback((t: ThemeName) => {
    const applied = applyThemeTokens(t) as ThemeName;
    try { window.localStorage.setItem(STORAGE_KEY, applied); } catch { /* ignore */ }
    paintBody();
    setThemeState(applied);
  }, []);

  const toggle = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {/* Remount on theme change so descendants re-read the mutated C.
          display:contents keeps layout unaffected by the wrapper. */}
      <div key={theme} style={{ display: "contents" }}>{children}</div>
      {hydrated && <ThemeToggle theme={theme} onToggle={toggle} />}
    </ThemeContext.Provider>
  );
};

const ThemeToggle: React.FC<{ theme: ThemeName; onToggle: () => void }> = ({ theme, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    title={`Switch to ${theme === "dark" ? "Facebook Lite (light)" : "Blue (dark)"} mode`}
    style={{
      position: "fixed", right: 16, bottom: 16, zIndex: 4000,
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 13px", borderRadius: 24, cursor: "pointer",
      background: C.cd, color: C.t1, border: `1px solid ${C.brL}`,
      fontFamily: F, fontSize: 12, fontWeight: 600,
      boxShadow: "0 4px 14px rgba(0,0,0,.18)",
    }}
  >
    <span aria-hidden="true" style={{ fontSize: 14 }}>{theme === "dark" ? "🌙" : "☀️"}</span>
    {theme === "dark" ? "Blue" : "Lite"}
  </button>
);
