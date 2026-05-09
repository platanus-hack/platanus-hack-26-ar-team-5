import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

// Wire @noble/hashes sha512 so @noble/ed25519 v3 has a sync hashing primitive.
ed.hashes.sha512 = sha512;

export type Keypair = {
  privateKey: Uint8Array; // 32 bytes
  publicKey: Uint8Array; // 32 bytes
};

export function generateKeypair(): Keypair {
  const privateKey = ed.utils.randomSecretKey();
  const publicKey = ed.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed.sign(message, privateKey);
}

export function verify(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  try {
    return ed.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

export function bytesToHexStr(b: Uint8Array): string {
  return bytesToHex(b);
}

export function hexStrToBytes(h: string): Uint8Array {
  return hexToBytes(h);
}
