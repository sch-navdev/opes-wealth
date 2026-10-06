"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, FileSpreadsheet, Plus, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useUiTier } from "@/components/tier-gate";
import { useLanguage } from "@/context/language-context";
import { useUiTierStore } from "@/stores/useUiTierStore";
import { visibleNavItems } from "@/lib/nav-items";
import {
  OPEN_COMMAND_MENU_EVENT,
  openCommandMenu,
  requestQuickAction,
  type QuickAction,
} from "@/lib/command-menu-events";
import {
  canUploadStatement,
  currencyItems,
  holdingHref,
  holdingKeywords,
  matchesSearch,
  tierSwitchItems,
  type CommandHolding,
} from "@/lib/command-menu-items";
import { cn } from "@/lib/utils";

export type { CommandHolding };

const noopSubscribe = () => () => {};
function useShortcutHint(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => (/mac|iphone|ipad/i.test(navigator.platform) ? "⌘K" : "Ctrl K"),
    () => "Ctrl K",
  );
}

/**
 * Persistent search button for the dashboard header. It only asks the palette (mounted once
 * in the dashboard layout) to open; the Ctrl/Cmd+K hint matches the platform.
 */
export function CommandMenuTrigger({ className }: { className?: string }) {
  const { t } = useLanguage();
  const hint = useShortcutHint();
  return (
    <button
      type="button"
      onClick={openCommandMenu}
      aria-label={t("cmdk_trigger_aria")}
      title={t("cmdk_trigger_aria")}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="hidden sm:inline">{t("cmdk_trigger")}</span>
      <kbd className="ms-2 hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground md:inline">
        {hint}
      </kbd>
    </button>
  );
}

/** Command palette (Ctrl/Cmd+K). Holds only the open state until opened; the lists mount with the dialog. */
export function CommandMenu({ holdings }: { holdings: CommandHolding[] }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  // A quick action that opens its own dialog must keep focus; otherwise Radix returns focus to the opener.
  const keepFocus = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_COMMAND_MENU_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_COMMAND_MENU_EVENT, onOpen);
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden p-0 motion-reduce:animate-none sm:max-w-xl"
        onCloseAutoFocus={(e) => {
          if (keepFocus.current) {
            e.preventDefault();
            keepFocus.current = false;
          }
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t("cmdk_title")}</DialogTitle>
          <DialogDescription>{t("cmdk_desc")}</DialogDescription>
        </DialogHeader>
        <Palette
          holdings={holdings}
          onDone={(opensDialog) => {
            keepFocus.current = opensDialog;
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function Palette({
  holdings,
  onDone,
}: {
  holdings: CommandHolding[];
  onDone: (opensDialog: boolean) => void;
}) {
  const { t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const tier = useUiTier();
  const setTier = useUiTierStore((s) => s.setExpertiseLevel);

  const onDashboard = pathname === "/dashboard";
  const currentCurrency =
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("currency");

  const pages = visibleNavItems(tier);
  const views = tierSwitchItems(tier);

  function go(href: string) {
    onDone(false);
    router.push(href);
  }

  function quickAction(action: QuickAction) {
    onDone(true);
    if (!onDashboard) router.push("/dashboard");
    requestQuickAction(action);
  }

  function setCurrency(code: string) {
    const params = new URLSearchParams(window.location.search);
    params.set("currency", code);
    go(`${pathname}?${params.toString()}`);
  }

  return (
    <Command
      label={t("cmdk_title")}
      // Match on the visible keywords only (the item value carries an id that would pollute fuzzy search).
      filter={(value, search, keywords) => (matchesSearch(keywords?.length ? keywords.join(" ") : value, search) ? 1 : 0)}
      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5"
    >
      <CommandInput placeholder={t("cmdk_placeholder")} />
      <CommandList>
        <CommandEmpty>{t("cmdk_empty")}</CommandEmpty>

        {holdings.length > 0 && (
          <CommandGroup heading={t("cmdk_group_holdings")}>
            {holdings.map((h) => (
              <CommandItem
                key={h.id}
                value={`holding ${h.id}`}
                keywords={holdingKeywords(h)}
                onSelect={() => go(holdingHref(h.id))}
              >
                <span className="min-w-0 flex-1 truncate">{h.name}</span>
                {h.ticker_symbol && (
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{h.ticker_symbol}</span>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {h.is_liability ? t("cmdk_liability") : h.category}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading={t("cmdk_group_pages")}>
          {pages.map(({ id, href, labelKey, icon: Icon }) => (
            <CommandItem key={id} value={`page ${id}`} keywords={[t(labelKey)]} onSelect={() => go(href)}>
              <Icon aria-hidden />
              <span className="truncate">{t(labelKey)}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading={t("cmdk_group_actions")}>
          <CommandItem
            value="action add-asset"
            keywords={[t("cmdk_add_asset")]}
            onSelect={() => quickAction("add-asset")}
          >
            <Plus aria-hidden />
            <span className="truncate">{t("cmdk_add_asset")}</span>
          </CommandItem>
          {canUploadStatement(tier) && (
            <CommandItem
              value="action upload-statement"
              keywords={[t("cmdk_upload_statement")]}
              onSelect={() => quickAction("upload-statement")}
            >
              <FileSpreadsheet aria-hidden />
              <span className="truncate">{t("cmdk_upload_statement")}</span>
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading={t("cmdk_group_view")}>
          {views.map(({ level, nameKey, current }) => {
            const label = t("cmdk_view_item", { tier: t(nameKey) });
            return (
              <CommandItem
                key={level}
                value={`view ${level}`}
                keywords={[label]}
                aria-current={current ? "true" : undefined}
                onSelect={() => {
                  if (!current) setTier(level);
                  onDone(false);
                }}
              >
                <Check aria-hidden className={cn(!current && "invisible")} />
                <span className="truncate">{label}</span>
                {current && <CommandShortcut>{t("cmdk_current")}</CommandShortcut>}
              </CommandItem>
            );
          })}
        </CommandGroup>

        {onDashboard && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("cmdk_group_currency")}>
              {currencyItems(currentCurrency).map(({ code, name, current }) => {
                const label = t("cmdk_currency_item", { code });
                return (
                  <CommandItem
                    key={code}
                    value={`currency ${code}`}
                    keywords={[label, name]}
                    aria-current={current ? "true" : undefined}
                    onSelect={() => setCurrency(code)}
                  >
                    <Check aria-hidden className={cn(!current && "invisible")} />
                    <span className="truncate">{label}</span>
                    {current && <CommandShortcut>{t("cmdk_current")}</CommandShortcut>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  );
}
