"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/components/use-reduced-motion";
import { springProgress } from "@/lib/spring";

/**
 * Animated number: tweens from a starting value to the target and re-tweens
 * whenever the target changes (e.g. after switching the Base Currency).
 *
 * Adapted from the "Number Ticker" pattern on 21st.dev (danielpetho): same
 * from / target / duration idea, but written with `requestAnimationFrame`
 * instead of the `motion` package (not a dependency of this app), and with what
 * a wealth dashboard needs on top:
 *  - values are FORMATTED on every frame (`format`), so currencies keep their
 *    symbol, grouping and decimals instead of being rounded to integers;
 *  - Privacy Mode keeps working because `format` is where the caller masks;
 *  - `prefers-reduced-motion` jumps straight to the final value (read live);
 *  - easing is a closed-form critically damped spring by default (no overshoot,
 *    so a money figure never briefly exceeds its real value); `cubic` is kept.
 *  - the server renders the final value, so without JavaScript (and on first
 *    paint, before the first animation frame) the real figure is shown and
 *    nothing mismatches on hydration.
 */
export function NumberTicker({
  value,
  format,
  from = 0,
  durationMs = 900,
  easing = "spring",
  className,
}: {
  value: number;
  format: (n: number) => string;
  /** Where the very first animation starts (default 0). */
  from?: number;
  durationMs?: number;
  easing?: "spring" | "cubic";
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const shown = useRef(value);
  const firstRun = useRef(true);
  const reduced = useReducedMotion();

  useEffect(() => {
    // First run counts up from `from`; later runs continue from wherever the number is now.
    // (Marked done only once a frame has actually run, so React Strict Mode's
    // double-invoked effect in development doesn't swallow the first animation.)
    const start = firstRun.current ? from : shown.current;
    const duration = reduced ? 0 : durationMs;

    let frame = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      firstRun.current = false;
      const t = duration === 0 ? 1 : Math.min(1, (now - t0) / duration);
      const eased = easing === "spring" ? springProgress(t) : 1 - Math.pow(1 - t, 3); // else easeOutCubic
      const current = start + (value - start) * eased;
      shown.current = current;
      setDisplay(current);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, from, durationMs, easing, reduced]);

  return <span className={className}>{format(display)}</span>;
}
