import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/context/language-context";
import { PdfPasswordPrompt } from "@/components/pdf-password-prompt";

function setup(props: Partial<React.ComponentProps<typeof PdfPasswordPrompt>> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <LanguageProvider>
      <PdfPasswordPrompt fileName="stmt.pdf" pending={false} onSubmit={onSubmit} onCancel={onCancel} {...props} />
    </LanguageProvider>,
  );
  const input = screen.getByLabelText("PDF password") as HTMLInputElement;
  return { onSubmit, onCancel, input };
}

describe("PdfPasswordPrompt", () => {
  it("renders an accessible group with a masked, non-autofilled field", () => {
    const { input } = setup();
    expect(screen.getByRole("group")).toBeTruthy();
    expect(screen.getByText("This PDF is password protected")).toBeTruthy();
    expect(screen.getByText("stmt.pdf")).toBeTruthy();
    expect(input.type).toBe("password");
    expect(input.autocomplete).toBe("off");
    expect(input.getAttribute("spellcheck")).toBe("false");
  });

  it("submits with Enter, then clears the field", async () => {
    const { input, onSubmit } = setup();
    await userEvent.type(input, "hunter2{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("hunter2");
    expect(input.value).toBe("");
  });

  it("submits with the Unlock button and ignores an empty password", async () => {
    const { input, onSubmit } = setup();
    const unlock = screen.getByRole("button", { name: "Unlock" }) as HTMLButtonElement;
    expect(unlock.disabled).toBe(true);
    await userEvent.type(input, "pw");
    await userEvent.click(unlock);
    expect(onSubmit).toHaveBeenCalledWith("pw");
  });

  it("toggles visibility with aria-pressed", async () => {
    const { input } = setup();
    const toggle = screen.getByRole("button", { name: "Show" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    await userEvent.click(toggle);
    expect(input.type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the wrong-password error and refocuses the field", () => {
    const { input } = setup({ error: true });
    expect(screen.getByText("Incorrect password, try again")).toBeTruthy();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(input);
  });

  it("disables the form and shows the pending label while unlocking", () => {
    const { input } = setup({ pending: true });
    expect(input.disabled).toBe(true);
    expect(screen.getByText("Unlocking…")).toBeTruthy();
  });

  it("cancels", async () => {
    const { onCancel } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
