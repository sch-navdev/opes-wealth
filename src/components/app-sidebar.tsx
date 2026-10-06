"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsRight, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useUiTier } from "@/components/tier-gate";
import { useLanguage } from "@/context/language-context";
import { logout } from "@/app/auth/actions";
import type { TranslationKey } from "@/lib/i18n";
import { visibleNavItems } from "@/lib/nav-items";
import {
  EXPERTISE_LEVELS,
  useUiTierStore,
  type ExpertiseLevel,
} from "@/stores/useUiTierStore";

const TIER_LABEL_KEYS: Record<ExpertiseLevel, TranslationKey> = {
  basic: "tier_basic",
  standard: "tier_standard",
  professional: "tier_professional",
  expert: "tier_expert",
};

/**
 * Desktop collapse preference. `null` = no explicit choice yet: the rail is
 * expanded at `lg+` and icon-only at `md` (pure CSS). Once the user presses the
 * toggle it is pinned to `true` (icon rail) or `false` (full) and remembered.
 */
type CollapsePref = boolean | null;
const COLLAPSE_STORAGE_KEY = "opes-sidebar-collapsed";

/** Classes that show a label only when the rail is expanded. */
function labelClass(pref: CollapsePref, collapsible: boolean) {
  if (!collapsible) return "";
  return pref === null ? "hidden lg:inline" : pref ? "hidden" : "";
}

const LG_QUERY = "(min-width: 1024px)";
function subscribeLg(onChange: () => void) {
  const mq = window.matchMedia(LG_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
/** True at `lg+`; assumed true on the server so the first paint matches the desktop default. */
function useIsLg() {
  return useSyncExternalStore(subscribeLg, () => window.matchMedia(LG_QUERY).matches, () => true);
}

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
export function NavList({
  collapsible,
  onNavigate,
  pref = null,
}: {
  collapsible: boolean;
  onNavigate?: () => void;
  pref?: CollapsePref;
}) {
  const label = labelClass(pref, collapsible);
  const { t } = useLanguage();
  const pathname = usePathname();
  const level = useUiTier();
  const setLevel = useUiTierStore((s) => s.setExpertiseLevel);
  const visibleItems = visibleNavItems(level);

  return (
    <>
      <nav className="flex-1 space-y-1 px-2 py-4" aria-label="Main">
        {visibleItems.map(({ href, labelKey, icon: Icon }) => {
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
              <span className={cn("truncate", label)}>
                {t(labelKey)}
              </span>
            </Link>
          );
        })}
      </nav>

      <div
        className={cn(
          "border-t border-border px-3 py-2",
          collapsible && (pref === null ? "hidden lg:block" : pref ? "hidden" : ""),
        )}
      >
        <label className="mb-1 block text-xs text-muted-foreground" htmlFor={`tier-${collapsible ? "rail" : "drawer"}`}>
          {t("tier_label")}
        </label>
        <select
          id={`tier-${collapsible ? "rail" : "drawer"}`}
          value={level}
          onChange={(e) => setLevel(e.target.value as ExpertiseLevel)}
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
        >
          {EXPERTISE_LEVELS.map((l) => (
            <option key={l} value={l}>
              {t(TIER_LABEL_KEYS[l])}
            </option>
          ))}
        </select>
      </div>

      <form action={logout} className="border-t border-border p-2">
        <Button
          type="submit"
          variant="ghost"
          className="w-full justify-start gap-3 px-3 text-muted-foreground hover:bg-muted hover:text-foreground"
          title={t("sign_out")}
        >
          <LogOut className="size-5 shrink-0" />
          <span className={cn("truncate", label)}>
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
  const [pref, setPref] = useState<CollapsePref>(null);
  const isLg = useIsLg();
  // Effective state: the explicit choice, else the CSS default (icon rail below lg).
  const collapsed = pref ?? !isLg;

  // Restore a saved collapse choice after mount (SSR + first paint use the CSS breakpoint default).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only storage after hydration
      if (saved === "1" || saved === "0") setPref(saved === "1");
    } catch {
      /* storage unavailable: keep the responsive default */
    }
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setPref(next);
    try {
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void useUiTierStore.persist.rehydrate();
  }, []);

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
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-e border-border bg-background transition-[width] duration-300 motion-reduce:transition-none md:flex",
          pref === null ? "w-16 lg:w-64" : pref ? "w-16" : "w-64",
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-border px-4 lg:px-5">
          <Brand labelClassName={labelClass(pref, true)} />
        </div>
        <NavList collapsible pref={pref} />
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? t("sidebar_expand") : t("sidebar_collapse")}
          aria-expanded={!collapsed}
          title={collapsed ? t("sidebar_expand") : t("sidebar_collapse")}
          className="flex items-center gap-3 border-t border-border px-5 py-3 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <ChevronsRight
            className={cn(
              "size-5 shrink-0 transition-transform duration-300 motion-reduce:transition-none",
              // Points toward the collapsed side while expanded; flipped for RTL.
              collapsed ? "rtl:rotate-180" : "rotate-180 rtl:rotate-0",
            )}
            aria-hidden
          />
          <span className={cn("truncate", labelClass(pref, true))}>
            {collapsed ? t("sidebar_expand") : t("sidebar_collapse")}
          </span>
        </button>
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
