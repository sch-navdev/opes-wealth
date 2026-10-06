import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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
