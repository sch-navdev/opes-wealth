import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/context/language-context";
import { TransactionDetailsSheet } from "@/components/transaction-details-sheet";
import type { TransactionDetail } from "@/lib/transaction-detail";

const FULL = "a".repeat(8) + "b".repeat(56);

const txs: TransactionDetail[] = [
  {
    date: "2026-03-02",
    valueDate: "2026-03-03",
    description: "Carrefour",
    originalLabel: "POS CARREFOUR MOE DUBAI AE 0302",
    amount: -45.5,
    currency: "AED",
    balance: 1000,
    reference: "P180166769",
    bank: "Wio",
    accountRef: "AE07 0860 0000 1234 5678",
    source: "pdf_import",
    fingerprint: FULL,
    importedAt: "2026-03-05T10:00:00Z",
  },
  { date: "2026-03-01", description: "Salary", amount: 3000, currency: "AED", source: "csv_import" },
  { date: "2026-02-28", description: "Rent", amount: -1500, currency: "AED" },
];

function Harness({ start = 0 }: { start?: number | null }) {
  const [index, setIndex] = useState<number | null>(start);
  return (
    <LanguageProvider>
      <TransactionDetailsSheet transactions={txs} index={index} onIndexChange={setIndex} />
    </LanguageProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("TransactionDetailsSheet", () => {
  it("shows the signed, colour-coded amount and the metadata rows", () => {
    render(<Harness />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const amount = screen.getByTestId("txd-amount");
    expect(amount.textContent).toContain("45.50");
    expect(amount.textContent).toMatch(/[-−]/);
    expect(amount).toHaveClass("text-destructive");
    expect(screen.getByText("POS CARREFOUR MOE DUBAI AE 0302")).toBeInTheDocument();
    expect(screen.getByText("Wio")).toBeInTheDocument();
    expect(screen.getByText("•••• 5678")).toBeInTheDocument();
    expect(screen.getByText("P180166769")).toBeInTheDocument();
    expect(screen.getByText("PDF import")).toBeInTheDocument();
    expect(screen.getByText("aaaaaaaa")).toBeInTheDocument();
  });

  it("colours a credit green with a plus sign and omits the original label when absent", () => {
    render(<Harness start={1} />);
    const amount = screen.getByTestId("txd-amount");
    expect(amount).toHaveClass("text-success");
    expect(amount.textContent).toContain("+");
    expect(screen.queryByText("Original bank label")).not.toBeInTheDocument();
  });

  it("copies the original label and the full fingerprint, with feedback", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("POS CARREFOUR MOE DUBAI AE 0302");
    await waitFor(() => expect(screen.getAllByText("Copied").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "Copy full fingerprint" }));
    expect(writeText).toHaveBeenLastCalledWith(FULL);
  });

  it("reports a failed copy instead of throwing", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(screen.getAllByText("Copy failed").length).toBeGreaterThan(0));
  });

  it("navigates with the buttons and the arrow keys", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Previous transaction" })).toBeDisabled();
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next transaction" }));
    expect(screen.getByText("Salary")).toBeInTheDocument();
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByText("Rent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next transaction" })).toBeDisabled();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByText("Salary")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
