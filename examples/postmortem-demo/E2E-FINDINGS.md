# Pacta MCP — End-to-End Test Findings (2026-05-09)

Real prod test of the Stitcher ↔ Lumea schema-less BYO scenario, driven by two independent Claude subagents, each given only their persona, tokens, and the autonomous-loop instructions.

## TL;DR

**The protocol works.** Two AI agents from different "organizations" reached non-trivial hybrid convergence on a non-monetary dispute over a multi-vendor post-mortem, citing real cryptographic evidence. All Ed25519 signatures (12 evidence + 6 messages) verify individually. Convergence took 3 rounds and is documented in a content-addressed bundle.

**One serious UX bug surfaced**, plus several smaller ergonomic issues, and the docs (README, MILESTONE1, FUTURE) are partially out of date relative to what is now shipped in prod.

## Run summary

| Field | Value |
|---|---|
| dispute_id | `dsp_fc869be60bf16ce227325193` |
| Mode | Schema-less BYO (no scenario template) |
| Roles | `aria` = Stitcher, `atlas` = Lumea |
| Counterparty controller | both `external` (no Pacta-driven side) |
| Rounds used | 3 of 5 |
| Turns total | 6 (aria 3 + atlas 3) |
| Wall time end-to-end | ~25 min (incl. recovery from msg_id confusion) |
| Final outcome | `converged` |
| Accepted msg hash | `sha256:9a8925187cf798f4bd739cd55b0d9f1ec513b063ea7ddbd1239cd94556b7e98b` |
| Bundle root_hash | `sha256:f30675bfff5d7b85c969d1b252cb9f45c5df5dedab89accc6ca3dca56682fa6a` |

Subagents used: 3 in total (Stitcher v1 timed out due to my orchestration mistake; Stitcher v2 + Lumea drove convergence).

## Convergence quality (the part that matters most)

The agreed terms were **strictly stronger than what either side opened with** — the protocol produced the deal:

- **Framing**: aria opened with symmetric "both sides contributed"; atlas pushed for sole upstream cause. Convergence: "**shared coordination gap with primary trigger from upstream signature-rotation timing that did not honor §7.3 of Stitcher's own published contract template**." Neither's draft alone.
- **Notice regime**: aria offered 14-day notice; atlas demanded 30-day or 14-day-with-pre-pub. Convergence: **OR clause** giving Stitcher a real choice — 30-day human notice **or** 14-day human notice + 60-day cryptographic pre-publication of the next public key (industry comparables: APNs, Stripe, GHA OIDC). This is a genuinely creative middle that respects both sides' security committees.
- **Verifier-policy language**: atlas's reservation value held — language explicitly EXCLUDES "aggressive / non-standard / overly strict / industry-deviant" characterization of Lumea's reject-on-unknown-KID policy.
- **Customer disclosure**: aggregate-only, no counts/names — both sides' redline.
- **Publish date**: ≤ 2026-05-12 — both sides' redline.

Every reservation value documented in the system prompts was respected.

## What worked

- **Schema-less BYO mode (`open_dispute` with `claim`)** — the abstract `aria`/`atlas` roles took on Stitcher/Lumea semantics from the claim text and message content, exactly as the README describes.
- **`submit_evidence` + tier coercion** — clean, returns sha256, threads naturally into `evidence_refs`.
- **Compromise-bound enforcement** — the protocol invariant that `utility_for_self` must be monotonically non-increasing on Propose/CounterPropose held throughout.
- **Cross-instance state persistence** — the dispute survived across **multiple separate subagent invocations** spanning ~25 minutes. The recent Upstash Redis swap (commit `d14fb52`) is working in prod even though the README still talks about `globalThis`.
- **`wait_for_turn` server-side blocking** — the right primitive. No agent had to busy-poll.
- **Per-document Ed25519 signature verification** — all 18 docs (12 evidence + 6 messages) verify cleanly via `verify_bundle`, with the right keys, over canonical bytes.
- **Two-AI-agents-never-see-each-other property** — the README's central claim. Both subagents only ever read Pacta's signed audit trail, never each other's reasoning. They still converged.

## Bugs / issues found

Severity is from the perspective of a real third-party agent integrating Pacta.

### 🔴 P0 — `get_dispute` does not expose the content sha256 of history entries

**Symptom.** `parent_refs` and `target_msg_hash` require the content sha256 (canonical-JSON sha256 of the full signed message). `get_dispute` returns each history entry with a `msg_id` field but **no `hash` / `content_hash` / `sha256` / `msg_hash` field**. The two values are different — atlas's first Critique attempt cited `sha256:<msg_id>` and was rejected with `parent_refs unknown`.

**Real cost observed.** Atlas burned ~18 minutes of wall-time and ≥3 subagent retries figuring this out. Lumea's subagent ultimately had to read `src/canonical.ts` + `src/sign.ts` from the local repo, install `canonicalize` from npm, and re-derive the hash by RFC 8785 canonicalization + sha256. **A pure-LLM agent without filesystem and code-execution would be permanently blocked at the first Critique.**

**Fix.** In `get_dispute`, add a `hash: "sha256:<hex>"` field to every entry of `history[]` and `evidence[]`. The server already knows these — `submit_message` returns the hash on the producing side. Mirror it in get_dispute for the consuming side.

**Workaround until fixed.** Document that agents should compute hashes locally via canonical-JSON sha256 of the full signed doc. Reference the algorithm in tool descriptions. Or: have `submit_message` echo the hash back in error messages when validating other people's parent_refs.

### 🟠 P1 — `parent_refs` is silently optional in non-opening rounds

**Symptom.** Stitcher v2 sent a deliberate "probe" message (`terms: "test"`, `rationale: "probe"`, `parent_refs: []`) to discover Pacta's behavior. It was accepted as a real binding round-2 CounterPropose at utility 0.85, advancing the round counter and obligating subsequent moves. Atlas had to thread its real CounterPropose through the probe.

**Risk.** A misbehaving or buggy agent can silently submit junk that locks them in. The compromise bound then restricts them for the rest of the dispute.

**Fix.** Either (a) require non-empty `parent_refs` on any Propose/CounterPropose after round 1, or (b) add a `dry_run: true` flag on `submit_message` that validates without persisting.

### 🟠 P1 — `verify_bundle` fails `root_hash` check after MCP transport

**Symptom.** Both subagents ran `verify_bundle` on the bundle returned by `get_dispute`. **All 18 per-document signatures pass** but the `root_hash` check fails. This is reproducible.

**Why.** The bundle is canonicalized and hashed on the server in its native byte form. When it travels through JSON-RPC over HTTP and back into the MCP tool input, key ordering / whitespace / Unicode normalization can shift, and recomputing canonical-JSON over the in-memory object is not bit-identical to the server's original.

**Cost vs. README's claim.** MILESTONE1.md line 89 ("Independent verifier — `pnpm verify <bundle.json>` re-canonicalizes every signed doc, re-checks every Ed25519 signature, and recomputes the bundle root hash. 18/18 checks pass on a successful demo run.") is true for the **CLI verifier reading bytes from disk**. It is NOT true for the **MCP `verify_bundle` tool round-tripping through JSON-RPC**. The MCP tool says 17/18 (root_hash fails). This is the single biggest gap between the docs and reality from a third-party-integrator perspective.

**Fix options.** (a) Have the server stash the original canonical bytes (or just the canonical hex string) in a side field of the bundle so verifiers can replay. (b) Add a `verify_bundle_structural` mode that only checks per-document signatures (which always survive transport). (c) Document the limitation explicitly in tool description.

### 🟡 P2 — Rejection feedback does not echo expected hashes

**Symptom.** When `parent_refs` is wrong, the error reads `parent_refs unknown: sha256:<your bad hash>` — it tells you what you sent was wrong but doesn't tell you what's right. Combined with P0 above, this leaves an agent guessing.

**Fix.** When `parent_refs` validation fails, include `valid_msg_hashes: [...]` in the error so the agent can self-correct.

### 🟡 P2 — `wait_for_turn` semantics on finalized

**Symptom.** When the dispute finalizes, `wait_for_turn` returns with the message text "it's your turn now (or dispute finalized)" plus the public state including the bundle. The "your turn" phrasing is misleading.

**Fix.** Distinguish two return shapes: `{ kind: "your_turn", state }` vs `{ kind: "finalized", state, bundle }`. Or change the message text to something like "wait_for_turn unblocked: turn=X, finalized=true|false."

### 🟡 P2 — `wait_for_turn` returns the entire dispute on every timeout

**Symptom.** During a long wait (atlas wasn't moving), aria's wait_for_turn returned the full dispute state — including every evidence body and every signature — on each 50-second timeout. For a single agent that's hundreds of lines per heartbeat. Burns context window.

**Fix.** On timeout, return a thin shape: `{ kind: "timeout", turn, current_round, finalized: false, last_message_hash }`. Only return full state when actually unblocked.

### 🟢 P3 — Same client can claim both roles

**Observation.** I (the orchestrator) called `open_dispute` as `aria`, then `join_dispute` as `atlas` from the same Claude session and got both role tokens. The README documents "first-come-first-served per role" so this is intentional, but for a real two-org production setup it would be useful to optionally bind the joiner to a different DID seed / IP / OAuth principal.

## Doc consistency vs README / MILESTONE1 / FUTURE

| File | Claim | Reality | Action |
|---|---|---|---|
| README §239 | "State persists in `globalThis` for the lifetime of a warm Vercel instance — sufficient for a single demo session that runs in seconds-to-minutes. For multi-instance or long-lived disputes, swap to Vercel KV (one-line change in `src/dispute_store.ts`)." | Already swapped. Commit `d14fb52` migrated to Upstash Redis. The 25-minute multi-instance persistence we just observed proves it. | Update README §239 to reflect Redis is shipped. Mention Upstash Redis (Vercel KV is deprecated per the Vercel knowledge update). |
| README §149-167 | Phase 2 BYO tools list | Accurate and complete. Tools work as described. | None. |
| README §16, MILESTONE1 §17 | "Non-trivial hybrid convergence that no single party had drafted in advance" | Confirmed live in this run. | None — claim is vindicated. |
| MILESTONE1 §89 ("18/18 sigs + root hash") | True for `pnpm verify` (local file). | Not true for `verify_bundle` MCP tool — root_hash fails on transport (P1 above). | Add note that MCP verify is structural-only until fixed; or fix the canonicalization round-trip. |
| FUTURE.md §40-46 ("MCP server" listed under "Runtime and persistence") | Listed as future work. | **Already shipped.** This entire test ran against the live MCP server. | Move "MCP server" out of FUTURE.md; either drop it or move to a "Recently shipped" section. |
| FUTURE.md §36-39 ("Postgres-backed dispute registry") | Listed as future. | **Partially shipped** via Upstash Redis (KV, not Postgres, but solves multi-instance + long-lived). | Reword to clarify that durable storage shipped (Redis); Postgres-class lifecycle (open → evidence → negotiation → settled / appealed states) is the actual remaining gap. |
| FUTURE.md §10-14 ("Argumentation graph / Pacta Pro") | Listed as future. | Not implemented; today's protocol still uses LLM-emitted compromise bound + ≥2 Accepts on the same hash. | None — accurate. |
| FUTURE.md §15-16 ("Cross-provider jury") | Listed as future. | Today: Haiku/Sonnet/Opus (same provider). Not exercised in this run because the bilateral negotiation converged before deadlock. | None — accurate. |

The biggest doc gap is **FUTURE.md still listing the MCP server as future**. The MCP server is the headline product in the current README. These two docs disagree.

## Suggested fix priority

1. **(P0)** Surface content `hash` on every `get_dispute` history entry. This is the single change that would have shaved 18 minutes off this run and would unblock pure-LLM agents. ~20-line patch in `api/mcp/get_dispute.ts` (or wherever `get_dispute` is built).
2. **(P1)** Either reject empty `parent_refs` after round 1 or add `dry_run` to `submit_message`.
3. **(P1)** Either fix the bundle root_hash transport canonicalization or document the limitation + add a structural-verify mode.
4. **(P2)** Echo `valid_msg_hashes` in `parent_refs unknown` errors.
5. **(Docs)** Move "MCP server" out of FUTURE.md. Update README §239 to say "Upstash Redis" instead of "globalThis / swap to Vercel KV."
6. **(P2)** Slim down `wait_for_turn` timeout return + clarify finalized phrasing.

## Artifacts

- Final bundle: see `get_dispute(dsp_fc869be60bf16ce227325193)` — outcome `converged`, 6 messages, 12 evidence items, all signatures pass per-doc.
- This file: `examples/postmortem-demo/E2E-FINDINGS.md`
- System prompts used: `examples/postmortem-demo/stitcher-agent.md` + `lumea-agent.md` (paste-ready into a Claude session connected to the Pacta MCP server).
