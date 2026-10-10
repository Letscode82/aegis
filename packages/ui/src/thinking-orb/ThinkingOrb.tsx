// OneLegal-authored React wrapper around the vendored thinking-orbs canvas
// engine (MIT, © 2026 Jakub Antalik — see ./NOTICE). The upstream package
// ships a Vue component; this is a faithful React port of that driver —
// same preset resolution, raf loop, reduced-motion static frame,
// IntersectionObserver + visibility pause/resume, and `auto` theme
// resolution (ancestor data-theme/class → prefers-color-scheme).
//
// Note: on OneLegal's light Aurora surfaces, pass `theme="light"` explicitly
// rather than relying on `auto`, so the ink stays dark-on-light regardless of
// the viewer's OS colour-scheme preference.

import React, { useEffect, useRef, useState } from "react";
import { MODE_DRAWS } from "./engine/registry";
import { setInk } from "./engine/core";
import { resolvePreset } from "./presets";
import type { OrbState, OrbTheme, ThinkingOrbProps } from "./types";

const LABELS: Record<OrbState, string> = {
  working: "Working…",
  searching: "Searching…",
  solving: "Solving…",
  listening: "Listening…",
  composing: "Composing…",
  shaping: "Shaping…",
};

function ancestorTheme(el: Element | null): boolean | null {
  let node: Element | null = el;
  while (node) {
    const attr = node.getAttribute("data-theme");
    if (attr === "dark") return true;
    if (attr === "light") return false;
    if (node.classList.contains("dark")) return true;
    if (node.classList.contains("light")) return false;
    node = node.parentElement;
  }
  return null;
}

function systemDark(): boolean {
  return typeof matchMedia === "undefined" || matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Resolve the effective dark/light, live-updating in `auto` mode. */
function useResolvedDark(theme: OrbTheme, hostRef: React.RefObject<Element | null>): boolean {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    if (theme === "dark") {
      setDark(true);
      return;
    }
    if (theme === "light") {
      setDark(false);
      return;
    }

    const resolve = () => setDark(ancestorTheme(hostRef.current) ?? systemDark());
    resolve();

    const mq = typeof matchMedia !== "undefined" ? matchMedia("(prefers-color-scheme: dark)") : null;
    const onMediaChange = () => resolve();
    mq?.addEventListener("change", onMediaChange);

    let observer: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(resolve);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "data-theme"],
        subtree: true,
      });
    }

    return () => {
      mq?.removeEventListener("change", onMediaChange);
      observer?.disconnect();
    };
  }, [theme, hostRef]);

  return dark;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

export const ThinkingOrb: React.FC<ThinkingOrbProps> = ({
  state = "working",
  size = 64,
  theme = "auto",
  speed = 1,
  paused = false,
  ink,
  className,
  style,
  "aria-label": ariaLabelProp,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dark = useResolvedDark(theme, canvasRef);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(2, (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1);
    const orbSize = size;
    canvas.width = Math.round(orbSize * dpr);
    canvas.height = Math.round(orbSize * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { mode, speed: baseSpeed, opts } = resolvePreset(state, orbSize);
    const draw = MODE_DRAWS[mode];
    const effSpeed = baseSpeed * speed;

    const frame = (tSec: number) => {
      // Set the tint right before the draw — paint() reads it synchronously,
      // so multiple orbs with different inks on one page stay independent.
      setInk(ink ?? null);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, orbSize, orbSize);
      draw(ctx, orbSize, tSec, dark, opts);
    };

    // Reduced motion: paint one representative static frame and stop.
    if (reduced) {
      frame(0.6);
      return;
    }

    let raf = 0;
    let running = false;
    const loop = () => {
      frame((performance.now() / 1000) * effSpeed);
      if (running) raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running || paused) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    // Paint an initial frame immediately so SSR hydration has something.
    frame((performance.now() / 1000) * effSpeed);

    let visible = true;
    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(([entry]) => {
            visible = !!entry?.isIntersecting;
            if (visible && document.visibilityState !== "hidden") start();
            else stop();
          })
        : null;

    io?.observe(canvas);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") stop();
      else if (visible) start();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (!io && !paused) start();

    return () => {
      stop();
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [state, size, speed, paused, dark, reduced, ink]);

  const ariaLabel = ariaLabelProp ?? LABELS[state];

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={ariaLabel}
      className={className}
      style={{ width: size, height: size, display: "block", ...style }}
    />
  );
};

export default ThinkingOrb;
