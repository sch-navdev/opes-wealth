import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { LanguageProvider } from "@/context/language-context";
import { TimeRangeSelector } from "@/components/time-range-selector";
import { DEFAULT_RANGE_STORAGE_KEY, type TimeRange } from "@/lib/time-range";

let latest: TimeRange = { preset: "all" };
function Harness() {
  const [v, setV] = useState<TimeRange>({ preset: "all" });
  return (
    <LanguageProvider>
      <TimeRangeSelector value={v} onChange={(n) => { latest = n; setV(n); }} />
    </LanguageProvider>
  );
}

describe("TimeRangeSelector", () => {
  beforeEach(() => {
    latest = { preset: "all" };
    try { window.localStorage.clear(); } catch { /* ignore */ }
  });

  it("offers all the presets and custom dates", async () => {
    render(<Harness />);
    for (const name of ["All time", "1 month", "3 months", "6 months", "1 year", "Custom dates"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    await userEvent.click(screen.getByRole("button", { name: "3 months" }));
    expect(latest.preset).toBe("3m");
    await userEvent.click(screen.getByRole("button", { name: "Custom dates" }));
    expect(latest.preset).toBe("custom");
    expect(screen.getByLabelText("From")).toBeTruthy();
    expect(screen.getByLabelText("To")).toBeTruthy();
  });

  it("remembers a chosen default and applies it the next time", async () => {
    const first = render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "6 months" }));
    await userEvent.click(screen.getByRole("button", { name: "Use as my default" }));
    expect(window.localStorage.getItem(DEFAULT_RANGE_STORAGE_KEY)).toBe("6m");
    first.unmount();
    render(<Harness />);
    expect(latest.preset).toBe("6m");
  });
});
