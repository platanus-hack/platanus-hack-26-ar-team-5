# Milestone 1 — Hackathon MVP

What we built in the 3-hour Platanus Hack 26 window. Honest line between real and mocked.

## What ships, end-to-end

A self-contained TypeScript implementation of a deliberation / negotiation / conciliation protocol between two AI agents, scenario-driven so adding a new domain is a single file. Three canonical scenarios bundled, all live-validated against Claude. CLI demo, Vercel serverless endpoint, 32 mocked tests, an externally-runnable verifier.

## Scenarios shipped + live-validated against Claude

| id | Roles | Convergence reached live | Rounds | Bundle sigs |
|---|---|---|---|---|
| `ai-overrun` | Aria (FinOps) ↔ Atlas (AI Provider Account) | USD 95k credit + Eval API alerts opt-in at next renewal | 5 | 17 / 17 |
| `oncology` | Aurora (Hospital authorization) ↔ Cobra (Insurer adjudication) | 3-month upfront durva + RECIST reassessment + stopping criteria | 4 | 17 / 17 |
| `cve-disclosure` | Hedge (OSS maintainer) ↔ Bastion (Corporate consumer) | USD 25k Premium renewal + 14-day pre-disclosure + joint policy doc | 3 | 16 / 16 |

All three reached **non-trivial hybrid convergence** that no single party had drafted in advance — the rounds produced the deal. Adding a fourth scenario is one file in `src/scenarios/`.

```
pnpm install
cp .env.example .env.local                # add ANTHROPIC_API_KEY
pnpm test                                 # 27 tests pass (incl. live skipped if no key)
pnpm run demo                             # ~12s with Claude / ~1s with --mock
pnpm verify tmp/last-run.json             # validates every signature and the root hash
```

### The pieces, in order

1. **JCS canonicalization (RFC 8785)** — every signable artifact is converted to the canonical JSON form before hashing or signing. Tests check stability across key reordering. Uses the `canonicalize` library wrapped in `src/canonical.ts`.

2. **Ed25519 signing and verification** — `@noble/ed25519` v3 with `@noble/hashes` sha512 wired in. 32-byte private key, 32-byte public key, 64-byte signature. Tests cover happy path + tampering on the signature, message, and public key.

3. **`did:key` identity** — multicodec `0xed01` + base58btc-encoded prefix, plus a clean reverse resolver. Each agent (Aria, Atlas, Tribunal) gets a fresh keypair on boot and a stable DID for the run. Tests cover round-tripping and rejection of malformed DIDs.

4. **Six message primitives** — `Propose`, `Critique`, `CounterPropose`, `Accept`, `Reveal`, `Escalate`. Each carries `evidence_refs` and `parent_refs` (sha256 hashes), a `payload` typed by message kind, and a `proof` (Ed25519 signature). Encoded as Anthropic tools so the LLM emits exactly one structured message per turn.

5. **Nine pieces of evidence** for the AI-overrun case, pre-classified by tier:
   - Tier S (cryptographically self-verifiable): MSA §3.4, provider-signed API logs, ToS §8.2, support records, public SLA.
   - Tier A (third-party verifiable): internal lm-eval-harness benchmark, public model changelog, eval API release notes.
   - Tier B (self-emitted, weighted less): provider's internal utilization mgmt policy.
   Each item is signed at boot by the appropriate agent.

6. **Orchestrator** with the protocol invariants:
   - Round-robin alternation Aria → Atlas, up to 5 rounds.
   - Validates: `from_agent` matches the active role; `evidence_refs` exist in the pool; `parent_refs` are known message hashes; `Accept` targets a real Propose/CounterPropose hash.
   - **Compromise bound**: each agent's `utility_for_self` must be `≤` their previous Propose/CounterPropose utility. Violations are rejected.
   - **Reveal monotonicity**: a `domain` may be revealed only once per agent.
   - Convergence: ≥ 2 distinct agents Accept the same target hash.
   - Deadlock: aggregate utility flat for `deadlockFlatRounds` — escalates.
   - One retry per turn on validation failure; otherwise the agent forfeits the slot.

7. **LLM drivers**:
   - `claude_driver.ts` — real Anthropic SDK, model `claude-sonnet-4-5`, tool_use forced (`tool_choice: any, disable_parallel_tool_use: true`). Receives the full evidence catalog and signed history each turn.
   - `mock_driver.ts` — deterministic scripted replay of the canonical 4-round scenario. Lets the demo run without any API key.

8. **Jury fallback (Tribunal)** — three personas with different bias prompts running in parallel on three different Claude generations:
   - Aequitas (fairness) — `claude-sonnet-4-5`
   - Utilis (efficiency) — `claude-opus-4-5`
   - Velox (speed) — `claude-haiku-4-5`
   Each casts a vote via the `cast_vote` tool. We aggregate by majority outcome + median remedy, sign the ruling with the Tribunal key, and validate that every cited evidence hash exists in the pool (silently filtered otherwise).

9. **Bundle assembly** — final artifact is a content-addressed DAG: every signed evidence, every signed message, the convergence outcome (or jury votes + signed ruling), plus a `root_hash` over the canonical bundle minus the hash itself.

10. **Independent verifier** — `pnpm verify <bundle.json>` re-canonicalizes every signed doc, re-checks every Ed25519 signature, and validates the bundle root hash. The hash check uses the embedded `root_hash_jcs` (canonical-JCS bytes) when present — that path is byte-deterministic and survives any number of JSON round-trips through transport / storage / serialization. The MCP `verify_bundle` tool follows the same algorithm, so CLI and remote verification produce identical results. 18/18 checks pass on a successful demo run.

11. **Vercel function** — `api/negotiation.ts` exposes `runPacta` as an NDJSON stream over HTTP, with `maxDuration: 60`, Node 22 runtime (required for `@noble/ed25519`). `?mock=1` to force the offline driver.

## Test inventory

| Test file | Count | Coverage |
|---|---:|---|
| `tests/canonical.test.ts` | 7 | JCS spec, ordering, stability, hash determinism |
| `tests/crypto.test.ts` | 5 | Ed25519 keypair, sign/verify, tampering rejection |
| `tests/did.test.ts` | 4 | `did:key` derivation + resolution + length checks |
| `tests/fixtures.test.ts` | 5 | Evidence pool integrity, every item verifies, tier distribution |
| `tests/orchestrator.mocked.test.ts` | 5 | Happy 4-round path, evidence-ref / compromise / reveal / max-rounds |
| `tests/jury.mocked.test.ts` | 1 | 3-vote aggregation, signed ruling, median remedy |
| `tests/scenario.live.test.ts` | 1 | Full live run against Claude (auto-skipped without key) |

Total: **27 deterministic + 1 live** = 28 tests; all passing.

## What is real

- The 32-byte Ed25519 keys, signatures, and verifications. Independently checkable with any Ed25519 implementation.
- The RFC 8785 canonical JSON over which we sign. Re-canonicalize, recompute the hash, the signature still verifies.
- The DID derivation. Standard `did:key` for Ed25519 — interoperable with W3C DID resolvers.
- The negotiation rounds (with a real LLM key). Two agents emitting structured tool calls, validated against the protocol, are the actual mechanism.
- The jury escalation path (with a real key). Three heterogeneous Claude models on parallel API calls, structured-output votes, signed ruling.
- The bundle DAG and its root hash. Content-addressed, externally verifiable.

## What is mocked or descoped (and why)

- **No payments.** Pacta is, by user-confirmed design, a conciliation protocol, not a settlement rail. Wiring x402 / AP2 / Stripe / escrow is one downstream integration of many — see `FUTURE.md`.
- **Upstash Redis storage when configured.** Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (or the Vercel-assigned `KV_REST_API_*` pair) and dispute state survives across Vercel cold starts and instances — what makes the two-agent BYO MCP flow actually work in production. Without those env vars the storage layer falls back to in-memory `Map` per process (fine for unit tests / single-process CLI). 6h TTL by default. Multi-tenant, replay, and richer lifecycle APIs are FUTURE.
- **Pre-loaded evidence.** The 9 fixtures for the AI-overrun case are baked into the repo. Production would pull from a registry with oracles (TLSNotary, TEE attestation, on-chain commits) and let agents submit fresh evidence per case.
- **No argumentation-graph viz.** The grounded extension of a Dung framework over the message DAG is on the roadmap (Pacta Pro tier). Today the audit trail is JSON, easily re-rendered.
- **No web UI.** This was an explicit scope decision: the demo is terminal-first, validated by tests, exposed as an HTTP API. Adding an inspector / replay UI is FUTURE.
- **No cross-AI mediation.** Running Claude + GPT + Gemini in the jury would harden the panel against prompt injection further. Today we run three Claude generations (Haiku 4.5 / Sonnet 4.5 / Opus 4.5) — heterogeneous in size and architecture but same provider. Cross-provider is FUTURE.
- **`Critique` and `Escalate` work but are exercised less.** The orchestrator validates them; the mock script focuses on `Propose`/`CounterPropose`/`Reveal`/`Accept` because that is the canonical path of the AI-overrun case.
- **Live test runs only with a key.** No anthropic-mock fixture; the live test is a real call against the API, gated on `ANTHROPIC_API_KEY`. CI without a key still runs the 27 deterministic tests.

## How to run it locally (full path)

```bash
pnpm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
pnpm typecheck                            # tsc --noEmit
pnpm test                                 # all 27 + 1 live test
pnpm run demo                             # ~12s end-to-end
pnpm verify tmp/last-run.json             # 18/18 sigs + root hash
```

## How to run it in production

The Vercel function is one default export per file under `api/`. Deploy:

```bash
pnpm dlx vercel link
pnpm dlx vercel env add ANTHROPIC_API_KEY production
pnpm dlx vercel --prod
```

Then:

```bash
curl -N -X POST https://<your-deploy>.vercel.app/api/negotiation \
  -H 'content-type: application/json' -d '{}'
# NDJSON stream of every event, ending with the signed bundle.

curl https://<your-deploy>.vercel.app/api/health
# {"ok":true,"name":"pacta","has_anthropic_key":true,...}
```

## Time budget actually spent

Roughly: scaffold 15 min, crypto/canonical/DID 20 min, agents and 9 evidence fixtures 20 min, orchestrator with mocked tests 40 min, Claude wiring 30 min, jury fallback 15 min, CLI demo + verify 20 min, Vercel function 15 min, README/MILESTONE1/FUTURE 25 min. Total close to the 3-hour budget.

## What we would ship next, in order

See `FUTURE.md`. Top three: a Postgres-backed dispute registry, the Dung argumentation-graph mediator, and an MCP server so external agents can audit live disputes.
