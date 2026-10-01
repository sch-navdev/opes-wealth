"use client";

import { Globe } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/context/language-context";
import { LOCALE_INFO, isLocale } from "@/lib/locales";

/**
 * Language dropdown (header, login and Settings). Each language is listed under
 * its own name so it can always be found, whatever language the page is in.
 * Switching is instant and remembered in this browser.
 */
export function LanguageSwitcher({ compact = true }: { compact?: boolean }) {
  const { locale, setLocale, t } = useLanguage();

  return (
    <Select value={locale} onValueChange={(v) => isLocale(v) && setLocale(v)}>
      <SelectTrigger size="sm" className={compact ? "w-auto gap-1.5" : "w-full"} aria-label={t("language_switch")}>
        <Globe className="size-4 text-muted-foreground" aria-hidden="true" />
        <SelectValue>{compact ? LOCALE_INFO.find((l) => l.code === locale)?.short : undefined}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {LOCALE_INFO.map((l) => (
          <SelectItem key={l.code} value={l.code} lang={l.code} dir={l.dir}>
            {l.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
