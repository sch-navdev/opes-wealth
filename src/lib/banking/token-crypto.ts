/**
 * Authenticated encryption for bank-connection secrets (OAuth access/refresh
 * tokens, the PKCE code verifier) before they are written to the database.
 *
 * AES-256-GCM with a fresh random 96-bit IV per value; the stored string is
 * `v1:<iv>:<authTag>:<ciphertext>` (base64url). The key comes from
 * `BANK_TOKEN_ENCRYPTION_KEY` (32 random bytes, base64 — generate with
 * `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`)
 * and exists only in the server environment, so a database leak alone does
 * not expose a usable token. Server-only: imports `node:crypto` and reads a
 * secret, so never import it from a `"use client"` component.
 *
 * Rotating the key invalidates every stored token (users reconnect); there is
 * deliberately no fallback to a default key.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;

export class TokenCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenCryptoError";
  }
}

function getKey(): Buffer {
  const raw = process.env.BANK_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new TokenCryptoError("BANK_TOKEN_ENCRYPTION_KEY is not set.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new TokenCryptoError("BANK_TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  }
  return key;
}

export function isTokenCryptoConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, ciphertext] = stored.split(":");
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new TokenCryptoError("Unrecognised encrypted value format.");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Wrong key or tampered data — GCM authentication failed.
    throw new TokenCryptoError("Could not decrypt the stored value (wrong key or corrupted data).");
  }
}
