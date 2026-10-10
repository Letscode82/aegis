// Vendored from thinking-orbs (MIT, © 2026 Jakub Antalik). See NOTICE.
// Adapted: prop docs reworded for the React <ThinkingOrb> wrapper.
//
// The six shipped states — each a hand-tuned animation:
// - `working`   — particles on tilted orbits
// - `searching` — a scan meridian sweeps a dotted globe
// - `solving`   — bands scramble in quarter turns, then click back
// - `listening` — a waveform rolls through latitude rings
// - `composing` — an undulating multi-band sash
// - `shaping`   — a dotted outline morphs circle → triangle → square

import type { CSSProperties } from 'react';

export type OrbState = 'working' | 'searching' | 'solving' | 'listening' | 'composing' | 'shaping';

/**
 * Rendered size in CSS pixels. Exactly two tuned presets ship:
 * 64 (chat-avatar scale) and 20 (inline-text scale). Each size carries
 * its own dot count, dot size and speed tuning — they are separate
 * designs, not a scale factor.
 */
export type OrbSize = 64 | 20;

/**
 * Theme mode.
 *
 * - `auto` (default) resolves in three layers, live-updating on change:
 *   1. a `data-theme="dark|light"` attribute or `dark`/`light` class on
 *      any ancestor, watched via `MutationObserver`;
 *   2. otherwise `matchMedia('(prefers-color-scheme: dark)')`,
 *      subscribed for live OS/browser theme switches;
 *   3. during SSR (no DOM) the canvas is client-only — the first client
 *      render resolves the theme before anything is painted.
 * - `dark` / `light` pin the palette regardless of context.
 *
 * Dark renders light ink on the transparent canvas (for dark
 * backgrounds); light renders dark ink (for light backgrounds).
 */
export type OrbTheme = 'auto' | 'dark' | 'light';

/** Props for the React ThinkingOrb component. */
export interface ThinkingOrbProps {
  /** Which animation to show. @default 'working' */
  state?: OrbState;

  /**
   * Rendered size in CSS pixels. @default 64
   *
   * Two tunings ship (20 inline, 64 avatar); any other size renders at the
   * nearest tuning scaled into a canvas of the requested px — e.g. a 128
   * splash orb reuses the 64 tuning. Pass 20 or 64 for the pixel-perfect
   * hand-tuned designs.
   */
  size?: number;

  /** Theme mode; `auto` detects from the host project. @default 'auto' */
  theme?: OrbTheme;

  /**
   * Animation speed multiplier on top of the preset's baked speed.
   * @default 1
   */
  speed?: number;

  /** Freeze the animation on the current frame. @default false */
  paused?: boolean;

  /**
   * Optional brand tint as a `#rrggbb` hex. When set, the dots render in
   * this colour (depth preserved via opacity) instead of grayscale — e.g.
   * pass the Aurora accent token for an on-brand orb. @default undefined
   */
  ink?: string;

  /** Optional class on the rendered canvas. */
  className?: string;

  /** Optional inline styles merged onto the canvas sizing styles. */
  style?: CSSProperties;

  /** Override the per-state accessible label. */
  'aria-label'?: string;
}
