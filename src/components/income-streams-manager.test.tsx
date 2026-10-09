import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  createIncomeStream: vi.fn(),
  updateIncomeStream: vi.fn(),
  deleteIncomeStream: vi.fn(),
}));
vi.mock("@/app/dashboard/income-stream-actions", () => actions);

import { IncomeStreamsManager } from "@/components/income-streams-manager";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import type { IncomeStream } from "@/lib/income-streams";

const salary: IncomeStream = {
  id: "s1", kind: "salary", label: "Main job", source_name: "Acme", amount: 3000, currency: "USD",
  frequency: "monthly", pay_day: 25, pay_month: null, start_date: "2026-01-01", end_date: null, notes: "",
};
const bonus: IncomeStream = {
  id: "s2", kind: "bonus", label: "Year-end bonus", source_name: "", amount: 6000, currency: "EUR",
  frequency: "annual", pay_day: 15, pay_month: 12, start_date: "2026-01-01", end_date: null, notes: "",
};
const rates = { USD: 1, EUR: 0.5 };

function renderManager(streams: IncomeStream[], over: Partial<React.ComponentProps<typeof IncomeStreamsManager>> = {}) {
  return render(
    <LanguageProvider>
      <PrivacyProvider>
        <IncomeStreamsManager streams={streams} baseCurrency="USD" rates={rates} asOf="2026-03-10" available {...over} />
      </PrivacyProvider>
    </LanguageProvider>,
  );
}

beforeEach(() => {
  for (const m of Object.values(actions)) m.mockReset();
  actions.createIncomeStream.mockResolvedValue({ ok: true, id: "n1" });
  actions.updateIncomeStream.mockResolvedValue({ ok: true, id: "s1" });
  actions.deleteIncomeStream.mockResolvedValue({ ok: true, id: "s1" });
});

describe("IncomeStreamsManager", () => {
  it("shows the empty state and still offers Add", () => {
    renderManager([]);
    expect(screen.getByText("No income streams yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add income" })).toBeEnabled();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("lists streams with figures and a totals row in the base currency", () => {
    renderManager([salary, bonus]);
    const table = screen.getByRole("table");
    expect(within(table).getByText("Main job")).toBeInTheDocument();
    expect(within(table).getByText("Year-end bonus")).toBeInTheDocument();
    // Run-rate: 3,000 + 6,000 EUR / 12 (= 12,000 USD / 12 = 1,000) = 4,000. Next 12 months: 36,000 + 12,000 = 48,000.
    const foot = table.querySelector("tfoot") as HTMLElement;
    expect(foot.textContent).toContain("USD 4,000");
    expect(foot.textContent).toContain("USD 48,000");
  });

  it("an ended stream has no run-rate", () => {
    renderManager([{ ...salary, end_date: "2026-02-28" }]);
    const foot = screen.getByRole("table").querySelector("tfoot") as HTMLElement;
    expect(foot.textContent).toContain("USD 0");
  });

  it("validates the add form before calling the server", async () => {
    const user = userEvent.setup();
    renderManager([]);
    await user.click(screen.getByRole("button", { name: "Add income" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Enter a label of 1 to 120 characters.");
    await user.type(within(dialog).getByLabelText("Label"), "Salary");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Enter a net amount of zero or more.");
    expect(actions.createIncomeStream).not.toHaveBeenCalled();
  });

  it("requires a pay month for an annual stream, then saves a valid one", async () => {
    const user = userEvent.setup();
    renderManager([]);
    await user.click(screen.getByRole("button", { name: "Add income" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Label"), "Bonus");
    await user.type(within(dialog).getByLabelText("Net amount per payment"), "5000");
    await user.selectOptions(within(dialog).getByLabelText("Frequency"), "annual");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Choose the pay month.");
    await user.selectOptions(within(dialog).getByLabelText("Pay month"), "3");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(actions.createIncomeStream).toHaveBeenCalledTimes(1);
    expect(actions.createIncomeStream.mock.calls[0][0]).toMatchObject({
      label: "Bonus", amount: 5000, frequency: "annual", pay_month: 3, currency: "USD", kind: "salary",
    });
  });

  it("shows a server error code in the dialog", async () => {
    actions.createIncomeStream.mockResolvedValue({ ok: false, error: "cf_err_demo" });
    const user = userEvent.setup();
    renderManager([]);
    await user.click(screen.getByRole("button", { name: "Add income" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Label"), "Job");
    await user.type(within(dialog).getByLabelText("Net amount per payment"), "100");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("The demo account is read-only.");
  });

  it("edits a stream through update with its id", async () => {
    const user = userEvent.setup();
    renderManager([salary]);
    await user.click(screen.getByRole("button", { name: "Edit Main job" }));
    const dialog = await screen.findByRole("dialog");
    const amount = within(dialog).getByLabelText("Net amount per payment");
    await user.clear(amount);
    await user.type(amount, "3200");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(actions.updateIncomeStream).toHaveBeenCalledWith("s1", expect.objectContaining({ amount: 3200, label: "Main job" }));
  });

  it("asks before deleting", async () => {
    const user = userEvent.setup();
    renderManager([salary]);
    await user.click(screen.getByRole("button", { name: "Delete Main job" }));
    const dialog = await screen.findByRole("dialog");
    expect(actions.deleteIncomeStream).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(actions.deleteIncomeStream).toHaveBeenCalledWith("s1");
  });

  it("is read-only in demo mode and while the table is missing", () => {
    const { unmount } = renderManager([salary], { readOnly: true });
    expect(screen.getByRole("button", { name: "Add income" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit Main job" })).toBeDisabled();
    unmount();
    renderManager([], { available: false });
    expect(screen.getByRole("button", { name: "Add income" })).toBeDisabled();
    expect(screen.getByText("Income streams are not available yet on this database.")).toBeInTheDocument();
  });
});
