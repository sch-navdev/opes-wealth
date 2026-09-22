import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/utils/supabase/server";
import { ResetPasswordForm } from "@/components/reset-password-form";

/**
 * Reached only via the recovery email link → `/auth/callback?next=/reset-password`,
 * which exchanges the recovery code for a real session before redirecting
 * here. Without that session there's nothing to reset — send anyone who
 * lands here directly (no valid recovery code was ever exchanged) to login.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm border-border bg-card">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight text-foreground">
            Reset Password
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Choose a new password for your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResetPasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
