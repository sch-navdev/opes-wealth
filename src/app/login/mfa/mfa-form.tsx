"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyMfaLogin } from "@/app/auth/actions";

export function MfaForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submitCode(value: string) {
    setError(null);
    startTransition(async () => {
      const result = await verifyMfaLogin(value);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  function handleCodeChange(value: string) {
    setCode(value);
    setError(null);
    // Auto-submit the instant a full 6-digit code is entered — an OTP
    // input never needs a separate "Verify" click once it's complete.
    if (value.length === 6 && !isPending) {
      submitCode(value);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="code">Authenticator code</Label>
        <Input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          placeholder="123456"
          autoComplete="one-time-code"
          required
          disabled={isPending}
          value={code}
          onChange={(e) => handleCodeChange(e.target.value)}
        />
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {isPending && (
        <p className="text-sm text-muted-foreground">Verifying…</p>
      )}
    </div>
  );
}
