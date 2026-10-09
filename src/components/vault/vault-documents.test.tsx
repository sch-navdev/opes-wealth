import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  uploadDocument: vi.fn(),
  getDocumentUrl: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
}));
vi.mock("@/app/dashboard/vault-actions", () => actions);

import { VaultDocuments } from "@/components/vault/vault-documents";
import { LanguageProvider } from "@/context/language-context";
import { todayUtc, type VaultDocument } from "@/lib/vault";

const day = (offset: number) => new Date(Date.parse(`${todayUtc()}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

const doc = (over: Partial<VaultDocument> = {}): VaultDocument => ({
  id: "d1",
  assetId: "a1",
  title: "Villa deed",
  docType: "deed",
  mimeType: "application/pdf",
  sizeBytes: 2048,
  expiresOn: null,
  ownerOnly: false,
  createdAt: "2026-10-01T00:00:00Z",
  isMine: true,
  ...over,
});

function mount() {
  return render(
    <LanguageProvider>
      <VaultDocuments assetId="a1" />
    </LanguageProvider>,
  );
}

beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset();
  actions.listDocuments.mockResolvedValue({ ok: true, available: true, documents: [] });
});

describe("VaultDocuments", () => {
  it("shows the empty state with an upload button", async () => {
    mount();
    expect(await screen.findByText(/No documents yet/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Upload document/ })).toBeTruthy();
  });

  it("shows a graceful 'not available yet' state and no upload button when the migration is missing", async () => {
    actions.listDocuments.mockResolvedValue({ ok: true, available: false, documents: [] });
    mount();
    expect(await screen.findByText(/not available yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Upload document/ })).toBeNull();
  });

  it("shows an error message instead of crashing", async () => {
    actions.listDocuments.mockResolvedValue({ ok: false, error: "vault_err_mfa" });
    mount();
    expect((await screen.findByRole("alert")).textContent).toMatch(/two-factor/);
  });

  it("lists documents with expiry badge, size and lock; only own documents have edit/delete", async () => {
    actions.listDocuments.mockResolvedValue({
      ok: true,
      available: true,
      documents: [
        doc({ id: "d1", title: "Passport", ownerOnly: true, expiresOn: day(3) }),
        doc({ id: "d2", title: "Insurance policy", docType: "insurance", expiresOn: day(-2), isMine: false, sizeBytes: 3 * 1024 * 1024 }),
        doc({ id: "d3", title: "Valuation", docType: "valuation", expiresOn: day(40) }),
      ],
    });
    mount();
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText(/Owner only/)).toBeTruthy();
    expect(items[0].querySelector('[data-status="urgent"]')).toBeTruthy();
    expect(items[1].querySelector('[data-status="expired"]')?.textContent).toMatch(/^Expired/);
    expect(items[2].querySelector('[data-status="soon"]')).toBeTruthy();
    expect(within(items[1]).getByText("3.0 MB")).toBeTruthy();
    expect(within(items[1]).queryByRole("button", { name: /^Delete/ })).toBeNull();
    expect(within(items[0]).getByRole("button", { name: /^Delete/ })).toBeTruthy();
  });

  it("opens a signed URL in a new tab with rel=noopener", async () => {
    actions.listDocuments.mockResolvedValue({ ok: true, available: true, documents: [doc()] });
    actions.getDocumentUrl.mockResolvedValue({ ok: true, url: "https://files.test/signed?t=1" });
    const clicks: HTMLAnchorElement[] = [];
    const spy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this);
    });
    mount();
    await userEvent.click(await screen.findByRole("button", { name: /^View/ }));
    await waitFor(() => expect(clicks).toHaveLength(1));
    expect(actions.getDocumentUrl).toHaveBeenCalledWith("d1", "view");
    expect(clicks[0].target).toBe("_blank");
    expect(clicks[0].rel).toContain("noopener");
    spy.mockRestore();
  });

  it("confirms before deleting, then reloads the list", async () => {
    actions.listDocuments.mockResolvedValue({ ok: true, available: true, documents: [doc()] });
    actions.deleteDocument.mockResolvedValue({ ok: true });
    mount();
    await userEvent.click(await screen.findByRole("button", { name: /^Delete/ }));
    expect(actions.deleteDocument).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toMatch(/Villa deed/);
    await userEvent.click(within(dialog).getByRole("button", { name: /Delete permanently/ }));
    await waitFor(() => expect(actions.deleteDocument).toHaveBeenCalledWith("d1"));
    await waitFor(() => expect(actions.listDocuments).toHaveBeenCalledTimes(2));
  });

  it("uploads a file with the entered fields", async () => {
    actions.uploadDocument.mockResolvedValue({ ok: true, id: "n" });
    mount();
    await userEvent.click(await screen.findByRole("button", { name: /Upload document/ }));
    const dialog = await screen.findByRole("dialog");
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "deed.pdf", { type: "application/pdf" });
    await userEvent.upload(within(dialog).getByLabelText(/^File/), file);
    await userEvent.clear(within(dialog).getByLabelText("Title"));
    await userEvent.type(within(dialog).getByLabelText("Title"), "Deed");
    await userEvent.click(within(dialog).getByLabelText(/Owner only/));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(actions.uploadDocument).toHaveBeenCalledTimes(1));
    const fd = actions.uploadDocument.mock.calls[0][0] as FormData;
    expect(fd.get("assetId")).toBe("a1");
    expect(fd.get("title")).toBe("Deed");
    expect(fd.get("ownerOnly")).toBe("true");
    expect((fd.get("file") as File).name).toBe("deed.pdf");
  });

  it("shows the server's error inside the dialog", async () => {
    actions.uploadDocument.mockResolvedValue({ ok: false, error: "vault_err_file_type" });
    mount();
    await userEvent.click(await screen.findByRole("button", { name: /Upload document/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.upload(within(dialog).getByLabelText(/^File/), new File(["x"], "a.pdf"));
    await userEvent.type(within(dialog).getByLabelText("Title"), "A");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect((await within(dialog).findByRole("alert")).textContent).toMatch(/Only PDF, PNG and JPEG/);
  });
});
