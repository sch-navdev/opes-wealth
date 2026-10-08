import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AllocationCard } from "@/components/allocation-card";
import { LanguageProvider } from "@/context/language-context";

const allocation = [
  { category: "Real Estate", share: 58, amount: 580 },
  { category: "Equities", share: 30, amount: 300 },
  { category: "Cash", share: 12, amount: 120 },
];

function renderCard(props: Partial<React.ComponentProps<typeof AllocationCard>> = {}) {
  return render(
    <LanguageProvider>
      <AllocationCard allocation={allocation} {...props} />
    </LanguageProvider>,
  );
}

describe("AllocationCard", () => {
  it("draws the dial and prints every share in the legend", () => {
    const { container } = renderCard();
    expect(container.querySelectorAll("svg line")).toHaveLength(60);
    expect(container.querySelectorAll("li")).toHaveLength(3);
    expect(screen.getByText("58%", { selector: "li span" })).toBeTruthy();
    expect(screen.getByText("12%", { selector: "li span" })).toBeTruthy();
  });

  it("keeps the dial stacked over the legend when compact", () => {
    const { container } = renderCard({ compact: true });
    const group = container.querySelector('[role="group"]')!;
    expect(group.className).not.toContain("min-[520px]:flex-row");
  });
});
