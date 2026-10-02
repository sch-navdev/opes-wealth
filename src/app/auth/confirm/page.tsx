import Image from "next/image";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/language-switcher";
import { T } from "@/components/translated-text";
import { confirmEmailLink } from "@/app/auth/confirm/actions";

/**
 * Landing page of the links in our emails (invitation, sign-up, password reset, email
 * change): `/auth/confirm?token_hash=…&type=…&next=…`, on opeswealth.app so the link
 * matches the sender's domain. Nothing happens on a plain visit; the button below
 * completes the step (see `confirmEmailLink` for why).
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash, type, next } = await searchParams;
  if (!token_hash || !type) redirect("/login");

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
      <div className="absolute end-4 top-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-sm border-border bg-card">
        <CardHeader>
          <Image src="/logo.png" alt="Opes Wealth" width={80} height={80} priority />
          <CardTitle className="text-2xl font-semibold tracking-tight text-foreground">
            <T k="auth_confirm_title" />
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            <T k="auth_confirm_desc" />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={confirmEmailLink} className="space-y-4">
            <input type="hidden" name="token_hash" value={token_hash} />
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="next" value={next ?? ""} />
            <Button type="submit" size="lg" className="w-full">
              <T k="auth_confirm_button" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
