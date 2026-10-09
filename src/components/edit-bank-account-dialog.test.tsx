import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/context/language-context";
import { EditBankAccountDialog, type BankAccountForEdit } from "@/components/edit-bank-account-dialog";

const updateAsset = vi.fn();
vi.mock("@/app/dashboard/actions", () => ({ updateAsset: (...a: unknown[]) => updateAsset(...a) }));

const asset = (metadata: Record<string, unknown>): BankAccountForEdit => ({
  id: "a1",
  name: "Daily account",
  category_id: "cat-cash",
  quantity: 1,
  current_value: 1234.5,
  currency: "AED",
  metadata,
  images: [],
  ticker_symbol: null,
  purchase_date: "2026-01-15",
});

async function openDialog(a: BankAccountForEdit, imported: boolean) {
  const user = userEvent.setup();
  render(
    <LanguageProvider>
      <EditBankAccountDialog asset={a} imported={imported} />
    </LanguageProvider>,
  );
  await user.click(screen.getByRole("button"));
  return user;
}

beforeEach(() => updateAsset.mockReset().mockResolvedValue(undefined));

describe("EditBankAccountDialog", () => {
  it("shows the dedicated title and the bank, with no category, image upload or ownership section", async () => {
    await openDialog(asset({ institution_name: "Wio Bank", bank_profile: "wio" }), true);
    expect(screen.getByText("Edit Bank Account")).toBeInTheDocument();
    expect(screen.queryByText(/Upload Image/i)).toBeNull();
    expect(screen.queryByLabelText(/Category/i)).toBeNull();
    expect(screen.queryByText(/Ownership/i)).toBeNull();
    expect(screen.getByLabelText("Bank")).toHaveValue("Wio Bank");
  });

  it("falls back to initials for an unknown bank", async () => {
    await openDialog(asset({ institution_name: "Zed Savings" }), false);
    expect(screen.getByTestId("ebk-logo-initials")).toHaveTextContent("ZS");
  });

  it("locks quantity, balance and currency for an imported account and explains why", async () => {
    await openDialog(asset({ bank_profile: "wio" }), true);
    expect(screen.getByLabelText("Quantity")).toBeDisabled();
    expect(screen.getByLabelText("Balance")).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Currency" })).toBeDisabled();
    expect(screen.getByTestId("ebk-locked-note")).toBeInTheDocument();
  });

  it("keeps a manual account editable", async () => {
    await openDialog(asset({ institution_name: "Zed Savings" }), false);
    expect(screen.getByLabelText("Quantity")).toBeEnabled();
    expect(screen.getByLabelText("Balance")).toBeEnabled();
    expect(screen.queryByTestId("ebk-locked-note")).toBeNull();
  });

  it("saves through updateAsset keeping unknown metadata and the stored numbers of an imported account", async () => {
    const user = await openDialog(
      asset({ bank_profile: "wio", account_ref: "1234", institution_name: "Wio Bank", purpose: "salary", extra: { a: 1 } }),
      true,
    );
    const name = screen.getByLabelText("Account name");
    await user.clear(name);
    await user.type(name, "Salary account");
    await user.type(screen.getByLabelText("Notes"), "Main");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateAsset).toHaveBeenCalledTimes(1));
    const [id, fd] = updateAsset.mock.calls[0] as [string, FormData];
    expect(id).toBe("a1");
    expect(fd.get("name")).toBe("Salary account");
    expect(fd.get("category_id")).toBe("cat-cash");
    expect(fd.get("current_value")).toBe("1234.5");
    expect(fd.get("currency")).toBe("AED");
    expect(fd.get("purchase_date")).toBe("2026-01-15");
    const meta = JSON.parse(fd.get("metadata") as string);
    expect(meta).toMatchObject({
      bank_profile: "wio",
      account_ref: "1234",
      institution_name: "Wio Bank",
      purpose: "salary",
      extra: { a: 1 },
      country: "AE",
      notes: "Main",
    });
  });

  it("requires an account name", async () => {
    const user = await openDialog(asset({ institution_name: "Zed Savings" }), false);
    await user.clear(screen.getByLabelText("Account name"));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(updateAsset).not.toHaveBeenCalled();
  });
});
