import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FxStatusView } from "@/lib/fx-history";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/app/dashboard/fx-actions", () => ({ refreshFxRatesNow: refresh }));

import { FxRatesStatus } from "@/components/fx-rates-status";
import { LanguageProvider } from "@/context/language-context";

const view = (over: Partial<FxStatusView> = {}): FxStatusView => ({
  state: "fresh",
  ranAt: "2026-10-08T20:00:03Z",
  source: "live",
  currencies: 12,
  historyAvailable: true,
  ...over,
});

const renderIt = (v: FxStatusView) =>
  render(
    <LanguageProvider>
      <FxRatesStatus status={v} />
    </LanguageProvider>,
  );

beforeEach(() => refresh.mockReset());

describe("FxRatesStatus", () => {
  it("shows the GST stamp, source and count with the state", () => {
    renderIt(view());
    expect(screen.getByText(/updated 09 Oct 00:00 GST · live source · 12 currencies/)).toBeInTheDocument();
    expect(screen.getByText("Up to date")).toBeInTheDocument();
    expect(document.querySelector("[data-state='fresh']")).not.toBeNull();
  });

  it("flags stale and fallback", () => {
    const { unmount } = renderIt(view({ state: "stale" }));
    expect(screen.getByText("Stale")).toBeInTheDocument();
    unmount();
    renderIt(view({ state: "fallback", source: "fallback" }));
    expect(screen.getByText("Approximate rates")).toBeInTheDocument();
    expect(screen.getByText(/static fallback/)).toBeInTheDocument();
  });

  it("degrades gracefully when the table is missing", () => {
    renderIt({ state: "missing", ranAt: null, source: "", currencies: 0, historyAvailable: false });
    expect(screen.getByText(/History not available yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh now" })).toBeInTheDocument();
  });

  it("refreshes on click and reports the result or the error", async () => {
    refresh.mockResolvedValueOnce({ ok: true, currencies: 12, source: "live" });
    renderIt(view());
    await userEvent.click(screen.getByRole("button", { name: "Refresh now" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Rates refreshed (12 currencies)."));
    refresh.mockResolvedValueOnce({ ok: false, error: "fxr_err_rate_limited" });
    await userEvent.click(screen.getByRole("button", { name: "Refresh now" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Wait a minute/));
  });
});
