import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyDiscordSignature } from "../../interactions/verifySignature.js";

// Discord signs the timestamp concatenated with the raw request body, using the
// public key from the application's settings.
const { publicKey, privateKey } = generateKeyPairSync("ed25519");

const publicKeyHex = (() => {
  const jwk = publicKey.export({ format: "jwk" });
  const bytes = Buffer.from(jwk.x ?? "", "base64url");

  expect(bytes.length).toBe(32);

  return bytes.toString("hex");
})();

const timestamp = "1700000000";
const body = JSON.stringify({ type: 1, id: "1234567890" });

const signWith = (
  key: typeof privateKey,
  signedTimestamp: string,
  signedBody: string,
) =>
  sign(
    null,
    Buffer.concat([Buffer.from(signedTimestamp), Buffer.from(signedBody)]),
    key,
  ).toString("hex");

const validSignature = signWith(privateKey, timestamp, body);

describe("verifyDiscordSignature", () => {
  it("accepts a signature made over the timestamp and body", async () => {
    await expect(
      verifyDiscordSignature(body, validSignature, timestamp, publicKeyHex),
    ).resolves.toBe(true);
  });

  it("accepts a body passed as raw bytes", async () => {
    await expect(
      verifyDiscordSignature(
        new TextEncoder().encode(body),
        validSignature,
        timestamp,
        publicKeyHex,
      ),
    ).resolves.toBe(true);
  });

  it("rejects a body that was tampered with after signing", async () => {
    await expect(
      verifyDiscordSignature(
        JSON.stringify({ type: 1, id: "9999999999" }),
        validSignature,
        timestamp,
        publicKeyHex,
      ),
    ).resolves.toBe(false);
  });

  it("rejects the body when replayed under a different timestamp", async () => {
    await expect(
      verifyDiscordSignature(body, validSignature, "1700000001", publicKeyHex),
    ).resolves.toBe(false);
  });

  it("rejects a signature from a different key", async () => {
    const otherKey = generateKeyPairSync("ed25519");
    const otherSignature = signWith(otherKey.privateKey, timestamp, body);

    await expect(
      verifyDiscordSignature(body, otherSignature, timestamp, publicKeyHex),
    ).resolves.toBe(false);
  });

  // Malformed input must be rejected rather than raised, since this runs before
  // any request body has been trusted.
  it("rejects a malformed signature instead of throwing", async () => {
    await expect(
      verifyDiscordSignature(body, "not-hex", timestamp, publicKeyHex),
    ).resolves.toBe(false);

    await expect(
      verifyDiscordSignature(
        body,
        validSignature.slice(2),
        timestamp,
        publicKeyHex,
      ),
    ).resolves.toBe(false);
  });

  it("rejects a public key of the wrong length instead of throwing", async () => {
    await expect(
      verifyDiscordSignature(body, validSignature, timestamp, "ab".repeat(31)),
    ).resolves.toBe(false);

    await expect(
      verifyDiscordSignature(body, validSignature, timestamp, ""),
    ).resolves.toBe(false);
  });
});
