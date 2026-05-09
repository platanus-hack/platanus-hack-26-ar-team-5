# Pacta

> Trust protocol for AI agents in dispute. Negotiate, deliberate, conciliate, with cryptographic audit trail.

<img src="./project-logo.png" alt="Pacta" width="160" />

**Track:** 🛸 Future — Platanus Hack 26 (Buenos Aires)
**Team:** Juan Francisco Lebrero ([@frizynn](https://github.com/frizynn)) · Micol Sarah Michanie ([@micmich05](https://github.com/micmich05)) · Facundo Viñas Canale ([@FacuVCanale](https://github.com/FacuVCanale))

---

## What Pacta is

The agentic stack got two-thirds of the protocol right. **A2A** standardized how agents discover and talk to each other; **MCP** standardized how they invoke tools; **ERC-8004** is converging on identity and reputation. None of those define **how two agents with structurally divergent utilities reach an auditable agreement**.

That is Pacta. It is the conciliation layer.

Two agents — one with technical expertise, one with contractual or regulatory authority — negotiate over a multi-dimensional state space. They cite cryptographically signed evidence, exchange structured offers under a *compromise bound* (utility monotonically non-increasing), and either converge or escalate to a heterogeneous LLM jury. Every message is signed Ed25519 over RFC 8785 canonical JSON. The output is a content-addressed DAG that anyone can verify.

> **Pacta is a deliberation protocol, not a payment protocol.** Settlement of money — x402, AP2, escrow, Stripe — is a downstream integration, not part of the core. The product is the conversation and its audit trail.

---

## The three verbs

```ts
import { runPacta } from "pacta";

// Negotiate: round-robin Propose / Critique / CounterPropose / Reveal / Accept
// with compromise-bound enforcement and signed audit trail.
for await (const event of runPacta({ scenario: "ai-overrun" })) {
  console.log(event);
}

// Deliberate: when negotiation deadlocks, three heterogeneous LLM jurors
// (Aequitas / Utilis / Velox) cast structured votes citing evidence by hash.
// Majority outcome, median remedy, signed by the Tribunal key.

// Conciliate: produce a signed Bundle (DAG of evidence + messages + ruling)
// that any third party can verify with a single Ed25519 check.
```

---

## The flagship demo case

**AI inference cost overrun.** A SaaS customer agent (Aria, FinOps role) and an AI provider's account agent (Atlas, account+reliability role) negotiate over a USD 180 000 overage claim caused by a silent model-version regression.

| | |
|---|---|
| **Aria** (Customer) | Has the MSA committed-spend amendment, internal benchmarks, provider-signed retry logs, the public changelog. Wants credit + a structural fix. |
| **Atlas** (Provider) | Has ToS §8.2 (model bumps with 14d notice), public SLA (uptime + latency only), zero support tickets, eval API release notes. Wants to honour SLAs without precedent-setting payouts. |

Evidence is pre-classified by **tier**: `S` (cryptographically self-verifiable like signed contracts and provider logs), `A` (third-party verifiable like public papers and changelogs), `B` (self-emitted internal policies — weighted less). The jury weighs evidence by tier explicitly.

Convergence target (the rounds find it; it is not hardcoded): **USD 90 000 credit + alerts opt-in + customer commits to the eval API at next renewal**. Neither extreme; a hybrid no human had drafted in advance.

The **same structural pattern** also applies to:

- **Healthcare authorization** — hospital agent vs. health insurer agent over a treatment protocol (canonical case: NSCLC IIIB, durvalumab regimen).
- **Software supply chain** — pentest vendor's agent vs. SaaS company's agent over an SLA-bound vulnerability fix.
- **Regulatory compliance** — auditor agent vs. regulated entity's agent over interpretation of a control.

Same shape: organization with technical expertise vs. organization with contractual authority, divergent utilities, evidence stratified by verifiability, hybrid convergence is the productive outcome.

---

## Quickstart

Requires Node ≥ 20 and pnpm.

```bash
git clone https://github.com/frizynn/platanus-hack-26-ar-team-5
cd platanus-hack-26-ar-team-5
pnpm install
cp .env.example .env.local           # add your ANTHROPIC_API_KEY
pnpm run demo                         # live demo with Claude
pnpm verify tmp/last-run.json         # audit every signature
```

Without an API key, the demo falls back to a deterministic mock driver so the protocol mechanics still ship:

```bash
pnpm run demo --mock                  # deterministic, no LLM calls, ~1s
```

### What you should see

```
⚖  Pacta — Trust protocol for AI agents in dispute
Case: AI inference cost overrun (Aria @ Customer ↔ Atlas @ Provider)

  ✓ Aria   did:key:z6MkuU8…Fb5393
  ✓ Atlas  did:key:z6MkvZm…qUyjLS
  ✓ Tribu  did:key:z6Mkiap…qmzYKb

Loading evidence pool…
  [S]  sha256:c8fe827…a2  msa-3.4
  [A]  sha256:c816daa…9d  bench-lm-eval
  [S]  sha256:4d21f86…87  api-logs-retry
  [A]  sha256:a0281b4…23  changelog-x.z
  [S]  sha256:a6146db…ca  tos-8.2
  [B]  sha256:61d1261…d2  policy-um-v3.2026
  [S]  sha256:c0d7b63…d2  support-tickets
  [S]  sha256:9e76628…2c  sla-public
  [A]  sha256:2ca77d9…9f  eval-api-release
  All 9 items signed and content-addressed ✓

— Round 1 ─────────────────────────────────
  ▶ Aria   Propose         sha256:ceb4d7d…58  Ed25519 ✓
        state: { credit_usd: $180,000, terms: "full overage refund" }
  ▶ Atlas  CounterPropose  sha256:d90c9ce…74  Ed25519 ✓
        state: { credit_usd: $0, terms: "case closed per ToS §8.2 + no support tickets filed" }

…rounds 2–4…

✅  CONVERGED  in 4 rounds (12.3s wall)
   Final state: { credit_usd: $90,000, terms: "credit + alerts opt-in + customer commits to eval API in next renewal" }
   Bundle root hash: sha256:3970164…2f
   Saved bundle: tmp/last-run.json   verify with: pnpm verify tmp/last-run.json
```

### Production endpoint

The same library is exposed as a Vercel serverless function:

```bash
curl -N -X POST https://<your-deploy>.vercel.app/api/negotiation \
  -H 'content-type: application/json' -d '{}'
```

NDJSON streams back, one event per line. Set `?mock=1` to force the deterministic driver.

---

## Tests

```bash
pnpm test            # 27 tests, including jury mock and orchestrator e2e
pnpm test:mocked     # only the deterministic ones (no API key needed)
pnpm typecheck       # tsc --noEmit
```

The live LLM test (`tests/scenario.live.test.ts`) is automatically skipped when `ANTHROPIC_API_KEY` is unset. When set, it runs the full 4-round AI-overrun negotiation against real Claude and asserts every produced message verifies and every cited evidence hash is real.

---

## Architecture

```
src/
  canonical.ts     RFC 8785 (JCS) canonical JSON + sha256 content-addressing
  crypto.ts        Ed25519 sign/verify (@noble/ed25519, @noble/hashes)
  did.ts           did:key (multibase base58btc + multicodec 0xed01) round-trip
  sign.ts          signDoc / verifySignedDoc / docHash helpers
  types.ts         The 6 message primitives, Evidence (S/A/B/C tiers),
                   Vote, Ruling, Bundle
  agents.ts        Boot Aria + Atlas + Tribunal at runtime
  fixtures.ts      9 evidence items pre-signed for the AI-overrun case
  orchestrator.ts  Round-robin loop with compromise bound, reveal monotonicity,
                   evidence-ref validation, convergence detection, deadlock
                   detection, escalation
  prompts.ts       ARIA_SYSTEM, ATLAS_SYSTEM, TOOLS for Anthropic
  claude_driver.ts Real Claude LLM driver (tool_use)
  mock_driver.ts   Deterministic offline driver
  jury.ts          Three heterogeneous personas (Aequitas/Utilis/Velox)
                   running on Sonnet 4.5 / Opus 4.5 / Haiku 4.5
  pacta.ts         Public API: runPacta() generator → Bundle

api/
  negotiation.ts   Vercel serverless: NDJSON stream of all events
  health.ts        Liveness probe with key presence

examples/cli-demo.ts   The "live demo" — runs against Claude or mock
scripts/verify.ts      Independent bundle verifier, exit 0 if all sigs valid
```

---

## Roadmap

The protocol surface today is the deliberate MVP cut. The full Pacta vision lives in [`FUTURE.md`](./FUTURE.md). Snapshot:

- **Pacta Lite** (rule-based, instant, free): structured disputes where the verdict is computable from on-chain / signed sources.
- **Pacta Standard** (3-LLM jury, what ships today): heterogeneous panel with structured outputs, evidence tiering.
- **Pacta Pro** (argumentation graph): LLM extracts claims and attack relations; the verdict is the grounded extension of a Dung framework — deterministic on the extraction.

What ships today and what does not is documented honestly in [`MILESTONE1.md`](./MILESTONE1.md).

---

## Status

**Hackathon MVP.** This is a 3-hour build for Platanus Hack 26 (Future track). The cryptography is real, the negotiation is real, the audit trail is real. Storage is in-memory per run. There is no payment integration by design. See `MILESTONE1.md` for the exact line between what is real and what is mocked.

Apache-2.0 licensed. Spec-aligned. Friendly to A2A, MCP, ERC-8004 downstream.
