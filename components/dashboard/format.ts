/** Pure formatters used across dashboard components. */

export function shortDid(did: string, head = 12, tail = 4): string {
  if (!did) return "";
  if (did.length <= head + tail + 1) return did;
  return `${did.slice(0, head)}…${did.slice(-tail)}`;
}

export function shortHash(h: string, head = 10): string {
  if (!h) return "";
  const trimmed = h.startsWith("sha256:") ? h.slice(7) : h;
  return trimmed.slice(0, head);
}

export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "·";
  const diff = Math.max(0, Math.floor((now - t) / 1000));
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function timeOfDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "·";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function partyLabel(role: "aria" | "atlas", scenarioId: string | null) {
  // Stable role naming that doesn't depend on scenario meta — keeps the
  // dashboard generic for schema-less disputes too.
  if (role === "aria") return "Aria";
  return "Atlas";
}

export function partyKind(role: "aria" | "atlas") {
  return role === "aria" ? "claimant" : "respondent";
}

/** Extract the (key, value) pairs of a DealState regardless of whether the
 *  backend serializes it flat (`{credit_usd, terms}`) or wrapped in a
 *  `{domain, tiers}` envelope. Always returns a stable key/value list. */
export function readStateTiers(
  state: unknown,
): Array<[string, unknown]> {
  if (!state || typeof state !== "object") return [];
  const s = state as Record<string, unknown>;
  if (s.tiers && typeof s.tiers === "object") {
    return Object.entries(s.tiers as Record<string, unknown>);
  }
  return Object.entries(s).filter(([k]) => k !== "domain" && k !== "tiers");
}
