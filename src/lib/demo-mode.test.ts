import { describe, expect, it } from "vitest";
import { DEMO_MONTHLY_INCOME, DEMO_USER_ID, isDemoUser, userIdFromAccessToken } from "@/lib/demo-mode";

const b64url = (obj: unknown) => Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
const jwt = (payload: unknown) => `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.signature`;

describe("DEMO_USER_ID", () => {
  it("is a non-empty id", () => {
    expect(typeof DEMO_USER_ID).toBe("string");
    expect(DEMO_USER_ID.length).toBeGreaterThan(0);
  });
});

describe("isDemoUser", () => {
  it("is true for the demo user id, regardless of case", () => {
    expect(isDemoUser(DEMO_USER_ID)).toBe(true);
    expect(isDemoUser(DEMO_USER_ID.toUpperCase())).toBe(true);
    expect(isDemoUser(DEMO_USER_ID.toLowerCase())).toBe(true);
  });

  it("is false for any other user, and for null / undefined / empty", () => {
    expect(isDemoUser("00000000-0000-0000-0000-000000000000")).toBe(false);
    expect(isDemoUser(`${DEMO_USER_ID}x`)).toBe(false);
    expect(isDemoUser(` ${DEMO_USER_ID}`)).toBe(false);
    expect(isDemoUser(null)).toBe(false);
    expect(isDemoUser(undefined)).toBe(false);
    expect(isDemoUser("")).toBe(false);
  });
});

describe("userIdFromAccessToken", () => {
  it("reads the sub claim from a JWT payload (no signature check)", () => {
    expect(userIdFromAccessToken(jwt({ sub: "user-123", role: "authenticated" }))).toBe("user-123");
  });

  it("identifies the demo user from its token", () => {
    expect(isDemoUser(userIdFromAccessToken(jwt({ sub: DEMO_USER_ID })))).toBe(true);
  });

  it("handles base64url payloads with non-ASCII characters", () => {
    expect(userIdFromAccessToken(jwt({ sub: "usér-ß", name: "Zoë" }))).toBe("usér-ß");
  });

  it("returns null for missing, empty or malformed tokens", () => {
    expect(userIdFromAccessToken(null)).toBeNull();
    expect(userIdFromAccessToken(undefined)).toBeNull();
    expect(userIdFromAccessToken("")).toBeNull();
    expect(userIdFromAccessToken("not-a-jwt")).toBeNull();
    expect(userIdFromAccessToken("a.!!!.c")).toBeNull();
    expect(userIdFromAccessToken(`a.${Buffer.from("not json").toString("base64url")}.c`)).toBeNull();
  });

  it("returns null when sub is absent or not a string", () => {
    expect(userIdFromAccessToken(jwt({}))).toBeNull();
    expect(userIdFromAccessToken(jwt({ sub: 42 }))).toBeNull();
    expect(userIdFromAccessToken(jwt({ sub: null }))).toBeNull();
    expect(userIdFromAccessToken(jwt(null))).toBeNull();
  });
});

describe("DEMO_MONTHLY_INCOME", () => {
  it("is a positive number", () => {
    expect(DEMO_MONTHLY_INCOME).toBe(60000);
  });
});
