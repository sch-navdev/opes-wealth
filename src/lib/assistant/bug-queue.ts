import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/utils/supabase/service";

/** Server-only (service-role client, `node:crypto`): import from route handlers / server code, never a client component. */

export type BugReportInput = {
  title: string;
  summary: string;
  reproSteps: string;
  pagePath: string;
  severity: "low" | "medium" | "high";
};

type BugRow = {
  id: string;
  title: string;
  summary: string;
  repro_steps: string;
  page_path: string;
  severity: string;
  occurrences: number;
  reporter_ids: string[];
  first_seen_at: string;
  last_seen_at: string;
};

// `bug_reports` isn't in the generated Database types (migration 0021), so use an untyped view of the service client.
function db(): SupabaseClient {
  return createServiceClient() as unknown as SupabaseClient;
}

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.trim().slice(0, n) : "");

/** Same bug = same normalised title on the same page (digits and case ignored, so "Row 3" and "row 7" merge). */
export function bugFingerprint(title: string, pagePath: string): string {
  const norm = `${title.toLowerCase().replace(/\d+/g, "#").replace(/[^a-z#]+/g, " ").trim()}|${pagePath.replace(/[0-9a-f-]{8,}/gi, ":id")}`;
  return createHash("sha256").update(norm).digest("hex").slice(0, 32);
}

/**
 * Logs a reproducible bug into the pending queue, consolidating with an
 * identical pending ticket (bumps `occurrences`, remembers the reporter)
 * instead of creating a duplicate. Returns whether it merged into an existing one.
 */
export async function logBugReport(
  raw: Partial<Record<keyof BugReportInput, unknown>>,
  userId: string,
): Promise<{ ok: true; consolidated: boolean } | { ok: false; error: string }> {
  const title = clip(raw.title, 200);
  const summary = clip(raw.summary, 4000);
  if (!title || !summary) return { ok: false, error: "title and summary are required" };
  const pagePath = clip(raw.pagePath, 300);
  const reproSteps = clip(raw.reproSteps, 4000);
  const severity = raw.severity === "low" || raw.severity === "high" ? raw.severity : "medium";
  const fingerprint = bugFingerprint(title, pagePath);
  const client = db();

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: existing, error: readError } = await client
      .from("bug_reports")
      .select("id, occurrences, reporter_ids")
      .eq("fingerprint", fingerprint)
      .eq("status", "pending")
      .maybeSingle();
    if (readError) return { ok: false, error: readError.message };

    if (existing) {
      const reporters: string[] = existing.reporter_ids ?? [];
      const { error } = await client
        .from("bug_reports")
        .update({
          occurrences: existing.occurrences + 1,
          reporter_ids: reporters.includes(userId) ? reporters : [...reporters, userId],
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      return error ? { ok: false, error: error.message } : { ok: true, consolidated: true };
    }

    const { error } = await client.from("bug_reports").insert({
      fingerprint,
      title,
      summary,
      repro_steps: reproSteps,
      page_path: pagePath,
      severity,
      reporter_ids: [userId],
    });
    if (!error) return { ok: true, consolidated: false };
    // 23505: someone logged the same bug between our read and insert; loop once to merge into it.
    if (error.code !== "23505") return { ok: false, error: error.message };
  }
  return { ok: false, error: "could not consolidate bug report" };
}

export type FlushResult =
  | { ok: true; sent: number; destination: string }
  | { ok: false; code: "not_configured" | "push_failed" | "db_error"; error: string; sent: number };

function issueBody(b: BugRow): string {
  return [
    b.summary,
    "",
    b.repro_steps ? `**Steps to reproduce**\n${b.repro_steps}\n` : "",
    `- Page: \`${b.page_path || "unknown"}\``,
    `- Severity (AI-assessed): ${b.severity}`,
    `- Reported ${b.occurrences}x by ${b.reporter_ids.length} user(s); first ${b.first_seen_at}, last ${b.last_seen_at}`,
    "",
    "_Logged by the Opes Wealth AI assistant. Unverified by a human: reproduce before fixing._",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/**
 * Pushes every pending report to the developers and marks it sent. Destinations
 * (first configured wins): GitHub issues (`GITHUB_ISSUES_TOKEN` +
 * `GITHUB_ISSUES_REPO`, one issue per report) or a JSON webhook
 * (`BUG_REPORT_WEBHOOK_URL`, one digest POST). Nothing configured -> the queue
 * is left untouched. A report is marked sent only after its push succeeded, so
 * a failure mid-way is retried on the next run without duplicating earlier ones.
 */
export async function flushBugReports(): Promise<FlushResult> {
  const client = db();
  const { data, error } = await client
    .from("bug_reports")
    .select("id, title, summary, repro_steps, page_path, severity, occurrences, reporter_ids, first_seen_at, last_seen_at")
    .eq("status", "pending")
    .order("first_seen_at", { ascending: true })
    .limit(100);
  if (error) return { ok: false, code: "db_error", error: error.message, sent: 0 };
  const rows = (data ?? []) as BugRow[];

  const token = process.env.GITHUB_ISSUES_TOKEN;
  const repo = process.env.GITHUB_ISSUES_REPO; // "owner/name"
  const webhook = process.env.BUG_REPORT_WEBHOOK_URL;
  if (!(token && repo) && !webhook) {
    return {
      ok: false,
      code: "not_configured",
      error: "Set GITHUB_ISSUES_TOKEN + GITHUB_ISSUES_REPO and/or BUG_REPORT_WEBHOOK_URL.",
      sent: 0,
    };
  }
  if (rows.length === 0) return { ok: true, sent: 0, destination: token && repo ? "github" : "webhook" };

  const markSent = (id: string, ref: string) =>
    client.from("bug_reports").update({ status: "sent", sent_at: new Date().toISOString(), external_ref: ref }).eq("id", id);

  let sent = 0;
  try {
    if (token && repo) {
      for (const bug of rows) {
        const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({ title: `[AI bug] ${bug.title}`, body: issueBody(bug), labels: ["bug", "ai-reported"] }),
        });
        if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
        const issue = (await res.json()) as { html_url?: string };
        await markSent(bug.id, issue.html_url ?? "github");
        sent++;
      }
      return { ok: true, sent, destination: "github" };
    }
    const res = await fetch(webhook!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Opes Wealth: ${rows.length} AI-reported bug(s) pending`,
        bugs: rows.map((b) => ({ ...b, body: issueBody(b) })),
      }),
    });
    if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
    for (const bug of rows) await markSent(bug.id, "webhook");
    return { ok: true, sent: rows.length, destination: "webhook" };
  } catch (e) {
    return { ok: false, code: "push_failed", error: e instanceof Error ? e.message : "push failed", sent };
  }
}
