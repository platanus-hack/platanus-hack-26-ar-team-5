import { hexStrToBytes } from "./crypto.js";

// did:key method for Ed25519 — multicodec prefix 0xed01 + raw 32-byte pubkey,
// then base58btc encoded with multibase prefix 'z'.
// Reference: https://w3c-ccg.github.io/did-method-key/#ed25519-x25519

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58btcEncode(bytes: Uint8Array): string {
  // Count leading zeros
  let zeros = 0;
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) zeros++;

  // Convert big-endian byte array to base58
  const digits: number[] = [0];
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i]!;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j]! << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  let out = "";
  for (let i = 0; i < zeros; i++) out += "1";
  for (let i = digits.length - 1; i >= 0; i--) out += BASE58_ALPHABET[digits[i]!];
  return out;
}

function base58btcDecode(s: string): Uint8Array {
  let zeros = 0;
  while (zeros < s.length && s[zeros] === "1") zeros++;

  const bytes: number[] = [0];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    const value = BASE58_ALPHABET.indexOf(ch);
    if (value < 0) throw new Error(`base58: invalid char ${ch}`);
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j]! * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  const result = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) result[zeros + i] = bytes[bytes.length - 1 - i]!;
  return result;
}

/** Derive a did:key string from a 32-byte Ed25519 public key. */
export function deriveDid(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) throw new Error("Ed25519 pubkey must be 32 bytes");
  const prefixed = new Uint8Array(2 + publicKey.length);
  prefixed[0] = 0xed; // multicodec ed25519-pub low byte
  prefixed[1] = 0x01;
  prefixed.set(publicKey, 2);
  return `did:key:z${base58btcEncode(prefixed)}`;
}

/** Resolve a did:key Ed25519 DID back to its 32-byte public key. */
export function resolvePubKey(did: string): Uint8Array {
  const m = did.match(/^did:key:z([1-9A-HJ-NP-Za-km-z]+)$/);
  if (!m) throw new Error(`not a did:key Ed25519 DID: ${did}`);
  const decoded = base58btcDecode(m[1]!);
  if (decoded.length < 3 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error(`unsupported did:key codec: ${did}`);
  }
  return decoded.slice(2);
}

// Helper for tests / interop in case anyone passes hex
export function deriveDidFromHexPub(hex: string): string {
  return deriveDid(hexStrToBytes(hex));
}
