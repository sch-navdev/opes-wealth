"use client";

import { useEffect, useRef, useState } from "react";
import { Money } from "@/components/money";

const SEEN_KEY = "opes-networth-counted";
const DURATION_MS = 1100;

function alreadyCounted(): boolean {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

function markCounted() {
  try {
    window.sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* private mode: the figure just counts again next visit */
  }
}

/**
 * The Basic tier's headline figure. The server renders the real amount (so it is there without JavaScript
 * and for crawlers); the first time it appears in a browser session it then counts up from zero in about a
 * second, easing out, and settles on exactly the real value. Later visits, reduced motion and Privacy Mode
 * show the figure at once. Plain `requestAnimationFrame`, no animation library; the digit-roll of `Money` is
 * switched off while counting so the digits do not flicker at frame rate.
 */
export function NetWorthTicker({
  value,
  currency,
  className,
}: {
  value: number;
  currency: string;
  className?: string;
}) {
  // null = settled: show the real prop; a number = a frame of the count-up.
  const [frame, setFrame] = useState<number | null>(null);
  const target = useRef(value);
  useEffect(() => {
    target.current = value;
  });

  useEffect(() => {
    if (alreadyCounted()) return;
    markCounted();
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION_MS);
      if (progress >= 1) {
        setFrame(null);
        return;
      }
      const eased = 1 - Math.pow(1 - progress, 3);
      setFrame(target.current * eased);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <Money value={frame ?? value} currency={currency} animate={frame === null} className={className} />;
}
