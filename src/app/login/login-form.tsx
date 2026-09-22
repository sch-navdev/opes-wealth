"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2, Eye, EyeOff, Fingerprint, Lock, Mail, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, signup } from "@/app/auth/actions";
import { createClient } from "@/utils/supabase/client";
import { getPasswordRequirementErrors } from "@/lib/auth-validation";

type Mode = "login" | "signup";

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

/** A small "eye" button that toggles absolute-positioned inside a password field's right edge. */
function PasswordVisibilityToggle({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      tabIndex={-1}
      aria-label={visible ? "Hide password" : "Show password"}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
    >
      {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );
}

export function LoginForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isPasskeyPending, setIsPasskeyPending] = useState(false);

  const passwordErrors =
    mode === "signup" ? getPasswordRequirementErrors(password) : [];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const form = formRef.current;
    if (!form) return;

    const formData = new FormData(form);

    if (mode === "signup") {
      if (passwordErrors.length > 0) {
        setPasswordTouched(true);
        setError("Please meet all password requirements above.");
        return;
      }

      const confirmPassword = formData.get("confirmPassword");
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    startTransition(async () => {
      try {
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
        setError("Something went wrong. Please try again.");
      }
    });
  }

  async function handlePasskeySignIn() {
    setError(null);
    setIsPasskeyPending(true);

    const noPasskeyMessage =
      "No passkey found. Please log in with your email and password, then register a passkey in your dashboard.";

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPasskey();

      if (error) {
        setIsPasskeyPending(false);
        setError(noPasskeyMessage);
        return;
      }

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
            Account created successfully.
          </p>
          <p className="text-sm text-muted-foreground">
            Please check your email to verify your account before logging in.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setNeedsEmailVerification(false);
            setMode("login");
          }}
        >
          Back to Login
        </Button>
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
        {isPasskeyPending ? "Waiting for passkey…" : "Sign in with Passkey"}
      </Button>

      <div className="relative text-center text-xs text-muted-foreground">
        <span className="relative bg-card px-2">
          or continue with email
        </span>
        <div className="absolute inset-x-0 top-1/2 -z-10 border-t border-border" />
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        {mode === "signup" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="firstName"
                  name="firstName"
                  type="text"
                  placeholder="Jane"
                  required
                  autoComplete="given-name"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
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
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="pl-9"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="pl-9 pr-9"
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
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </div>

        {mode === "signup" && (
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="••••••••"
                required
                autoComplete="new-password"
                className="pl-9 pr-9"
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
              Remember me
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
            ? "Please wait…"
            : mode === "login"
              ? "Login"
              : "Create Account"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => {
            setError(null);
            setPassword("");
            setPasswordTouched(false);
            setShowPassword(false);
            setShowConfirmPassword(false);
            setMode(mode === "login" ? "signup" : "login");
          }}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {mode === "login" ? "Sign Up" : "Login"}
        </button>
      </p>
    </div>
  );
}
