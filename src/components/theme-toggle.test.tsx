import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageProvider } from "@/context/language-context";

const state = vi.hoisted(() => ({ theme: "system" as string | undefined, setTheme: vi.fn() }));
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: state.theme, setTheme: state.setTheme }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const renderIt = () =>
  render(
    <LanguageProvider>
      <ThemeToggle />
    </LanguageProvider>,
  );

beforeEach(() => {
  state.theme = "system";
  state.setTheme.mockClear();
});

describe("ThemeToggle", () => {
  it("offers Light, Dark and Device as a labelled radio group", () => {
    renderIt();
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeTruthy();
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual([
      "Light",
      "Dark",
      "Device (follows your system)",
    ]);
  });

  it("shows Device as selected when no choice was made", () => {
    state.theme = undefined;
    renderIt();
    expect(screen.getByRole("radio", { name: /Device/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked")).toBe("false");
  });

  it("reflects a stored choice", () => {
    state.theme = "light";
    renderIt();
    expect(screen.getByRole("radio", { name: "Light" }).getAttribute("aria-checked")).toBe("true");
  });

  it("sets the theme when an option is clicked", () => {
    renderIt();
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(state.setTheme).toHaveBeenCalledWith("dark");
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(state.setTheme).toHaveBeenCalledWith("light");
    fireEvent.click(screen.getByRole("radio", { name: /Device/ }));
    expect(state.setTheme).toHaveBeenCalledWith("system");
  });

  it("moves between options with the arrow keys and wraps", () => {
    state.theme = "dark";
    renderIt();
    const group = screen.getByRole("radiogroup");
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(state.setTheme).toHaveBeenLastCalledWith("system");
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(state.setTheme).toHaveBeenLastCalledWith("light");
  });

  it("keeps a single tab stop on the selected option", () => {
    state.theme = "dark";
    renderIt();
    const stops = screen.getAllByRole("radio").filter((r) => r.getAttribute("tabindex") === "0");
    expect(stops).toHaveLength(1);
    expect(stops[0].getAttribute("aria-label")).toBe("Dark");
  });
});
