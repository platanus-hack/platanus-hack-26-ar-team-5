import { canonicalBytes, hash } from "./canonical";
import { sign, verify, bytesToHexStr, hexStrToBytes, type Keypair } from "./crypto";
import { resolvePubKey } from "./did";
import type { Proof, SignedDoc } from "./types";

/** Build a Proof object: sign canonical bytes of `doc` (without proof) using `keypair`.
 *  When `at` is provided, the proof.created timestamp is fixed to it — needed for
 *  deterministic re-signing across restarts/reloads (otherwise each rehydration
 *  produces different signatures and evidence hashes drift). */
export function makeProof<T extends object>(
  doc: T,
  keypair: Keypair,
  did: string,
  at?: string,
): Proof {
  const sigBytes = sign(canonicalBytes(doc), keypair.privateKey);
  return {
    type: "Ed25519Signature2020",
    created: at ?? new Date().toISOString(),
    verificationMethod: did,
    signature: bytesToHexStr(sigBytes),
  };
}

export function signDoc<T extends object>(
  doc: T,
  keypair: Keypair,
  did: string,
  at?: string,
): SignedDoc<T> {
  const proof = makeProof(doc, keypair, did, at);
  return { ...doc, proof };
}

/** Verify a SignedDoc: re-canonicalize without `proof`, check Ed25519 sig against the signer's DID. */
export function verifySignedDoc<T extends object>(signed: SignedDoc<T>): boolean {
  const { proof, ...rest } = signed as SignedDoc<T> & { proof: Proof };
  const pub = resolvePubKey(proof.verificationMethod);
  const msgBytes = canonicalBytes(rest);
  const sigBytes = hexStrToBytes(proof.signature);
  return verify(sigBytes, msgBytes, pub);
}

/** Stable content-addressed hash of a signed doc (over canonical bytes, including proof). */
export function docHash<T extends object>(signed: SignedDoc<T>): string {
  return hash(signed);
}
