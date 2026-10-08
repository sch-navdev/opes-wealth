import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PointerLight } from "@/components/pointer-light";

function setup() {
  const view = render(
    <div>
      <PointerLight />
      <div className="lit" data-testid="lit">
        <span data-testid="inner">x</span>
      </div>
      <div data-testid="plain">y</div>
    </div>,
  );
  const lit = view.getByTestId("lit");
  lit.getBoundingClientRect = () => ({ left: 100, top: 50, right: 300, bottom: 150, width: 200, height: 100, x: 100, y: 50, toJSON() {} });
  return { ...view, lit };
}

describe("PointerLight", () => {
  it("writes the pointer position, relative to the card, onto a lit card", () => {
    const { getByTestId, lit } = setup();
    fireEvent.pointerMove(getByTestId("inner"), { clientX: 130, clientY: 70, pointerType: "mouse" });
    expect(lit.style.getPropertyValue("--mx")).toBe("30px");
    expect(lit.style.getPropertyValue("--my")).toBe("20px");
  });

  it("ignores touch and elements outside a lit card", () => {
    const { getByTestId, lit } = setup();
    fireEvent.pointerMove(getByTestId("inner"), { clientX: 130, clientY: 70, pointerType: "touch" });
    fireEvent.pointerMove(getByTestId("plain"), { clientX: 130, clientY: 70, pointerType: "mouse" });
    expect(lit.style.getPropertyValue("--mx")).toBe("");
  });
});
