"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useLanguage } from "@/context/language-context";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/dashboard/ownership-actions";
import {
  notificationMessageKey,
  notificationParams,
  relativeTime,
  type NotificationItem,
} from "@/lib/notifications";

/**
 * Header bell for the OUTCOME of changes the signed-in user proposed to a co-owned asset
 * (approved / rejected / auto-applied after 7 days). Sits next to the approvals bell, which
 * is the opposite direction (changes waiting for the user). The server passes the latest
 * notifications; reading one is applied optimistically here and persisted by a server action
 * (which also revalidates the layout, so the next render carries the stored state).
 */
export function NotificationsBell({ items }: { items: NotificationItem[] }) {
  const { t, intlLocale } = useLanguage();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  // Ids read in this session; merged over the server state so the UI updates at once.
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(new Set());
  const [allRead, setAllRead] = useState(false);

  const isUnread = (n: NotificationItem) =>
    !n.readAt && !allRead && !readIds.has(n.id);
  const unread = items.filter(isUnread).length;
  const label =
    unread > 0 ? t("notif_bell_label", { n: unread }) : t("notif_title");

  function read(id: string) {
    setReadIds((prev) => new Set(prev).add(id));
    startTransition(async () => {
      await markNotificationRead(id);
    });
  }

  function readAll() {
    setAllRead(true);
    startTransition(async () => {
      await markAllNotificationsRead();
    });
  }

  function openItem(n: NotificationItem) {
    if (isUnread(n)) read(n.id);
    setOpen(false);
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={label}
            className="relative"
          >
            <Bell className="size-4" aria-hidden="true" />
            {unread > 0 && (
              <span
                aria-hidden="true"
                className="absolute -end-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
              >
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-[min(92vw,26rem)] space-y-3 border-border bg-popover p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">
              {t("notif_title")}
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={unread === 0}
              onClick={readAll}
            >
              <CheckCheck className="size-4" aria-hidden="true" />
              {t("notif_mark_all")}
            </Button>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("notif_empty")}</p>
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto">
              {items.map((n) => {
                const unreadItem = isUnread(n);
                const params = notificationParams(
                  n.data,
                  t("notif_someone"),
                  t("notif_asset_fallback"),
                );
                const body = (
                  <>
                    <span className="flex items-start gap-2">
                      {unreadItem && (
                        <>
                          <span
                            aria-hidden="true"
                            className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                          />
                          <span className="sr-only">{t("notif_unread")}: </span>
                        </>
                      )}
                      <span
                        className={
                          unreadItem
                            ? "font-medium text-foreground"
                            : "text-muted-foreground"
                        }
                      >
                        {t(notificationMessageKey(n.kind), params)}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {relativeTime(n.createdAt, intlLocale)}
                    </span>
                  </>
                );
                const cls = `block w-full border border-border p-3 text-start text-sm transition-colors motion-reduce:transition-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  unreadItem ? "bg-accent/40" : "bg-card"
                }`;
                return (
                  <li key={n.id}>
                    {n.assetId ? (
                      <Link
                        href={`/dashboard/assets/${n.assetId}`}
                        className={cls}
                        onClick={() => openItem(n)}
                      >
                        {body}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className={cls}
                        onClick={() => openItem(n)}
                      >
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </PopoverContent>
      </Popover>
      {/* Live region outside the popover so a changing count is announced while it is closed. */}
      <span role="status" className="sr-only">
        {unread > 0 ? t("notif_bell_label", { n: unread }) : ""}
      </span>
    </>
  );
}
