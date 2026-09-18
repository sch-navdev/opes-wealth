import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { ProfileForm } from "@/components/profile-form";

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (await needsMfaStepUp(supabase)) {
    redirect("/login/mfa");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "first_name, last_name, phone_number, address_street, address_po_box, address_city, address_postal_code, address_landmark, address_country, avatar_base64",
    )
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen bg-background px-8 py-10">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Dashboard
      </Link>

      <div className="max-w-2xl">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-foreground">
          Profile Settings
        </h1>

        <ProfileForm
          profile={profile}
          email={user.email!}
          isEmailVerified={user.email_confirmed_at != null}
        />
      </div>
    </div>
  );
}
