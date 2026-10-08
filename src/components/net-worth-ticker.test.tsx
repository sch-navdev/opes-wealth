import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NetWorthTicker } from "@/components/net-worth-ticker";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";

function renderTicker(value = 1_000_000) {
  return render(
    <LanguageProvider>
      <PrivacyProvider>
        <NetWorthTicker value={value} currency="USD" />
      </PrivacyProvider>
    </LanguageProvider>,
  );
}

const fullText = (c: HTMLElement) => c.querySelector(".sr-only")?.textContent ?? "";

describe("NetWorthTicker", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  });
  afterEach(() => vi.useRealTimers());

  it("renders the real amount on first paint, counts up once, and settles on the exact value", () => {
    const { container } = renderTicker();
    expect(fullText(container)).toContain("1,000,000");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const mid = fullText(container);
    expect(mid).not.toContain("1,000,000");
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(fullText(container)).toContain("1,000,000");
    expect(window.sessionStorage.getItem("opes-networth-counted")).toBe("1");
  });

  it("does not count again once it has played in this session", () => {
    window.sessionStorage.setItem("opes-networth-counted", "1");
    const { container } = renderTicker();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(fullText(container)).toContain("1,000,000");
  });

  it("shows the figure at once under reduced motion", () => {
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as never;
    const { container } = renderTicker();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(fullText(container)).toContain("1,000,000");
  });
});
