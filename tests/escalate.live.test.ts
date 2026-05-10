import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { docHash, verifySignedDoc } from "../src/sign";
import { hash as hashOf } from "../src/canonical";
import { loadEnv } from "../src/env";
import { openDispute, joinDispute } from "../src/dispute_store";
import { submitExternalMessage } from "../src/dispute_engine";

loadEnv();
const HAS_KEY = !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!HAS_KEY)("party-driven Escalate (live jury)", () => {
  it(
    "Escalate via submit_message triggers the real Tribunal jury and produces a verifiable ruling bundle",
    async () => {
      // Both sides external, max_rounds=5. Schema-less so no scenario template
      // drives the moves — we drive them directly.
      const opener = await openDispute({
        context_summary: "Test dispute",
      claim:
          "Live escalation routing test: aria opens a low offer, atlas escalates instead of negotiating.",
        your_role: "aria",
        counterparty_external: true,
        max_rounds: 5,
      });
      const joiner = await joinDispute({
        dispute_id: opener.dispute_id,
        role: "atlas",
      });

      // Round 1: aria opens with a Propose so atlas has something to escalate against.
      const proposeRes = await submitExternalMessage({
        dispute_id: opener.dispute_id,
        role_token: opener.your_token,
        body: {
          type: "Propose",
          summary: "test move",
          round: 1,
          from_agent: opener.your_did,
          evidence_refs: [],
          parent_refs: [],
          payload: {
            state: { credit_usd: 10000, terms: "minimal credit, no commitments" },
            rationale: "Opening lowball offer.",
            utility_for_self: 0.95,
          },
        },
      });
      expect(proposeRes.state.finalized).toBe(false);
      expect(proposeRes.state.turn).toBe("atlas");

      // Atlas escalates. This is what we're validating end-to-end.
      const escRes = await submitExternalMessage({
        dispute_id: opener.dispute_id,
        role_token: joiner.your_token,
        body: {
          type: "Escalate",
          summary: "test move",
          round: 1,
          from_agent: joiner.your_did,
          evidence_refs: [],
          parent_refs: ["m1"],
          payload: {
            reason:
              "counterparty offer of $10k credit is below our reservation; no realistic counter exists.",
            requested_action: "mediator",
          },
        },
      });

      const kinds = escRes.events.map((e) => e.kind);
      expect(kinds).toContain("message.accepted");
      expect(kinds).toContain("escalation");
      expect(kinds).toContain("jury.ruled");
      expect(kinds).toContain("bundle.built");

      const escEvent = escRes.events.find((e) => e.kind === "escalation") as
        | { kind: "escalation"; reason: string }
        | undefined;
      expect(escEvent?.reason).toMatch(/^escalation_by_atlas:/);

      expect(escRes.state.finalized).toBe(true);
      const bundle = escRes.state.bundle!;
      expect(bundle).not.toBeNull();
      expect(bundle.outcome.kind).toBe("ruling");

      if (bundle.outcome.kind !== "ruling") {
        throw new Error("expected ruling outcome");
      }

      // 3 jurors, each producing a signed Vote.
      expect(bundle.outcome.votes).toHaveLength(3);
      const jurorNames = bundle.outcome.votes.map((v) => v.juror).sort();
      expect(jurorNames).toEqual(["Aequitas", "Utilis", "Velox"]);
      for (const v of bundle.outcome.votes) {
        expect(verifySignedDoc(v), `vote ${v.juror} verifies`).toBe(true);
        expect(typeof v.outcome).toBe("string");
        expect(v.confidence).toBeGreaterThanOrEqual(0);
        expect(v.confidence).toBeLessThanOrEqual(1);
      }

      // The signed Ruling must verify and reference all 3 votes by hash.
      expect(verifySignedDoc(bundle.outcome.ruling)).toBe(true);
      expect(bundle.outcome.ruling.cited_votes).toEqual(
        bundle.outcome.votes.map((v) => docHash(v)),
      );

      // The Escalate must be present in the signed history.
      const escMsgs = bundle.messages.filter((m) => m.type === "Escalate");
      expect(escMsgs).toHaveLength(1);
      expect(verifySignedDoc(escMsgs[0]!)).toBe(true);

      // Every message in the bundle verifies individually.
      for (const m of bundle.messages) {
        expect(verifySignedDoc(m), `msg ${docHash(m)} verifies`).toBe(true);
      }

      // Bundle root_hash + root_hash_jcs both consistent.
      const { root_hash, root_hash_jcs, ...rest } = bundle;
      expect(hashOf(rest)).toBe(root_hash);
      if (typeof root_hash_jcs === "string") {
        expect(hashOf(JSON.parse(root_hash_jcs))).toBe(root_hash);
      }

      mkdirSync("tmp", { recursive: true });
      writeFileSync(
        "tmp/last-escalate-run.json",
        JSON.stringify(bundle, null, 2),
      );
    },
    180_000,
  );
});
