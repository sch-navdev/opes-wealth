import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HelpChatWidget, visibleReply } from "@/components/help-chat-widget";
import { LanguageProvider } from "@/context/language-context";

const sendMessage = vi.fn();
let chat: { messages: unknown[]; status: string; error?: Error };

vi.mock("@ai-sdk/react", () => ({ useChat: () => ({ ...chat, sendMessage }) }));

function open() {
  render(
    <LanguageProvider>
      <HelpChatWidget />
    </LanguageProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /help/i }));
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.clearAllMocks();
  chat = { messages: [], status: "ready" };
});

describe("HelpChatWidget (useChat)", () => {
  it("sends the typed question through useChat and clears the field", () => {
    open();
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "How do I add a car?" } });
    fireEvent.submit(input.closest("form")!);
    expect(sendMessage).toHaveBeenCalledWith({ text: "How do I add a car?" });
    expect(input.value).toBe("");
  });

  it("renders streamed message text and a refusal as a readable error", () => {
    chat = {
      messages: [
        { id: "1", role: "user", parts: [{ type: "text", text: "hi" }] },
        { id: "2", role: "assistant", parts: [{ type: "text", text: "Open Settings." }] },
      ],
      status: "ready",
      error: new Error(JSON.stringify({ error: "rate_limited" })),
    };
    open();
    expect(screen.getByText("Open Settings.")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Too many questions");
  });

  it("does not send while a reply is streaming", () => {
    chat = { messages: [], status: "streaming" };
    open();
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it.each([
    ["unauthenticated", "session has expired"],
    ["upstream_401", "AI service refused"],
    ["upstream_500", "couldn't answer"],
  ])("explains a %s failure", (code, text) => {
    chat = { messages: [], status: "error", error: new Error(JSON.stringify({ error: code })) };
    open();
    expect(screen.getByRole("alert").textContent).toContain(text);
  });

  it("hides reasoning text sent inside think tags, also while it is still streaming", () => {
    expect(visibleReply("<think>plan the answer</think>Open Cmd+K.")).toBe("Open Cmd+K.");
    expect(visibleReply("<think>still thinking")).toBe("");
    expect(visibleReply("Plain answer")).toBe("Plain answer");
  });
});
