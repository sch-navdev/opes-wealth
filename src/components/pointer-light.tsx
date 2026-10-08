"use client";

import { useEffect } from "react";

/**
 * Feeds the `.lit` card border (see globals.css): while a mouse or pen moves over a card marked `lit`, the
 * pointer position inside that card is written to its `--mx` / `--my` custom properties, so a gold
 * highlight follows the cursor along the border. One passive listener on the document for the whole
 * dashboard (no per-card handlers or state); touch is ignored, and nothing renders. The highlight itself
 * is plain CSS and is switched off for reduced motion and touch screens there.
 */
export function PointerLight() {
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      const card = target.closest<HTMLElement>(".lit");
      if (!card) return;
      const box = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - box.left}px`);
      card.style.setProperty("--my", `${e.clientY - box.top}px`);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, []);
  return null;
}
