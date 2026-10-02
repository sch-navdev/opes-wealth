import { createClient } from "@/utils/supabase/server";
import { isDemoUser, userIdFromAccessToken } from "@/lib/demo-mode";

/** Is the signed-in user the read-only demo account? Reads the session cookie; no network call. */
export async function currentUserIsDemo(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return isDemoUser(userIdFromAccessToken(session?.access_token));
}
