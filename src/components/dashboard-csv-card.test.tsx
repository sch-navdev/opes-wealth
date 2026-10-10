import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const batch = vi.hoisted(() => ({ props: null as null | { files: File[]; accounts: unknown[] } }));
vi.mock("@/components/bank-statement-batch", () => ({
  BankStatementBatch: (p: { files: File[]; accounts: unknown[] }) => {
    batch.props = p;
    return <div data-testid="batch">{p.files.map((f) => f.name).join(",")}</div>;
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { DashboardCsvCard } from "@/components/dashboard-csv-card";
import { LanguageProvider } from "@/context/language-context";

const accounts = [{ id: "a", name: "Wio AED", currency: "AED", nativeValue: 10, bankProfile: "wio", accountRef: "AE1" }];

function renderCard() {
  return render(
    <LanguageProvider>
      <DashboardCsvCard accounts={accounts} />
    </LanguageProvider>,
  );
}

describe("DashboardCsvCard batch import", () => {
  it("accepts several statements at once and hands them to the same batch review as the Banking page", () => {
    renderCard();
    const input = screen.getByTestId("dashboard-statement-input") as HTMLInputElement;
    expect(input.multiple).toBe(true);
    const files = [new File(["a"], "jan.pdf", { type: "application/pdf" }), new File(["b"], "feb.pdf", { type: "application/pdf" })];
    fireEvent.change(input, { target: { files } });
    expect(screen.getByTestId("batch").textContent).toBe("jan.pdf,feb.pdf");
    expect(batch.props?.accounts).toEqual(accounts);
  });

  it("keeps the manual column mapping as a fallback", async () => {
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: /Map the columns of one CSV myself/ }));
    expect(screen.getByRole("button", { name: /Back to importing several statements/ })).toBeTruthy();
  });
});
