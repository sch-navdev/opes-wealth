import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OPEN_CATEGORY_EVENT } from "@/lib/category-events";
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

  it("highlights a category and shows its share in the dial centre when the pointer is over its legend row", () => {
    const { container } = renderCard();
    expect(container.querySelector("svg")!.textContent).toContain("58%");
    const rows = container.querySelectorAll("li");
    fireEvent.pointerEnter(rows[2].firstElementChild!);
    expect(container.querySelector("svg")!.textContent).toContain("12%");
    expect(container.querySelector("svg")!.textContent).toContain("Cash");
    fireEvent.pointerLeave(container.querySelector("ul")!);
    expect(container.querySelector("svg")!.textContent).toContain("58%");
  });

  it("highlights from the dial arc itself", () => {
    const { container } = renderCard();
    fireEvent.pointerEnter(container.querySelectorAll("[data-dial-hit]")[1]);
    expect(container.querySelector("svg")!.textContent).toContain("30%");
  });

  it("asks the dashboard to open the category explorer on click, from the dial and from the legend, when enabled", () => {
    const heard = vi.fn();
    const listener = (e: Event) => heard((e as CustomEvent<string>).detail);
    window.addEventListener(OPEN_CATEGORY_EVENT, listener);
    const { container } = renderCard({ opensExplorer: true });
    fireEvent.click(container.querySelectorAll("[data-dial-hit]")[0]);
    fireEvent.click(screen.getByRole("button", { name: /Cash/ }));
    window.removeEventListener(OPEN_CATEGORY_EVENT, listener);
    expect(heard).toHaveBeenNthCalledWith(1, "Real Estate");
    expect(heard).toHaveBeenNthCalledWith(2, "Cash");
  });

  it("does nothing on click and has no buttons when the explorer is not available (Basic)", () => {
    const heard = vi.fn();
    window.addEventListener(OPEN_CATEGORY_EVENT, heard);
    const { container } = renderCard();
    fireEvent.click(container.querySelectorAll("[data-dial-hit]")[0]);
    window.removeEventListener(OPEN_CATEGORY_EVENT, heard);
    expect(heard).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
