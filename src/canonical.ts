import canonicalizeFn from "canonicalize";
import { sha256 as sha256Bytes } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

/**
 * RFC 8785 (JCS) canonical JSON serialization.
 * Returns the canonical UTF-8 string for a value.
 *
 * The wrapped library uses a default export of a function in CJS shape.
 * We coerce it to a stable shape and throw on undefined input (which it
 * silently returns in some edge cases) so we never sign empty bytes.
 */
export function canonicalize(value: unknown): string {
  const out = (canonicalizeFn as unknown as (v: unknown) => string | undefined)(value);
  if (typeof out !== "string") {
    throw new Error("canonicalize: input is not JSON-serializable");
  }
  return out;
}

export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}

/** sha256 over the canonical JCS bytes. Returns "sha256:<hex>". */
export function hash(value: unknown): string {
  const digest = sha256Bytes(canonicalBytes(value));
  return `sha256:${bytesToHex(digest)}`;
}
