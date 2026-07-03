import { useEffect, useState } from "react";

/**
 * useIsNarrow — true when the viewport is at or below `maxWidthPx`
 * (W4-3). SSR-safe (false on the server; corrects on mount) and
 * live: tracks matchMedia changes so rotation / window resize
 * re-renders responsive layouts.
 *
 *   const phone  = useIsNarrow(640);   // requester phone breakpoint
 *   const tablet = useIsNarrow(1024);  // staff tablet breakpoint
 */
export function useIsNarrow(maxWidthPx = 640) {
  const query = `(max-width: ${maxWidthPx}px)`;
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const onChange = (e) => setNarrow(e.matches);
    setNarrow(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, [query]);
  return narrow;
}
