import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const run = vi.hoisted(() => vi.fn());
vi.mock("@/lib/vault-expiry-server", () => ({ runDocumentExpiry: run }));

import { GET } from "@/app/api/cron/document-expiry/route";

const req = (auth?: string) => new Request("http://x/api/cron/document-expiry", { headers: auth ? { authorization: auth } : {} });

describe("document-expiry cron route", () => {
  beforeEach(() => {
    run.mockReset();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("refuses without a secret configured, without a header, and with a wrong header", async () => {
    expect((await GET(req("Bearer s"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "s");
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("runs with the right bearer, returns counts and logs counts only", async () => {
    vi.stubEnv("CRON_SECRET", "s");
    run.mockResolvedValue({ available: true, scanned: 3, due: 2, sent: 2, skipped: 1, failed: 0 });
    const res = await GET(req("Bearer s"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: true, scanned: 3, due: 2, sent: 2, skipped: 1, failed: 0 });
    expect(String((console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0])).toBe(
      "[cron:document-expiry] scanned=3 due=2 sent=2 skipped=1 failed=0",
    );
  });

  it("207 on partial failure, 500 (no detail) on a crash", async () => {
    vi.stubEnv("CRON_SECRET", "s");
    run.mockResolvedValueOnce({ available: true, scanned: 1, due: 1, sent: 0, skipped: 0, failed: 1 });
    expect((await GET(req("Bearer s"))).status).toBe(207);
    run.mockRejectedValueOnce(new Error("secret detail"));
    const res = await GET(req("Bearer s"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret detail");
  });
});
