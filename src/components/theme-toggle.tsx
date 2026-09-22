"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

const ORDER = ["light", "dark", "system"] as const;
type ThemeChoice = (typeof ORDER)[number];

const ICONS: Record<ThemeChoice, React.ReactNode> = {
  light: <Sun className="size-4" />,
  dark: <Moon className="size-4" />,
  system: <Monitor className="size-4" />,
};

const LABELS: Record<ThemeChoice, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes can't know the persisted theme until after hydration —
  // rendering a fixed icon before that would mismatch the client's actual
  // theme and cause a flash, so render a stable placeholder until mounted.
  useEffect(() => setMounted(true), []);

  const current = (theme as ThemeChoice) ?? "system";

  function cycle() {
    const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
    setTheme(next);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      aria-label={mounted ? `Switch theme (currently ${LABELS[current]})` : "Switch theme"}
      onClick={cycle}
    >
      {mounted ? ICONS[current] : <Monitor className="size-4" />}
    </Button>
  );
}
