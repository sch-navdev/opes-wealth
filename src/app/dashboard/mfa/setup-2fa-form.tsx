"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/utils/supabase/client";

type EnrollState = {
  factorId: string;
  qrCode: string;
} | null;

type LinkedFactor = {
  id: string;
  label: string;
  createdAt: string;
};

/**
 * Confirm-then-remove control shared by the Authenticator App and Passkeys
 * lists — same double-confirmation pattern as `delete-asset-button.tsx`,
 * since removing a security factor is at least as consequential as
 * deleting a portfolio asset. `onConfirm` does the actual API call and
 * reports back whether it succeeded, so the dialog only closes on success
 * and stays open (showing the parent's error state) on failure.
 */
function RemoveFactorButton({
  itemLabel,
  isRemoving,
  onConfirm,
}: {
  itemLabel: string;
  isRemoving: boolean;
  onConfirm: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);

  async function handleConfirm() {
    const succeeded = await onConfirm();
    if (succeeded) setOpen(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label={`Remove ${itemLabel}`}>
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="border-border bg-card">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground">
            Remove {itemLabel}?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            You won&apos;t be able to use this to sign in anymore. This
            action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={isRemoving}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isRemoving ? "Removing…" : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function Setup2faForm() {
  const supabase = createClient();

  const [totpFactors, setTotpFactors] = useState<LinkedFactor[]>([]);
  const [passkeyFactors, setPasskeyFactors] = useState<LinkedFactor[]>([]);
  const [isFactorsLoading, setIsFactorsLoading] = useState(true);

  const [enroll, setEnroll] = useState<EnrollState>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeySuccess, setPasskeySuccess] = useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [totpRemovalError, setTotpRemovalError] = useState<string | null>(null);
  const [passkeyRemovalError, setPasskeyRemovalError] = useState<string | null>(
    null,
  );

  // AAL2 step-up gate for passkey management (register/remove) and
  // authenticator removal — this page has no server-side guard the way
  // `/dashboard` does (see `needsMfaStepUp` in `utils/supabase/mfa.ts`), so
  // a session that's only ever reached aal1 could otherwise register a
  // rogue passkey or remove the real authenticator without ever proving
  // possession of it. `stepUpResolverRef` holds the pending action's own
  // resolve callback while the TOTP prompt is open — a ref rather than
  // state, since a function is never a safe value to store in `useState`
  // (React re-renders by calling it as an updater) and doing so here broke
  // the React Compiler's memoization of `loadActiveFactors` below.
  // `ensureAal2()` is the single entry point every gated action calls
  // before doing anything.
  const stepUpResolverRef = useRef<((ok: boolean) => void) | null>(null);
  const [isStepUpOpen, setIsStepUpOpen] = useState(false);
  const [stepUpCode, setStepUpCode] = useState("");
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const [stepUpVerifying, setStepUpVerifying] = useState(false);

  async function ensureAal2(): Promise<boolean> {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    // Mirrors `reset-password-form.tsx`'s same fail-open choice: if the AAL
    // can't be read, don't block the user on a check that itself failed.
    if (error || !data) return true;

    const needsStepUp = data.currentLevel === "aal1" && data.nextLevel === "aal2";
    if (!needsStepUp) return true;

    setStepUpCode("");
    setStepUpError(null);
    setIsStepUpOpen(true);
    return new Promise<boolean>((resolve) => {
      stepUpResolverRef.current = resolve;
    });
  }

  async function submitStepUpCode(code: string) {
    setStepUpError(null);
    setStepUpVerifying(true);

    try {
      const { data: factorsData, error: factorsError } =
        await supabase.auth.mfa.listFactors();

      if (factorsError) {
        setStepUpError(factorsError.message);
        return;
      }

      const totpFactor = factorsData.totp[0];
      if (!totpFactor) {
        setStepUpError("No authenticator app found for this account.");
        return;
      }

      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: totpFactor.id });

      if (challengeError) {
        setStepUpError(challengeError.message);
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challengeData.id,
        code,
      });

      if (verifyError) {
        setStepUpError(verifyError.message);
        return;
      }

      stepUpResolverRef.current?.(true);
      stepUpResolverRef.current = null;
      setIsStepUpOpen(false);
    } catch (err) {
      console.error("Setup2faForm: unexpected error during AAL2 step-up", err);
      setStepUpError("Something went wrong. Please try again.");
    } finally {
      setStepUpVerifying(false);
    }
  }

  function handleStepUpCodeChange(value: string) {
    setStepUpCode(value);
    setStepUpError(null);
    if (value.length === 6 && !stepUpVerifying) {
      submitStepUpCode(value);
    }
  }

  function cancelStepUp() {
    stepUpResolverRef.current?.(false);
    stepUpResolverRef.current = null;
    setIsStepUpOpen(false);
    setStepUpCode("");
    setStepUpError(null);
  }

  // Plain function rather than `useCallback` — it's called imperatively
  // from several handlers below, not passed down as a prop, so it doesn't
  // need referential stability; wrapping it in `useCallback` was tripping
  // the React Compiler's memoization-preservation check once this
  // component grew the AAL2 step-up state above.
  async function loadActiveFactors() {
    setIsFactorsLoading(true);

    const [factorsResult, passkeysResult] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.passkey.list(),
    ]);

    setTotpFactors(
      (factorsResult.data?.totp ?? []).map((factor) => ({
        id: factor.id,
        label: factor.friendly_name || "Authenticator App",
        createdAt: factor.created_at,
      })),
    );

    setPasskeyFactors(
      (passkeysResult.data ?? []).map((passkey) => ({
        id: passkey.id,
        label: passkey.friendly_name || "Passkey",
        createdAt: passkey.created_at,
      })),
    );

    setIsFactorsLoading(false);
  }

  useEffect(() => {
    loadActiveFactors();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only, same as before this was a plain function
  }, []);

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

  async function handleRemoveTotp(factorId: string): Promise<boolean> {
    const stepUpOk = await ensureAal2();
    if (!stepUpOk) return false;

    setRemovingId(factorId);
    setTotpRemovalError(null);

    const { error } = await supabase.auth.mfa.unenroll({ factorId });

    setRemovingId(null);

    if (error) {
      setTotpRemovalError(error.message);
      return false;
    }

    await loadActiveFactors();
    return true;
  }

  async function handleRemovePasskey(passkeyId: string): Promise<boolean> {
    const stepUpOk = await ensureAal2();
    if (!stepUpOk) return false;

    setRemovingId(passkeyId);
    setPasskeyRemovalError(null);

    const { error } = await supabase.auth.passkey.delete({ passkeyId });

    setRemovingId(null);

    if (error) {
      setPasskeyRemovalError(error.message);
      return false;
    }

    await loadActiveFactors();
    return true;
  }

  async function handleRegisterPasskey() {
    setPasskeyError(null);

    const stepUpOk = await ensureAal2();
    if (!stepUpOk) return;

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
      {/* Authenticator App (TOTP) — a true MFA factor: required as a
          second step after password login on /login/mfa. */}
      <div>
        <h3 className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
          <ShieldCheck className="size-4 text-primary" />
          Authenticator App
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Required as a second step after entering your password.
        </p>

        {isFactorsLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : totpFactors.length > 0 ? (
          <ul className="mb-4 divide-y divide-border border border-border">
            {totpFactors.map((factor) => (
              <li
                key={factor.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div>
                  <p className="text-sm text-foreground">{factor.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Linked {new Date(factor.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <RemoveFactorButton
                  itemLabel={factor.label}
                  isRemoving={removingId === factor.id}
                  onConfirm={() => handleRemoveTotp(factor.id)}
                />
              </li>
            ))}
          </ul>
        ) : null}

        {totpRemovalError && (
          <p className="mb-4 text-sm text-destructive" role="alert">
            {totpRemovalError}
          </p>
        )}

        {success ? (
          <p className="text-sm text-success">
            Authenticator app 2FA is now active on your account.
          </p>
        ) : !enroll ? (
          <div className="space-y-4">
            {totpFactors.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Add an extra layer of security by requiring a 6-digit code
                from an authenticator app each time you sign in.
              </p>
            )}
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

      {/* Passkeys — a standalone passwordless sign-in method, not an MFA
          factor. A passkey login already satisfies strong authentication
          on its own and skips /login/mfa entirely; it's never checked as
          a second step after a password login. */}
      <div className="border-t border-border pt-6">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
          <KeyRound className="size-4 text-primary" />
          Passkeys
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Sign in without a password. A passkey already counts as strong
          authentication on its own, so it replaces the authenticator-app
          step above rather than working alongside it.
        </p>

        {!isFactorsLoading && passkeyFactors.length > 0 && (
          <ul className="mb-4 divide-y divide-border border border-border">
            {passkeyFactors.map((factor) => (
              <li
                key={factor.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div>
                  <p className="text-sm text-foreground">{factor.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Linked {new Date(factor.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <RemoveFactorButton
                  itemLabel={factor.label}
                  isRemoving={removingId === factor.id}
                  onConfirm={() => handleRemovePasskey(factor.id)}
                />
              </li>
            ))}
          </ul>
        )}

        {passkeyRemovalError && (
          <p className="mb-4 text-sm text-destructive" role="alert">
            {passkeyRemovalError}
          </p>
        )}

        {passkeySuccess ? (
          <p className="text-sm text-success">
            Passkey registered — you can now sign in with it directly from
            the login page.
          </p>
        ) : (
          <div className="space-y-4">
            {passkeyFactors.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Register a passkey to sign in with your device&apos;s
                biometrics instead of a password.
              </p>
            )}
            {passkeyError && (
              <p className="text-sm text-destructive" role="alert">
                {passkeyError}
              </p>
            )}
            <Button
              variant="outline"
              onClick={handleRegisterPasskey}
              disabled={isPasskeyLoading}
            >
              {isPasskeyLoading ? "Waiting for passkey…" : "Register Passkey"}
            </Button>
          </div>
        )}
      </div>

      <Dialog
        open={isStepUpOpen}
        onOpenChange={(open) => {
          if (!open) cancelStepUp();
        }}
      >
        <DialogContent className="border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Confirm it&apos;s you
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              This account requires a second step for security-sensitive
              changes. Enter the 6-digit code from your authenticator app to
              continue.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="step-up-code">Authenticator code</Label>
              <Input
                id="step-up-code"
                name="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="123456"
                autoComplete="one-time-code"
                required
                disabled={stepUpVerifying}
                value={stepUpCode}
                onChange={(e) => handleStepUpCodeChange(e.target.value)}
              />
            </div>

            {stepUpError && (
              <p className="text-sm text-destructive" role="alert">
                {stepUpError}
              </p>
            )}

            {stepUpVerifying && (
              <p className="text-sm text-muted-foreground">Verifying…</p>
            )}

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={cancelStepUp}
              disabled={stepUpVerifying}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
