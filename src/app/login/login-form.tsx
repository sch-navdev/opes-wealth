"use client";

import { useRef, useState, useTransition } from "react";
import { Fingerprint, Lock, Mail, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, signup } from "@/app/auth/actions";
import { createClient } from "@/utils/supabase/client";

type Mode = "login" | "signup";

export function LoginForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isPasskeyPending, setIsPasskeyPending] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const form = formRef.current;
    if (!form) return;

    const formData = new FormData(form);

    if (mode === "signup") {
      const password = formData.get("password");
      const confirmPassword = formData.get("confirmPassword");
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    const action = mode === "login" ? login : signup;

    startTransition(async () => {
      const result = await action(formData);
      if (result?.error) {
        setError(result.error);
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
              type="password"
              placeholder="••••••••"
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="pl-9"
            />
          </div>
        </div>

        {mode === "signup" && (
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="••••••••"
                required
                autoComplete="new-password"
                className="pl-9"
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
