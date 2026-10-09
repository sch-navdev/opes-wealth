import { cloneElement, type ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import { buildVehicleComparisonSeries } from "@/lib/vehicles";
import { VehicleValuationChart } from "@/components/vehicle-valuation-chart";

// jsdom has no layout: give the responsive container a fixed size so the SVG is drawn.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) => (
      <div style={{ width: 800, height: 300 }}>{cloneElement(children, { width: 800, height: 300 })}</div>
    ),
  };
});

// Invented fixture.
const today = "2025-01-01";
function rows(guide: { date: string; value: number }[]) {
  return buildVehicleComparisonSeries({
    market: [{ recorded_date: "2024-02-01", value: 90 }],
    purchaseDate: "2024-01-01",
    purchasePrice: 100,
    guide,
    today,
  });
}

function renderChart(r: ReturnType<typeof rows>) {
  return render(
    <LanguageProvider>
      <PrivacyProvider>
        <VehicleValuationChart rows={r} currency="USD" />
      </PrivacyProvider>
    </LanguageProvider>,
  );
}

describe("VehicleValuationChart", () => {
  it("draws the Blue Book as a step line with one dot per real valuation, and explains the carry-forward", () => {
    const { container } = renderChart(
      rows([
        { date: "2024-03-01", value: 85 },
        { date: "2024-08-01", value: 75 },
      ]),
    );
    expect(screen.getByTestId("bluebook-carried-note")).toHaveTextContent(/instant valuation|valorisation ponctuelle/i);
    // Two real observations -> exactly two dots (carried-forward rows get none).
    expect(container.querySelectorAll(".recharts-area-dots .recharts-dot, .recharts-dot")).toHaveLength(2);
    // The step line is drawn (a path exists for the carried series) next to market and purchase.
    expect(container.querySelectorAll("path.recharts-area-curve").length).toBeGreaterThanOrEqual(3);
  });

  it("keeps the legend to the three values (the dots series is hidden from it)", () => {
    renderChart(rows([{ date: "2024-03-01", value: 85 }]));
    const legend = document.querySelector(".recharts-legend-wrapper") as HTMLElement;
    expect(legend).toBeTruthy();
    expect(legend.querySelectorAll(".recharts-legend-item")).toHaveLength(3);
  });

  it("shows no note and no Blue Book dots without a Blue Book valuation", () => {
    const { container } = renderChart(rows([]));
    expect(screen.queryByTestId("bluebook-carried-note")).toBeNull();
    expect(container.querySelectorAll(".recharts-dot")).toHaveLength(0);
  });
});
