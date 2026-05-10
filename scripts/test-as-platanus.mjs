// Run a freeform MCP dispute owned by platanus@hack.com so it appears in
// THAT account's dashboard. Mints two keys (both bound to platanus@hack.com
// so the dispute and usage rows are attributed to a single user the operator
// is actually logged in as). DOES NOT clean up — the dispute persists after
// the script exits so /dashboard, /dashboard/usage and /dashboard/settings
// all show real data.
//
// Run: node scripts/test-as-platanus.mjs

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import crypto from "node:crypto";

const SUPABASE_URL = "https://wnnpnckuubgdnsexxpzq.supabase.co";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndubnBuY2t1dWJnZG5zZXh4cHpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM2OTU2MCwiZXhwIjoyMDkzOTQ1NTYwfQ.CGMVEVdxAXlM088T6R7er39YUS_kv82_2c7stVOXX5s";
const PLATANUS_USER_ID = "41ea802f-594c-4270-8638-4fee495d49e2";
const APP = "http://localhost:44323";
const MCP_URL = `${APP}/api/mcp`;

async function admin(path, init = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function mintKey(userId, name) {
  const random = crypto.randomBytes(24).toString("hex");
  const plaintext = `pacta_live_${random}`;
  const hash = crypto.createHash("sha256").update(plaintext).digest("hex");
  const prefix = plaintext.slice(0, 12);
  const r = await admin("/rest/v1/api_keys", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ user_id: userId, name, prefix, key_hash: hash }),
  });
  if (!r.ok) throw new Error(`mintKey failed: ${await r.text()}`);
  return plaintext;
}

async function makeMcpClient(apiKey, label) {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { "X-Pacta-Key": apiKey } },
  });
  const client = new Client(
    { name: `pacta-platanus-${label}`, version: "0.0.1" },
    { capabilities: {} },
  );
  await client.connect(transport);
  return { client, transport };
}

function unwrap(res) {
  const text = res.content?.[0]?.text ?? "";
  const m = text.match(/--- (?:DETAILS|STATE) ---\n([\s\S]+?)(?:\n\n--- |$)/);
  if (m) {
    try { return { state: JSON.parse(m[1]), text }; } catch { /* fall through */ }
  }
  return { text };
}

async function main() {
  console.log("Running a real schema-less dispute as platanus@hack.com");
  console.log("");

  const keyAria = await mintKey(PLATANUS_USER_ID, "demo-aria");
  const keyAtlas = await mintKey(PLATANUS_USER_ID, "demo-atlas");
  console.log("✓ minted 2 keys for platanus@hack.com (visible in /dashboard/settings)");
  console.log("    aria-side prefix: ", keyAria.slice(0, 16) + "…");
  console.log("    atlas-side prefix:", keyAtlas.slice(0, 16) + "…");

  const a = await makeMcpClient(keyAria, "aria");
  const b = await makeMcpClient(keyAtlas, "atlas");

  const claim =
    "Disputo el corte de servicio de mi proveedor cloud durante 4 horas el 8/may. Mi SLA dice 99.95% mensual; ya estamos en 0.55% de downtime este mes y exijo reembolso proporcional + crédito por incumplimiento.";

  const opened = await a.client.callTool({
    name: "open_dispute",
    arguments: {
      claim,
      your_role: "aria",
      counterparty_external: true,
      max_rounds: 4,
      tribunal_mode: "binding",
    },
  });
  const openedState = unwrap(opened).state;
  console.log("✓ opened schema-less dispute:", openedState.dispute_id);
  console.log("  claim:", claim.slice(0, 90) + "…");

  const tokenA = openedState.your_token;
  const joined = await b.client.callTool({
    name: "join_dispute",
    arguments: { dispute_id: openedState.dispute_id, role: "atlas" },
  });
  const joinedState = unwrap(joined).state;
  const tokenB = joinedState.your_token;
  console.log("✓ atlas joined as counterparty");

  await a.client.callTool({
    name: "submit_evidence",
    arguments: {
      dispute_id: openedState.dispute_id,
      role_token: tokenA,
      evidence: {
        tier: "S",
        title: "SLA contractual firmado",
        body: "Cláusula 4.2 del MSA: 'El proveedor garantiza disponibilidad mensual ≥ 99.95%. Por cada 0.1% de incumplimiento, crédito del 5% sobre la factura del mes afectado, con piso de USD 500.'",
      },
    },
  });
  await b.client.callTool({
    name: "submit_evidence",
    arguments: {
      dispute_id: openedState.dispute_id,
      role_token: tokenB,
      evidence: {
        tier: "A",
        title: "Status page público + post-mortem",
        body: "El incidente del 8/may fue causado por un BGP withdrawal upstream (un proveedor de red, no nuestra infraestructura). Cláusula 9.1 excluye fuerza mayor de terceros. Ofrecemos crédito de cortesía pero no compensación contractual.",
      },
    },
  });
  console.log("✓ ambos submitearon evidencia");

  const m1 = await a.client.callTool({
    name: "submit_message",
    arguments: {
      dispute_id: openedState.dispute_id,
      role_token: tokenA,
      message: {
        type: "Propose",
        round: 1,
        from_agent: openedState.your_did,
        evidence_refs: ["e1"],
        parent_refs: [],
        payload: {
          state: { credit_usd: 1800, terms: "Reembolso completo del mes + crédito de USD 500 por incumplimiento contractual." },
          rationale: "0.55% de downtime → 11x el incumplimiento de 0.05% que activa el piso de USD 500 según cláusula 4.2.",
          utility_for_self: 0.95,
        },
      },
    },
  });
  console.log("✓ aria propuso reembolso + USD 1800 crédito");

  await b.client.callTool({
    name: "submit_message",
    arguments: {
      dispute_id: openedState.dispute_id,
      role_token: tokenB,
      message: {
        type: "CounterPropose",
        round: 1,
        from_agent: joinedState.your_did,
        evidence_refs: ["e2"],
        parent_refs: ["m1"],
        payload: {
          state: { credit_usd: 600, terms: "Crédito comercial de USD 600 (no contractual). Sin reconocimiento de incumplimiento de SLA por la exclusión de fuerza mayor en la cláusula 9.1." },
          rationale: "El incidente fue causa externa (BGP upstream). 9.1 excluye explícitamente. Ofrecemos buena voluntad sin sentar precedente contractual.",
          utility_for_self: 0.7,
        },
      },
    },
  });
  console.log("✓ atlas counter-propuso USD 600 con argumento de fuerza mayor");

  // Aria escala — desacuerdo sobre si 9.1 cubre el caso
  await a.client.callTool({
    name: "submit_message",
    arguments: {
      dispute_id: openedState.dispute_id,
      role_token: tokenA,
      message: {
        type: "Escalate",
        round: 2,
        from_agent: openedState.your_did,
        evidence_refs: ["e1", "e2"],
        parent_refs: ["m2"],
        payload: {
          reason: "Desacuerdo sobre si la cláusula 9.1 (fuerza mayor) cubre BGP upstream. Pido que el tribunal interprete las dos cláusulas en conflicto.",
          requested_action: "mediator",
        },
      },
    },
  });
  console.log("✓ aria escala al tribunal — desacuerdo sobre interpretación de fuerza mayor");

  console.log("");
  console.log("Listo. Andá a http://localhost:44323/dashboard y:");
  console.log("  · /dashboard           → vas a ver la dispute en el sidebar");
  console.log(`  · /dashboard           → click en ${openedState.dispute_id} para ver el DAG firmado`);
  console.log("  · /dashboard/settings  → 2 keys minteadas (demo-aria, demo-atlas)");
  console.log("  · /dashboard/usage     → requests + tokens consumidos");

  await a.transport.close().catch(() => {});
  await b.transport.close().catch(() => {});
}

main().catch((e) => {
  console.error("error:", e);
  process.exit(1);
});
