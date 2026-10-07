import { jsPDF } from "jspdf";
import { describe, expect, it } from "vitest";
import { PdfPasswordError, pdfToText, pdfToTextWithPages } from "@/lib/pdf-text";

const PASSWORD = "s3cret-Pw-42";

function makePdf(encrypted: boolean): ArrayBuffer {
  const doc = new jsPDF(
    encrypted
      ? { encryption: { userPassword: PASSWORD, ownerPassword: "owner-pw", userPermissions: ["print"] } }
      : {},
  );
  doc.text("Statement balance 1234.56", 10, 20);
  return doc.output("arraybuffer");
}

async function failure(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected a rejection");
}

describe("pdfToTextWithPages with passwords", () => {
  it("asks for a password when the PDF is encrypted and none is given", async () => {
    const e = await failure(pdfToTextWithPages(makePdf(true)));
    expect(e).toBeInstanceOf(PdfPasswordError);
    expect((e as PdfPasswordError).reason).toBe("required");
  });

  it("reports a wrong password as incorrect, without echoing it", async () => {
    const wrong = "definitely-wrong-pw";
    const e = await failure(pdfToTextWithPages(makePdf(true), wrong));
    expect(e).toBeInstanceOf(PdfPasswordError);
    expect((e as PdfPasswordError).reason).toBe("incorrect");
    const dump = `${(e as Error).message} ${(e as Error).stack} ${JSON.stringify(e)}`;
    expect(dump).not.toContain(wrong);
    expect(dump).not.toContain(PASSWORD);
  });

  it("extracts the text with the right password", async () => {
    const out = await pdfToTextWithPages(makePdf(true), PASSWORD);
    expect(out.text).toContain("Statement balance 1234.56");
    expect(out.numPages).toBe(1);
  });

  it("still reads an unencrypted PDF, with or without a password argument", async () => {
    expect(await pdfToText(makePdf(false))).toContain("Statement balance 1234.56");
    expect((await pdfToTextWithPages(makePdf(false), "ignored")).text).toContain("1234.56");
  });
});
