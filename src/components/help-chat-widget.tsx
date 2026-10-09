"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { LifeBuoy, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/context/language-context";
import type { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const transport = new DefaultChatTransport({ api: "/api/chat" });

/**
 * Reasoning models (Qwen, gpt-oss) may send their thinking inside <think> tags; only the answer is shown.
 * An unclosed tag (the reply is still streaming) hides everything after it.
 */
export function visibleReply(text: string): string {
  return text.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, "").trim();
}

/** The route answers with JSON { error } on refusal; the hook puts that body in the error message. */
function errorKey(error: Error): TranslationKey {
  let code = "";
  try {
    code = (JSON.parse(error.message) as { error?: string }).error ?? "";
  } catch {
    /* a network or streaming failure, not a refusal */
  }
  if (code === "not_configured") return "help_error_not_configured";
  if (code === "rate_limited" || code === "upstream_429") return "help_error_rate";
  if (code === "unauthenticated") return "help_chat_err_auth";
  if (/^upstream_(400|401|403|404)$/.test(code)) return "help_chat_err_provider";
  return "help_error_generic";
}

/**
 * Floating, collapsible AI help chat (bottom-right of the dashboard). Uses the AI SDK `useChat` hook against
 * `/api/chat` and renders the reply as it streams in. Messages live in memory only (they survive navigation
 * inside the dashboard, not a reload).
 */
export function HelpChatWidget() {
  const { t, locale } = useLanguage();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat({ transport });
  const pending = status === "submitted" || status === "streaming";
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status, open]);

  function handleSend() {
    const text = input.trim();
    if (!text || pending) return;
    void sendMessage({ text }, { body: { page: pathname, locale } });
    setInput("");
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
            {messages.length === 0 && <p className="text-muted-foreground">{t("help_chat_welcome")}</p>}
            {messages.map((m) => {
              const raw = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
              const text = m.role === "assistant" ? visibleReply(raw) : raw;
              if (!text) return null;
              return (
                <div key={m.id} className={cn("flex flex-col gap-1", m.role === "user" ? "items-end" : "items-start")}>
                  <p
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap px-3 py-2",
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                    )}
                  >
                    {text}
                  </p>
                </div>
              );
            })}
            {status === "submitted" && <p className="text-xs text-muted-foreground">{t("help_thinking")}</p>}
            {error && (
              <p className="text-xs text-destructive" role="alert">
                {t(errorKey(error))}
              </p>
            )}
            <div ref={endRef} />
          </div>

          <div className="space-y-2 border-t border-border p-3">
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
            >
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
            <p className="text-xs leading-tight text-muted-foreground">{t("help_chat_privacy")}</p>
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
