"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LogOut, Menu, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";
import { logout } from "@/app/auth/actions";
import type { TranslationKey } from "@/lib/i18n";

const NAV_ITEMS: { href: string; labelKey: TranslationKey; icon: typeof LayoutDashboard }[] = [
  { href: "/dashboard", labelKey: "nav_dashboard", icon: LayoutDashboard },
  { href: "/dashboard/settings", labelKey: "profile_settings", icon: Settings },
];

function isActiveHref(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

/**
 * Global app shell navigation — a Finary-style sidebar that goes full
 * (icons + labels) at `lg`, collapses to icons-only between `md` and `lg` to
 * keep horizontal room for data-dense tables/charts, and gives way to a
 * top bar + slide-down menu below `md`. Rendered once from
 * `app/dashboard/layout.tsx` rather than duplicated per page.
 */
export function AppSidebar() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-16 shrink-0 flex-col border-r border-border bg-card transition-[width] duration-300 md:flex lg:w-64">
        <div className="flex h-16 items-center gap-3 border-b border-border px-4 lg:px-5">
          <Image
            src="/logo.png"
            alt="Opes Wealth"
            width={32}
            height={32}
            className="size-8 shrink-0"
            priority
          />
          <span className="hidden truncate text-lg font-semibold text-foreground lg:inline">
            Opes Wealth
          </span>
        </div>

        <nav className="flex-1 space-y-1 px-2 py-4">
          {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
            const active = isActiveHref(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                title={t(labelKey)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-5 shrink-0" />
                <span className="hidden truncate lg:inline">{t(labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        <form action={logout} className="border-t border-border p-2">
          <Button
            type="submit"
            variant="ghost"
            className="w-full justify-start gap-3 px-3 text-muted-foreground hover:text-foreground"
            title={t("sign_out")}
          >
            <LogOut className="size-5 shrink-0" />
            <span className="hidden truncate lg:inline">{t("sign_out")}</span>
          </Button>
        </form>
      </aside>

      <div className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 md:hidden">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="Opes Wealth" width={28} height={28} className="size-7" priority />
          <span className="text-base font-semibold text-foreground">Opes Wealth</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-x-0 top-14 z-30 space-y-1 border-b border-border bg-card p-2 shadow-lg md:hidden">
          {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                isActiveHref(pathname, href)
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-muted",
              )}
            >
              <Icon className="size-5" />
              {t(labelKey)}
            </Link>
          ))}
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LogOut className="size-5" />
              {t("sign_out")}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
