import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InfoTooltip } from "@/components/ui/tooltip";

function setup() {
  render(
    <InfoTooltip label="About D/E" icon={<span>i</span>}>
      Total liabilities / net worth
    </InfoTooltip>,
  );
  return screen.getByRole("button", { name: "About D/E" });
}

describe("InfoTooltip", () => {
  it("is closed by default and the bubble is hidden", () => {
    const trigger = setup();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.hasAttribute("aria-describedby")).toBe(false);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on keyboard focus, wires aria-describedby and closes on blur", () => {
    const trigger = setup();
    fireEvent.focus(trigger);
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain("Total liabilities / net worth");
    expect(trigger.getAttribute("aria-describedby")).toBe(tip.id);
    fireEvent.blur(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on hover and closes on mouse leave", () => {
    const trigger = setup();
    const wrapper = trigger.parentElement as HTMLElement;
    fireEvent.mouseEnter(wrapper);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.mouseLeave(wrapper);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("closes on Escape", () => {
    const trigger = setup();
    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("toggles on tap (click) for touch devices", () => {
    const trigger = setup();
    fireEvent.click(trigger);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
