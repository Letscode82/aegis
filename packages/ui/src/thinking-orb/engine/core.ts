// Vendored from thinking-orbs (https://github.com/RareFormLabs/thinking-orbs),
// MIT License, Copyright (c) 2026 Jakub Antalik. See NOTICE in this folder.
// The canvas engine is upstream-verbatim; only the React wrapper
// (ThinkingOrb.tsx) is OneLegal-authored. A few `!` assertions were added to
// satisfy this repo's `noUncheckedIndexedAccess` — behavior is unchanged.
//
// Shared primitives for the dotted 3D thought-orbs. Ported from inkform
// (PlotterLab's HalftoneSphere lineage): honestly 3D — rotated,
// depth-shaded, z-sorted. Depth is carried by dot size and ink weight
// alone. Plain 2D canvas fills only: no ctx.filter, no SVG filters, so
// every mode renders identically in Chrome, Safari and Firefox.

export interface Dot {
  x: number;
  y: number;
  z: number;
  r: number;
  /** Ink value: 0 = darkest ink on paper. Mirrored on dark themes. */
  white: number;
  a?: number;
}

export type Projector = (x: number, y: number, z: number) => [number, number, number];

/** Deterministic hash in [0, 1). */
export function hashD(a: number, b: number): number {
  const h = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

/** Stable directions on a unit sphere (Fibonacci lattice). */
export function fibDir(i: number, n: number): [number, number, number] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (2 * (i + 0.5)) / n;
  const rad = Math.sqrt(1 - y * y);
  const a = i * golden;
  return [rad * Math.cos(a), y, rad * Math.sin(a)];
}

/** Shortest signed angular distance, wrapped to (-π, π]. */
export function angleDelta(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

/** Shared spin + tilt + orthographic projection. */
export function makeProj(yaw: number, tilt: number, cx: number, cy: number, scale: number): Projector {
  const st = Math.sin(tilt);
  const ct = Math.cos(tilt);
  const sy = Math.sin(yaw);
  const cyw = Math.cos(yaw);
  return (x, y, z) => {
    const x1 = x * cyw + z * sy;
    const z1 = -x * sy + z * cyw;
    const y1 = y * ct - z1 * st;
    const z2 = y * st + z1 * ct;
    return [cx + x1 * scale, cy - y1 * scale, z2];
  };
}

// Optional brand tint. When set (OneLegal extension — upstream paints pure
// grayscale), dots render in this colour instead of grey: the dot's ink
// weight becomes opacity over the page, so near/dark dots read as saturated
// brand colour and far/ghost dots fade toward transparent — the same depth
// language, in colour. Set per frame by the React wrapper before each draw;
// paint() runs synchronously within draw() so a module-level value is safe.
let _ink: [number, number, number] | null = null;

/** Set (or clear, with null) the brand tint used by `paint`. */
export function setInk(hex: string | null): void {
  if (!hex) {
    _ink = null;
    return;
  }
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) {
    _ink = null;
    return;
  }
  const n = parseInt(m[1], 16);
  _ink = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Painter: z-sort far→near, matte dots. Grayscale by default; on dark
 * substrates the ink value is mirrored (1 - white) so near dots read bright.
 * When a brand tint is set (`setInk`), dots take that colour with opacity
 * driven by ink weight, so depth survives the recolour.
 */
export function paint(ctx: CanvasRenderingContext2D, dots: Dot[], dark: boolean, rMin = 0.3): void {
  dots.sort((a, b) => a.z - b.z);
  const ink = _ink;
  for (const d of dots) {
    const alpha = d.a ?? 1;
    if (alpha < 0.02) continue;
    const w = Math.min(1, Math.max(0, d.white));
    const lum = dark ? 1 - w : w; // 0 = full-weight ink, 1 = toward substrate
    if (ink) {
      // Weight the tint by darkness so close dots are saturated and ghost
      // dots fade out; floor keeps faint paths visible.
      const strength = 0.12 + 0.88 * (1 - lum);
      ctx.fillStyle = `rgba(${ink[0]},${ink[1]},${ink[2]},${alpha * strength})`;
    } else {
      const g = Math.round(lum * 255);
      ctx.fillStyle = `rgba(${g},${g},${g},${alpha})`;
    }
    ctx.beginPath();
    ctx.arc(d.x, d.y, Math.max(rMin, d.r), 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Dot radii were tuned for a 300pt frame; sub-linear scaling keeps small
 * spinners legible. Lower pow = radii shrink less with size.
 */
export function radiusScale(size: number, pow: number): number {
  return (size / 300) ** pow;
}
