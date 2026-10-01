"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Camera, LifeBuoy, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/context/language-context";
import type { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Message = { role: "user" | "assistant"; content: string; shot?: string };

const MAX_SCREENSHOT_CHARS = 2_900_000;

/**
 * Captures the visible page as a JPEG data URL. Done in the browser with
 * html-to-image (html2canvas chokes on modern CSS colour functions). The chat
 * widget itself is left out, and, when `maskAmounts` is on, every amount
 * (`.tabular-nums`) is blurred first; best-effort, so the user always sees
 * the screenshot before it is sent.
 */
async function captureViewport(maskAmounts: boolean): Promise<string> {
  const { toJpeg } = await import("html-to-image");
  const root = document.documentElement;
  if (maskAmounts) root.classList.add("help-capture-mask");
  try {
    const options = {
      pixelRatio: 0.75,
      // Page fonts are self-hosted and already rendered; re-embedding them is slow and the main cause of hangs.
      skipFonts: true,
      imagePlaceholder: "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      width: window.innerWidth,
      height: window.innerHeight,
      style: { transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)`, transformOrigin: "top left" },
      filter: (node: Node) => !(node instanceof HTMLElement && node.hasAttribute("data-help-widget")),
    };
    let url = await toJpeg(document.body, { ...options, quality: 0.7 });
    if (url.length > MAX_SCREENSHOT_CHARS) url = await toJpeg(document.body, { ...options, quality: 0.4, pixelRatio: 0.5 });
    if (url.length > MAX_SCREENSHOT_CHARS) throw new Error("too_large");
    return url;
  } finally {
    root.classList.remove("help-capture-mask");
  }
}

/**
 * Floating, collapsible AI help chat (bottom-right of the dashboard). Talks to
 * `/api/assistant`; the user can attach a screenshot of the current page so the
 * assistant can diagnose a visual/UI problem. Messages live in memory only (they
 * survive navigation inside the dashboard, not a reload).
 */
export function HelpChatWidget() {
  const { t, locale } = useLanguage();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [maskAmounts, setMaskAmounts] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending, open]);

  async function handleCapture() {
    setError(null);
    setCapturing(true);
    try {
      // A capture that never finishes (e.g. the tab is in the background) must not leave the button stuck.
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000));
      setShot(await Promise.race([captureViewport(maskAmounts), timeout]));
    } catch {
      setError("help_error_capture");
    } finally {
      setCapturing(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || pending) return;
    const next: Message[] = [...messages, { role: "user", content: text, shot: shot ?? undefined }];
    setMessages(next);
    setInput("");
    const attached = shot;
    setShot(null);
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map(({ role, content }) => ({ role, content })),
          screenshot: attached ?? undefined,
          page: pathname,
          locale,
        }),
      });
      if (!res.ok) {
        const code = ((await res.json().catch(() => ({}))) as { error?: string }).error;
        setError(
          code === "not_configured" ? "help_error_not_configured" : code === "rate_limited" ? "help_error_rate" : "help_error_generic",
        );
        return;
      }
      const data = (await res.json()) as { reply: string; bugLogged?: boolean };
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch {
      setError("help_error_generic");
    } finally {
      setPending(false);
    }
  }

  return (
    <div data-help-widget className="fixed bottom-4 end-4 z-50 flex flex-col items-end gap-3 print:hidden">
      {open && (
        <section
          role="dialog"
          aria-label={t("help_title")}
          className="flex h-[min(34rem,calc(100vh-6rem))] w-[min(24rem,calc(100vw-2rem))] flex-col border border-border bg-card text-card-foreground shadow-lg"
        >
          <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-foreground">{t("help_title")}</h2>
              <p className="truncate text-xs text-muted-foreground">{t("help_subtitle")}</p>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label={t("help_close")}>
              <X className="size-4" />
            </Button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
            {messages.length === 0 && <p className="text-muted-foreground">{t("help_welcome")}</p>}
            {messages.map((m, i) => (
              <div key={i} className={cn("flex flex-col gap-1", m.role === "user" ? "items-end" : "items-start")}>
                {m.shot && (
                  // eslint-disable-next-line @next/next/no-img-element -- local data URL, nothing to optimise
                  <img src={m.shot} alt={t("help_screenshot_alt")} className="max-h-24 border border-border" />
                )}
                <p
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap px-3 py-2",
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                  )}
                >
                  {m.content}
                </p>
              </div>
            ))}
            {pending && <p className="text-xs text-muted-foreground">{t("help_thinking")}</p>}
            {error && (
              <p className="text-xs text-destructive" role="alert">
                {t(error)}
              </p>
            )}
            <div ref={endRef} />
          </div>

          <div className="space-y-2 border-t border-border p-3">
            {shot && (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- local data URL, nothing to optimise */}
                <img src={shot} alt={t("help_screenshot_alt")} className="h-12 border border-border" />
                <Button type="button" variant="ghost" size="sm" onClick={() => setShot(null)}>
                  {t("help_remove_screenshot")}
                </Button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Checkbox
                id="help-mask"
                checked={maskAmounts}
                onCheckedChange={(v) => setMaskAmounts(v === true)}
              />
              <Label htmlFor="help-mask" className="text-xs font-normal text-muted-foreground">
                {t("help_mask_amounts")}
              </Label>
            </div>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
            >
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => void handleCapture()}
                disabled={capturing || pending}
                aria-label={t("help_capture")}
                title={t("help_capture_hint")}
              >
                <Camera className="size-4" />
              </Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("help_placeholder")}
                maxLength={4000}
                disabled={pending}
              />
              <Button type="submit" size="icon" disabled={!input.trim() || pending} aria-label={t("help_send")}>
                <Send className="size-4" />
              </Button>
            </form>
            <p className="text-[11px] leading-tight text-muted-foreground">{t("help_privacy_note")}</p>
          </div>
        </section>
      )}

      <Button
        type="button"
        size="lg"
        className="rounded-full shadow-lg"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? t("help_close") : t("help_open")}
      >
        <LifeBuoy className="size-5" />
        {!open && t("help_button")}
      </Button>
    </div>
  );
}
