import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateAsset: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/dashboard/actions", () => ({ updateAsset: mocks.updateAsset }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { PrivateEquityLedgerEditor, type LedgerEditorAsset } from "@/components/asset-detail/private-equity-ledger-editor";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import type { PrivateEquityMetadata } from "@/lib/private-equity";

const asset: LedgerEditorAsset = {
  id: "asset-1",
  name: "Invented Fund I",
  category_id: "cat-pe",
  quantity: 1,
  current_value: 80_000,
  currency: "EUR",
  images: [],
  ticker_symbol: null,
  purchase_date: "2021-01-01",
  metadata: {
    entity_name: "Invented Fund I",
    share_class: "A",
    ownership_percentage: 5,
    commitment_amount: 200_000,
    capital_calls: [
      { id: "c1", due_date: "2022-03-31", paid_date: "2022-04-05", amount: 50_000, percentage: 25, status: "paid" },
      { id: "c2", due_date: "2099-03-31", amount: 50_000, percentage: 25, status: "pending" },
    ],
    distributions: [{ id: "d1", date: "2024-06-30", amount: 10_000, kind: "income" }],
  },
};

function renderEditor(a: LedgerEditorAsset = asset, shareFactor = 1) {
  return render(
    <LanguageProvider>
      <PrivacyProvider>
        <PrivateEquityLedgerEditor asset={a} shareFactor={shareFactor} />
      </PrivacyProvider>
    </LanguageProvider>,
  );
}

const savedMetadata = (): PrivateEquityMetadata => {
  const formData = mocks.updateAsset.mock.calls.at(-1)![1] as FormData;
  return JSON.parse(formData.get("metadata") as string);
};

beforeEach(() => {
  localStorage.clear();
  mocks.updateAsset.mockReset().mockResolvedValue(undefined);
  mocks.refresh.mockReset();
});

describe("PrivateEquityLedgerEditor", () => {
  it("lists paid calls and distributions, not pending calls", () => {
    renderEditor();
    const rows = screen.getAllByTestId("pel-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("2022-04-05");
    expect(rows[0].textContent).toContain("50,000");
    expect(rows[1].textContent).toContain("2024-06-30");
    expect(screen.getByText(/still pending are managed in the fund form/)).toBeTruthy();
  });

  it("masks the amounts in Privacy Mode", () => {
    localStorage.setItem("opes_privacy_mode", "true");
    renderEditor();
    expect(screen.getAllByTestId("pel-row")[0].textContent).not.toContain("50,000");
    expect(screen.getAllByTestId("pel-row")[0].textContent).toContain("••••••••");
  });

  it("adds a paid call through updateAsset with the whole asset and the new metadata", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Add paid call" }));
    fireEvent.change(screen.getByLabelText("Date paid"), { target: { value: "2023-09-30" } });
    await user.type(screen.getByLabelText("Amount (EUR)"), "25000");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.updateAsset).toHaveBeenCalledTimes(1));
    const [id, formData] = mocks.updateAsset.mock.calls[0] as [string, FormData];
    expect(id).toBe("asset-1");
    expect(formData.get("name")).toBe("Invented Fund I");
    expect(formData.get("category_id")).toBe("cat-pe");
    expect(formData.get("current_value")).toBe("80000");
    expect(formData.get("currency")).toBe("EUR");
    expect(formData.has("owners")).toBe(false);
    const md = savedMetadata();
    const added = md.capital_calls.find((c) => c.paid_date === "2023-09-30")!;
    expect(added).toMatchObject({ status: "paid", amount: 25_000, percentage: 12.5 });
    expect(md.capital_calls).toHaveLength(3);
    expect(md.commitment_amount).toBe(200_000); // the rest of the metadata is preserved
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(screen.getByText("Ledger saved.")).toBeTruthy();
  });

  it("adds a dated actual distribution with its kind", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Add distribution" }));
    fireEvent.change(screen.getByLabelText("Date received"), { target: { value: "2025-01-10" } });
    await user.selectOptions(screen.getByLabelText("Kind of distribution"), "gain");
    await user.type(screen.getByLabelText("Amount (EUR)"), "7500");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.updateAsset).toHaveBeenCalled());
    const dists = savedMetadata().distributions;
    expect(dists.map((d) => [d.date, d.amount, d.kind])).toEqual([
      ["2024-06-30", 10_000, "income"],
      ["2025-01-10", 7_500, "gain"],
    ]);
  });

  it("edits a row in place", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: /Edit the Distribution dated 2024-06-30/ }));
    const amount = screen.getByLabelText("Amount (EUR)");
    await user.clear(amount);
    await user.type(amount, "12000");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.updateAsset).toHaveBeenCalled());
    expect(savedMetadata().distributions[0]).toMatchObject({ id: "d1", amount: 12_000 });
  });

  it("removes a paid call", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: /Remove the Paid call dated 2022-04-05/ }));
    await waitFor(() => expect(mocks.updateAsset).toHaveBeenCalled());
    expect(savedMetadata().capital_calls.map((c) => c.id)).toEqual(["c2"]);
  });

  it("shows the validation message and saves nothing for a bad date or amount", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Add distribution" }));
    await user.type(screen.getByLabelText("Amount (EUR)"), "100");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Each distribution needs a valid date and an amount above zero.");
    expect(mocks.updateAsset).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Add paid call" }));
    await user.type(screen.getByLabelText("Amount (EUR)"), "100");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toBe("A paid capital call needs a valid payment date.");
    expect(mocks.updateAsset).not.toHaveBeenCalled();
  });

  it("explains that a co-owner must approve when the edit is staged, and does not refresh", async () => {
    mocks.updateAsset.mockResolvedValue({ pending: true });
    const user = userEvent.setup();
    renderEditor(asset, 0.5);
    expect(screen.getByTestId("owner-share-note")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Remove the Distribution dated 2024-06-30/ }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/co-owner must approve/i));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("shows a server error without refreshing", async () => {
    mocks.updateAsset.mockResolvedValue({ error: "change_pending_exists" });
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: /Remove the Distribution dated 2024-06-30/ }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("mentions an undated legacy distributions total until dated rows exist", () => {
    renderEditor({ ...asset, metadata: { ...asset.metadata, distributions: [], distributions_to_date: 4_000 } });
    expect(screen.getByText(/undated distributions total of/)).toBeTruthy();
    expect(within(screen.getByText(/undated distributions total of/)).queryByText("4,000")).toBeNull(); // plain text, amount inline
  });

  it("shows an empty-ledger note", () => {
    renderEditor({ ...asset, metadata: { entity_name: "x" } });
    expect(screen.getByText("No paid calls or distributions recorded yet.")).toBeTruthy();
  });
});
