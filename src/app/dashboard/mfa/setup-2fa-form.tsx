"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/utils/supabase/client";

type EnrollState = {
  factorId: string;
  qrCode: string;
} | null;

type ActiveFactor = {
  id: string;
  kind: "totp" | "passkey";
  label: string;
  createdAt: string;
};

export function Setup2faForm() {
  const supabase = createClient();

  const [activeFactors, setActiveFactors] = useState<ActiveFactor[]>([]);
  const [isFactorsLoading, setIsFactorsLoading] = useState(true);

  const [enroll, setEnroll] = useState<EnrollState>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeySuccess, setPasskeySuccess] = useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);

  const loadActiveFactors = useCallback(async () => {
    setIsFactorsLoading(true);

    const [factorsResult, passkeysResult] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.passkey.list(),
    ]);

    const totpFactors: ActiveFactor[] = (factorsResult.data?.totp ?? []).map(
      (factor) => ({
        id: factor.id,
        kind: "totp",
        label: factor.friendly_name || "Authenticator App",
        createdAt: factor.created_at,
      }),
    );

    const passkeys: ActiveFactor[] = (passkeysResult.data ?? []).map(
      (passkey) => ({
        id: passkey.id,
        kind: "passkey",
        label: passkey.friendly_name || "Passkey",
        createdAt: passkey.created_at,
      }),
    );

    setActiveFactors([...totpFactors, ...passkeys]);
    setIsFactorsLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadActiveFactors();
  }, [loadActiveFactors]);

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
    loadActiveFactors();
  }

  async function handleRegisterPasskey() {
    setPasskeyError(null);
    setIsPasskeyLoading(true);

    try {
      // Standard passwordless Passkey registration (not an MFA factor):
      // drives the browser's `navigator.credentials.create()` prompt and
      // verifies the resulting credential in one call.
      const { error } = await supabase.auth.registerPasskey();

      if (error) {
        setPasskeyError(error.message);
        return;
      }

      setPasskeySuccess(true);
      loadActiveFactors();
    } catch {
      // The user cancelled the OS/browser passkey prompt, or the browser
      // rejected the request outright.
      setPasskeyError("Could not register a passkey. Please try again.");
    } finally {
      setIsPasskeyLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-3 text-sm font-medium text-foreground">
          Active authenticators
        </h3>
        {isFactorsLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : activeFactors.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No authenticators or passkeys are linked to your account yet.
          </p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {activeFactors.map((factor) => (
              <li
                key={factor.id}
                className="flex items-center gap-3 px-3 py-2.5"
              >
                {factor.kind === "totp" ? (
                  <ShieldCheck className="size-4 text-primary" />
                ) : (
                  <KeyRound className="size-4 text-primary" />
                )}
                <div>
                  <p className="text-sm text-foreground">{factor.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Linked{" "}
                    {new Date(factor.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-border pt-6">
        {success ? (
          <p className="text-sm text-success">
            Authenticator app 2FA is now active on your account.
          </p>
        ) : !enroll ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add an extra layer of security by requiring a 6-digit code from
              an authenticator app each time you sign in.
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
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Scan this QR code with your authenticator app, then enter the
              code it generates to activate two-factor authentication.
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
        )}
      </div>

      <div className="border-t border-border pt-6">
        {passkeySuccess ? (
          <p className="text-sm text-success">
            Passkey registered — you can use it to verify at login.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Or register a passkey to verify with your device&apos;s
              biometrics instead of a 6-digit code.
            </p>
            {passkeyError && (
              <p className="text-sm text-destructive" role="alert">
                {passkeyError}
              </p>
            )}
            <Button
              variant="outline"
              onClick={handleRegisterPasskey}
              disabled={isPasskeyLoading}
              className="border-primary text-primary hover:bg-primary/10 hover:text-primary"
            >
              {isPasskeyLoading ? "Waiting for passkey…" : "Register Passkey"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
