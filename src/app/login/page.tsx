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
import { T } from "@/components/translated-text";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="relative flex min-h-screen bg-background">
      <div className="absolute end-4 top-4 z-10 flex max-w-[calc(100%-2rem)] flex-wrap items-center justify-end gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
        <ComfortModeToggle />
      </div>
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden border-e border-border bg-card p-10 lg:flex">
        <div className="relative max-w-md">
          <p className="font-index text-[11px] uppercase tracking-[0.2em] text-primary">
            <T k="landing_tagline" />
          </p>
          <h1 className="mt-5 text-balance text-4xl font-medium tracking-tight text-foreground">
            <T k="landing_headline" />
          </h1>
          <div aria-hidden="true" className="tick-rule mt-6 max-w-xs" />
          <p className="mt-5 text-muted-foreground">
            <T k="login_lead" />
          </p>
          <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" />
            <T k="login_secured" />
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
              <T k="login_card_desc" />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm initialError={error ? error.slice(0, 200) : null} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
