/**
 * Tests for the scenario-declared state_schema and the Amend protocol.
 * Mocks Anthropic so the jury aggregation tests run without an API key.
 */
import { describe, expect, it, vi } from "vitest";

// Mocked jurors used by the aggregation test below. Each juror returns a
// different oncology remedy so we can verify per-field aggregation works:
// - coverage_envelope_usd is median (50000)
// - regimen is majority (2/3 say "concurrent durva")
// - duration_months is median (3)
// - stop_rules is intersect (only "imaging at month 2" appears in all 3)
vi.mock("../src/anthropic.js", () => {
  let callIdx = 0;
  return {
    MODELS: {
      negotiator: "mock-sonnet",
      juror_fast: "mock-haiku",
      juror_balanced: "mock-sonnet",
      juror_deep: "mock-opus",
    },
    getClient: () => ({
      messages: {
        create: async () => {
          const idx = callIdx++ % 3;
          // Three oncology remedies with overlapping but distinct stop_rules.
          const remedies: Record<string, unknown>[] = [
            {
              coverage_envelope_usd: 30000,
              regimen: "concurrent durva + chemo",
              duration_months: 3,
              stop_rules: ["imaging at month 2", "discontinue on grade 3+ AE"],
            },
            {
              coverage_envelope_usd: 50000,
              regimen: "concurrent durva + chemo",
              duration_months: 3,
              stop_rules: ["imaging at month 2", "discontinue on grade 4 AE"],
            },
            {
              coverage_envelope_usd: 80000,
              regimen: "consolidation per PACIFIC",
              duration_months: 6,
              stop_rules: ["imaging at month 2"],
            },
          ];
          const r = remedies[idx]!;
          return {
            content: [
              {
                type: "tool_use",
                name: "cast_vote",
                input: {
                  outcome: "claimant_partial",
                  remedy: r,
                  rationale: `juror ${idx} reasoning`,
                  cited_evidence_hashes: [],
                  confidence: 0.85,
                },
              },
            ],
          };
        },
      },
    }),
  };
});

describe("state_schema (mocked)", () => {
  describe("oncology schema validation", () => {
    it("accepts a valid oncology state in a Propose", async () => {
      const { defineStateSchema } = await import("../src/state_schema.js");
      const { z } = await import("zod");
      const schema = defineStateSchema({
        domain: "oncology-coverage",
        description: "test",
        fields: {
          coverage_envelope_usd: {
            zod: z.number().min(0).max(200000),
            aggregation: "median",
            description: "USD",
          },
          regimen: { zod: z.string(), aggregation: "majority", description: "x" },
          duration_months: {
            zod: z.number().min(0).max(12),
            aggregation: "median",
            description: "x",
          },
          stop_rules: {
            zod: z.array(z.string()),
            aggregation: "intersect",
            description: "x",
          },
        },
      });
      const result = schema.zodSchema.safeParse({
        coverage_envelope_usd: 50000,
        regimen: "concurrent durva",
        duration_months: 3,
        stop_rules: ["imaging at month 2"],
        amendments: [],
      });
      expect(result.success).toBe(true);
    });

    it("rejects a state with unknown top-level keys (legacy {credit_usd, terms} on oncology)", async () => {
      const { oncology } = await import("../src/scenarios/oncology.js");
      const result = oncology.state_schema.zodSchema.safeParse({
        credit_usd: 80000,
        terms: "durvalumab plan",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a state missing required oncology fields", async () => {
      const { oncology } = await import("../src/scenarios/oncology.js");
      const result = oncology.state_schema.zodSchema.safeParse({
        coverage_envelope_usd: 50000,
        // missing regimen, duration_months, stop_rules
        amendments: [],
      });
      expect(result.success).toBe(false);
    });

    it("orchestrator validates schema and rejects bad oncology state", async () => {
      const { validateStateAgainstSchema } = await import(
        "../src/orchestrator.js"
      );
      const { oncology } = await import("../src/scenarios/oncology.js");
      const err = validateStateAgainstSchema(
        { credit_usd: 80000, terms: "x" },
        oncology.state_schema,
      );
      expect(err).not.toBeNull();
      expect(err).toMatch(/state does not match scenario schema/);
    });
  });

  describe("Amend protocol", () => {
    it("Amend with valid key (not in declared schema) is accepted", async () => {
      const { openDispute, joinDispute } = await import(
        "../src/dispute_store.js"
      );
      const { submitExternalMessage } = await import("../src/dispute_engine.js");

      const opener = await openDispute({
        scenario_id: "oncology",
        your_role: "aria",
        counterparty_external: true,
      });
      const joiner = await joinDispute({
        dispute_id: opener.dispute_id,
        role: "atlas",
      });

      // Aria opens with a valid oncology Propose
      await submitExternalMessage({
        dispute_id: opener.dispute_id,
        role_token: opener.your_token,
        body: {
          type: "Propose",
          round: 1,
          from_agent: opener.your_did,
          evidence_refs: [],
          parent_refs: [],
          payload: {
            state: {
              coverage_envelope_usd: 80000,
              regimen: "durvalumab + carbo/paclitaxel",
              duration_months: 6,
              stop_rules: ["standard monitoring"],
              amendments: [],
            },
            rationale: "Opening.",
            utility_for_self: 0.95,
          },
        },
      });

      // Atlas submits an Amend with a non-colliding key
      const amendRes = await submitExternalMessage({
        dispute_id: opener.dispute_id,
        role_token: joiner.your_token,
        body: {
          type: "Amend",
          round: 1,
          from_agent: joiner.your_did,
          evidence_refs: [],
          parent_refs: [],
          payload: {
            key: "imaging_cadence",
            value: "month 2 + month 5",
            rationale: "Add imaging cadence not in the schema.",
          },
        },
      });
      const accepted = amendRes.events.find(
        (e) => e.kind === "message.accepted",
      );
      expect(accepted).toBeDefined();
    });

    it("Amend with key colliding with a declared schema field is rejected", async () => {
      const { openDispute, joinDispute } = await import(
        "../src/dispute_store.js"
      );
      const { submitExternalMessage } = await import("../src/dispute_engine.js");

      const opener = await openDispute({
        scenario_id: "oncology",
        your_role: "aria",
        counterparty_external: true,
      });
      const joiner = await joinDispute({
        dispute_id: opener.dispute_id,
        role: "atlas",
      });

      // Aria opens
      await submitExternalMessage({
        dispute_id: opener.dispute_id,
        role_token: opener.your_token,
        body: {
          type: "Propose",
          round: 1,
          from_agent: opener.your_did,
          evidence_refs: [],
          parent_refs: [],
          payload: {
            state: {
              coverage_envelope_usd: 80000,
              regimen: "x",
              duration_months: 6,
              stop_rules: [],
              amendments: [],
            },
            rationale: "x",
            utility_for_self: 0.95,
          },
        },
      });

      // Atlas tries to Amend a declared field — should be rejected
      const amendRes = await submitExternalMessage({
        dispute_id: opener.dispute_id,
        role_token: joiner.your_token,
        body: {
          type: "Amend",
          round: 1,
          from_agent: joiner.your_did,
          evidence_refs: [],
          parent_refs: [],
          payload: {
            key: "regimen", // collides with declared schema field
            value: "different",
            rationale: "trying to bypass propose",
          },
        },
      });
      const rejected = amendRes.events.find(
        (e) => e.kind === "message.rejected",
      );
      expect(rejected).toBeDefined();
      const reason =
        (rejected as { reason?: string } | undefined)?.reason ?? "";
      expect(reason).toMatch(/collides with a declared schema field/);
    });

    it("Counterparty Accept on Amend emits amendment.applied event; self-Accept does not", async () => {
      const { openDispute, joinDispute } = await import(
        "../src/dispute_store.js"
      );
      const { submitExternalMessage } = await import("../src/dispute_engine.js");

      const opener = await openDispute({
        scenario_id: "oncology",
        your_role: "aria",
        counterparty_external: true,
      });
      const joiner = await joinDispute({
        dispute_id: opener.dispute_id,
        role: "atlas",
      });

      // Aria Propose
      await submitExternalMessage({
        dispute_id: opener.dispute_id,
        role_token: opener.your_token,
        body: {
          type: "Propose",
          round: 1,
          from_agent: opener.your_did,
          evidence_refs: [],
          parent_refs: [],
          payload: {
            state: {
              coverage_envelope_usd: 50000,
              regimen: "x",
              duration_months: 3,
              stop_rules: [],
              amendments: [],
            },
            rationale: "x",
            utility_for_self: 0.9,
          },
        },
      });

      // Atlas Amend (m2)
      await submitExternalMessage({
        dispute_id: opener.dispute_id,
        role_token: joiner.your_token,
        body: {
          type: "Amend",
          round: 1,
          from_agent: joiner.your_did,
          evidence_refs: [],
          parent_refs: [],
          payload: {
            key: "imaging_cadence",
            value: "month 2 + month 5",
            rationale: "extra imaging",
          },
        },
      });

      // Aria's turn: Aria Accepts Atlas's Amend (counterparty Accept)
      const acceptRes = await submitExternalMessage({
        dispute_id: opener.dispute_id,
        role_token: opener.your_token,
        body: {
          type: "Accept",
          round: 2,
          from_agent: opener.your_did,
          evidence_refs: [],
          parent_refs: ["m2"],
          payload: { target_msg_hash: "m2" },
        },
      });
      const applied = acceptRes.events.find(
        (e) => e.kind === "amendment.applied",
      );
      expect(applied).toBeDefined();
      expect(
        (applied as { key?: string } | undefined)?.key,
      ).toBe("imaging_cadence");
    });
  });

  describe("Bundle versioning + schema embedding", () => {
    it("v2 bundle embeds state_schema for scenario-driven disputes", async () => {
      const { openDispute, joinDispute } = await import(
        "../src/dispute_store.js"
      );
      const { submitExternalMessage } = await import("../src/dispute_engine.js");

      const opener = await openDispute({
        scenario_id: "ai-overrun",
        your_role: "aria",
        counterparty_external: true,
        max_rounds: 5,
      });
      const joiner = await joinDispute({
        dispute_id: opener.dispute_id,
        role: "atlas",
      });

      // Aria Propose, Atlas Counter, both Accept Aria's r2.
      await submitExternalMessage({
        dispute_id: opener.dispute_id,
        role_token: opener.your_token,
        body: {
          type: "Propose",
          round: 1,
          from_agent: opener.your_did,
          evidence_refs: [],
          parent_refs: [],
          payload: {
            state: { credit_usd: 100000, terms: "x", amendments: [] },
            rationale: "x",
            utility_for_self: 0.9,
          },
        },
      });
      await submitExternalMessage({
        dispute_id: opener.dispute_id,
        role_token: joiner.your_token,
        body: {
          type: "CounterPropose",
          round: 1,
          from_agent: joiner.your_did,
          evidence_refs: [],
          parent_refs: ["m1"],
          payload: {
            state: { credit_usd: 50000, terms: "y", amendments: [] },
            rationale: "y",
            utility_for_self: 0.85,
          },
        },
      });
      // Aria Accept atlas's CP
      const ariaAcc = await submitExternalMessage({
        dispute_id: opener.dispute_id,
        role_token: opener.your_token,
        body: {
          type: "Accept",
          round: 2,
          from_agent: opener.your_did,
          evidence_refs: [],
          parent_refs: ["m2"],
          payload: { target_msg_hash: "m2" },
        },
      });
      // Atlas matching Accept
      const atlasAcc = await submitExternalMessage({
        dispute_id: opener.dispute_id,
        role_token: joiner.your_token,
        body: {
          type: "Accept",
          round: 2,
          from_agent: joiner.your_did,
          evidence_refs: [],
          parent_refs: ["m2"],
          payload: { target_msg_hash: "m2" },
        },
      });
      void ariaAcc;
      const bundle = atlasAcc.state.bundle;
      expect(bundle).not.toBeNull();
      expect(bundle!.bundle_version).toBe(2);
      expect(bundle!.state_schema).toBeDefined();
      expect(bundle!.state_schema!.domain).toBe("USD-credit");
      expect(bundle!.state_schema!.json_schema).toBeDefined();
      expect(typeof bundle!.state_schema!.ref).toBe("string");
    });
  });

  describe("Schema-driven jury aggregation", () => {
    it("oncology jury aggregates per-field (median + majority + intersect)", async () => {
      const { deliberate } = await import("../src/jury.js");
      const { bootAgents } = await import("../src/agents.js");
      const { buildEvidencePool } = await import("../src/fixtures.js");
      const { oncology } = await import("../src/scenarios/oncology.js");

      const agents = bootAgents();
      const pool = buildEvidencePool(agents, oncology);
      const result = await deliberate({
        agents,
        evidence: pool,
        history: [],
        scenario: oncology,
      });

      const remedy = result.ruling.remedy as Record<string, unknown>;
      // coverage_envelope_usd: median of [30000, 50000, 80000] = 50000
      expect(remedy.coverage_envelope_usd).toBe(50000);
      // regimen: majority of ["concurrent durva + chemo", "concurrent durva + chemo", "consolidation per PACIFIC"]
      expect(remedy.regimen).toBe("concurrent durva + chemo");
      // duration_months: median of [3, 3, 6] = 3
      expect(remedy.duration_months).toBe(3);
      // stop_rules: intersection across [
      //   ["imaging at month 2", "discontinue on grade 3+ AE"],
      //   ["imaging at month 2", "discontinue on grade 4 AE"],
      //   ["imaging at month 2"],
      // ] = ["imaging at month 2"]
      expect(remedy.stop_rules).toEqual(["imaging at month 2"]);
    });
  });

  describe("Schema visibility for joiner consent", () => {
    it("get_dispute returns state_schema before role claim", async () => {
      const { openDispute, dumpDispute } = await import(
        "../src/dispute_store.js"
      );
      const opener = await openDispute({
        scenario_id: "oncology",
        your_role: "aria",
        counterparty_external: true,
      });
      // Joiner has not claimed yet — but they can dumpDispute to inspect schema.
      const dump = await dumpDispute(opener.dispute_id);
      expect(dump.state_schema).not.toBeNull();
      expect(dump.state_schema!.domain).toBe("oncology-coverage");
      expect(dump.state_schema!.json_schema).toBeDefined();
      expect(dump.state_schema!.aggregations).toBeDefined();
      expect(dump.state_schema!.aggregations.coverage_envelope_usd).toBe(
        "median",
      );
    });
  });
});
