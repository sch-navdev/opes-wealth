/**
 * The "please review this change" email sent to a registered co-owner (server-only).
 * Same look as docs/emails: navy and gold, serif headline, Outlook-safe button.
 */
import { sendEmail, type SendResult } from "@/lib/email";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function approvalEmail(opts: {
  recipientName: string;
  requesterName: string;
  assetName: string;
  expiresAt: string;
  reviewUrl: string;
}): { subject: string; html: string; text: string } {
  const expires = new Date(opts.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const who = esc(opts.requesterName);
  const asset = esc(opts.assetName);
  const first = esc(opts.recipientName.trim().split(/\s+/)[0] ?? "");
  const subject = `${opts.requesterName} proposed a change to ${opts.assetName}`;
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><title>${esc(subject)}</title></head>
<body style="margin:0; padding:0; background-color:#06101E; color:#FAFAFA;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#06101E;"><tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px; max-width:100%;">
<tr><td align="center" style="padding:0 0 28px 0;">
<img src="https://www.opeswealth.app/email-logo.png" width="68" height="64" alt="Opes Wealth" style="display:block; margin:0 auto; width:68px; height:64px; border:0;">
<p style="margin:14px 0 0 0; font-family:Georgia,'Times New Roman',serif; font-size:13px; letter-spacing:6px; text-transform:uppercase; color:#C69B3C;">Opes&nbsp;Wealth</p>
</td></tr>
<tr><td style="background-color:#0B1830; border:1px solid #2A3550; border-top:3px solid #C69B3C;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td align="center" style="padding:44px 40px 8px 40px;">
<p style="margin:0 0 16px 0; font-family:Arial,Helvetica,sans-serif; font-size:11px; letter-spacing:4px; text-transform:uppercase; color:#C69B3C;">Your approval is needed</p>
<h1 style="margin:0; font-family:Georgia,'Times New Roman',serif; font-size:28px; line-height:36px; font-weight:normal; color:#FFFFFF;">A change to a shared asset</h1>
</td></tr>
<tr><td style="padding:24px 40px 0 40px; font-family:Georgia,'Times New Roman',serif; font-size:17px; line-height:28px; color:#E6E9F0;">
<p style="margin:0 0 18px 0;">${first ? `Dear ${first},` : "Hello,"}</p>
<p style="margin:0 0 18px 0;"><span style="color:#FFFFFF;">${who}</span> proposed a change to <span style="color:#FFFFFF;">${asset}</span>, which you own together. Nothing changes until you decide.</p>
<p style="margin:0;">If nobody answers, the change is applied automatically on <span style="color:#C69B3C;">${esc(expires)}</span>.</p>
</td></tr>
<tr><td align="center" style="padding:32px 40px 8px 40px;">
<a href="${esc(opts.reviewUrl)}" target="_blank" style="display:inline-block; background-color:#C69B3C; color:#06101E; font-family:Arial,Helvetica,sans-serif; font-size:14px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; line-height:52px; padding:0 40px; border:1px solid #C69B3C;">Review the change</a>
</td></tr>
<tr><td style="padding:28px 40px 44px 40px; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:19px; color:#9AA3B5;">
Sign in to Opes Wealth and open the bell at the top of your dashboard to approve or reject. If you have not yet accepted your invitation, use the invitation email first. Link: <a href="${esc(opts.reviewUrl)}" style="color:#C69B3C; word-break:break-all;">${esc(opts.reviewUrl)}</a>
</td></tr>
</table></td></tr>
<tr><td align="center" style="padding:28px 40px 0 40px; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:19px; color:#7F8AA0;">
<p style="margin:0; letter-spacing:3px; text-transform:uppercase; font-size:10px; color:#5D6880;">Opes&nbsp;Wealth &nbsp;·&nbsp; Private wealth, together</p>
</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${opts.requesterName} proposed a change to ${opts.assetName}, which you own together. Nothing changes until you decide; if nobody answers it is applied automatically on ${expires}.\n\nReview it: ${opts.reviewUrl}`;
  return { subject, html, text };
}

export async function sendApprovalEmail(
  to: string,
  opts: Parameters<typeof approvalEmail>[0],
): Promise<SendResult> {
  const { subject, html, text } = approvalEmail(opts);
  return sendEmail({ to, subject, html, text });
}
