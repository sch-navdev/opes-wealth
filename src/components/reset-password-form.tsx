"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordVisibilityToggle } from "@/components/password-visibility-toggle";
import { createClient } from "@/utils/supabase/client";
import { getPasswordRequirementErrors } from "@/lib/auth-validation";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // A recovery-link session only ever authenticates at aal1. If the account
  // also has TOTP enrolled, Supabase requires the session to step up to aal2
  // before `updateUser` will accept a new password — so the password fields
  // stay hidden until that step-up (if needed) completes.
  // `null` = still checking, so the form doesn't flash password fields that
  // then have to be swapped out for the MFA prompt a moment later.
  const [needsStepUp, setNeedsStepUp] = useState<boolean | null>(null);
  const [stepUpComplete, setStepUpComplete] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [verifyingMfa, setVerifyingMfa] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data, error }) => {
      if (error) {
        console.error("ResetPasswordForm: unable to read AAL", error);
        setNeedsStepUp(false);
        return;
      }
      setNeedsStepUp(
        data.currentLevel === "aal1" && data.nextLevel === "aal2",
      );
    });
  }, []);

  async function handleVerifyMfa(e: React.FormEvent) {
    e.preventDefault();
    setMfaError(null);
    setVerifyingMfa(true);

    try {
      const supabase = createClient();
      const { data: factorsData, error: factorsError } =
        await supabase.auth.mfa.listFactors();

      if (factorsError) {
        setMfaError(factorsError.message);
        return;
      }

      const totpFactor = factorsData.totp[0];
      if (!totpFactor) {
        setMfaError("No authenticator app found for this account.");
        return;
      }

      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: totpFactor.id });

      if (challengeError) {
        setMfaError(challengeError.message);
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challengeData.id,
        code: mfaCode,
      });

      if (verifyError) {
        setMfaError(verifyError.message);
        return;
      }

      setStepUpComplete(true);
    } catch (err) {
      console.error("ResetPasswordForm: unexpected error verifying MFA", err);
      setMfaError("Something went wrong. Please try again.");
    } finally {
      setVerifyingMfa(false);
    }
  }

  const passwordErrors = getPasswordRequirementErrors(password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (passwordErrors.length > 0) {
      setPasswordTouched(true);
      setError("Please meet all password requirements above.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (err) {
      console.error("ResetPasswordForm: unexpected error calling updateUser", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <CheckCircle2 className="size-10 text-success" />
        <p className="font-medium text-foreground">Password updated.</p>
        <p className="text-sm text-muted-foreground">Taking you to your dashboard…</p>
      </div>
    );
  }

  if (needsStepUp === null) {
    return null;
  }

  if (needsStepUp && !stepUpComplete) {
    return (
      <form onSubmit={handleVerifyMfa} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="mfa-code">Authenticator code</Label>
          <Input
            id="mfa-code"
            name="code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="123456"
            autoComplete="one-time-code"
            required
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
          />
        </div>

        {mfaError && (
          <p className="text-sm text-destructive" role="alert">
            {mfaError}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={verifyingMfa}>
          {verifyingMfa ? "Verifying…" : "Verify"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="new-password">New Password</Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="new-password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            required
            autoComplete="new-password"
            className="pl-9 pr-9"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setPasswordTouched(true)}
            aria-invalid={passwordTouched && passwordErrors.length > 0}
          />
          <PasswordVisibilityToggle
            visible={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
          />
        </div>
        {passwordTouched && passwordErrors.length > 0 && (
          <ul className="space-y-0.5 text-xs text-destructive" role="alert">
            {passwordErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-new-password">Confirm New Password</Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="confirm-new-password"
            name="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            placeholder="••••••••"
            required
            autoComplete="new-password"
            className="pl-9 pr-9"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <PasswordVisibilityToggle
            visible={showConfirmPassword}
            onToggle={() => setShowConfirmPassword((v) => !v)}
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
        {isSubmitting ? "Updating…" : "Update Password"}
      </Button>
    </form>
  );
}
