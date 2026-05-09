import { describe, expect, it } from "vitest";
import { generateKeypair, sign, verify } from "../src/crypto.js";
import { canonicalBytes } from "../src/canonical.js";

describe("crypto (mocked)", () => {
  it("generateKeypair returns 32-byte private and public keys", () => {
    const kp = generateKeypair();
    expect(kp.privateKey).toHaveLength(32);
    expect(kp.publicKey).toHaveLength(32);
  });

  it("sign + verify happy path", () => {
    const kp = generateKeypair();
    const msg = canonicalBytes({ hello: "world", n: 42 });
    const sig = sign(msg, kp.privateKey);
    expect(sig).toHaveLength(64);
    expect(verify(sig, msg, kp.publicKey)).toBe(true);
  });

  it("rejects tampered signature", () => {
    const kp = generateKeypair();
    const msg = canonicalBytes({ a: 1 });
    const sig = sign(msg, kp.privateKey);
    sig[0] = (sig[0]! ^ 0x01) & 0xff;
    expect(verify(sig, msg, kp.publicKey)).toBe(false);
  });

  it("rejects message tampering (1-byte change)", () => {
    const kp = generateKeypair();
    const msg = canonicalBytes({ a: 1 });
    const sig = sign(msg, kp.privateKey);
    const tampered = new Uint8Array(msg);
    tampered[2] = (tampered[2]! ^ 0x01) & 0xff;
    expect(verify(sig, tampered, kp.publicKey)).toBe(false);
  });

  it("rejects wrong public key", () => {
    const kp1 = generateKeypair();
    const kp2 = generateKeypair();
    const msg = canonicalBytes({ a: 1 });
    const sig = sign(msg, kp1.privateKey);
    expect(verify(sig, msg, kp2.publicKey)).toBe(false);
  });
});
