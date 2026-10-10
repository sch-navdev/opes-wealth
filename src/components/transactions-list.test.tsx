import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
const actions = vi.hoisted(() => ({ deleteStoredTransaction: vi.fn(), updateStoredTransaction: vi.fn() }));
vi.mock("@/app/dashboard/transaction-import-actions", () => actions);
import { LanguageProvider } from "@/context/language-context";
import { TransactionsList } from "@/components/transactions-list";
import type { StoredTransactionRow } from "@/lib/transaction-detail";

function row(i: number): StoredTransactionRow {
  return {
    booked_date: `2026-03-${String(30 - (i % 28)).padStart(2, "0")}`,
    amount: i % 2 === 0 ? -(i + 1) : i + 1,
    currency: "EUR",
    description: `Payment ${i}`,
    source: "csv_import",
    fingerprint: `fp${i}`.padEnd(64, "0"),
    created_at: "2026-04-01T00:00:00Z",
  };
}

function renderList(rows: StoredTransactionRow[]) {
  return render(
    <LanguageProvider>
      <TransactionsList transactions={rows} currency="EUR" />
    </LanguageProvider>,
  );
}

describe("TransactionsList", () => {
  it("shows the localized empty state", () => {
    renderList([]);
    expect(screen.getByText(/No transactions are stored/)).toBeInTheDocument();
  });

  it("renders rows and opens the drawer with the clicked row", async () => {
    const user = userEvent.setup();
    renderList([row(0), row(1), row(2)]);
    await user.click(screen.getByRole("button", { name: /Payment 1/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Payment 1")).toBeInTheDocument();
    expect(within(dialog).getByText("2 of 3")).toBeInTheDocument();
    expect(within(dialog).getByTestId("txd-amount")).toHaveClass("text-success");
  });

  it("lists 25 rows then reveals more", async () => {
    const user = userEvent.setup();
    renderList(Array.from({ length: 30 }, (_, i) => row(i)));
    expect(screen.getAllByRole("button", { name: /Payment/ })).toHaveLength(25);
    await user.click(screen.getByRole("button", { name: "Show more (5)" }));
    expect(screen.getAllByRole("button", { name: /Payment/ })).toHaveLength(30);
    expect(screen.queryByRole("button", { name: /Show more/ })).not.toBeInTheDocument();
  });
});

describe("TransactionsList: correcting and deleting a stored transaction", () => {
  beforeEach(() => {
    refresh.mockReset();
    actions.deleteStoredTransaction.mockReset().mockResolvedValue({ success: true });
    actions.updateStoredTransaction.mockReset().mockResolvedValue({ success: true });
  });

  const withId = (i: number): StoredTransactionRow => ({ ...row(i), id: `t${i}` });
  const renderOwn = (rows: StoredTransactionRow[]) =>
    render(
      <LanguageProvider>
        <TransactionsList transactions={rows} currency="EUR" assetId="asset1" />
      </LanguageProvider>,
    );

  it("offers no edit or delete without an account (nothing to act on)", () => {
    renderList([withId(1)]);
    expect(screen.queryByRole("button", { name: "Delete transaction" })).toBeNull();
  });

  it("deletes one transaction after a confirmation and refreshes", async () => {
    renderOwn([withId(1), withId(2)]);
    await userEvent.click(screen.getAllByRole("button", { name: "Delete transaction" })[0]);
    expect(await screen.findByText("Delete this transaction?")).toBeTruthy();
    await userEvent.click(screen.getAllByRole("button", { name: "Delete transaction" }).at(-1) as HTMLElement);
    await vi.waitFor(() => expect(actions.deleteStoredTransaction).toHaveBeenCalledWith("asset1", expect.stringMatching(/^t[12]$/)));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("corrects the amount of a row", async () => {
    renderOwn([withId(1)]);
    await userEvent.click(screen.getByRole("button", { name: "Edit transaction" }));
    const amount = await screen.findByLabelText("Amount (negative = money out)");
    await userEvent.clear(amount);
    await userEvent.type(amount, "-22");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(actions.updateStoredTransaction).toHaveBeenCalledWith("asset1", "t1", expect.objectContaining({ amount: -22 })));
  });

  it("shows the reason when the change is refused", async () => {
    actions.updateStoredTransaction.mockResolvedValue({ error: "A transaction with the same date, amount and description already exists." });
    renderOwn([withId(1)]);
    await userEvent.click(screen.getByRole("button", { name: "Edit transaction" }));
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
  });
});
