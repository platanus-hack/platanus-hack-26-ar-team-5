import { describe, expect, it } from "vitest";
import { deriveDid, resolvePubKey } from "../src/did";
import { generateKeypair } from "../src/crypto";

describe("did (mocked)", () => {
  it("derives a did:key string for an Ed25519 pubkey", () => {
    const kp = generateKeypair();
    const did = deriveDid(kp.publicKey);
    expect(did).toMatch(/^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]+$/);
  });

  it("round-trips: deriveDid → resolvePubKey returns the same bytes", () => {
    const kp = generateKeypair();
    const did = deriveDid(kp.publicKey);
    const resolved = resolvePubKey(did);
    expect(Array.from(resolved)).toEqual(Array.from(kp.publicKey));
  });

  it("rejects malformed DIDs", () => {
    expect(() => resolvePubKey("not-a-did")).toThrow();
    expect(() => resolvePubKey("did:web:example.com")).toThrow();
  });

  it("rejects 32-byte pubkeys with wrong length", () => {
    expect(() => deriveDid(new Uint8Array(31))).toThrow();
    expect(() => deriveDid(new Uint8Array(33))).toThrow();
  });
});
