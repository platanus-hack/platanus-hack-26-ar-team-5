# Pacta — Protocol foundations

This document grounds Pacta's protocol design in the academic + practitioner
literature it inherits from. It exists for two reasons:

1. To make explicit which Pacta primitives are research-backed versus original
   inventions, so a reviewer can audit our claims against the literature.
2. To give future contributors a map: when someone proposes a change, this
   document tells them which property of the existing design is load-bearing
   and what theory it's anchored to.

Each section names the relevant code (`src/...`) and the citations.

---

## §A. State-derived utility + Monotonic Concession Protocol with Zeuthen strategy

**Problem we solve.** The original Pacta "compromise bound" rejected a
`Propose` / `CounterPropose` when the agent's autoreported `utility_for_self`
scalar increased vs their previous offer. That check enforces nothing about
the actual `state` payload — an adversarial agent can keep the literal
scalar non-increasing while making zero material concession. The bound was
theatre.

**Theory.** The Monotonic Concession Protocol (MCP) and the Zeuthen strategy
that drives concessions under it are the canonical bilateral-bargaining
mechanism in multi-agent systems.

- **Zeuthen, F. (1930)**, *Problems of Monopoly and Economic Warfare*. The
  original "risk of conflict" ratio — at each round, the party with the lower
  risk of breakdown should concede. Predates modern game theory.
- **Rosenschein, J. & Zlotkin, G. (1994)**, *Rules of Encounter: Designing
  Conventions for Automated Negotiation among Computers* (MIT Press). Formalizes
  MCP for multi-agent systems and proves that when both agents follow the
  Zeuthen strategy, MCP converges to the **Nash bargaining solution**.
- **Endriss, U. (2006)**, *Monotonic Concession Protocols for Multilateral
  Negotiation*, AAMAS 2006 — generalization to >2 parties. Pacta is bilateral,
  so the original bilateral case applies directly.
- Wikipedia summary: <https://en.wikipedia.org/wiki/Zeuthen_strategy>.

**Key formula** (Zeuthen risk index for party *i*):

```
risk_i = (u_i(my_offer) - u_i(your_offer)) / (u_i(my_offer) - u_i(conflict))
```

- Numerator: utility *i* loses by accepting the counterparty's offer.
- Denominator: utility *i* loses by breaking down to the conflict outcome.
- The Zeuthen rule says the party with the *lower* risk has more to lose by
  holding firm than by conceding, and therefore should concede first.

**How Pacta implements it.** See `src/utility.ts`.

- `utilityFor(state, role, config)` — deterministic, state-derived utility in
  `[0,1]`. Per-field weights and signs are declared by the scenario and
  embedded in the bundle. The autoreported `utility_for_self` stays in the
  message payload as **audit-only signal**; the bound is enforced on the
  signed state.
- `utilityIncreases(prev, curr, role, config)` — when a Propose violates the
  bound, this returns a per-field breakdown of which fields nudged utility
  upward. The orchestrator uses it to build a precise rejection that names
  specific fields the LLM must move back.
- `zeuthenRisk({u_self_own, u_self_other, u_conflict})` — the risk index above.
- `expectedConceder({state_aria_last, state_atlas_last, config})` — given the
  most recent offer from each side, computes risk for both and returns
  `"aria" | "atlas" | "tie" | "either"` (`"either"` = both are at/below
  reservation, protocol expects Escalate or Withdraw).
- `zeuthenAdvisory(role, info)` — one-line natural-language advisory the
  orchestrator pushes to the LLM prompt at turn start. **Soft enforcement:**
  the LLM is shown its risk and the counterparty's, with the protocol's
  recommendation. Hard enforcement is only on the state-derived bound.

**Why we don't hard-enforce Zeuthen.** Hard enforcement (the lower-risk agent
must concede or be rejected) requires the orchestrator to know each party's
true reservation utility. We use the system-prompt-declared reservation as a
proxy, which is correct enough as a *recommendation* but too brittle as a
hard rule — if reservations are slightly mis-declared, a hard rule deadlocks
agents who actually had room to deal. Soft advisory + hard bound on derived
utility was the right trade-off for the hackathon MVP.

**Wire-level enforcement points.**
`src/orchestrator.ts` (in-process / CLI demo path) and `src/dispute_engine.ts`
(BYO-agent / MCP path) both:

1. Look up the agent's last `Propose` / `CounterPropose` state.
2. Compute `u_curr - u_prev` from `state` under the scenario's signed weights.
3. Reject when `Δu > 1e-9` with a precise field-level error message.

This is symmetric across the two engines so external (MCP-driven) and internal
(Claude-driven) negotiations enforce identical guarantees.

---

## §B. Alternating-Offers Protocol — game-theoretic basis for round-robin Propose / CounterPropose

**Where we sit.** Pacta's round-robin `aria → atlas → aria → atlas` Propose /
CounterPropose loop is structurally **the Alternating Offers Protocol (AOP)**
— and specifically its multi-issue extension (SAOP) used in the academic
benchmark.

**Theory.**

- **Rubinstein, A. (1982)**, *Perfect Equilibrium in a Bargaining Model*,
  Econometrica. The fundamental result for alternating offers with discount.
  In the infinite-horizon limit (intervals → 0), the subgame-perfect
  equilibrium converges to the **Nash bargaining solution** — the same
  attractor as Zeuthen-MCP.
- **Aydoğan, Festen, Hindriks & Jonker (2017)**, *Alternating Offers Protocols
  for Multilateral Negotiation*, in *Modern Approaches to Agent-based Complex
  Automated Negotiation*. Defines the **Stacked Alternating Offers Protocol
  (SAOP)** used as the canonical protocol for the Automated Negotiating Agents
  Competition (ANAC) since 2015. Three actions per turn: bid / accept-most-recent
  / walk-away. SAOP outperforms alternatives on time-deadline settings.
- ANAC competition (running annually since ~2010, 142 researchers / 42 teams
  in 2025): <https://ii.tudelft.nl/nego/node/7>.

**How Pacta maps to SAOP + extensions.**

| SAOP action       | Pacta primitive       |
|-------------------|-----------------------|
| `bid`             | `Propose` / `CounterPropose` |
| `accept`          | `Accept`              |
| `walk-away`       | `Withdraw`            |
| (extension)       | `Critique` — challenge an offer with cited evidence, no counter required |
| (extension)       | `Reveal` — disclose private info, binding (cannot be contradicted later) |
| (extension)       | `Escalate` — invoke the tribunal failsafe |
| (extension)       | `Amend` — propose a clause the schema didn't anticipate |

The "extensions" are why Pacta isn't just SAOP-with-signing. They handle the
properties SAOP doesn't address: evidence anchoring, private information,
deadlock failsafe, and mid-flight schema mutability.

**Wire-level enforcement.** `src/orchestrator.ts:runNegotiation` (round-robin
loop) and `src/dispute_engine.ts:advanceTurn` (state machine). The two engines
share `ORDER = ["aria", "atlas"]` so external + internal flows have identical
turn ordering.

---

## §C. Single Text Procedure — basis for the `Amend` primitive

**Problem we solve.** The state schema is fixed at scenario-author time, but
real disputes surface clauses neither party anticipated. The user's framing:
"el peso relativo no necesariamente se mantiene con el tiempo, y si se
agregan condiciones a lo largo del contrato, el peso cambia."

**Theory.** The Single Text Procedure was first formalized in *Getting to Yes*
and used by Jimmy Carter at the Camp David Accords (Israel-Egypt, 1978) to
avoid the standard position-vs-position deadlock pattern.

- **Fisher, R. & Ury, W. (1981)**, *Getting to Yes: Negotiating Agreement
  Without Giving In*. Harvard Negotiation Project. Introduces both
  interest-based negotiation and the single-text technique.
- Practitioner reference: <https://viaconflict.wordpress.com/2012/05/13/drafting-agreement-the-single-text-approach/>.
- Wikipedia: <https://en.wikipedia.org/wiki/Getting_to_Yes>.

**Mechanic.** A neutral document representing both parties' interests gets
drafted. Each side **critiques the document, not the other party's position**.
The document is iterated. Convergence happens by the document evolving toward
mutual acceptability rather than parties trading concessions on fixed positions.

**How Pacta implements it.** See `src/state_schema.ts` (`Amendment`,
`AmendmentZod`) and `src/types.ts` (`AmendMsg`).

- The state schema *itself* is the single text — declared at scenario time,
  embedded in the bundle (`bundle.state_schema`), content-addressed via
  `ref: sha256(...)`.
- An `Amend` message proposes a new clause (`{key, value, rationale}`) the
  schema didn't anticipate. **Self-Accept doesn't apply it** — only an Accept
  signed by the *counterparty* lands the amendment in subsequent
  `state.amendments[]` arrays.
- Amendments are **positive-sum by default**: they contribute 0 to either
  party's utility unless future scenarios attach explicit weight deltas. This
  matches the Single-Text intuition that bilateral text refinement should not
  count as a "concession" by either side under the compromise bound — both
  sides accepting an amendment means both sides agree it improves the deal.

**Wire-level enforcement.** Schema collision check (declared keys cannot be
reintroduced via Amend), counterparty-Accept gate in
`src/dispute_engine.ts:detectAmendmentApplications`.

---

## §D. Med-Arb / Arb-Med-Arb — basis for `tribunal_mode='binding'` + Withdraw routing

**Problem we solve.** Bilateral negotiation between rational agents can
deadlock indefinitely without a forcing function. Pacta needs convergence "sí
o sí" — but "sí o sí" via theatrical bound is humo (smoke), so the real
convergence guarantee has to come from a binding fallback.

**Theory.** Med-Arb and Arb-Med-Arb (AMA) are practitioner-developed hybrid
ADR processes where parties pre-commit to mediation, then to binding
arbitration if mediation fails. The pre-commitment is what makes mediation
work — knowing the alternative is a binding ruling motivates good-faith
bargaining.

- Harvard Program on Negotiation: <https://www.pon.harvard.edu/daily/mediation/what-is-med-arb/>.
- Pettibone, Siffert & Zhu (2022), *An Examination of Institutional
  Arb-Med-Arb Protocols and Practices*: <https://www.lswlaw.com/wp-content/uploads/2022/08/Pettibone-Siffert-and-Zhu-An-Examination-of-Institutional-Arb-Med-Arb-Protocols-and-Practices.pdf>.

**How Pacta implements it.** See `src/dispute_store.ts` (`TribunalMode`),
`src/dispute_engine.ts:withdrawFromDispute`, `src/jury.ts:deliberate`.

- **`tribunal_mode='binding'`** = Med-Arb pre-commit. If bilateral negotiation
  deadlocks (`max_rounds_exhausted`) or either party calls `Escalate`, the
  3-LLM tribunal renders a signed `Ruling` that binds both parties.
- **`tribunal_mode='none'`** = no failsafe. Parties opted out at open time;
  Escalate is rejected; max_rounds finalizes as `kind: "deadline"` with no
  remedy. Either party can always `Withdraw`.
- The mode is **fixed at open and visible to the joiner before they claim a
  role** (`src/dispute_store.ts:joinDispute`). This addresses the asymmetry
  concern: an opener picking `none` offloads risk onto the joiner, and the
  joiner gets to see the mode before consenting to the dispute.
- **Withdraw cannot escape binding once both sides have engaged**
  (`bothSidesEngaged`). If both have proposed at least once under
  `tribunal_mode='binding'`, a unilateral Withdraw still routes to the
  tribunal. The `Withdraw` is signed into the audit trail (so it's clear who
  walked and why), but the laudo is rendered against the existing record so
  the binding pre-commit at open actually binds. This is the contract-law
  intuition that you can't undo your binding consent to arbitration by
  walking out after engaging.
- **Confidentiality concern from the literature** (when mediator becomes
  arbitrator, parties may withhold sensitive info during mediation): mitigated
  in Pacta by separating the negotiation LLMs (the parties' own agents) from
  the tribunal LLMs (3 jurors with biases fairness / efficiency / speed). The
  tribunal sees only the signed audit trail, not the parties' private
  reasoning. `Reveal` messages are explicit, signed disclosures the party
  chose to put on record.

**Wire-level enforcement.** `src/dispute_engine.ts:terminateOnDeadline`,
`src/dispute_engine.ts:withdrawFromDispute` (mode-aware terminator and exit
routing), `src/jury.ts:deliberate` (3-juror panel with `Promise.allSettled` so
a single juror failure doesn't kill deliberation).

---

## §E. Heterogeneous panel — basis for the 3-LLM tribunal

**Theory.** Heterogeneous panels (jurors with declared, distinct biases) are
the standard in international commercial arbitration when single-arbitrator
selection would be contested. The biases need to be observable so the parties
can predict the panel's failure modes.

Pacta's panel: **Aequitas** (fairness, prefers `claimant_partial`),
**Utilis** (efficiency / total-utility maximization), **Velox** (speed /
clean enforceability, prefers S-tier evidence and avoids hybrid rulings).
Each runs on a different model (Sonnet 4.5 / Opus 4.5 / Haiku 4.5) so the
panel is also heterogeneous in compute cost and reasoning style.

**Schema-driven aggregation.** `src/state_schema.ts:aggregateRemedy` combines
the 3 jurors' votes per-field according to the scenario-declared aggregation
strategy: **median** for numeric fields, **majority** for categorical /
strings, **intersect** for arrays where only items ALL jurors include
survive (designed for the deadlock-leak `redactions` case), **first** for
"highest-confidence juror wins". The aggregation hint is part of the
scenario's signed schema so the bundle is fully self-describing.

**Final-offer arbitration consideration.** Final-offer (baseball) arbitration
— the literature's other forced-convergence mechanism — would have the panel
*pick one of the parties' last offers as-is*. Pacta does not currently do
this; the panel synthesizes its own remedy under the scenario's schema. We
considered it and rejected it for v1: scenarios with multi-dimensional state
(oncology, deadlock-leak) need finer-grained remedy crafting than picking
one of two extremes. The literature is split on whether final-offer actually
produces convergence: Wikipedia's "Pendulum arbitration" notes that empirical
studies have *not* found median convergence between offers under final-offer
in MLB salary arbitration, even though 80% of cases settle pre-hearing. So
final-offer's value is in the *threat* it poses, not in the resulting offers
themselves. Pacta gets a similar deterrent effect from `tribunal_mode='binding'`
+ the heterogeneous panel without forcing the panel into a binary choice.

References:
- Wikipedia: <https://en.wikipedia.org/wiki/Pendulum_arbitration>.
- Cardozo Journal of Conflict Resolution: <https://www.cardozojcr.com/cjcr-blog/final-offer-arbitration-in-major-league-baseb>.
- ADR Times: <https://adrtimes.com/final-offer-arbitration/>.

---

## §F. Self-describing bundle — basis for offline auditability

The bundle (`bundle.json`) is content-addressed via Merkle root over signed
messages + signed evidence + outcome. Re-verification is offline (`pnpm verify
tmp/last-run.json`) — no network call, no API key.

**`bundle_version: 2`** adds the embedded `state_schema` (JSON-Schema
fragment + content hash) so any third party can interpret `outcome.final_state`
or `outcome.ruling.remedy` without assuming any specific domain.

**RFC 8785 JCS** (canonical JSON) ensures byte-deterministic re-hashing across
JSON round-trips. **Ed25519** signatures (`@noble/ed25519`) on every primitive.
**did:key** identity (multibase base58btc + multicodec 0xed01).

This isn't "research" so much as engineering hygiene, but it's the property
that makes Pacta's claims about the negotiation actually verifiable. The
academic protocols above describe ideal mechanisms; the cryptographic
substrate is what lets us claim "we ran them" vs "we say we ran them".

---

## §G. Observability fields (v2)

**`context_summary` on `open_dispute`.** A required, human-readable headline
attached to every dispute at open time (`src/mcp_server.ts:open_dispute`,
`src/dispute_store.ts:openDispute`). Validated server-side as
`z.string().min(1).max(60)` and surfaced verbatim by `join_dispute` /
`get_dispute` so the joiner sees the same label the opener typed. Required
because dashboards, audit indices, and observability traces need a stable
glanceable identifier per dispute that is not a UUID and not the full claim
prose; a 60-char hard cap keeps it list-rendering safe and prevents authors
from smuggling argumentation into the headline slot.

**Per-move `summary` on `MessageBase`.** A short label on every message
(`src/types.ts:MessageBase.summary`). The TypeScript shape marks it optional,
but the wire surface in `src/mcp_server.ts:submit_message` enforces it as
required with `z.string().min(1).max(60)`; the comment specifies a 2–4 word
characterisation ("Demands full refund", "Counters with $600"). The
dashboard timeline renders this label per move; rationale and payload remain
the source of truth that the counterparty and tribunal read.

---

## What's next (not yet implemented)

These are anchored in literature too, but live in `FUTURE.md` rather than the
current MVP cut.

- **Pacta Pro: Argumentation graph rulings.** Dung (1995), *On the Acceptability
  of Arguments and its Fundamental Role in Nonmonotonic Reasoning, Logic
  Programming and n-Person Games*. The Pro tier would extract claims + attack
  relations from the message history and compute the grounded extension as a
  deterministic ruling — repeatable from the audit trail, no LLM in the loop.
- **Weight-deltas on Amend.** Currently amendments are positive-sum by
  default (zero weight). A future iteration could allow `AmendMsg.payload` to
  carry `utility_delta_aria` / `utility_delta_atlas` that take effect once
  both parties Accept. This implements the user's intuition that adding
  conditions changes weights. The orchestrator's bound check would re-anchor
  to the new weights starting from the segment after the amendment.
- **Time discount.** Add an explicit `δ` per round to the conflict-utility
  computation (Rubinstein finite-horizon). Today, demoring is "free" for
  agents — convergence is forced only by `max_rounds`. With δ < 1, demoring
  is costly and the equilibrium shifts toward earlier convergence.
- **Final-offer arbitration as alternative tribunal mode.** A
  `tribunal_mode: "final-offer"` where the panel must pick one of the two
  parties' last offers as the ruling. Adds a third option alongside `binding`
  / `none` and gives a sharper convergence incentive for scenarios where the
  state is one-dimensional enough that a binary pick is acceptable.
