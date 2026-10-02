"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";
import type { ApprovalStatus, OwnershipStatus, OwnerStatus } from "@/lib/shared-assets/server";
import { resendApprovalEmail, resendCoOwnerInvite, revokePendingCoOwner } from "@/app/dashboard/ownership-actions";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

/**
 * Who owns the asset, whether each co-owner was emailed (and when), and — while a
 * change is waiting — each approver's decision and the time left before it applies
 * automatically (days, then hours for the last 24 hours).
 */
export function OwnershipStatusPanel({ assetId, status }: { assetId: string; status: OwnershipStatus }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, okKey: TranslationKey = "ownership_resend_done") {
    setMessage(null);
    startTransition(async () => {
      const res = await action();
      setMessage(
        res.ok
          ? { ok: true, text: t(okKey) }
          : { ok: false, text: res.error.startsWith("ownership_") ? t(res.error as TranslationKey) : res.error },
      );
      if (res.ok) router.refresh();
    });
  }

  const left = status.request?.timeLeft;
  const leftText = !left
    ? ""
    : left.unit === "expired"
      ? t("ownership_time_expired")
      : t(
          (left.unit === "days"
            ? left.n === 1 ? "ownership_time_day" : "ownership_time_days"
            : left.n === 1 ? "ownership_time_hour" : "ownership_time_hours") as TranslationKey,
          { n: left.n },
        );

  function emailLine(kind: "not_sent" | "sent" | "failed", at: string | null, error: string | null) {
    if (kind === "sent") return { text: t("ownership_email_sent", { date: fmtDate(at) }), tone: "text-success" };
    if (kind === "failed") return { text: t("ownership_email_failed", { reason: error ?? "" }), tone: "text-destructive" };
    return { text: t("ownership_email_not_sent"), tone: "text-muted-foreground" };
  }

  const decisionKey: Record<ApprovalStatus["status"], TranslationKey> = {
    pending: "ownership_approval_waiting",
    approved: "ownership_approval_approved",
    rejected: "ownership_approval_rejected",
  };

  return (
    <div className="space-y-4 border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">{t("ownership_status_title")}</p>
      </div>

      {status.request && (
        <div className="space-y-3 border border-primary/40 bg-primary/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-foreground">{t("ownership_pending_request", { name: status.request.requesterName })}</p>
            <p className="flex items-center gap-1.5 text-sm font-medium tabular-nums text-primary" role="status">
              <Clock className="size-4" aria-hidden="true" />
              {leftText}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">{t("ownership_auto_apply")}</p>
          <ul className="space-y-2">
            {status.request.approvals.map((a) => {
              const mail = emailLine(a.notifyStatus, a.notifiedAt, a.notifyError);
              return (
                <li key={a.profileId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-foreground">{a.name || a.email}</span>
                  <span className="flex flex-wrap items-center gap-3">
                    <span className={cn("flex items-center gap-1 text-xs", mail.tone)}>
                      <Mail className="size-3.5" aria-hidden="true" />
                      {mail.text}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-medium",
                        a.status === "approved" && "text-success",
                        a.status === "rejected" && "text-destructive",
                        a.status === "pending" && "text-primary",
                      )}
                    >
                      {t(decisionKey[a.status])}
                    </span>
                    {status.request?.isMine && a.status === "pending" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => run(() => resendApprovalEmail(status.request!.id, a.profileId))}
                      >
                        {t("ownership_resend")}
                      </Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ul className="space-y-2">
        {status.owners.map((o) => (
          <OwnerLine key={o.key} owner={o} canResend={status.isCreator} pending={pending} run={run} assetId={assetId} emailLine={emailLine} />
        ))}
      </ul>

      {message && (
        <p className={cn("text-xs", message.ok ? "text-success" : "text-destructive")} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}

function OwnerLine({
  owner,
  canResend,
  pending,
  run,
  assetId,
  emailLine,
}: {
  owner: OwnerStatus;
  canResend: boolean;
  pending: boolean;
  run: (action: () => Promise<{ ok: true } | { ok: false; error: string }>, okKey?: TranslationKey) => void;
  assetId: string;
  emailLine: (kind: "not_sent" | "sent" | "failed", at: string | null, error: string | null) => { text: string; tone: string };
}) {
  const { t } = useLanguage();
  const mail = emailLine(owner.inviteStatus, owner.invitedAt, owner.inviteError);
  // The creator, and people who already finished sign-up, need no invitation line.
  const needsInvite = !owner.isCreator && !owner.joined;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="min-w-0 truncate text-foreground">
        {owner.isYou ? t("owners_you") : owner.name || owner.email}
        <span className="ms-2 tabular-nums text-xs text-muted-foreground">{owner.percentage}%</span>
      </span>
      <span className="flex flex-wrap items-center gap-3 text-xs">
        {owner.isCreator || owner.joined ? (
          <span className="text-success">{t("ownership_joined")}</span>
        ) : (
          <span className="text-primary">{t("ownership_invite_pending")}</span>
        )}
        {needsInvite && (
          <>
            <span className={cn("flex items-center gap-1", mail.tone)}>
              <Mail className="size-3.5" aria-hidden="true" />
              {mail.text}
            </span>
            {canResend && (
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => resendCoOwnerInvite(assetId, owner.email))}>
                {t("ownership_resend_invite")}
              </Button>
            )}
            {canResend && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(t("ownership_revoke_confirm", { name: owner.name || owner.email }))) {
                    run(() => revokePendingCoOwner(assetId, owner.email), "ownership_revoked");
                  }
                }}
              >
                {t("ownership_revoke")}
              </Button>
            )}
          </>
        )}
      </span>
    </li>
  );
}
