import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * End-to-end through the real AI SDK and the real OpenAI-compatible wire format, against a local fake of
 * Groq's /chat/completions endpoint (reached through AI_BASE_URL). Only Supabase is mocked.
 */
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }),
}));
vi.mock("@/utils/supabase/mfa", () => ({ needsMfaStepUp: async () => false }));

let server: Server;
let mode: "ok" | "unauthorized" = "ok";
let lastBody: { model?: string; messages?: { role: string; content: unknown }[]; stream?: boolean } = {};

function sse(delta: object, finish: string | null = null) {
  return `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model: "m", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (mode === "unauthorized") {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Invalid API Key", type: "invalid_request_error" } }));
        return;
      }
      lastBody = JSON.parse(raw);
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(sse({ role: "assistant", content: "" }));
      res.write(sse({ content: "Open Quick Actions " }));
      res.write(sse({ content: "with Cmd+K." }));
      res.write(sse({}, "stop"));
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.AI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  process.env.GROQ_API_KEY = "test-key";
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const request = () =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify({ messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "How do I add a car?" }] }] }),
  });

describe("POST /api/chat against an OpenAI-compatible server", () => {
  it("streams the model's text back and sends the system prompt, model and user message upstream", async () => {
    mode = "ok";
    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(request());
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Open Quick Actions ");
    expect(text).toContain("with Cmd+K.");
    expect(lastBody.model).toBe("qwen/qwen3.8-27b");
    expect(lastBody.stream).toBe(true);
    expect(Object.keys(lastBody)).toContain("stream_options");
    expect(lastBody.messages?.[0].role).toBe("system");
    expect(String(lastBody.messages?.[0].content)).toContain("Opes Wealth Support Assistant");
    expect(lastBody.messages?.at(-1)).toMatchObject({ role: "user" });
  });

  it("turns a provider 401 into a coded error in the stream, without forwarding the provider text", async () => {
    mode = "unauthorized";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("@/app/api/chat/route");
    const text = await (await POST(request())).text();
    expect(text).toContain("upstream_401");
    expect(text).not.toContain("Invalid API Key");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
