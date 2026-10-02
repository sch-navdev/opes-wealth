"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Laptop, LogOut, MapPin, ShieldCheck, Smartphone, Terminal } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/context/language-context";
import { parseDeviceInfo, type DeviceType } from "@/lib/device-info";
import { revokeOtherSessions, revokeSession } from "@/app/dashboard/security/actions";
import type { TranslationKey } from "@/lib/i18n";
import { formatLocation } from "@/lib/session-location";

export type SessionRow = {
  id: string;
  createdAt: string;
  lastActiveAt: string;
  userAgent: string | null;
  ip: string | null;
  city: string | null;
  country: string | null;
  /** The proxy has recorded this session's real location (otherwise IP/UA are the server's). */
  located: boolean;
  isCurrent: boolean;
};

const DEVICE_ICONS: Record<DeviceType, typeof Laptop> = {
  computer: Laptop,
  mobile: Smartphone,
  app: Terminal,
};

const DEVICE_LABEL_KEYS: Record<DeviceType, TranslationKey> = {
  computer: "security_device_computer",
  mobile: "security_device_mobile",
  app: "security_device_app",
};

function formatDateTime(iso: string, locale: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? iso
    : new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(parsed);
}

function RevokeButton({
  title,
  description,
  label,
  pendingLabel,
  variant,
  disabled,
  onConfirm,
  isPending,
  error,
}: {
  title: string;
  description: string;
  label: string;
  pendingLabel: string;
  variant: "outline" | "destructive";
  disabled?: boolean;
  onConfirm: () => void;
  isPending: boolean;
  error: string | null;
}) {
  const { t } = useLanguage();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant={variant} size="sm" disabled={disabled}>
          <LogOut className="size-4" />
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="border-border bg-card">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? pendingLabel : label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function SecuritySessions({
  sessions,
  loadError,
}: {
  sessions: SessionRow[];
  loadError: string | null;
}) {
  const { t, intlLocale } = useLanguage();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isOthersPending, startOthersTransition] = useTransition();
  const [othersError, setOthersError] = useState<string | null>(null);

  const otherSessions = sessions.filter((s) => !s.isCurrent);

  function handleRevoke(id: string) {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await revokeSession(id);
      setPendingId(null);
      if (!result.ok) setError({ id, message: result.error });
    });
  }

  function handleRevokeOthers() {
    setOthersError(null);
    startOthersTransition(async () => {
      const result = await revokeOtherSessions();
      if (!result.ok) setOthersError(result.error);
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("security_title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("security_subtitle")}</p>
        </div>
        <Link
          href="/dashboard/mfa"
          className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
        >
          <ShieldCheck className="size-4" />
          {t("security_manage_mfa")}
        </Link>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-foreground">{t("security_sessions_heading")}</CardTitle>
          {otherSessions.length > 0 && (
            <RevokeButton
              title={t("security_revoke_others_title")}
              description={t("security_revoke_others_desc", { n: otherSessions.length })}
              label={t("security_revoke_others")}
              pendingLabel={t("security_revoking")}
              variant="outline"
              onConfirm={handleRevokeOthers}
              isPending={isOthersPending}
              error={othersError}
            />
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("security_sessions_desc")}</p>

          {loadError ? (
            <div className="space-y-1 text-sm" role="alert">
              <p className="text-destructive">{t("security_load_error")}</p>
              <p className="text-muted-foreground">{t("security_migration_hint")}</p>
              <p className="font-mono text-xs text-muted-foreground">{loadError}</p>
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("security_no_sessions")}</p>
          ) : (
            <ul className="divide-y divide-border border border-border">
              {sessions.map((session) => {
                const device = parseDeviceInfo(session.userAgent);
                const Icon = DEVICE_ICONS[device.type];
                const detail = [device.browser, device.os].filter(Boolean).join(" · ");
                return (
                  <li
                    key={session.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center border border-border bg-background text-primary">
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">
                            {t(DEVICE_LABEL_KEYS[device.type])}
                          </span>
                          {detail && (
                            <span className="text-sm text-muted-foreground">{detail}</span>
                          )}
                          {session.isCurrent && (
                            <Badge variant="secondary">{t("security_this_device")}</Badge>
                          )}
                        </div>
                        <p className="text-xs text-foreground/80">
                          <MapPin className="me-1 inline size-3.5 text-primary" aria-hidden="true" />
                          {t("security_location")}:{" "}
                          {formatLocation(session.city, session.country, intlLocale) ??
                            t(session.located ? "security_location_unavailable" : "security_location_not_recorded")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("security_ip")}: {session.ip ?? t("security_unknown_ip")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("security_last_active")}: {formatDateTime(session.lastActiveAt, intlLocale)}
                          {" · "}
                          {t("security_signed_in")}: {formatDateTime(session.createdAt, intlLocale)}
                        </p>
                        {session.userAgent && (
                          <p
                            className="max-w-full truncate text-xs text-muted-foreground/70"
                            title={session.userAgent}
                          >
                            {session.userAgent}
                          </p>
                        )}
                      </div>
                    </div>
                    {!session.isCurrent && (
                      <RevokeButton
                        title={t("security_revoke_title")}
                        description={t("security_revoke_desc")}
                        label={t("security_revoke")}
                        pendingLabel={t("security_revoking")}
                        variant="destructive"
                        onConfirm={() => handleRevoke(session.id)}
                        isPending={isPending && pendingId === session.id}
                        error={error?.id === session.id ? error.message : null}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-xs text-muted-foreground">{t("security_jwt_note")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
