import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { logBugReport } from "@/lib/assistant/bug-queue";
import { SYSTEM_PROMPT } from "@/lib/assistant/knowledge";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  de: "German",
  ar: "Arabic",
  ru: "Russian",
  hi: "Hindi",
  zh: "Simplified Chinese",
};

const MAX_MESSAGES = 20;
const MAX_CHARS = 4000;
const MAX_SCREENSHOT_CHARS = 3_000_000; // base64 chars, roughly 2.2 MB of image
const MODEL = process.env.ASSISTANT_MODEL || "claude-sonnet-5-5";

// Best-effort per-user throttle (per server instance; a real limiter would need shared storage).
const recent = new Map<string, number[]>();
function throttled(userId: string): boolean {
  const now = Date.now();
  const hits = (recent.get(userId) ?? []).filter((t) => now - t < 60_000);
  hits.push(now);
  recent.set(userId, hits);
  return hits.length > 12;
}

const REPORT_BUG_TOOL: Anthropic.Tool = {
  name: "report_bug",
  description:
    "Log a reproducible bug in the Opes Wealth app into the developers' queue. Only for faults in the app itself with concrete repro steps, never user errors or missing features.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Specific one-line title, e.g. 'Saxo import drops the last trade row'." },
      summary: { type: "string", description: "What goes wrong, what was expected, and the evidence (no personal data or amounts)." },
      repro_steps: { type: "string", description: "Numbered steps to reproduce." },
      page_path: { type: "string", description: "App path where it happens, e.g. /dashboard/banking." },
      severity: { type: "string", enum: ["low", "medium", "high"] },
    },
    required: ["title", "summary", "repro_steps"],
  },
};

type ChatMessage = { role: "user" | "assistant"; content: string };

function parseMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) return null;
  const out: ChatMessage[] = [];
  for (const m of value) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;
    const content = m.content.trim().slice(0, MAX_CHARS);
    if (!content) return null;
    out.push({ role: m.role, content });
  }
  return out[out.length - 1].role === "user" ? out : null;
}

/**
 * POST { messages, screenshot?, page?, locale? } -> { reply, bugLogged }.
 * Signed-in (and MFA-complete) users only. `screenshot` is a JPEG/PNG data URL
 * attached to the LAST user message only; it is sent to the AI provider and
 * never stored.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (await needsMfaStepUp(supabase))) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  if (throttled(user.id)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let body: { messages?: unknown; screenshot?: unknown; page?: unknown; locale?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const messages = parseMessages(body.messages);
  if (!messages) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const page = typeof body.page === "string" ? body.page.slice(0, 300) : "";
  const locale = LANGUAGE_NAMES[typeof body.locale === "string" ? body.locale : ""] ?? "English";

  const shot = typeof body.screenshot === "string" ? /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(body.screenshot) : null;
  if (typeof body.screenshot === "string" && (!shot || body.screenshot.length > MAX_SCREENSHOT_CHARS)) {
    return NextResponse.json({ error: "invalid_screenshot" }, { status: 400 });
  }

  const apiMessages: Anthropic.MessageParam[] = messages.map((m, i) => {
    if (i === messages.length - 1 && shot) {
      return {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: shot[1] === "png" ? "image/png" : "image/jpeg", data: shot[2] } },
          { type: "text", text: m.content },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

  const client = new Anthropic();
  const system = `${SYSTEM_PROMPT}\n\nThe user is currently on page: ${page || "unknown"}. The app language is ${locale}.`;
  let bugLogged = false;

  try {
    for (let turn = 0; turn < 3; turn++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system,
        tools: [REPORT_BUG_TOOL],
        messages: apiMessages,
      });

      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        const reply = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return NextResponse.json({ reply: reply || "…", bugLogged });
      }

      apiMessages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        if (use.name !== "report_bug") {
          results.push({ type: "tool_result", tool_use_id: use.id, content: "Unknown tool.", is_error: true });
          continue;
        }
        const input = (use.input ?? {}) as Record<string, unknown>;
        const logged = await logBugReport(
          {
            title: input.title,
            summary: input.summary,
            reproSteps: input.repro_steps,
            pagePath: input.page_path || page,
            severity: input.severity,
          },
          user.id,
        );
        if (logged.ok) bugLogged = true;
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: logged.ok
            ? logged.consolidated
              ? "Logged: merged into an existing pending report of the same bug."
              : "Logged as a new pending report for the developers."
            : `Could not log the report (${logged.error}). Tell the user it could not be logged.`,
          is_error: !logged.ok,
        });
      }
      apiMessages.push({ role: "user", content: results });
    }
    return NextResponse.json({ reply: "…", bugLogged });
  } catch (error) {
    const status = error instanceof Anthropic.APIError ? error.status : undefined;
    console.error("assistant request failed", status ?? error);
    return NextResponse.json({ error: "upstream_failed" }, { status: 502 });
  }
}
