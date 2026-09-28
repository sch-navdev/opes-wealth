"use client";

import { useSyncExternalStore } from "react";
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

// next-themes can't know the persisted theme until after hydration —
// rendering a fixed icon before that would mismatch the client's actual
// theme and cause a flash, so render a stable placeholder until mounted.
// `mounted` never changes after that, so there's nothing to subscribe to —
// this just needs the server/first-paint snapshot (false) to differ from
// every later client snapshot (true), which `useSyncExternalStore` gives
// for free without an effect-driven extra render.
function noopSubscribe() {
  return () => {};
}
const getMountedSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    noopSubscribe,
    getMountedSnapshot,
    getServerSnapshot,
  );

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
