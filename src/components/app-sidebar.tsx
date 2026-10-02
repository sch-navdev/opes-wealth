"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Factory, Landmark, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, Telescope, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";
import { logout } from "@/app/auth/actions";
import type { TranslationKey } from "@/lib/i18n";

const NAV_ITEMS: { href: string; labelKey: TranslationKey; icon: typeof LayoutDashboard }[] = [
  { href: "/dashboard", labelKey: "nav_dashboard", icon: LayoutDashboard },
  { href: "/dashboard/banking", labelKey: "nav_banking", icon: Landmark },
  { href: "/dashboard/companies", labelKey: "nav_companies", icon: Factory },
  { href: "/dashboard/planning", labelKey: "nav_planning", icon: Telescope },
  { href: "/dashboard/settings", labelKey: "profile_settings", icon: Settings },
  { href: "/dashboard/security", labelKey: "nav_security", icon: ShieldCheck },
];

function isActiveHref(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

function Brand({ labelClassName }: { labelClassName?: string }) {
  return (
    <>
      <Image
        src="/logo.png"
        alt="Opes Wealth"
        width={32}
        height={32}
        className="size-8 shrink-0"
        priority
      />
      <span className={cn("truncate text-lg font-semibold text-foreground", labelClassName)}>
        Opes Wealth
      </span>
    </>
  );
}

/**
 * Nav list shared by the rail and the mobile drawer. `collapsible` hides the
 * labels below `lg` (tablet icon-only rail, with `title=` as the tooltip);
 * the drawer always shows labels.
 */
function NavList({
  collapsible,
  onNavigate,
}: {
  collapsible: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useLanguage();
  const pathname = usePathname();

  return (
    <>
      <nav className="flex-1 space-y-1 px-2 py-4" aria-label="Main">
        {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
          const active = isActiveHref(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              title={t(labelKey)}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-5 shrink-0" />
              <span className={cn("truncate", collapsible && "hidden lg:inline")}>
                {t(labelKey)}
              </span>
            </Link>
          );
        })}
      </nav>

      <form action={logout} className="border-t border-border p-2">
        <Button
          type="submit"
          variant="ghost"
          className="w-full justify-start gap-3 px-3 text-muted-foreground hover:bg-muted hover:text-foreground"
          title={t("sign_out")}
        >
          <LogOut className="size-5 shrink-0" />
          <span className={cn("truncate", collapsible && "hidden lg:inline")}>
            {t("sign_out")}
          </span>
        </Button>
      </form>
    </>
  );
}

/**
 * Global app shell navigation, rendered once from `app/dashboard/layout.tsx`.
 * Expanded sidebar (icons + labels) at `lg+`, icon-only rail at `md`–`lg`
 * (pure CSS breakpoints, no JS toggle), and below `md` a top bar whose
 * hamburger opens a start-side drawer over a dimmed backdrop. Only semantic
 * theme tokens are used so it follows `next-themes` light/dark.
 */
export function AppSidebar() {
  const { t } = useLanguage();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen]);

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-16 shrink-0 flex-col border-e border-border bg-background transition-[width] duration-300 md:flex lg:w-64">
        <div className="flex h-16 items-center gap-3 border-b border-border px-4 lg:px-5">
          <Brand labelClassName="hidden lg:inline" />
        </div>
        <NavList collapsible />
      </aside>

      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4 md:hidden">
        <div className="flex items-center gap-2">
          <Brand />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("menu")}
          aria-expanded={drawerOpen}
          aria-controls="mobile-nav-drawer"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
      </header>

      <div
        className={cn(
          "fixed inset-0 z-50 md:hidden",
          drawerOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!drawerOpen}
      >
        <div
          className={cn(
            "absolute inset-0 bg-foreground/40 transition-opacity duration-300",
            drawerOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setDrawerOpen(false)}
        />
        <aside
          id="mobile-nav-drawer"
          role="dialog"
          aria-modal="true"
          aria-label={t("menu")}
          className={cn(
            "absolute inset-y-0 start-0 flex w-64 max-w-[80vw] flex-col border-e border-border bg-background shadow-xl transition-transform duration-300",
            drawerOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex h-14 items-center justify-between gap-3 border-b border-border px-4">
            <div className="flex min-w-0 items-center gap-2">
              <Brand />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("close")}
              onClick={() => setDrawerOpen(false)}
            >
              <X className="size-5" />
            </Button>
          </div>
          <NavList collapsible={false} onNavigate={() => setDrawerOpen(false)} />
        </aside>
      </div>
    </>
  );
}
