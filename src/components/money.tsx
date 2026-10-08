"use client";

import { useState } from "react";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { changedPositionsFromRight, moneyParts } from "@/lib/money-parts";
import { cn } from "@/lib/utils";

/**
 * The house way to show an amount: the currency code as a small, wide-set label in gold, the figure in
 * tabular numerals, and the decimals dimmed so the eye reads the whole part first.
 *
 * Motion: nothing animates on first paint (the real figure is there immediately, also without JavaScript).
 * When the value later changes (currency switch, refresh), only the digit places that changed roll in, a
 * pattern adapted from 21st.dev "Animate Digits" (unlumen) and rebuilt with CSS (`tailwindcss-animate`), no
 * animation library. Reduced motion shows the new figure at once.
 *
 * Privacy Mode replaces the figure with the mask; screen readers get the full amount as plain text.
 */
export function Money({
  value,
  currency,
  decimals = "dim",
  showCurrency = true,
  fractionDigits,
  animate = true,
  className,
}: {
  value: number;
  currency: string;
  /** "dim" (default) fades the decimals, "hide" drops them, "normal" shows them like the whole part. */
  decimals?: "dim" | "hide" | "normal";
  showCurrency?: boolean;
  fractionDigits?: number;
  /** False keeps digits still when the value changes (a parent is already animating the figure). */
  animate?: boolean;
  className?: string;
}) {
  const { intlLocale } = useLanguage();
  const { isPrivate, maskValue } = usePrivacy();
  const parts = moneyParts(value, currency, intlLocale, { fractionDigits });
  const whole = (parts.negative ? "−" : "") + parts.integer;

  // Derived state: remember the last figure and which places differ, so only those roll.
  const [prevWhole, setPrevWhole] = useState(whole);
  const [changed, setChanged] = useState<Set<number>>(() => new Set());
  if (prevWhole !== whole) {
    setPrevWhole(whole);
    setChanged(changedPositionsFromRight(prevWhole, whole));
  }

  if (isPrivate) {
    return (
      <span className={cn("inline-flex items-baseline gap-[0.4em] tabular-nums", className)}>
        <span className="sr-only">{maskValue(parts.text)}</span>
        <span aria-hidden="true">{maskValue(parts.text)}</span>
      </span>
    );
  }

  const chars = Array.from(whole);
  return (
    <span className={cn("inline-flex items-baseline gap-[0.4em] tabular-nums", className)}>
      <span className="sr-only">{parts.text}</span>
      {showCurrency && (
        <span
          aria-hidden="true"
          className="font-index text-[0.34em] font-normal uppercase tracking-[0.16em] text-primary"
        >
          {parts.currency}
        </span>
      )}
      <bdi aria-hidden="true" className="inline-flex items-baseline">
        {chars.map((ch, i) => {
          const fromRight = chars.length - 1 - i;
          const rolls = animate && changed.has(fromRight);
          return (
            <span
              key={`${fromRight}:${ch}`}
              className={cn(
                rolls && "animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none",
              )}
            >
              {ch}
            </span>
          );
        })}
        {decimals !== "hide" && parts.decimal && (
          <span className={cn(decimals === "dim" && "text-[0.6em] opacity-55")}>{parts.decimal}</span>
        )}
      </bdi>
    </span>
  );
}
