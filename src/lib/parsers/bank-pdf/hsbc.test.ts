import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hsbcProfile } from "./hsbc";

const fixture = readFileSync(join(__dirname, "fixtures", "hsbc-image-only.txt"), "utf8");

describe("hsbcProfile", () => {
  it("has the expected identity", () => {
    expect(hsbcProfile.id).toBe("hsbc_uae");
    expect(hsbcProfile.name).toBe("HSBC UAE");
  });

  it("detects the HSBC UAE boilerplate", () => {
    expect(hsbcProfile.detect(fixture)).toBe(true);
  });

  it("does not detect unrelated text", () => {
    expect(hsbcProfile.detect("Wio Bank PJSC statement 01/02/2026 12.50")).toBe(false);
    expect(hsbcProfile.detect("Statement of Accounts but no bank name")).toBe(false);
  });

  it("returns image_only for boilerplate without transaction rows", () => {
    const out = hsbcProfile.parse(fixture);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failure.code).toBe("image_only");
      expect(out.failure.bank).toBe("hsbc_uae");
    }
  });

  it("returns unsupported (never invents a layout) when dated amount rows exist", () => {
    const out = hsbcProfile.parse(`${fixture}\n12 Feb 2026 SOME PAYMENT 1,234.56 CR\n`);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.code).toBe("unsupported");
  });
});
