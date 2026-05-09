import { describe, expect, it } from "vitest";
import { canonicalize, canonicalBytes, hash } from "../src/canonical";

describe("canonical (mocked)", () => {
  it("orders object keys lexicographically", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("emits no whitespace", () => {
    const out = canonicalize({ x: [1, 2, 3], y: { z: "v" } });
    expect(out).not.toMatch(/[\s]/);
  });

  it("is stable across key insertion order", () => {
    const a = canonicalize({ alpha: 1, beta: 2, gamma: { d: 4, c: 3 } });
    const b = canonicalize({ gamma: { c: 3, d: 4 }, beta: 2, alpha: 1 });
    expect(a).toBe(b);
  });

  it("produces matching bytes", () => {
    const obj = { a: 1, b: "x" };
    const expected = '{"a":1,"b":"x"}';
    expect(new TextDecoder().decode(canonicalBytes(obj))).toBe(expected);
  });

  it("hash is deterministic and prefixed", () => {
    const h = hash({ x: 1, y: 2 });
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(hash({ y: 2, x: 1 })).toBe(h);
  });

  it("hash differs for different content", () => {
    expect(hash({ x: 1 })).not.toBe(hash({ x: 2 }));
  });

  it("rejects non-serializable values", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalize(cyclic)).toThrow();
  });
});
