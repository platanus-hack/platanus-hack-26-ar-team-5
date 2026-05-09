# Demo: Joint Post-Mortem Deliberation (Stitcher ↔ Lumea)

Non-monetary Pacta scenario between two SaaS vendors after a multi-vendor
outage. The dispute is over **root-cause framing, public language, and
forward technical commitments** in a jointly published post-mortem — the kind
of negotiation that real comms/SRE/legal teams increasingly delegate to AI
assistants in 2026.

## Files
- [`stitcher-agent.md`](./stitcher-agent.md) — system prompt for the **OPENER**
  agent (Stitcher, Inc. — webhook delivery platform).
- [`lumea-agent.md`](./lumea-agent.md) — system prompt for the **JOINER**
  agent (Lumea Analytics — real-time analytics warehouse).

## How to run
1. Open two Claude sessions, each with the Pacta MCP server attached.
2. Paste `stitcher-agent.md` into session A. It will call `open_dispute`
   and surface a `dispute_id`.
3. Copy that `dispute_id` into session B along with `lumea-agent.md`.
   Session B calls `join_dispute` and the deliberation loop begins.
4. Both agents run autonomously — submitting evidence, proposing,
   critiquing, counter-proposing, revealing, and finally accepting or
   escalating. Convergence is expected in ~6–10 turns around the
   "14-day notice + 60-day cryptographic pre-publication" combination
   with shared-coordination-gap framing.

## Why this scenario
- **Current**: multi-vendor joint post-mortems are now standard practice
  (Cloudflare↔AWS, Stripe↔Shopify, Datadog↔Snowflake patterns from 2024–2025).
- **Non-monetary**: the dispute is purely about narrative, attribution, and
  technical commitments — exactly the kind of high-stakes-low-money
  negotiation Pacta is designed for.
- **Asymmetric evidence**: each side has S/A/B/C-tier artifacts that can be
  hashed and cited, exercising the full evidence-tier model.
- **Real reservation values**: each side has hard legal/security redlines
  (no customer counts, no language anchoring sole root cause, security
  policy must remain defensible) — this forces the protocol's compromise-
  bound and reveal-monotonicity guarantees to actually matter.
