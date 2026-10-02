/**
 * Emails the app sends itself about shared assets (server-only), through Resend:
 *  - "please review this change" to a co-owner who must approve an edit;
 *  - "an asset was shared with you" to a co-owner who already has an account (people
 *    without one get Supabase's invitation email instead).
 * Same look as docs/emails: navy and gold, serif headline, gold button.
 */
import { sendEmail, type SendResult } from "@/lib/email";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function shell(opts: { eyebrow: string; headline: string; bodyHtml: string; cta: string; url: string; footnote: string }): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><title>${esc(opts.headline)}</title></head>
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
<p style="margin:0 0 16px 0; font-family:Arial,Helvetica,sans-serif; font-size:11px; letter-spacing:4px; text-transform:uppercase; color:#C69B3C;">${esc(opts.eyebrow)}</p>
<h1 style="margin:0; font-family:Georgia,'Times New Roman',serif; font-size:28px; line-height:36px; font-weight:normal; color:#FFFFFF;">${esc(opts.headline)}</h1>
</td></tr>
<tr><td style="padding:24px 40px 0 40px; font-family:Georgia,'Times New Roman',serif; font-size:17px; line-height:28px; color:#E6E9F0;">
${opts.bodyHtml}
</td></tr>
<tr><td align="center" style="padding:32px 40px 8px 40px;">
<a href="${esc(opts.url)}" target="_blank" style="display:inline-block; background-color:#C69B3C; color:#06101E; font-family:Arial,Helvetica,sans-serif; font-size:14px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; line-height:52px; padding:0 40px; border:1px solid #C69B3C;">${esc(opts.cta)}</a>
</td></tr>
<tr><td style="padding:28px 40px 44px 40px; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:19px; color:#9AA3B5;">
${esc(opts.footnote)} Link: <a href="${esc(opts.url)}" style="color:#C69B3C; word-break:break-all;">${esc(opts.url)}</a>
</td></tr>
</table></td></tr>
<tr><td align="center" style="padding:28px 40px 0 40px; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:19px; color:#7F8AA0;">
<p style="margin:0; letter-spacing:3px; text-transform:uppercase; font-size:10px; color:#5D6880;">Opes&nbsp;Wealth &nbsp;·&nbsp; Private wealth, together</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? "";
const greeting = (name: string) => (firstName(name) ? `Dear ${esc(firstName(name))},` : "Hello,");

export function approvalEmail(opts: {
  recipientName: string;
  requesterName: string;
  assetName: string;
  expiresAt: string;
  reviewUrl: string;
}): { subject: string; html: string; text: string } {
  const expires = new Date(opts.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const subject = `${opts.requesterName} proposed a change to ${opts.assetName}`;
  const html = shell({
    eyebrow: "Your approval is needed",
    headline: "A change to a shared asset",
    bodyHtml: `<p style="margin:0 0 18px 0;">${greeting(opts.recipientName)}</p>
<p style="margin:0 0 18px 0;"><span style="color:#FFFFFF;">${esc(opts.requesterName)}</span> proposed a change to <span style="color:#FFFFFF;">${esc(opts.assetName)}</span>, which you own together. Nothing changes until you decide.</p>
<p style="margin:0;">If nobody answers, the change is applied automatically on <span style="color:#C69B3C;">${esc(expires)}</span>.</p>`,
    cta: "Review the change",
    url: opts.reviewUrl,
    footnote: "Sign in to Opes Wealth and open the bell at the top of your dashboard to approve or reject.",
  });
  const text = `${opts.requesterName} proposed a change to ${opts.assetName}, which you own together. Nothing changes until you decide; if nobody answers it is applied automatically on ${expires}.\n\nReview it: ${opts.reviewUrl}`;
  return { subject, html, text };
}

export function sharedWithYouEmail(opts: {
  recipientName: string;
  ownerName: string;
  assetName: string;
  percentage: number;
  url: string;
}): { subject: string; html: string; text: string } {
  const subject = `${opts.ownerName} shared ${opts.assetName} with you`;
  const html = shell({
    eyebrow: "Shared with you",
    headline: "You now co-own an asset",
    bodyHtml: `<p style="margin:0 0 18px 0;">${greeting(opts.recipientName)}</p>
<p style="margin:0 0 18px 0;"><span style="color:#FFFFFF;">${esc(opts.ownerName)}</span> added you as a co-owner of <span style="color:#FFFFFF;">${esc(opts.assetName)}</span>, with a <span style="color:#C69B3C;">${esc(String(opts.percentage))}%</span> share.</p>
<p style="margin:0;">You can view it on your Opes Wealth dashboard, where your share counts toward your net worth. Changes to a jointly held asset are proposed to its co-owners and need your approval.</p>`,
    cta: "Open the asset",
    url: opts.url,
    footnote: "Sign in to Opes Wealth with this email address to see it.",
  });
  const text = `${opts.ownerName} added you as a co-owner of ${opts.assetName} (${opts.percentage}% share). Sign in to Opes Wealth to view it: ${opts.url}`;
  return { subject, html, text };
}

export async function sendApprovalEmail(to: string, opts: Parameters<typeof approvalEmail>[0]): Promise<SendResult> {
  const { subject, html, text } = approvalEmail(opts);
  return sendEmail({ to, subject, html, text });
}

export async function sendSharedWithYouEmail(to: string, opts: Parameters<typeof sharedWithYouEmail>[0]): Promise<SendResult> {
  const { subject, html, text } = sharedWithYouEmail(opts);
  return sendEmail({ to, subject, html, text });
}
