# Opes Wealth — Supabase Auth email templates

Branded HTML for every email Supabase Auth sends (dark navy, champagne gold, serif headlines,
table layout with inline CSS, works in Outlook via VML buttons). The logo is loaded from
`https://www.opeswealth.app/email-logo.png` (an optimised copy of `public/logo.png`).

Paste each file into the Supabase dashboard (**Authentication → Emails**), set the suggested
subject, save, then send yourself a test. The `{{ … }}` tags are Supabase/Go template variables:
they show literally when you open a file in a browser and are filled in when the email is sent.

| File | Supabase screen | Suggested subject | Variables |
|---|---|---|---|
| `confirm-signup-template.html` | Templates → Confirm sign up | Confirm your Opes Wealth account | `.ConfirmationURL`, `.Email` |
| `invite-template.html` | Templates → Invite user | You have been invited to Opes Wealth | `.ConfirmationURL`, `.Email`, `.SiteURL`*, `.Data.first_name` / `.invited_by` / `.invited_asset` |
| `magic-link-template.html` | Templates → Magic link or OTP | Your Opes Wealth sign-in link | `.ConfirmationURL`, `.Token`, `.Email` |
| `change-email-template.html` | Templates → Change email address | Confirm your new email address | `.ConfirmationURL`, `.Email`, `.NewEmail`, `.SiteURL` |
| `reset-password-template.html` | Templates → Reset password | Reset your Opes Wealth password | `.ConfirmationURL`, `.Email` |
| `reauthentication-template.html` | Templates → Reauthentication | Your Opes Wealth verification code | `.Token`, `.Email` |
| `security-password-changed-template.html` | Security → Password changed | Your Opes Wealth password was changed | `.SiteURL` |
| `security-email-changed-template.html` | Security → Email address changed | Your Opes Wealth email address was changed | `.SiteURL` |
| `security-phone-changed-template.html` | Security → Phone number changed | Your Opes Wealth phone number was changed | `.SiteURL` |
| `security-identity-linked-template.html` | Security → Sign-in method linked | A sign-in method was added to your Opes Wealth account | `.SiteURL` |
| `security-identity-removed-template.html` | Security → Sign-in method removed | A sign-in method was removed from your Opes Wealth account | `.SiteURL` |
| `security-mfa-added-template.html` | Security → MFA method added | Two-factor authentication was added to your Opes Wealth account | `.SiteURL` |
| `security-mfa-removed-template.html` | Security → MFA method removed | Two-factor authentication was removed from your Opes Wealth account | `.SiteURL` |

\* the invite template's logo no longer uses `.SiteURL`; it points at the absolute logo URL above.

## Notes
- **Security notifications are off by default** in Supabase: turn each toggle on (Security section, then **Save changes**) for the email to be sent. They use only `{{ .SiteURL }}` on purpose — the richer variables (old/new address, provider, factor type) are not used because their exact names could not be verified, and a wrong variable makes a template fail to render. If you confirm them in the dashboard's template preview you can add detail lines.
- The **Reauthentication** and **Magic link** templates show the one-time code `{{ .Token }}`.
- **Redirect URLs:** the links resolve through Supabase and land on the app's `/auth/callback`; make sure `https://www.opeswealth.app/auth/callback` is in Authentication → URL Configuration → Redirect URLs.
- Some mail clients block images until the reader allows them; the gold "Opes Wealth" wordmark under the logo still shows.
- These files were generated from one shared layout; if you change the design, change all of them the same way.
