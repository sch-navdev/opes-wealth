import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadTierModules } from "@/test/tier-test-utils";

const action = vi.fn();
vi.mock("@/app/dashboard/settings/ocr-selftest-actions", () => ({ testOcrConnection: () => action() }));

type Mods = Awaited<ReturnType<typeof loadTierModules>>;
let m: Mods;
beforeEach(async () => {
  action.mockReset();
  m = await loadTierModules();
});

async function setup() {
  const { OcrSelfTestButton } = await import("./ocr-selftest-button");
  render(
    <m.LanguageProvider>
      <OcrSelfTestButton />
    </m.LanguageProvider>,
  );
}

describe("OcrSelfTestButton", () => {
  it("shows the diagnostic facts and hint from a failed test", async () => {
    action.mockResolvedValue({
      ok: false,
      configured: true,
      region: "ap-south-1",
      errorClass: "AccessDeniedException",
      httpStatus: 403,
      requestId: "req-1",
      hint: "check the IAM policy",
    });
    await setup();
    await userEvent.setup().click(screen.getByTestId("ocrtest-run"));
    await waitFor(() => expect(screen.getByTestId("ocrtest-result").textContent).toContain("check the IAM policy"));
    const text = screen.getByTestId("ocrtest-result").textContent ?? "";
    for (const s of ["OCR test failed (region ap-south-1)", "Error class: AccessDeniedException", "HTTP status: 403", "Request id: req-1"]) expect(text).toContain(s);
    expect(text).not.toContain("OCR works");
  });

  it("handles an unauthenticated result and a thrown action", async () => {
    action.mockResolvedValueOnce({ unauthenticated: true });
    await setup();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("ocrtest-run"));
    await waitFor(() => expect(screen.getByTestId("ocrtest-result").textContent).toContain("Sign in to run this test."));
    action.mockRejectedValueOnce(new Error("x"));
    await user.click(screen.getByTestId("ocrtest-run"));
    await waitFor(() => expect(screen.getByTestId("ocrtest-result").textContent).toContain("The test could not be run. Try again."));
  });
});
