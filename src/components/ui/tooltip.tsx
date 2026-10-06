"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Small accessible info-tooltip (no dependency). The trigger is a focusable button wired to the bubble
 * with aria-describedby; the bubble is `role="tooltip"`. Opens on hover and focus, closes on blur,
 * mouse leave and Escape; a tap toggles it on touch devices. The bubble is absolutely positioned (no
 * layout shift) and nudged horizontally after opening so it stays inside the viewport (320px+).
 */
export function InfoTooltip({
  label,
  children,
  icon,
  className,
}: {
  /** Accessible name of the trigger button. */
  label: string;
  /** Tooltip content. */
  children: ReactNode;
  /** Icon inside the trigger. */
  icon: ReactNode;
  className?: string;
}) {
  const id = useId();
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [shift, setShift] = useState(0);
  const bubble = useRef<HTMLSpanElement>(null);
  const open = hover || focus || pinned;

  const close = useCallback(() => {
    setHover(false);
    setFocus(false);
    setPinned(false);
  }, []);

  // Keep the bubble inside the viewport: measure the unshifted position, then offset it.
  useLayoutEffect(() => {
    const el = bubble.current;
    if (!open || !el) return;
    el.style.left = "50%";
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const vw = document.documentElement.clientWidth;
    let dx = 0;
    if (rect.left < margin) dx = margin - rect.left;
    else if (rect.right > vw - margin) dx = vw - margin - rect.right;
    el.style.left = `calc(50% + ${dx}px)`;
    setShift(dx);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && bubble.current?.parentElement?.contains(target)) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setPinned(false);
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={() => setFocus(true)}
        onBlur={() => {
          setFocus(false);
          setPinned(false);
        }}
        onClick={() => setPinned((p) => !p)}
        className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        {icon}
      </button>
      <span
        ref={bubble}
        id={id}
        role="tooltip"
        hidden={!open}
        style={{ left: `calc(50% + ${shift}px)` }}
        className={cn(
          "absolute top-full z-50 mt-1.5 w-64 max-w-[calc(100vw-1rem)] -translate-x-1/2 rounded-md border border-border bg-popover p-3 text-start text-xs font-normal normal-case leading-relaxed text-popover-foreground shadow-md",
          "animate-in fade-in-0 motion-reduce:animate-none",
        )}
      >
        {children}
      </span>
    </span>
  );
}
