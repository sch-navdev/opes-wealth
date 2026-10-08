import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/theme-provider";

const captured = vi.hoisted(() => ({ props: undefined as Record<string, unknown> | undefined }));
vi.mock("next-themes", () => ({
  ThemeProvider: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => {
    captured.props = props;
    return <>{children}</>;
  },
}));

describe("ThemeProvider", () => {
  it("defaults to the device theme and uses the class strategy", () => {
    render(
      <ThemeProvider>
        <span>x</span>
      </ThemeProvider>,
    );
    expect(captured.props).toMatchObject({ attribute: "class", defaultTheme: "system", enableSystem: true });
  });
});
