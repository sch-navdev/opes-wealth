import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingAssets } from "@/components/landing-assets";
import { LANDING_EN } from "@/components/landing-copy-en";
import { LandingField } from "@/components/landing-field";
import { LandingProof } from "@/components/landing-proof";
import { LanguageProvider } from "@/context/language-context";

function renderIn(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

describe("LandingField", () => {
  it("is decorative: hidden from assistive tech, no images, no text", () => {
    const { container } = render(<LandingField />);
    const root = container.firstElementChild!;
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("");
    expect(container.querySelector(".landing-dial-turn")).not.toBeNull();
    expect(container.querySelector(".landing-rosette-turn")).not.toBeNull();
  });
});

describe("LandingAssets", () => {
  it("lists the eight asset classes as h3 headings under one h2, with no raw keys", () => {
    const { container } = renderIn(<LandingAssets />);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    const names = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual([
      "Yachts & aircraft",
      "Art & collectibles",
      "Private Equity",
      "SCPI",
      "Assurance-Vie",
      "Companies & entities",
      "Real Estate",
      "Precious Metals",
    ]);
    expect(container.textContent).not.toMatch(/landing_/);
    expect(container.querySelector("#assets")).not.toBeNull();
  });
});

describe("LandingProof", () => {
  it("states the five product facts and claims no certification, rating or user count", () => {
    const { container } = renderIn(<LandingProof />);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(5);
    const text = container.textContent ?? "";
    expect(text).toContain("Privacy mode");
    expect(text).toContain("Nine languages");
    expect(text).not.toMatch(/landing_/);
    expect(text).not.toMatch(/ISO|SOC ?2|bank-grade|audited|certified|regulated|testimonial|\d+,?\d*\s*(users|clients|members)/i);
  });
});

describe("landing copy", () => {
  it("never promises returns or offers advice", () => {
    const all = Object.values(LANDING_EN).join(" ");
    expect(all).not.toMatch(/guarantee|outperform|maximi[sz]e returns|best returns/i);
    expect(all).not.toMatch(/tracker/i);
  });
});
