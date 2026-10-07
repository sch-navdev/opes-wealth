/**
 * OCR service (AWS Textract) — server-only module, same conventions as `fx-client.ts`:
 * typed failure reasons, `{ok:true,...}|{ok:false,reason,message}` result, nothing thrown to callers.
 *
 * Used for image-only / scanned bank statements. Textract's synchronous `AnalyzeDocument` accepts
 * ONE page per call (PDF <= 5 MB), so the PDF is split into single-page PDFs with `pdf-lib` and the
 * pages are analysed with limited concurrency (`FeatureTypes: ["TABLES"]`).
 *
 * Safety rules:
 *  - The Textract client is created LAZILY inside `ocrPdfToDocument`, never at module load, so a
 *    missing key can never crash the app or the build.
 *  - Credential VALUES are read only to hand them to the SDK constructor. They are never returned,
 *    logged or put in an error message; provider errors are mapped to fixed messages by `name`.
 *  - `send` is injectable so tests never reach AWS.
 */
import { PDFDocument } from "pdf-lib";
import type { AnalyzeDocumentCommand } from "@aws-sdk/client-textract";
import { textractToOcrPage, type TextractBlockLike } from "@/lib/parsers/bank-pdf/ocr-textract";
import type { OcrDocument } from "@/lib/parsers/bank-pdf/ocr-types";

type Env = Record<string, string | undefined>;

export type TextractSend = (command: AnalyzeDocumentCommand) => Promise<{ Blocks?: TextractBlockLike[] }>;

export type OcrFailureReason =
  | "not_configured"
  | "unreadable"
  | "too_many_pages"
  | "access_denied"
  | "throttled"
  | "provider_error";

export type OcrResult =
  | { ok: true; document: OcrDocument; pages: number; truncated: boolean }
  | { ok: false; reason: OcrFailureReason; message: string };

const DEFAULT_REGION = "eu-central-1";
const DEFAULT_MAX_PAGES = 8;
const HARD_MAX_PAGES = 20;
const CONCURRENCY = 3;
const PAGE_TIMEOUT_MS = 30_000;
const MAX_PAGE_BYTES = 5 * 1024 * 1024;

export function isOcrConfigured(env: Env = process.env): boolean {
  return !!env.AWS_ACCESS_KEY_ID?.trim() && !!env.AWS_SECRET_ACCESS_KEY?.trim();
}

function resolveMaxPages(explicit: number | undefined, env: Env): number {
  const raw = explicit ?? Number(env.OCR_MAX_PAGES);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_MAX_PAGES;
  return Math.min(Math.floor(raw), HARD_MAX_PAGES);
}

class OcrFailure extends Error {
  reason: OcrFailureReason;
  constructor(reason: OcrFailureReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

function mapProviderError(err: unknown): OcrFailure {
  if (err instanceof OcrFailure) return err;
  const name = err instanceof Error ? err.name : "";
  switch (name) {
    case "AccessDeniedException":
    case "UnrecognizedClientException":
    case "InvalidSignatureException":
      return new OcrFailure("access_denied", "The OCR provider rejected the configured credentials or permissions.");
    case "ThrottlingException":
    case "ProvisionedThroughputExceededException":
    case "LimitExceededException":
      return new OcrFailure("throttled", "The OCR provider is rate limiting requests; try again shortly.");
    case "UnsupportedDocumentException":
    case "BadDocumentException":
    case "InvalidParameterException":
      return new OcrFailure("unreadable", "The OCR provider could not read this document.");
    default:
      return new OcrFailure("provider_error", "The OCR provider failed to process the document.");
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new OcrFailure("provider_error", "The OCR request timed out.")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** Builds the real Textract sender lazily (dynamic import: the SDK is only loaded when OCR actually runs). */
async function createSend(env: Env): Promise<TextractSend> {
  const { TextractClient } = await import("@aws-sdk/client-textract");
  const client = new TextractClient({
    region: env.AWS_REGION?.trim() || DEFAULT_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID as string,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY as string,
      ...(env.AWS_SESSION_TOKEN?.trim() ? { sessionToken: env.AWS_SESSION_TOKEN } : {}),
    },
  });
  return (command) => client.send(command) as Promise<{ Blocks?: TextractBlockLike[] }>;
}

export async function ocrPdfToDocument(
  bytes: Uint8Array,
  opts: { maxPages?: number; send?: TextractSend; env?: Env } = {},
): Promise<OcrResult> {
  const env = opts.env ?? process.env;
  if (!isOcrConfigured(env)) {
    return { ok: false, reason: "not_configured", message: "OCR is not configured (AWS credentials are missing)." };
  }
  const maxPages = resolveMaxPages(opts.maxPages, env);

  try {
    let source: PDFDocument;
    try {
      source = await PDFDocument.load(bytes);
    } catch {
      return { ok: false, reason: "unreadable", message: "The PDF could not be read (corrupt or password protected)." };
    }
    const total = source.getPageCount();
    if (total === 0) return { ok: false, reason: "unreadable", message: "The PDF has no pages." };
    if (total > HARD_MAX_PAGES) {
      return {
        ok: false,
        reason: "too_many_pages",
        message: `The PDF has ${total} pages; OCR accepts at most ${HARD_MAX_PAGES}.`,
      };
    }
    const pages = Math.min(total, maxPages);

    const pageBytes: Uint8Array[] = [];
    for (let i = 0; i < pages; i++) {
      const single = await PDFDocument.create();
      const [copied] = await single.copyPages(source, [i]);
      single.addPage(copied);
      const out = await single.save();
      if (out.byteLength > MAX_PAGE_BYTES) {
        return { ok: false, reason: "unreadable", message: `Page ${i + 1} is larger than the 5 MB OCR page limit.` };
      }
      pageBytes.push(out);
    }

    const send = opts.send ?? (await createSend(env));
    const { AnalyzeDocumentCommand } = await import("@aws-sdk/client-textract");
    const results: OcrDocument["pages"] = new Array(pages);
    let next = 0;
    let failure: OcrFailure | null = null;

    const worker = async () => {
      while (!failure) {
        const i = next++;
        if (i >= pages) return;
        try {
          const res = await withTimeout(
            send(new AnalyzeDocumentCommand({ Document: { Bytes: pageBytes[i] }, FeatureTypes: ["TABLES"] })),
            PAGE_TIMEOUT_MS,
          );
          results[i] = textractToOcrPage(res.Blocks ?? []);
        } catch (err) {
          failure ??= mapProviderError(err);
          return;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pages) }, worker));

    if (failure) return { ok: false, reason: (failure as OcrFailure).reason, message: (failure as OcrFailure).message };
    return { ok: true, document: { pages: results }, pages, truncated: total > pages };
  } catch (err) {
    const f = mapProviderError(err);
    return { ok: false, reason: f.reason, message: f.message };
  }
}
