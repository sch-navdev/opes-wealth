/**
 * Safe OCR self-test: sends a tiny generated one-page PDF to Textract and reports ONLY
 * non-secret facts (configured?, region, AWS error class, HTTP status, request id, a fixed hint).
 * Never returns credential values or provider message text. `send` is injectable for tests.
 */
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  createSend,
  hintForErrorClass,
  isOcrConfigured,
  mapProviderError,
  resolveOcrRegion,
  type TextractSend,
} from "@/lib/services/ocr-client";

export type OcrSelfTestResult = {
  ok: boolean;
  configured: boolean;
  region: string;
  errorClass?: string;
  httpStatus?: number;
  requestId?: string;
  hint?: string;
};

type Env = Record<string, string | undefined>;

async function makeTinyPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 120]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Opes OCR self test", { x: 20, y: 60, size: 18, font });
  return doc.save();
}

export async function runOcrSelfTest(opts: { send?: TextractSend; env?: Env } = {}): Promise<OcrSelfTestResult> {
  const env = opts.env ?? process.env;
  const region = resolveOcrRegion(env);
  if (!isOcrConfigured(env)) {
    return {
      ok: false,
      configured: false,
      region,
      errorClass: "not_configured",
      hint: "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are not set in this deployment: add them (and AWS_REGION or OCR_AWS_REGION) in the host's environment variables and redeploy.",
    };
  }
  try {
    const bytes = await makeTinyPdf();
    const send = opts.send ?? (await createSend(env));
    const { AnalyzeDocumentCommand } = await import("@aws-sdk/client-textract");
    await send(new AnalyzeDocumentCommand({ Document: { Bytes: bytes }, FeatureTypes: ["TABLES"] }));
    return { ok: true, configured: true, region };
  } catch (err) {
    const f = mapProviderError(err);
    return {
      ok: false,
      configured: true,
      region,
      errorClass: f.detail ?? f.reason,
      httpStatus: f.httpStatus,
      requestId: f.requestId,
      hint:
        hintForErrorClass(f.detail, region) ??
        "AWS returned an error that is not in the known list: open CloudTrail Event history in the region above, event AnalyzeDocument, and read errorCode and errorMessage.",
    };
  }
}
