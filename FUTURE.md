# Future — beyond MILESTONE1

Pacta's MVP ships the conciliation protocol with real cryptography and a real LLM jury. This file is what comes after, ranked roughly by leverage.

## Protocol evolution

### N-party negotiation
Today: bilateral round-robin (Aria ↔ Atlas). Tomorrow: any number of parties with a configurable turn-taking policy (round-robin, stake-weighted, initiative-based). Convergence becomes "every party Accepts the same target hash" instead of "≥ 2 do".

### Argumentation graph (Pacta Pro tier)
Adopt Dung's abstract argumentation frameworks (1995) properly. The LLM's job becomes extracting **atomic claims** and **attack relations** from each message; the verdict is the **grounded extension** of the resulting graph, computed deterministically. The argument is auditable: any reviewer can replay the extension.

This is the answer to the inevitable "but LLMs are non-deterministic" critique. With Pacta Pro, only the extraction is non-deterministic, and the extraction is itself a structured output that verifiers can spot-check.

### Heterogeneous cross-provider jury
Today: Haiku 4.5 + Sonnet 4.5 + Opus 4.5 — heterogeneous in scale and generation but same provider. Tomorrow: Claude + GPT-class + Gemini-class. Maloyan et al. (2024) reported 30–73% prompt-injection success against single LLM judges; cross-architecture juries break the transferability of those attacks. The vote-aggregation logic (`src/jury.ts`) already supports this — only the model selection changes.

### Bonded claims
Inspired by optimistic rollups (Arbitrum, Optimism). Opening a dispute requires posting a bond. If the ruling determines bad faith, the bond pays the mediator fee + counterparty compensation. Eliminates frivolous claim spam without gating against legitimate disputes.

### Reveal evidence anti-contradiction
Today: same `domain` may be revealed only once per agent (mechanical). Tomorrow: an LLM-judged check that a new Reveal does not contradict prior Reveals from the same agent — with the contradiction itself becoming evidence in the audit trail if escalation happens.

## Identity and trust

### `did:web` and `did:wba`
`did:key` is enough for hackathon demos. Production wants stable, web-resolvable identifiers (`did:web`) for organizations and agent-network protocol DIDs (`did:wba`) for cross-domain auditability with privacy.

### ERC-8004 reputation
Wins and losses, evidence quality, frivolous-claim flags — all written to ERC-8004 reputation registries. Long-running agents accumulate trustworthy track records; bad actors get visible scores. The mediator can use reputation as a tiebreaker on close calls.

### Oracle whitelist for Tier-A evidence
TLSNotary attestations, TEE-signed computation results, public-data oracles (Chainlink), signed-changelog endpoints. Today Tier A is "the body says it is verifiable"; tomorrow there is a registry with explicit oracle-attestation requirements per evidence kind.

## Runtime and persistence

### Postgres-backed dispute registry
Replace `globalThis` storage. Each dispute gets a stable id, multi-step lifecycle (open → evidence → negotiation → optionally jury → settled / appealed), and an auditable history queryable by agent or by case.

### MCP server
Expose Pacta as an MCP server. External agents (Claude Desktop, Cline, custom tools) can:
- `pacta.open_dispute(parties, claim)` → `dispute_id`
- `pacta.submit_evidence(dispute_id, evidence)` → `signed_evidence`
- `pacta.list_disputes(filter)` → recent cases
- `pacta.verify_bundle(bundle_url)` → check signatures externally
This is what gives Pacta a place in the existing agentic stack: agents already speaking MCP can just connect.

### A2A binding
Publish Pacta as an A2A extension so any A2A-compliant agent can participate in negotiations without bespoke integration. Each `Propose` / `Accept` etc. maps to A2A messages with a `pacta-v0.1` extension namespace.

### Web UI / replay
Today the bundle is a JSON file. Tomorrow a small inspector renders the negotiation and ruling, with the argumentation graph laid out, evidence tiers color-coded, and a one-click "verify all signatures" runner.

### Conformance suite
A spec-test harness any third-party Pacta implementation can run to claim compliance. Validates message schemas, compromise bound, reveal monotonicity, signature algorithms, content-addressing, evidence-tier semantics.

## Product tiers

### Pacta Lite (rule-based)
For disputes where the verdict is computable from signed sources (e.g., "did the on-chain payment land"). Pure code, no LLM. Free, instant, deterministic.

### Pacta Standard (LLM jury — what ships today)
Three heterogeneous LLM jurors with structured-output ballots. Costs a few cents per case. Works for the long tail of "judgement call" disputes with non-trivial evidence weighing.

### Pacta Pro (argumentation graph)
LLM extracts the graph; the algorithm computes the grounded extension. Auditable in the strongest sense: a reviewer can pin the extraction and replay the verdict step by step.

### Pacta Court (human escalation)
Specialist humans (or hybrid panels via Kleros / JAMS) for disputes the prior tiers cannot resolve. The audit trail produced by lower tiers becomes the brief for the human reviewer.

### Domain-specialized mediators
Healthcare, B2B SaaS, supply chain, regulated industries each have their own evidence taxonomies and norms. Specialized mediator profiles (system prompt + tier rules + remedy templates) trained on prior rulings in the domain.

## Trust dataset and own-model

Every dispute Pacta processes is an annotated example: signed evidence, agent positions, jury votes, ruling, appeal outcomes. Over time this becomes a unique dataset that can fine-tune (or train from scratch) a Pacta-native mediation model.

The first generation is Claude-class; the third is Pacta-class — fine-tuned on real adjudicated disputes. This is the long-term moat: a wrapper-on-frontier-LLM is replicable in months, but a model trained on years of dispute rulings is not.

## Settlement bindings

The protocol is payment-agnostic. Optional integrations:

- **x402 + USDC on Base** for agent-native payment-bound disputes.
- **AP2 mandates** for Verifiable-Credential-style settlement instructions.
- **Stripe Connect** for fiat settlement when one party is a registered business.
- **Escrow contracts** for high-value disputes where the obligation should sit in cryptographic custody until the ruling executes.

Each is a thin adapter that consumes a Pacta bundle and emits the corresponding settlement; none changes the protocol itself.

## Adjacent protocols

### Healthcare authorization (Aurora ↔ Cobra)
A second canonical demo case: hospital agent (Aurora, NCCN/UpToDate access, clinical utility) negotiating with insurer agent (Cobra, contract + PMO + UM policy). Proof of generality.

### Software supply chain SLAs
Pentest vendor's agent vs. SaaS company's agent over whether a finding is valid + remediable within the SLA. Tech-friendly, naturally evidence-rich.

### Procurement and B2B contracts
Procurement agent vs. supplier agent over delivery, quality, terms. The largest TAM among the patterns we have studied.

## Where this stops being a hackathon project

Three thresholds, in order:

1. **Used by one real third-party agent in production** — not us, them.
2. **A second implementation (e.g. Python or Rust) passes a public conformance suite** — proving the protocol is a real protocol, not a single vendor's library.
3. **A regulator or arbitral body recognizes a Pacta bundle as admissible evidence** — the moment Pacta crosses from technical artifact to legal artifact.

Each is a separate workstream. None requires more than the protocol primitives we already shipped — only adoption, hardening, and time.
