import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, createUIMessageStreamResponse, streamText, toUIMessageStream, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { getMockUserId, isMockAuthEnabled } from "@/utils/supabase/mock-auth";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_MESSAGES = 20;
const MAX_CHARS = 4000;

/** Groq (free tier) speaks the OpenAI wire format; AI_BASE_URL can point at any other compatible provider. */
const provider = createOpenAI({
  baseURL: process.env.AI_BASE_URL || "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY,
});

/**
 * Groq retires models without notice (llama-3.3-70b-versatile stopped existing for Steve's account), so the name
 * is a setting: AI_MODEL in Vercel overrides this default without a code change.
 */
const MODEL = process.env.AI_MODEL || "qwen/qwen3.8-27b";

const SYSTEM_PROMPT = `You are the Opes Wealth Support Assistant. Your job is to help high-net-worth users navigate the platform. Platform Knowledge:

* Tiers: Users can switch between Basic, Standard, Professional, and Expert views in Settings. Expert view reveals FX exposure, IRR comparisons, and tax-lot accounting.
* Adding Assets: Users can add Real Estate, Vehicles, Private Equity, and Assurance-Vie via the Quick Actions menu (Cmd+K) or the Dashboard.
* Bank Uploads: Users can upload CSV or PDF bank statements in the 'Cash' category. OCR is supported for image-only PDFs.
* Navigation: The sidebar contains Dashboard, Banking, Companies (Entity Look-through), and Planning (Retirement Simulator). Rules: Keep answers concise, professional, and directly address the UI steps needed to accomplish the user's goal. Never offer financial advice.`;

// Best-effort per-user throttle (per server instance; a real limiter would need shared storage).
const recent = new Map<string, number[]>();
function throttled(userId: string): boolean {
  const now = Date.now();
  const hits = (recent.get(userId) ?? []).filter((t) => now - t < 60_000);
  hits.push(now);
  recent.set(userId, hits);
  return hits.length > 12;
}

/** HTTP status of a failed provider call (401 bad key, 404 unknown model, 429 rate limit), when there is one. */
function upstreamStatus(error: unknown): number | null {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === "number" ? status : null;
}

/** Keeps only the last MAX_MESSAGES messages and trims every text part, so a request cannot be made arbitrarily large. */
function sanitize(value: unknown): UIMessage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: UIMessage[] = [];
  for (const m of value.slice(-MAX_MESSAGES)) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || !Array.isArray(m.parts)) return null;
    const parts = m.parts
      .filter((p: { type?: unknown; text?: unknown }) => p?.type === "text" && typeof p.text === "string")
      .map((p: { text: string }) => ({ type: "text" as const, text: p.text.slice(0, MAX_CHARS) }));
    if (parts.length === 0) return null;
    out.push({ id: typeof m.id === "string" ? m.id.slice(0, 64) : crypto.randomUUID(), role: m.role, parts });
  }
  return out[out.length - 1].role === "user" ? out : null;
}

/**
 * POST { messages: UIMessage[] } -> a streamed AI SDK UI message response.
 * Signed-in (and MFA-complete) users only; anyone else gets a 401 before a prompt is read.
 */
export async function POST(request: Request) {
  // Local development only: the mock login has no Supabase session (see utils/supabase/mock-auth.ts, which is
  // hard-gated on NODE_ENV === "development"), so it stands in for one here and nowhere else.
  const mockUserId = isMockAuthEnabled() ? getMockUserId() : null;
  let userId = mockUserId;
  if (!userId) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || (await needsMfaStepUp(supabase))) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    userId = user.id;
  }
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  if (throttled(userId)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let body: { messages?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const messages = sanitize(body.messages);
  if (!messages) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const result = streamText({
    // `.chat()`: Groq implements the Chat Completions endpoint, not OpenAI's newer Responses API.
    model: provider.chat(MODEL),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    maxOutputTokens: 1000,
    // The provider's real answer (bad key, unknown model, rate limit) only ever reaches the server log.
    onError: ({ error }) => console.error("chat upstream error", upstreamStatus(error) ?? error),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      // The client turns this code into a readable message; the provider's own text is never forwarded.
      onError: (error) => JSON.stringify({ error: `upstream_${upstreamStatus(error) ?? "failed"}` }),
    }),
  });
}
