"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/utils/supabase/client";

type EnrollState = {
  factorId: string;
  qrCode: string;
} | null;

export function Setup2faForm() {
  const supabase = createClient();

  const [enroll, setEnroll] = useState<EnrollState>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSetup() {
    setError(null);
    setIsLoading(true);

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
    });

    setIsLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setEnroll({ factorId: data.id, qrCode: data.totp.qr_code });
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!enroll) return;

    setError(null);
    setIsLoading(true);

    const { data: challengeData, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId: enroll.factorId });

    if (challengeError) {
      setIsLoading(false);
      setError(challengeError.message);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: enroll.factorId,
      challengeId: challengeData.id,
      code,
    });

    setIsLoading(false);

    if (verifyError) {
      setError(verifyError.message);
      return;
    }

    setSuccess(true);
  }

  if (success) {
    return (
      <p className="text-sm text-success">
        Two-factor authentication is now active on your account.
      </p>
    );
  }

  if (!enroll) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Add an extra layer of security by requiring a 6-digit code from an
          authenticator app each time you sign in.
        </p>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button onClick={handleSetup} disabled={isLoading}>
          {isLoading ? "Setting up…" : "Setup 2FA"}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleVerify} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Scan this QR code with your authenticator app, then enter the code it
        generates to activate two-factor authentication.
      </p>

      <div
        className="w-fit bg-white p-2"
        dangerouslySetInnerHTML={{ __html: enroll.qrCode }}
      />

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

      <Button type="submit" disabled={isLoading}>
        {isLoading ? "Verifying…" : "Activate 2FA"}
      </Button>
    </form>
  );
}
