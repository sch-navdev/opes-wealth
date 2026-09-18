import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Setup2faForm } from "./setup-2fa-form";

export default function DashboardMfaPage() {
  return (
    <div className="min-h-screen bg-background px-8 py-10">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight text-foreground">
            Two-Factor Authentication
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Secure your Opes Wealth account with an authenticator app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Setup2faForm />
        </CardContent>
      </Card>
    </div>
  );
}
