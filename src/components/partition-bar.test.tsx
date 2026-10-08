import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PartitionBar } from "@/components/partition-bar";

describe("PartitionBar", () => {
  it("sizes each segment by its share of the positive total", () => {
    const { container } = render(
      <PartitionBar
        segments={[
          { key: "a", share: 75, color: "red" },
          { key: "b", share: 25, color: "blue" },
        ]}
      />,
    );
    const widths = [...container.querySelectorAll<HTMLElement>("[style]")].map((n) => n.style.width);
    expect(widths).toEqual(["75%", "25%"]);
  });

  it("normalises shares that do not add up to 100 and drops non-positive ones", () => {
    const { container } = render(
      <PartitionBar
        segments={[
          { key: "a", share: 1, color: "red" },
          { key: "b", share: 1, color: "blue" },
          { key: "c", share: 0, color: "green" },
          { key: "d", share: -5, color: "green" },
        ]}
      />,
    );
    expect([...container.querySelectorAll<HTMLElement>("[style]")].map((n) => n.style.width)).toEqual(["50%", "50%"]);
  });

  it("is decorative and renders nothing when there is nothing to show", () => {
    const { container, rerender } = render(<PartitionBar segments={[{ key: "a", share: 1, color: "red" }]} />);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    rerender(<PartitionBar segments={[{ key: "a", share: 0, color: "red" }]} />);
    expect(container.firstChild).toBeNull();
  });
});
