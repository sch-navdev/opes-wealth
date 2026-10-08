import { fireEvent, render } from "@testing-library/react";
import { vi } from "vitest";
import { describe, expect, it } from "vitest";
import { AllocationDial } from "@/components/allocation-dial";

const slices = [
  { key: "re", share: 58, color: "var(--chart-1)" },
  { key: "eq", share: 30, color: "var(--chart-2)" },
  { key: "cash", share: 12, color: "var(--chart-3)" },
];

describe("AllocationDial", () => {
  it("draws 60 ticks and one arc per slice, hidden from the accessibility tree", () => {
    const { container } = render(<AllocationDial slices={slices} centerValue="58%" centerLabel="Real estate" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelectorAll("line")).toHaveLength(60);
    expect(svg.querySelectorAll("path")).toHaveLength(3);
    expect(svg.textContent).toContain("58%");
    expect(svg.textContent).toContain("Real estate");
  });

  it("uses each slice's colour", () => {
    const { container } = render(<AllocationDial slices={slices} />);
    const strokes = [...container.querySelectorAll("path")].map((p) => p.getAttribute("stroke"));
    expect(strokes).toEqual(["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"]);
  });

  it("closes a single slice as a full ring", () => {
    const { container } = render(<AllocationDial slices={[{ key: "x", share: 100, color: "red" }]} />);
    expect(container.querySelectorAll("path")).toHaveLength(0);
    expect(container.querySelectorAll("circle")).toHaveLength(1);
  });

  it("draws only the ticks when there are no positive slices", () => {
    const { container } = render(<AllocationDial slices={[{ key: "x", share: 0, color: "red" }]} />);
    expect(container.querySelectorAll("path, circle")).toHaveLength(0);
    expect(container.querySelectorAll("line")).toHaveLength(60);
  });

  it("adds no hit areas unless it is interactive", () => {
    const { container } = render(<AllocationDial slices={slices} />);
    expect(container.querySelectorAll("[data-dial-hit]")).toHaveLength(0);
  });

  it("reports the arc under the pointer and clicks, and thickens the active arc while dimming the rest", () => {
    const onActiveChange = vi.fn();
    const onSelect = vi.fn();
    const { container, rerender } = render(
      <AllocationDial slices={slices} onActiveChange={onActiveChange} onSelect={onSelect} />,
    );
    const hits = container.querySelectorAll("[data-dial-hit]");
    expect(hits).toHaveLength(3);
    fireEvent.pointerEnter(hits[1]);
    expect(onActiveChange).toHaveBeenCalledWith("eq");
    fireEvent.click(hits[2]);
    expect(onSelect).toHaveBeenCalledWith("cash");
    fireEvent.pointerLeave(container.querySelector("svg")!);
    expect(onActiveChange).toHaveBeenLastCalledWith(null);

    rerender(<AllocationDial slices={slices} activeKey="eq" onActiveChange={onActiveChange} onSelect={onSelect} />);
    const visible = [...container.querySelectorAll("path")].filter((p) => !p.hasAttribute("data-dial-hit"));
    const widths = visible.map((p) => Number(p.getAttribute("stroke-width")));
    expect(widths[1]).toBeGreaterThan(widths[0]);
    expect(visible[0].getAttribute("opacity")).toBe("0.3");
    expect(visible[1].getAttribute("opacity")).toBe("1");
  });
});
