import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { ComfortModeToggle } from "@/components/comfort-mode-toggle";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen bg-background">
      <div className="absolute end-4 top-4 z-10 flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
        <ComfortModeToggle />
      </div>
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden border-e border-border bg-card p-10 lg:flex">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--color-primary) 12%, transparent), transparent 60%)",
          }}
        />
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
            <Image src="/logo.png" alt="Opes Wealth" width={80} height={80} priority />
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
