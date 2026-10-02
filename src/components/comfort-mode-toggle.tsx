"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Eye } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/context/language-context";
import {
  readComfortMode,
  setComfortMode,
  subscribeComfortMode,
} from "@/lib/comfort-mode";

/**
 * Switch for the accessibility "comfort" display mode (larger text, high
 * contrast, bigger touch targets, labelled icons — see `lib/comfort-mode.ts`).
 * The visible label is part of the control, so it is a text-labelled switch in
 * every mode.
 */
export function ComfortModeToggle() {
  const { t } = useLanguage();
  const on = useSyncExternalStore(subscribeComfortMode, readComfortMode, () => false);

  // Re-apply the stored preference once mounted (the head script already did
  // this before paint; this covers a cleared attribute after client navigation).
  useEffect(() => {
    setComfortMode(readComfortMode());
  }, []);

  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
      <Eye className="size-4" aria-hidden="true" />
      <span>{t("comfort_mode")}</span>
      <Switch
        checked={on}
        onCheckedChange={setComfortMode}
        aria-label={t("comfort_mode")}
        title={t("comfort_mode_desc")}
      />
    </label>
  );
}
