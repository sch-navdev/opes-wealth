"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, signup } from "@/app/auth/actions";
import { createClient } from "@/utils/supabase/client";

export function LoginForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isPasskeyPending, setIsPasskeyPending] = useState(false);

  function handleSubmit(action: typeof login | typeof signup) {
    setError(null);
    const form = formRef.current;
    if (!form) return;

    const formData = new FormData(form);

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

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPasskey();

    if (error) {
      setIsPasskeyPending(false);
      setError(error.message);
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <form ref={formRef} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="you@example.com"
          required
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="rememberMe" name="rememberMe" />
        <Label htmlFor="rememberMe" className="cursor-pointer font-normal text-muted-foreground">
          Remember me
        </Label>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 pt-2">
        <Button
          type="button"
          disabled={isPending || isPasskeyPending}
          onClick={() => handleSubmit(login)}
        >
          {isPending ? "Please wait…" : "Login"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending || isPasskeyPending}
          onClick={() => handleSubmit(signup)}
        >
          {isPending ? "Please wait…" : "Sign Up"}
        </Button>
      </div>

      <div className="relative py-2 text-center text-xs text-muted-foreground">
        <span className="relative bg-card px-2">or</span>
        <div className="absolute inset-x-0 top-1/2 -z-10 border-t border-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        disabled={isPending || isPasskeyPending}
        onClick={handlePasskeySignIn}
        className="w-full border-primary text-primary hover:bg-primary/10 hover:text-primary"
      >
        {isPasskeyPending ? "Waiting for passkey…" : "Sign in with Passkey"}
      </Button>
    </form>
  );
}
