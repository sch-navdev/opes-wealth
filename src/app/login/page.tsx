import { ShieldCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden border-r border-border bg-card p-10 lg:flex">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--color-primary) 12%, transparent), transparent 60%)",
          }}
        />
        <span className="relative text-lg font-semibold tracking-tight text-foreground">
          Opes Wealth
        </span>
        <div className="relative max-w-md">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            Private Wealth, Clearly Seen
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
            One view of everything you own.
          </h1>
          <p className="mt-4 text-muted-foreground">
            Real estate, holdings, and cash together in a single, private
            dashboard — built for individuals who expect precision.
          </p>
          <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" />
            Secured with passkeys and two-factor authentication
          </div>
        </div>
        <p className="relative text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Opes Wealth
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <Card className="w-full max-w-sm border-border bg-card">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold tracking-tight text-foreground">
              Opes Wealth
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Sign in to access your wealth dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
