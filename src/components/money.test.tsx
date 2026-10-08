import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Money } from "@/components/money";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";

const wrap = (node: React.ReactNode) =>
  render(
    <LanguageProvider>
      <PrivacyProvider>{node}</PrivacyProvider>
    </LanguageProvider>,
  );

beforeEach(() => localStorage.clear());

describe("Money", () => {
  it("gives screen readers the whole amount as plain text", () => {
    wrap(<Money value={1234567.5} currency="USD" />);
    expect(screen.getByText("USD 1,234,567.50", { selector: ".sr-only" })).toBeTruthy();
  });

  it("shows the code as a label and the whole part and decimals separately, all hidden from the accessibility tree", () => {
    const { container } = wrap(<Money value={4286410.52} currency="aed" />);
    const hidden = [...container.querySelectorAll("[aria-hidden=\"true\"]")].map((n) => n.textContent);
    expect(hidden).toContain("AED");
    expect(container.querySelector("bdi")!.textContent).toBe("4,286,410.52");
    expect([...container.querySelectorAll("bdi > span")].map((n) => n.textContent)).toContain(".52");
  });

  it("can hide the code and the decimals", () => {
    const { container } = wrap(<Money value={1000.25} currency="USD" showCurrency={false} decimals="hide" />);
    const hidden = container.querySelector("bdi")!;
    expect(hidden.textContent).toBe("1,000");
    expect(container.textContent).not.toMatch(/\.25$/);
  });

  it("marks a negative amount", () => {
    wrap(<Money value={-250} currency="USD" fractionDigits={0} />);
    expect(screen.getByText("USD -250", { selector: ".sr-only" })).toBeTruthy();
  });

  it("does not animate on first render", () => {
    const { container } = wrap(<Money value={1234} currency="USD" />);
    expect(container.querySelectorAll(".animate-in").length).toBe(0);
  });

  it("rolls only the digit places that changed when the value changes", () => {
    const { container, rerender } = wrap(<Money value={1234} currency="USD" fractionDigits={0} />);
    rerender(
      <LanguageProvider>
        <PrivacyProvider>
          <Money value={1239} currency="USD" fractionDigits={0} />
        </PrivacyProvider>
      </LanguageProvider>,
    );
    const rolling = [...container.querySelectorAll(".animate-in")].map((n) => n.textContent);
    expect(rolling).toEqual(["9"]);
  });

  it("replaces the figure with the mask in Privacy Mode", () => {
    localStorage.setItem("opes_privacy_mode", "true");
    const { container } = wrap(<Money value={987654} currency="USD" />);
    expect(container.textContent).toContain("••••");
    expect(container.textContent).not.toContain("987");
  });
});
