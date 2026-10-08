"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useLanguage } from "@/context/language-context";
import type { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type ThemeChoice = "light" | "dark" | "system";

const CHOICES: { value: ThemeChoice; labelKey: TranslationKey; icon: typeof Sun }[] = [
  { value: "light", labelKey: "theme_light", icon: Sun },
  { value: "dark", labelKey: "theme_dark", icon: Moon },
  { value: "system", labelKey: "theme_device", icon: Monitor },
];

// next-themes can't know the persisted theme until after hydration: until then no option is shown as
// selected, so the server render and the first client render match. `mounted` never changes after that,
// so there is nothing to subscribe to; the server/first-paint snapshot (false) just has to differ from
// every later client snapshot (true).
function noopSubscribe() {
  return () => {};
}
const getMountedSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Light / Dark / Device (follow the system) as a three-option radio group. Device is the default for a
 * visitor who has not chosen (see `ThemeProvider`).
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useLanguage();
  const mounted = useSyncExternalStore(noopSubscribe, getMountedSnapshot, getServerSnapshot);
  const current = mounted ? ((theme as ThemeChoice | undefined) ?? "system") : null;

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const dir = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    event.preventDefault();
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const step = rtl && (event.key === "ArrowRight" || event.key === "ArrowLeft") ? -dir : dir;
    const index = Math.max(0, CHOICES.findIndex((c) => c.value === current));
    const next = CHOICES[(index + step + CHOICES.length) % CHOICES.length];
    setTheme(next.value);
    (event.currentTarget.querySelector(`[data-theme-choice="${next.value}"]`) as HTMLElement | null)?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={t("theme_label")}
      onKeyDown={onKeyDown}
      className="inline-flex border border-border bg-background"
    >
      {CHOICES.map(({ value, labelKey, icon: Icon }) => {
        const selected = current === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t(labelKey)}
            title={t(labelKey)}
            data-theme-choice={value}
            tabIndex={selected || (current === null && value === "system") ? 0 : -1}
            onClick={() => setTheme(value)}
            className={cn(
              "flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
              selected && "bg-primary text-primary-foreground hover:text-primary-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
