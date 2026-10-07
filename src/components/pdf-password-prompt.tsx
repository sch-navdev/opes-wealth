"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/context/language-context";

/**
 * Inline prompt shown when an uploaded PDF is password protected. The password lives only
 * in this component's state while it is typed: it is handed to `onSubmit` and cleared at
 * once (and with the component on cancel / unmount). It is never persisted, logged or put
 * in a URL. After a wrong password (`error`) the field is emptied and refocused.
 */
export function PdfPasswordPrompt({
  fileName,
  error = false,
  pending,
  onSubmit,
  onCancel,
}: {
  fileName: string;
  error?: boolean;
  pending: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  // Back to the field after each attempt (the wrong password was already cleared on submit).
  useEffect(() => {
    if (!pending) inputRef.current?.focus();
  }, [pending, error]);

  function submit() {
    if (pending || password.length === 0) return;
    const value = password;
    setPassword("");
    setVisible(false);
    onSubmit(value);
  }

  function cancel() {
    setPassword("");
    setVisible(false);
    onCancel();
  }

  return (
    <div
      role="group"
      aria-label={t("bank_pdf_password_title")}
      className="space-y-3 rounded-md border border-border bg-muted/30 p-4"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Lock className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{t("bank_pdf_password_title")}</p>
          <p className="truncate text-xs text-muted-foreground" dir="auto">
            {fileName}
          </p>
        </div>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="relative min-w-48 flex-1">
          <Input
            ref={inputRef}
            type={visible ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="none"
            maxLength={256}
            disabled={pending}
            placeholder={t("bank_pdf_password_placeholder")}
            aria-label={t("bank_pdf_password_label")}
            aria-invalid={error || undefined}
            aria-describedby={error ? `${errorId} ${hintId}` : hintId}
            className="pe-10"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-pressed={visible}
            aria-label={visible ? t("bank_pdf_password_hide") : t("bank_pdf_password_show")}
            disabled={pending}
            className="absolute inset-y-0 end-0 flex w-9 items-center justify-center rounded-e-md text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none"
          >
            {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
        <Button type="submit" size="sm" disabled={pending || password.length === 0}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
              {t("bank_pdf_password_unlocking")}
            </>
          ) : (
            t("bank_pdf_password_unlock")
          )}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={cancel}>
          {t("bank_pdf_password_cancel")}
        </Button>
      </form>

      <div aria-live="polite">
        {error && (
          <p id={errorId} className="text-sm text-destructive">
            {t("bank_pdf_password_incorrect")}
          </p>
        )}
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">
        {t("bank_pdf_password_hint")}
      </p>
    </div>
  );
}
