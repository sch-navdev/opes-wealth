import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { isOcrConfigured, ocrPdfToDocument, type TextractSend } from "./ocr-client";

const KEY = "AKIATESTFAKEKEY0000";
const SECRET = "fake/secret+value/DO-NOT-LEAK";
const env = { AWS_ACCESS_KEY_ID: KEY, AWS_SECRET_ACCESS_KEY: SECRET };

async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  return doc.save();
}

const okSend = (): TextractSend =>
  vi.fn(async () => ({
    Blocks: [{ Id: "l", BlockType: "LINE", Text: "hello" }],
  }));

function namedError(name: string, message = `boom ${KEY} ${SECRET}`): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}

describe("isOcrConfigured", () => {
  it.each([
    [{}, false],
    [{ AWS_ACCESS_KEY_ID: KEY }, false],
    [{ AWS_SECRET_ACCESS_KEY: SECRET }, false],
    [{ AWS_ACCESS_KEY_ID: "", AWS_SECRET_ACCESS_KEY: SECRET }, false],
    [{ AWS_ACCESS_KEY_ID: KEY, AWS_SECRET_ACCESS_KEY: "  " }, false],
    [env, true],
  ])("%j -> %s", (e, expected) => {
    expect(isOcrConfigured(e)).toBe(expected);
  });
});

describe("ocrPdfToDocument", () => {
  it("returns not_configured without calling send", async () => {
    const send = okSend();
    const res = await ocrPdfToDocument(await makePdf(1), { env: {}, send });
    expect(res).toMatchObject({ ok: false, reason: "not_configured" });
    expect(send).not.toHaveBeenCalled();
  });

  it("splits a multi-page PDF and returns one OCR page per page, in order", async () => {
    const sent: number[] = [];
    const send: TextractSend = vi.fn(async (cmd) => {
      const bytes = cmd.input.Document?.Bytes as Uint8Array;
      expect(cmd.input.FeatureTypes).toEqual(["TABLES"]);
      const single = await PDFDocument.load(bytes);
      expect(single.getPageCount()).toBe(1);
      const n = sent.push(1);
      return { Blocks: [{ Id: "l", BlockType: "LINE", Text: `page-${n}` }] };
    });
    const res = await ocrPdfToDocument(await makePdf(4), { env, send });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.pages).toBe(4);
      expect(res.truncated).toBe(false);
      expect(res.document.pages).toHaveLength(4);
      expect(res.document.pages.every((p) => p.lines.length === 1)).toBe(true);
    }
    expect(send).toHaveBeenCalledTimes(4);
  });

  it("truncates at maxPages and flags it", async () => {
    const send = okSend();
    const res = await ocrPdfToDocument(await makePdf(5), { env, send, maxPages: 2 });
    expect(res.ok && res.pages).toBe(2);
    expect(res.ok && res.truncated).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("honours OCR_MAX_PAGES from env", async () => {
    const send = okSend();
    const res = await ocrPdfToDocument(await makePdf(3), { env: { ...env, OCR_MAX_PAGES: "1" }, send });
    expect(res.ok && res.truncated).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("rejects documents above the hard page cap", async () => {
    const send = okSend();
    const res = await ocrPdfToDocument(await makePdf(21), { env, send, maxPages: 50 });
    expect(res).toMatchObject({ ok: false, reason: "too_many_pages" });
    expect(send).not.toHaveBeenCalled();
  });

  it("returns unreadable for non-PDF bytes", async () => {
    const res = await ocrPdfToDocument(new TextEncoder().encode("not a pdf"), { env, send: okSend() });
    expect(res).toMatchObject({ ok: false, reason: "unreadable" });
  });

  it.each([
    ["AccessDeniedException", "access_denied"],
    ["ThrottlingException", "throttled"],
    ["ProvisionedThroughputExceededException", "throttled"],
    ["UnsupportedDocumentException", "unreadable"],
    ["BadDocumentException", "unreadable"],
    ["SomethingElse", "provider_error"],
  ])("maps %s -> %s and never leaks credentials", async (name, reason) => {
    const send: TextractSend = vi.fn(async () => {
      throw namedError(name);
    });
    const res = await ocrPdfToDocument(await makePdf(3), { env, send });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe(reason);
      expect(JSON.stringify(res)).not.toContain(KEY);
      expect(JSON.stringify(res)).not.toContain(SECRET);
    }
  });
});
