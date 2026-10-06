"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import { useUiTier } from "@/components/tier-gate";
import { EXPERTISE_LEVELS, useUiTierStore, type ExpertiseLevel } from "@/stores/useUiTierStore";
import { TIER_OPTION_KEYS, tierForKey } from "@/lib/ui-tier-options";
import { cn } from "@/lib/utils";

/**
 * Settings > Preferences: choose the dashboard view (UI tier). Reads the active tier
 * through `useUiTier()` so it always matches what is rendering (server cookie until the
 * store hydrates). Choosing calls `setExpertiseLevel`, which updates the Zustand store
 * (sidebar select + dashboard follow instantly) and mirrors the `opes-ui-tier` cookie so
 * the server render honors it on the next load. UI preference, not access control.
 */
export function UiTierPreference() {
  const { t } = useLanguage();
  const active = useUiTier();
  const setLevel = useUiTierStore((s) => s.setExpertiseLevel);
  const [message, setMessage] = useState("");
  const refs = useRef<Partial<Record<ExpertiseLevel, HTMLButtonElement | null>>>({});

  function choose(level: ExpertiseLevel) {
    if (level === active) return;
    setLevel(level);
    setMessage(t("prefs_tier_saved", { tier: t(TIER_OPTION_KEYS[level].name) }));
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const next = tierForKey(active, e.key);
    if (!next) return;
    e.preventDefault();
    choose(next);
    refs.current[next]?.focus();
  }

  return (
    <section aria-labelledby="prefs-title" className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <h2 id="prefs-title" className="mb-4 text-lg font-semibold tracking-tight text-foreground">
        {t("prefs_title")}
      </h2>
      <h3 id="prefs-tier-title" className="text-base font-medium text-foreground">
        {t("prefs_tier_title")}
      </h3>
      <p id="prefs-tier-hint" className="mt-1 text-sm text-muted-foreground">
        {t("prefs_tier_hint")}
      </p>

      <div
        role="radiogroup"
        aria-labelledby="prefs-tier-title"
        aria-describedby="prefs-tier-hint"
        className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {EXPERTISE_LEVELS.map((level) => {
          const selected = level === active;
          return (
            <button
              key={level}
              ref={(el) => {
                refs.current[level] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => choose(level)}
              onKeyDown={onKeyDown}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 text-start transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                selected
                  ? "border-primary bg-primary/10"
                  : "border-border bg-background hover:bg-muted",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                  selected ? "border-primary bg-primary text-primary-foreground" : "border-input",
                )}
              >
                {selected && <Check className="size-3" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{t(TIER_OPTION_KEYS[level].name)}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{t(TIER_OPTION_KEYS[level].desc)}</span>
              </span>
            </button>
          );
        })}
      </div>

      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-xs text-muted-foreground">
        {message}
      </p>
    </section>
  );
}
