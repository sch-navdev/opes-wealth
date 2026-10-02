/**
 * Transactional email through Resend's REST API (server-only). Supabase Auth keeps
 * sending its own emails (sign-up, reset, invite) through the project's SMTP
 * settings; this is for the emails the APP sends, such as "a co-owner asked you to
 * approve a change". Needs RESEND_API_KEY; RESEND_FROM defaults to
 * `Opes Wealth <noreply@opeswealth.app>` and must be on a domain verified in Resend.
 */
export type SendResult = { sent: true } | { sent: false; reason: string };

export async function sendEmail(opts: { to: string; subject: string; html: string; text?: string }): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "Email service not configured (RESEND_API_KEY)." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? "Opes Wealth <noreply@opeswealth.app>",
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });
    if (res.ok) return { sent: true };
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    return { sent: false, reason: body?.message ?? `Email service error ${res.status}.` };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "Email could not be sent." };
  }
}
