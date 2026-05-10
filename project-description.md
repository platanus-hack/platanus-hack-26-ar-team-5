# Pacta

**Cuando dos agentes IA no se ponen de acuerdo, ¿qué les queda?**

Hoy nada. Pacta es eso. La capa que falta del stack agéntico.

---

## Qué hace

Dos agentes IA con utilidades opuestas — el FinOps del cliente y el agente de cuenta del proveedor, el bot de un hospital y el de un seguro, el de una editorial y el de un autor — abren una **disputa**. No una conversación. Una negociación con reglas, firmas y un audit trail que cualquier tercero verifica offline.

Cada lado puede:

- **Propose / Counter** un estado de acuerdo, con su utilidad declarada y la evidencia que lo respalda.
- **Critique** un mensaje del otro lado citando evidencia.
- **Reveal** información privada (binding desde ahí).
- **Accept** un estado para converger.
- **Escalate** al tribunal cuando no convergen.

El orchestrator enforce el **compromise bound** (la utilidad que cada lado declara para sí mismo solo puede bajar — no podés volver a tu posición original). Las referencias entre mensajes son sha256 hashes content-addressed. Cada move se firma Ed25519 sobre JSON canónico RFC 8785.

Si en `max_rounds` no convergen, un **tribunal de tres LLMs heterogéneos** (Haiku 4.5 + Sonnet 4.5 + Opus 4.5, cada uno con un sesgo distinto: equidad, eficiencia, velocidad) lee el case, vota independientemente, y firma un Ruling. La aggregación es confidence-weighted.

El output es un **bundle**: un objeto que contiene los mensajes firmados, las firmas de los jurados (si hubo tribunal), el remedy, y un `root_hash` (sha256 sobre los bytes canónicos del bundle entero). Lo verificás con `pnpm verify bundle.json` y listo. No necesita confiar en Pacta.

## Por qué importa

Cuando los agentes empiecen a tomar decisiones de plata real (FinOps, comisiones de marketplace, ajustes de SLA), va a haber disputas. Hoy:

- O un humano arbitra → no escala.
- O confiás ciegamente en uno de los dos agentes → conflicto de interés.
- O lo resolvés en ChatGPT → ningún audit trail, ningún binding.

Pacta da una primitiva auditable: deliberación entre agentes con prueba criptográfica. Sin blockchain, sin pagos. La conciliación es el producto. Los rails de pago (x402, AP2, Stripe) son integraciones downstream.

## Qué entregamos en el hackathon

1. **Protocol + SDK** (`pnpm demo`): el motor completo, los seis primitivos, las firmas, el audit DAG, el tribunal de 3 jurados, el verificador offline. ~3000 líneas TS, 81 tests vitest.
2. **MCP server** (`/api/mcp`): tools `open_dispute` / `join_dispute` / `submit_evidence` / `submit_message` / `wait_for_turn` / `get_dispute` / `withdraw_dispute` / `verify_bundle`. Cualquier agent que hable MCP puede ser parte de una disputa.
3. **Dashboard** (`/dashboard`): un solo bloque por disputa con status, posiciones de cada lado, outcome. Vista Simple (timeline ejecutivo en lenguaje claro) y Deep (audit DAG con cada nodo signed). Modal "Verify the bundle" con root hash + nota para verificación offline.
4. **Auth + gating + usage**: login con email/password (Supabase), API keys per-user (sha256 hash en DB, plaintext shown once), rate-limiting + token-cost tracking por usuario, allowlist + admin tier configurables. **No drainable.**
5. **6 scenarios bundleados**: AI inference cost overrun, oncology coverage, deadlock-leak, CVE disclosure, ad-revenue ratchet, publication timing. Cada uno con su `state_schema` typed.
6. **`context_summary` y `summary` por move**: requeridos en el protocolo. El primero es el headline del case (5 palabras), el segundo caracteriza cada move (2-4 palabras). Ambos firman dentro del bundle. La dashboard los surfacea para que un viewer entienda en 5 segundos.

## Cómo se usa (3 modos)

### A. Demo CLI

```bash
pnpm install
pnpm demo --mock                      # determinístico, sin key, ~1s
pnpm demo                             # live con Claude (~30s)
pnpm verify tmp/last-run.json         # re-check offline de cada firma
```

### B. Dashboard live

Click "Run" en el sidebar — Pacta seedea una disputa con uno de los 6 scenarios y vos ves los dos Claudes negociando en tiempo real, con el DAG construyéndose move por move.

### C. MCP — agentes externos traen su propio caso

```ts
// Agent A (claimant)
mcp.call("open_dispute", {
  claim: "...",
  context_summary: "Cloud SLA outage refund",  // 5 words
  your_role: "aria",
  counterparty_external: true,
  tribunal_mode: "binding",
});
// Returns dispute_id. Pasalo al Agent B.

// Agent B (respondent)
mcp.call("join_dispute", { dispute_id, role: "atlas" });

// Both sides loop:
mcp.call("submit_evidence", { ... tier S/A/B/C ... });
mcp.call("submit_message", {
  message: { type: "Propose", summary: "Demands $1,800", ... },
});
mcp.call("wait_for_turn", { dispute_id, role });
```

Cualquier dos agentes que hablen MCP pueden disputar cualquier cosa, schema-less.

## Stack

Next.js 16, TypeScript estricto, Tailwind v4, Anthropic SDK (Opus 4.5 + Sonnet 4.5 + Haiku 4.5), Supabase Auth + Postgres + RLS, Upstash Redis (storage de disputas), MCP SDK (Streamable HTTP transport), Ed25519 vía `@noble/ed25519`, RFC 8785 vía `canonicalize`, framer-motion para animaciones de la dashboard.

## Roadmap inmediato (post-hack)

- **x402 / AP2 settlement integration**: el bundle es la primitiva. Los pagos son una capa arriba.
- **Multi-party**: hoy son 2 lados. La extensión a N partes cambia poco del protocolo (las firmas y el DAG ya son N-friendly).
- **ERC-8004 reputation**: cada DID acumula bundles firmados. Eso ES un score de reputación negociadora.
- **Schema marketplace**: `state_schema` típicas para casos comunes (SLA, refund, license). Re-usables across organizations.

## Equipo

[Equipo Argentino, Platanus Hack 26 Future track.]
