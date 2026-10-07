import { describe, expect, it, vi } from "vitest";
import type { TextractSend } from "./ocr-client";
import { runOcrSelfTest } from "./ocr-selftest";

const KEY = "AKIATESTFAKEKEY0000";
const SECRET = "fake/secret+value/DO-NOT-LEAK";
const env = { AWS_ACCESS_KEY_ID: KEY, AWS_SECRET_ACCESS_KEY: SECRET, AWS_REGION: "ap-south-1" };

function awsError(name: string, status = 400) {
  const e = new Error(`User: arn:aws:iam::123456789012:user/x is not authorized ${KEY} ${SECRET}`);
  e.name = name;
  Object.assign(e, { $metadata: { httpStatusCode: status, requestId: "abc-123" } });
  return e;
}

describe("runOcrSelfTest", () => {
  it("reports not configured without calling send", async () => {
    const send = vi.fn() as unknown as TextractSend;
    const res = await runOcrSelfTest({ env: { AWS_REGION: "ap-south-1" }, send });
    expect(res).toMatchObject({ ok: false, configured: false, region: "ap-south-1", errorClass: "not_configured" });
    expect(send).not.toHaveBeenCalled();
  });

  it("returns ok when Textract answers, sending a one-page PDF with TABLES", async () => {
    const send: TextractSend = vi.fn(async (cmd) => {
      expect(cmd.input.FeatureTypes).toEqual(["TABLES"]);
      expect(cmd.input.Document?.Bytes).toBeInstanceOf(Uint8Array);
      return { Blocks: [] };
    });
    const res = await runOcrSelfTest({ env, send });
    expect(res).toEqual({ ok: true, configured: true, region: "ap-south-1" });
  });

  it("prefers OCR_AWS_REGION", async () => {
    const res = await runOcrSelfTest({ env: { ...env, OCR_AWS_REGION: "eu-west-1" }, send: async () => ({}) });
    expect(res.region).toBe("eu-west-1");
  });

  it.each([
    ["AccessDeniedException", /CloudTrail Event history in ap-south-1/],
    ["UnrecognizedClientException", /access key id/],
    ["InvalidSignatureException", /secret/i],
    ["SubscriptionRequiredException", /not enabled for Amazon Textract/],
    ["OptInRequired", /not enabled for Amazon Textract/],
    ["WeirdThing", /not in the known list/],
  ])("maps %s to a fixed hint and leaks nothing", async (name, hint) => {
    const send: TextractSend = async () => {
      throw awsError(name, 403);
    };
    const res = await runOcrSelfTest({ env, send });
    expect(res).toMatchObject({ ok: false, configured: true, errorClass: name, httpStatus: 403, requestId: "abc-123" });
    expect(res.hint).toMatch(hint);
    const json = JSON.stringify(res);
    for (const bad of [KEY, SECRET, "arn:aws"]) expect(json).not.toContain(bad);
  });
});
