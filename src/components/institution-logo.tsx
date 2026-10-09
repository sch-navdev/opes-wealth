"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { logoBankByName } from "@/lib/banking/institutions";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

/**
 * A bank's or broker's logo beside its name. The image comes from our own
 * `/api/logo/...` proxy (registry key → site icon); if it can't load, the
 * avatar falls back to the institution's initials, so it never shows a broken
 * image.
 */
export function InstitutionLogo({
  kind,
  id,
  name,
  size = "sm",
  className,
}: {
  kind: "bank" | "broker";
  /** Bank key (`wio`, `sandbox-enbd` is also accepted) or broker id (`saxo`). */
  id: string;
  name: string;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  const key = id.replace(/^sandbox-/, "");
  return (
    <Avatar size={size} className={cn("rounded-md bg-background ring-1 ring-border", className)}>
      <AvatarImage src={`/api/logo/${kind}/${encodeURIComponent(key)}`} alt="" className="object-contain p-0.5" />
      <AvatarFallback className="rounded-md text-[10px] font-semibold">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

/** Logo for a bank known only by its display name (e.g. the institution name stored on a connection). */
export function BankLogoByName({ name, size, className }: { name: string; size?: "default" | "sm" | "lg"; className?: string }) {
  const bank = logoBankByName(name);
  return bank ? (
    <InstitutionLogo kind="bank" id={bank.key} name={name} size={size} className={className} />
  ) : null;
}
