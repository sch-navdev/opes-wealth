import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { logout } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aal?.nextLevel === "aal2" && aal.currentLevel === "aal1") {
    redirect("/login/mfa");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-8 py-6">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <h1 className="text-xl font-semibold text-foreground">
            {user.email}
          </h1>
        </div>
        <form action={logout}>
          <Button type="submit" variant="outline">
            Sign Out
          </Button>
        </form>
      </header>

      <main className="px-8 py-10">
        <p className="text-muted-foreground">
          Your wealth dashboard will appear here.
        </p>
        <Link
          href="/dashboard/mfa"
          className="mt-4 inline-block text-sm text-primary underline-offset-4 hover:underline"
        >
          Manage two-factor authentication
        </Link>
      </main>
    </div>
  );
}
