import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
const act = vi.hoisted(() => ({ mergeCashAccounts: vi.fn(), batchDeleteAssets: vi.fn() }));
vi.mock("@/app/dashboard/banking/actions", () => ({ mergeCashAccounts: act.mergeCashAccounts }));
vi.mock("@/app/dashboard/actions", () => ({ batchDeleteAssets: act.batchDeleteAssets }));
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import { BankDetailView, type BankDetailAccount, type BankDetailTransaction } from "@/components/bank-detail-view";

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.scrollIntoView ??= () => {};
});

const accounts: BankDetailAccount[] = [
  { id: "a1", name: "FAB current AED ···7013", masked: "••••7013", currency: "AED", balance: 1000, baseBalance: 272, balanceAsOf: "2026-09-30", closedOn: null },
  { id: "a2", name: "FAB card AED ···5025", masked: "••••5025", currency: "AED", balance: -200, baseBalance: -54, balanceAsOf: "2026-09-22", closedOn: null },
  { id: "a3", name: "FAB old AED ···1111", masked: "••••1111", currency: "AED", balance: 0, baseBalance: 0, balanceAsOf: "2025-01-01", closedOn: "2025-01-01" },
];
const transactions: BankDetailTransaction[] = [
  { accountId: "a1", date: "2026-09-20", amount: -50, currency: "AED", description: "COFFEE SHOP" },
  { accountId: "a2", date: "2026-09-21", amount: -150, currency: "AED", description: "RESTAURANT" },
  { accountId: "a3", date: "2025-01-01", amount: -10, currency: "AED", description: "OLD FEE" },
];

function view() {
  render(
    <LanguageProvider>
      <PrivacyProvider>
        <BankDetailView bankName="First Abu Dhabi Bank (FAB)" baseCurrency="USD" accounts={accounts} transactions={transactions} truncated={false} today="2026-10-10" />
      </PrivacyProvider>
    </LanguageProvider>,
  );
}

describe("BankDetailView", () => {
  it("shows the consolidated balance and the transactions of ALL the bank's accounts, without closed ones by default", () => {
    view();
    expect(screen.getByTestId("bank-detail")).toBeTruthy();
    expect(screen.getByText("$218.00")).toBeTruthy();
    expect(screen.getByText("COFFEE SHOP")).toBeTruthy();
    expect(screen.getByText("RESTAURANT")).toBeTruthy();
    expect(screen.queryByText("OLD FEE")).toBeNull();
    expect(screen.getByRole("link", { name: /Back to Banking/ }).getAttribute("href")).toBe("/dashboard/banking");
  });

  it("links into each account and can filter by account or reveal closed accounts", async () => {
    view();
    const links = screen.getAllByRole("link", { name: "Open account and analyse" });
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/dashboard/assets/a1", "/dashboard/assets/a2"]);
    await userEvent.selectOptions(screen.getByRole("combobox"), "a2");
    const list = screen.getByText("RESTAURANT").closest("ul") as HTMLElement;
    expect(within(list).queryByText("COFFEE SHOP")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Show closed accounts \(1\)/ }));
    expect(screen.getAllByText(/FAB old AED/).length).toBeGreaterThan(0);
  });
});

describe("BankDetailView: merge accounts and delete the whole bank", () => {
  beforeEach(() => {
    nav.refresh.mockReset();
    nav.push.mockReset();
    act.mergeCashAccounts.mockReset().mockResolvedValue({ ok: true, keptId: "a1" });
    act.batchDeleteAssets.mockReset().mockResolvedValue(undefined);
  });

  it("merges the selected accounts into one under the chosen name", async () => {
    view();
    expect(screen.queryByRole("button", { name: /Merge selected accounts/ })).toBeNull();
    await userEvent.click(screen.getByRole("checkbox", { name: /Select FAB current AED/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Select FAB card AED/ }));
    await userEvent.click(screen.getByRole("button", { name: "Merge selected accounts (2)" }));
    const name = await screen.findByLabelText("Name of the merged account");
    await userEvent.clear(name);
    await userEvent.type(name, "FAB main account");
    await userEvent.click(screen.getByRole("button", { name: "Merge accounts" }));
    await vi.waitFor(() => expect(act.mergeCashAccounts).toHaveBeenCalledWith(["a1", "a2"], "FAB main account"));
    await vi.waitFor(() => expect(nav.refresh).toHaveBeenCalled());
  });

  it("deletes every account of the bank only after the bank name is typed", async () => {
    view();
    await userEvent.click(screen.getByRole("button", { name: "Delete this bank and its accounts" }));
    const confirm = await screen.findByRole("button", { name: "Delete everything" });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("First Abu Dhabi Bank (FAB)"), "First Abu Dhabi Bank (FAB)");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await vi.waitFor(() => expect(act.batchDeleteAssets).toHaveBeenCalledWith(["a1", "a2", "a3"]));
    await vi.waitFor(() => expect(nav.push).toHaveBeenCalledWith("/dashboard/banking"));
  });

  it("shows the reason when a merge is refused", async () => {
    act.mergeCashAccounts.mockResolvedValue({ ok: false, code: "invalid", error: "The accounts must all be in the same currency." });
    view();
    await userEvent.click(screen.getByRole("checkbox", { name: /Select FAB current AED/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Select FAB card AED/ }));
    await userEvent.click(screen.getByRole("button", { name: "Merge selected accounts (2)" }));
    await userEvent.click(await screen.findByRole("button", { name: "Merge accounts" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("same currency");
  });
});
