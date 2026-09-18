import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MfaForm } from "./mfa-form";

export default function LoginMfaPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm border-border bg-card">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight text-foreground">
            Two-Factor Verification
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Enter the 6-digit code from your authenticator app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MfaForm />
        </CardContent>
      </Card>
    </div>
  );
}
