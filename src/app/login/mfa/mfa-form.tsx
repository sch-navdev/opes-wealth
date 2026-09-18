"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyMfaLogin } from "@/app/auth/actions";
import { createClient } from "@/utils/supabase/client";

export function MfaForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [webauthnFactorId, setWebauthnFactorId] = useState<string | null>(
    null,
  );
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [isPasskeyPending, setIsPasskeyPending] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (error) return;
      const factor = data.all.find(
        (f) => f.factor_type === "webauthn" && f.status === "verified",
      );
      if (factor) {
        setWebauthnFactorId(factor.id);
      }
    });
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await verifyMfaLogin(code);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  async function handleVerifyWithPasskey() {
    if (!webauthnFactorId) return;

    setPasskeyError(null);
    setIsPasskeyPending(true);

    const supabase = createClient();
    const { error } = await supabase.auth.mfa.webauthn.authenticate({
      factorId: webauthnFactorId,
    });

    if (error) {
      setIsPasskeyPending(false);
      setPasskeyError(error.message);
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
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
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Verifying…" : "Verify"}
        </Button>
      </form>

      {webauthnFactorId && (
        <>
          <div className="relative py-2 text-center text-xs text-muted-foreground">
            <span className="relative bg-card px-2">or</span>
            <div className="absolute inset-x-0 top-1/2 -z-10 border-t border-border" />
          </div>

          <div className="space-y-2">
            {passkeyError && (
              <p className="text-sm text-destructive" role="alert">
                {passkeyError}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              className="w-full border-primary text-primary hover:bg-primary/10 hover:text-primary"
              disabled={isPasskeyPending}
              onClick={handleVerifyWithPasskey}
            >
              {isPasskeyPending ? "Waiting for passkey…" : "Verify with Passkey"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
