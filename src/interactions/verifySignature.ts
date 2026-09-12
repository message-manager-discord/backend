const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Invalid hexadecimal string");
  }

  const bytes = new Uint8Array(hex.length / 2);

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}

export async function verifyDiscordSignature(
  rawBody: Uint8Array | string,
  signature: string,
  timestamp: string,
  publicKey: string,
): Promise<boolean> {
  try {
    const bodyBytes =
      typeof rawBody === "string" ? encoder.encode(rawBody) : rawBody;

    const timestampBytes = encoder.encode(timestamp);

    const message = new Uint8Array(timestampBytes.length + bodyBytes.length);

    message.set(timestampBytes, 0);
    message.set(bodyBytes, timestampBytes.length);

    const publicKeyBytes = hexToBytes(publicKey);
    const signatureBytes = hexToBytes(signature);

    if (publicKeyBytes.length !== 32 || signatureBytes.length !== 64) {
      return false;
    }

    const key = await crypto.subtle.importKey(
      "raw",
      publicKeyBytes,
      {
        name: "Ed25519",
      },
      false,
      ["verify"],
    );

    return await crypto.subtle.verify(
      {
        name: "Ed25519",
      },
      key,
      signatureBytes,
      message,
    );
  } catch {
    return false;
  }
}
