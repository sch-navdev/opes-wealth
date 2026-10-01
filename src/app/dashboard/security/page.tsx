import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { SecuritySessions, type SessionRow } from "@/components/security-sessions";

export default async function SecurityPage() {
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

  // `list_my_sessions` is migration 0016 (SECURITY DEFINER, scoped to
  // auth.uid()). If it hasn't been applied yet, say so instead of crashing.
  const { data, error } = await supabase.rpc("list_my_sessions");

  const sessions: SessionRow[] = (data ?? []).map((s) => ({
    id: s.id,
    createdAt: s.created_at,
    lastActiveAt: s.last_active_at,
    userAgent: s.user_agent,
    ip: s.ip,
    isCurrent: s.is_current,
  }));

  return (
    <div className="w-full px-4 py-10 sm:px-6 lg:px-8">
      <SecuritySessions sessions={sessions} loadError={error?.message ?? null} />
    </div>
  );
}
