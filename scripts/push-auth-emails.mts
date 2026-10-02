/**
 * Pushes the branded auth email templates in docs/emails/ to the Supabase
 * project's Auth configuration through the Management API: the 6 template
 * bodies + subjects, and the 7 security-notification bodies + subjects, which it
 * also switches ON.
 *
 *   node --env-file=.env.local scripts/push-auth-emails.mts          # dry run: reads the remote config, prints the plan
 *   node --env-file=.env.local scripts/push-auth-emails.mts --yes    # back up the current templates, then apply
 *
 * Needs SUPABASE_ACCESS_TOKEN: a personal access token (Supabase dashboard →
 * account menu → Access Tokens), put in .env.local — never commit it. The
 * project is taken from NEXT_PUBLIC_SUPABASE_URL.
 *
 * Safety: only mailer template / subject / notification keys are sent (never
 * site URL, redirect URLs, providers, rate limits…). Every key is first looked
 * up in the project's REAL auth config; if one cannot be found the script stops
 * and lists the candidates instead of guessing. The current values are saved to
 * a JSON backup in the OS temp folder before anything is changed, and the result
 * is read back and compared. Uses Node's built-in TypeScript support.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!token) throw new Error("SUPABASE_ACCESS_TOKEN is not set (add it to .env.local).");
if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
const ref = new URL(supabaseUrl).hostname.split(".")[0];
const apply = process.argv.includes("--yes");
const API = `https://api.supabase.com/v1/projects/${ref}/config/auth`;

type Item = {
  file: string;
  subject: string;
  /** Exact key names, when they are well known; otherwise patterns matched against the real config. */
  contentKey?: string;
  subjectKey?: string;
  match?: RegExp;
  /** Security notifications also have an "enabled" switch. */
  notification?: boolean;
};

const ITEMS: Item[] = [
  { file: "confirm-signup", subject: "Confirm your Opes Wealth account", contentKey: "mailer_templates_confirmation_content", subjectKey: "mailer_subjects_confirmation" },
  { file: "invite", subject: "You have been invited to Opes Wealth", contentKey: "mailer_templates_invite_content", subjectKey: "mailer_subjects_invite" },
  { file: "magic-link", subject: "Your Opes Wealth sign-in link", contentKey: "mailer_templates_magic_link_content", subjectKey: "mailer_subjects_magic_link" },
  { file: "change-email", subject: "Confirm your new email address", contentKey: "mailer_templates_email_change_content", subjectKey: "mailer_subjects_email_change" },
  { file: "reset-password", subject: "Reset your Opes Wealth password", contentKey: "mailer_templates_recovery_content", subjectKey: "mailer_subjects_recovery" },
  { file: "reauthentication", subject: "Your Opes Wealth verification code", contentKey: "mailer_templates_reauthentication_content", subjectKey: "mailer_subjects_reauthentication" },
  { file: "security-password-changed", subject: "Your Opes Wealth password was changed", match: /password_changed/, notification: true },
  { file: "security-email-changed", subject: "Your Opes Wealth email address was changed", match: /email_changed/, notification: true },
  { file: "security-phone-changed", subject: "Your Opes Wealth phone number was changed", match: /phone_changed/, notification: true },
  { file: "security-identity-linked", subject: "A sign-in method was added to your Opes Wealth account", match: /identity_linked/, notification: true },
  { file: "security-identity-removed", subject: "A sign-in method was removed from your Opes Wealth account", match: /identity_(unlinked|removed)/, notification: true },
  { file: "security-mfa-added", subject: "Two-factor authentication was added to your Opes Wealth account", match: /mfa_(factor_)?(enrolled|added)/, notification: true },
  { file: "security-mfa-removed", subject: "Two-factor authentication was removed from your Opes Wealth account", match: /mfa_(factor_)?(unenrolled|removed)/, notification: true },
];

async function api(method: "GET" | "PATCH", body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(API, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Supabase API ${method} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as Record<string, unknown>;
}

console.log(`Project: ${ref} (${apply ? "WRITING" : "dry run"})`);
const remote = await api("GET");
const keys = Object.keys(remote);

/** Finds the one remote key for a notification: kind = content | subject | enabled. */
function findKey(item: Item, kind: "content" | "subject" | "enabled"): string | null {
  const wanted = keys.filter((k) => {
    if (!item.match?.test(k)) return false;
    if (kind === "content") return /^mailer_templates_.*_content$/.test(k);
    if (kind === "subject") return /^mailer_subjects_/.test(k);
    return /^mailer_notifications_.*_enabled$/.test(k);
  });
  return wanted.length === 1 ? wanted[0] : null;
}

const patch: Record<string, unknown> = {};
const backup: Record<string, unknown> = {};
const missing: string[] = [];
const plan: string[] = [];

for (const item of ITEMS) {
  const html = readFileSync(new URL(`../docs/emails/${item.file}-template.html`, import.meta.url), "utf8");
  const contentKey = item.contentKey ?? findKey(item, "content");
  const subjectKey = item.subjectKey ?? findKey(item, "subject");
  const enabledKey = item.notification ? findKey(item, "enabled") : null;

  for (const [label, k] of [["content", contentKey], ["subject", subjectKey], ...(item.notification ? [["enabled", enabledKey]] : [])] as [string, string | null][]) {
    if (!k || !(k in remote)) missing.push(`${item.file}: no remote key for ${label}`);
  }
  if (!contentKey || !subjectKey || (item.notification && !enabledKey)) continue;

  backup[contentKey] = remote[contentKey];
  backup[subjectKey] = remote[subjectKey];
  patch[contentKey] = html;
  patch[subjectKey] = item.subject;
  if (enabledKey) {
    backup[enabledKey] = remote[enabledKey];
    patch[enabledKey] = true;
  }
  const same = remote[contentKey] === html && remote[subjectKey] === item.subject;
  plan.push(`  ${item.file.padEnd(28)} ${same ? "already up to date" : "will update"}${enabledKey ? `, notification ${remote[enabledKey] ? "already on" : "will be switched ON"}` : ""}`);
}

console.log(plan.join("\n"));
if (missing.length > 0) {
  console.log("\nCould not match these to the project's auth config, so NOTHING was changed:\n  " + missing.join("\n  "));
  console.log("\nTemplate-related keys the project actually has:\n  " + keys.filter((k) => /^mailer_(templates|subjects|notifications)_/.test(k)).join("\n  "));
  process.exit(1);
}

if (!apply) {
  console.log("\nDry run: nothing written. Re-run with --yes to apply.");
} else {
  const backupPath = join(tmpdir(), `opes-auth-emails-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`\nBackup of the current templates: ${backupPath}`);

  await api("PATCH", patch);
  const after = await api("GET");
  const wrong = Object.entries(patch).filter(([k, v]) => after[k] !== v).map(([k]) => k);
  console.log(wrong.length === 0 ? `Applied and verified ${Object.keys(patch).length} settings.` : `Applied, but these did not read back as sent: ${wrong.join(", ")}`);
}
