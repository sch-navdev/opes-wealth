"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

type ThemeChoice = "light" | "dark";

const ICONS: Record<ThemeChoice, React.ReactNode> = {
  light: <Sun className="size-4" />,
  dark: <Moon className="size-4" />,
};

const LABELS: Record<ThemeChoice, string> = {
  light: "Light",
  dark: "Dark",
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes can't know the persisted theme until after hydration —
  // rendering a fixed icon before that would mismatch the client's actual
  // theme and cause a flash, so render a stable placeholder until mounted.
  useEffect(() => setMounted(true), []);

  const current = (theme as ThemeChoice) ?? "dark";

  function toggle() {
    setTheme(current === "dark" ? "light" : "dark");
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      aria-label={mounted ? `Switch theme (currently ${LABELS[current]})` : "Switch theme"}
      onClick={toggle}
    >
      {mounted ? ICONS[current] : <Moon className="size-4" />}
    </Button>
  );
}
