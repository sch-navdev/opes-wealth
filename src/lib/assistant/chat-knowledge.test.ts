import { describe, expect, it } from "vitest";
import { buildChatSystemPrompt, CHAT_KNOWLEDGE, describeDevice } from "@/lib/assistant/chat-knowledge";

const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36";

describe("describeDevice", () => {
  it("tells Windows, Mac, phones and tablets apart from the user agent", () => {
    expect(describeDevice(WINDOWS)).toContain("Windows");
    expect(describeDevice(MAC)).toContain("Mac");
    expect(describeDevice(IPHONE)).toContain("phone");
    expect(describeDevice(ANDROID)).toContain("phone");
    expect(describeDevice("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)")).toContain("tablet");
  });
  it("returns null when the user agent says nothing", () => {
    expect(describeDevice(undefined)).toBeNull();
    expect(describeDevice("curl/8")).toBeNull();
  });
});

describe("buildChatSystemPrompt", () => {
  it("gives the device-specific shortcut note and the page and language", () => {
    const p = buildChatSystemPrompt({ userAgent: WINDOWS, page: "/dashboard/banking", language: "French" });
    expect(p).toContain("Windows computer");
    expect(p).toContain("/dashboard/banking");
    expect(p).toContain("French");
  });
  it("tells the model to cover every route when the device is unknown, and never to assume a Mac", () => {
    const p = buildChatSystemPrompt({});
    expect(p).toContain("device is unknown");
    expect(p).toContain("Never assume the user's device");
  });
  it("carries the platform knowledge and the honesty rules", () => {
    const p = buildChatSystemPrompt({});
    expect(p).toContain("Platform Knowledge:");
    expect(p).toContain("Never invent a feature");
    expect(p).toContain("Never offer financial, tax or investment advice");
  });
});

describe("CHAT_KNOWLEDGE", () => {
  it("explains co-ownership sharing, which the assistant once wrongly denied", () => {
    expect(CHAT_KNOWLEDGE).toContain("Ownership & co-owners");
    expect(CHAT_KNOWLEDGE).toContain("exactly 100%");
  });
  it("gives the search shortcut for every device, not only the Mac one", () => {
    expect(CHAT_KNOWLEDGE).toContain("Ctrl+K");
    expect(CHAT_KNOWLEDGE).toContain("Cmd+K");
    expect(CHAT_KNOWLEDGE).toContain("tap");
  });
  it("lists what is not available instead of leaving the model to guess", () => {
    expect(CHAT_KNOWLEDGE).toContain("Not available");
    expect(CHAT_KNOWLEDGE).toContain("Live bank sync");
  });
});
