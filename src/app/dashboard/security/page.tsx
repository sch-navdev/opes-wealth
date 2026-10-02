import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { SecuritySessions, type SessionRow } from "@/components/security-sessions";
import { createServiceClient } from "@/utils/supabase/service";

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

  // Real IP / city / country recorded by the proxy (migration 0030; empty if not applied yet).
  const { data: locations } = await supabase
    .from("session_locations")
    .select("session_id, ip, country, city, user_agent");
  const located = new Map((locations ?? []).map((l) => [l.session_id, l]));
  const liveIds = new Set((data ?? []).map((s) => s.id));
  const ended = (locations ?? []).filter((l) => !liveIds.has(l.session_id)).map((l) => l.session_id);
  if (ended.length > 0) {
    try {
      await createServiceClient().from("session_locations").delete().in("session_id", ended).eq("user_id", user.id);
    } catch {
      // best effort
    }
  }

  const sessions: SessionRow[] = (data ?? []).map((s) => ({
    id: s.id,
    createdAt: s.created_at,
    lastActiveAt: s.last_active_at,
    userAgent: located.get(s.id)?.user_agent ?? s.user_agent,
    ip: located.get(s.id)?.ip ?? s.ip,
    city: located.get(s.id)?.city ?? null,
    country: located.get(s.id)?.country ?? null,
    located: located.has(s.id),
    isCurrent: s.is_current,
  }));

  return (
    <div className="w-full px-4 py-10 sm:px-6 lg:px-8">
      <SecuritySessions sessions={sessions} loadError={error?.message ?? null} />
    </div>
  );
}
