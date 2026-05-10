/**
 * Reference normalization for messages and evidence.
 *
 * Pacta's protocol cites messages and evidence by canonical content sha256 —
 * required for the audit trail to be content-addressed. But asking an LLM
 * agent to produce or remember a 64-char hex hash mid-negotiation is brittle
 * and historically the single biggest UX trap in the protocol.
 *
 * This module accepts THREE forms of reference and normalizes them all to
 * canonical "sha256:<hex>" before signing / validating:
 *
 *   - "sha256:<64 hex>"  — canonical (must exist in pool/history)
 *   - "m1", "m2", ...    — 1-based index into history (chronological order)
 *   - "e1", "e2", ...    — 1-based index into the evidence pool
 *   - <msg_id hex>       — the 32-char msg_id surfaced in history entries
 *   - <evidence_id>      — the "ev_..." id surfaced in evidence entries
 *
 * The signed message ALWAYS carries the canonical sha256 form, so the
 * audit trail is preserved exactly as before.
 */
import { docHash } from "./sign";
import type { SignedEvidence, SignedMessage } from "./types";

const SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const MSG_REF_RE = /^m(\d+)$/i;
const EV_REF_RE = /^e(\d+)$/i;

/**
 * Resolve a user-supplied message reference to its canonical sha256 hash.
 * Returns the canonical hash on success; null if the ref is unresolvable.
 */
export function resolveMsgRef(ref: string, history: SignedMessage[]): string | null {
  if (typeof ref !== "string" || ref.length === 0) return null;
  const trimmed = ref.trim();
  if (SHA256_RE.test(trimmed)) {
    return history.some((m) => docHash(m) === trimmed) ? trimmed : null;
  }
  const mMatch = trimmed.match(MSG_REF_RE);
  if (mMatch) {
    const idx = parseInt(mMatch[1]!, 10) - 1;
    if (idx < 0 || idx >= history.length) return null;
    return docHash(history[idx]!);
  }
  // msg_id is a 32-char hex string assigned at sign-time.
  const byMsgId = history.find((m) => m.msg_id === trimmed);
  if (byMsgId) return docHash(byMsgId);
  return null;
}

/**
 * Resolve a user-supplied evidence reference to its canonical sha256 hash.
 */
export function resolveEvidenceRef(
  ref: string,
  evidence: SignedEvidence[],
): string | null {
  if (typeof ref !== "string" || ref.length === 0) return null;
  const trimmed = ref.trim();
  if (SHA256_RE.test(trimmed)) {
    return evidence.some((e) => docHash(e) === trimmed) ? trimmed : null;
  }
  const eMatch = trimmed.match(EV_REF_RE);
  if (eMatch) {
    const idx = parseInt(eMatch[1]!, 10) - 1;
    if (idx < 0 || idx >= evidence.length) return null;
    return docHash(evidence[idx]!);
  }
  const byId = evidence.find((e) => e.evidence_id === trimmed);
  if (byId) return docHash(byId);
  return null;
}

/** Human-readable list of valid message refs, for error messages. */
export function listValidMsgRefs(history: SignedMessage[]): string[] {
  return history.map((m, i) => {
    const h = docHash(m);
    return `m${i + 1} = ${m.type} (${h.slice(0, 26)}…)`;
  });
}

/** Human-readable list of valid evidence refs, for error messages. */
export function listValidEvidenceRefs(evidence: SignedEvidence[]): string[] {
  return evidence.map((e, i) => {
    const h = docHash(e);
    const title = e.title.length > 30 ? e.title.slice(0, 30) + "…" : e.title;
    return `e${i + 1} = ${e.tier}-tier "${title}" (${h.slice(0, 26)}…)`;
  });
}
