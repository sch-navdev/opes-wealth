import Link from "next/link";
import { LanguageSetting } from "@/components/language-setting";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { ProfileForm } from "@/components/profile-form";
import { UiTierPreference } from "@/components/ui-tier-preference";

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
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
    <div className="w-full px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Dashboard
      </Link>

      <div className="max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Profile Settings
          </h1>
          <Link
            href="/dashboard/mfa"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Manage Two-Factor Authentication
          </Link>
        </div>

        <div className="mb-6 flex max-w-xs flex-col gap-1.5">
          <LanguageSetting />
        </div>

        <div className="mb-6">
          <UiTierPreference />
        </div>

        <ProfileForm
          profile={profile}
          email={user.email}
          isEmailVerified={user.email_confirmed_at != null}
        />
      </div>
    </div>
  );
}
