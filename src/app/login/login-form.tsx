"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2, Fingerprint, Lock, Mail, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordVisibilityToggle } from "@/components/password-visibility-toggle";
import { login, signup, requestPasswordReset } from "@/app/auth/actions";
import { createClient } from "@/utils/supabase/client";
import { getPasswordRequirementErrors } from "@/lib/auth-validation";
import { useLanguage } from "@/context/language-context";
import type { TranslationKey } from "@/lib/i18n";

/** Maps the English rule messages of `passwordSchema` to translation keys. */
const PASSWORD_RULE_KEYS: Record<string, TranslationKey> = {
  "At least 8 characters": "pw_rule_length",
  "At least one lowercase letter": "pw_rule_lower",
  "At least one uppercase letter": "pw_rule_upper",
  "At least one number": "pw_rule_number",
  "At least one special character": "pw_rule_special",
};

type Mode = "login" | "signup" | "forgot";

/**
 * A successful `login()`/`signup()` calls Next's `redirect()` on the server,
 * which the client-side call re-throws as a special error so the router can
 * perform the navigation. A blanket try/catch around that call must let this
 * one specific error through instead of swallowing it as a "real" failure.
 */
function isNextRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export function LoginForm() {
  const { t } = useLanguage();
  const formRef = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [resetLinkSent, setResetLinkSent] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isPasskeyPending, setIsPasskeyPending] = useState(false);

  const passwordErrors =
    mode === "signup" ? getPasswordRequirementErrors(password) : [];

  function resetFormState(nextMode: Mode) {
    setError(null);
    setPassword("");
    setPasswordTouched(false);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setMode(nextMode);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const form = formRef.current;
    if (!form) return;

    const formData = new FormData(form);

    if (mode === "signup") {
      if (passwordErrors.length > 0) {
        setPasswordTouched(true);
        setError(t("auth_meet_requirements"));
        return;
      }

      const confirmPassword = formData.get("confirmPassword");
      if (password !== confirmPassword) {
        setError(t("auth_passwords_mismatch"));
        return;
      }
    }

    startTransition(async () => {
      try {
        if (mode === "forgot") {
          const result = await requestPasswordReset(formData);
          if ("error" in result) {
            setError(result.error);
            return;
          }
          setResetLinkSent(true);
          return;
        }

        const result =
          mode === "login" ? await login(formData) : await signup(formData);
        if (result && "error" in result) {
          setError(result.error);
          return;
        }
        if (result && "needsEmailVerification" in result) {
          setNeedsEmailVerification(true);
        }
      } catch (err) {
        if (isNextRedirectError(err)) {
          throw err;
        }
        console.error("Sign-in/up submit failed", err);
        setError(t("auth_something_wrong"));
      }
    });
  }

  async function handlePasskeySignIn() {
    setError(null);
    setIsPasskeyPending(true);

    const noPasskeyMessage = t("auth_no_passkey");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPasskey();

      if (error) {
        setIsPasskeyPending(false);
        setError(noPasskeyMessage);
        return;
      }

      // A hard navigation, not `router.push()`: passkey sign-in sets the
      // session cookie client-side (no server `redirect()` involved, unlike
      // the email/password path above), so a full reload is needed to
      // guarantee the dashboard's server components read that fresh cookie
      // rather than racing an RSC cache that still reflects the signed-out state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/dashboard";
    } catch {
      // The user cancelled the OS/browser passkey prompt, no passkey was
      // found on the device, or the browser rejected the request outright.
      setIsPasskeyPending(false);
      setError(noPasskeyMessage);
    }
  }

  if (needsEmailVerification) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <CheckCircle2 className="size-10 text-success" />
        <div className="space-y-1.5">
          <p className="font-medium text-foreground">
            {t("auth_account_created")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("auth_verify_email")}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => resetFormState("login")}>
          {t("auth_back_to_login")}
        </Button>
      </div>
    );
  }

  if (resetLinkSent) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <CheckCircle2 className="size-10 text-success" />
        <div className="space-y-1.5">
          <p className="font-medium text-foreground">{t("auth_check_your_email")}</p>
          <p className="text-sm text-muted-foreground">
            {t("auth_reset_sent")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setResetLinkSent(false);
            resetFormState("login");
          }}
        >
          {t("auth_back_to_login")}
        </Button>
      </div>
    );
  }

  if (mode === "forgot") {
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          {t("auth_forgot_intro")}
        </p>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth_email")}</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="ps-9"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={isPending}>
            {isPending ? t("auth_sending") : t("auth_send_reset")}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => resetFormState("login")}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("auth_back_to_login")}
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button
        type="button"
        variant="outline"
        disabled={isPending || isPasskeyPending}
        onClick={handlePasskeySignIn}
        className="w-full gap-2"
        size="lg"
      >
        <Fingerprint className="size-5" />
        {isPasskeyPending ? t("auth_waiting_passkey") : t("auth_signin_passkey")}
      </Button>

      <div className="relative text-center text-xs text-muted-foreground">
        <span className="relative bg-card px-2">
          {t("auth_or_email")}
        </span>
        <div className="absolute inset-x-0 top-1/2 -z-10 border-t border-border" />
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        {mode === "signup" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="firstName">{t("auth_first_name")}</Label>
              <div className="relative">
                <User className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="firstName"
                  name="firstName"
                  type="text"
                  placeholder="Jane"
                  required
                  autoComplete="given-name"
                  className="ps-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">{t("auth_last_name")}</Label>
              <Input
                id="lastName"
                name="lastName"
                type="text"
                placeholder="Doe"
                required
                autoComplete="family-name"
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">{t("auth_email")}</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="ps-9"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t("auth_password")}</Label>
            {mode === "login" && (
              <button
                type="button"
                onClick={() => resetFormState("forgot")}
                className="text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                {t("auth_forgot_password")}
              </button>
            )}
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="ps-9 pe-9"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setPasswordTouched(true)}
              aria-invalid={
                mode === "signup" && passwordTouched && passwordErrors.length > 0
              }
            />
            <PasswordVisibilityToggle
              visible={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
            />
          </div>
          {mode === "signup" && passwordTouched && passwordErrors.length > 0 && (
            <ul className="space-y-0.5 text-xs text-destructive" role="alert">
              {passwordErrors.map((message) => (
                <li key={message}>{PASSWORD_RULE_KEYS[message] ? t(PASSWORD_RULE_KEYS[message]) : message}</li>
              ))}
            </ul>
          )}
        </div>

        {mode === "signup" && (
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t("auth_confirm_password")}</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="••••••••"
                required
                autoComplete="new-password"
                className="ps-9 pe-9"
              />
              <PasswordVisibilityToggle
                visible={showConfirmPassword}
                onToggle={() => setShowConfirmPassword((v) => !v)}
              />
            </div>
          </div>
        )}

        {mode === "login" && (
          <div className="flex items-center gap-2">
            <Checkbox id="rememberMe" name="rememberMe" />
            <Label
              htmlFor="rememberMe"
              className="cursor-pointer font-normal text-muted-foreground"
            >
              {t("auth_remember_me")}
            </Label>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" size="lg" disabled={isPending || isPasskeyPending}>
          {isPending
            ? t("auth_please_wait")
            : mode === "login"
              ? t("auth_login")
              : t("auth_create_account")}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? t("auth_no_account") : t("auth_have_account")}{" "}
        <button
          type="button"
          onClick={() => resetFormState(mode === "login" ? "signup" : "login")}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {mode === "login" ? t("auth_sign_up") : t("auth_login")}
        </button>
      </p>
    </div>
  );
}
